/**
 * 冒烟测试：单元（去重/指纹）+ API（关键词 CRUD、设置、热点、统计）
 * 需先启动服务：npm start，然后 npm test
 */
import assert from 'node:assert/strict';
import { canonicalUrl, fingerprintOf, titleSimilarity } from '../src/services/dedupe.js';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:8787';
let passed = 0;
let failed = 0;

const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${error.message}`);
  }
};

const api = async (path, init) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

console.log('\n[1] 去重与指纹');
await check('URL 归一化会去掉跟踪参数与末尾斜杠', () => {
  const canonical = canonicalUrl('https://WWW.Example.com/a/b/?utm_source=x&b=2&a=1#top');
  assert.equal(canonical, 'https://example.com/a/b?a=1&b=2');
});

await check('相同 URL 生成相同指纹', () => {
  const a = fingerprintOf({ title: 'x', url: 'https://example.com/post?utm_source=a' });
  const b = fingerprintOf({ title: 'y', url: 'https://example.com/post/?utm_medium=b' });
  assert.equal(a, b);
});

await check('中文近义标题相似度高于无关标题', () => {
  const near = titleSimilarity('DeepSeek V4.1 Flash 发布新版本', 'DeepSeek V4.1 Flash 发布新版本了');
  const far = titleSimilarity('DeepSeek V4.1 Flash 发布新版本', '苹果发布新款耳机');
  assert.ok(near > 0.8, `near=${near}`);
  assert.ok(far < 0.2, `far=${far}`);
});

console.log('\n[2] API 契约');
await check('GET /api/health 返回 200 与能力标记', async () => {
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.capabilities.ai, 'boolean');
});

await check('GET /api/stats 包含统计字段', async () => {
  const { status, body } = await api('/api/stats');
  assert.equal(status, 200);
  for (const key of ['total', 'today', 'real', 'fake', 'keywords', 'bySource', 'byImportance', 'timeline']) {
    assert.ok(key in body, `缺少字段 ${key}`);
  }
});

await check('GET /api/hotspots 返回分页结构', async () => {
  const { status, body } = await api('/api/hotspots?limit=3');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length <= 3);
  assert.equal(typeof body.total, 'number');
  if (body.items[0]) {
    for (const key of ['id', 'title', 'source', 'importance', 'aiStatus']) {
      assert.ok(key in body.items[0], `热点缺少字段 ${key}`);
    }
  }
});

await check('GET /api/hotspots 支持多选等级与综合排序', async () => {
  const { status, body } = await api('/api/hotspots?sort=recommended&importance=urgent,high&limit=10');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
  for (const item of body.items) {
    assert.ok(['urgent', 'high'].includes(item.importance), `未过滤的等级 ${item.importance}`);
  }
});

await check('GET /api/hotspots 相关度门槛生效', async () => {
  const { status, body } = await api('/api/hotspots?relevanceMin=80&limit=10');
  assert.equal(status, 200);
  for (const item of body.items) {
    assert.ok(item.relevance >= 80, `relevance=${item.relevance}`);
  }
});

await check('GET /api/hotspots 未知筛选值回落为默认排序', async () => {
  const { status, body } = await api('/api/hotspots?sort=whatever&trust=nope&limit=3');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
});

await check('GET /api/hotspots 时间窗口过滤不超过窗口', async () => {
  const { status, body } = await api('/api/hotspots?hours=6&limit=10');
  assert.equal(status, 200);
  const limit = Date.now() - 6 * 3600_000 - 60_000;
  for (const item of body.items) {
    const time = Date.parse(item.publishedAt || item.createdAt);
    assert.ok(time >= limit, `超出 6h 窗口：${item.publishedAt || item.createdAt}`);
  }
});

const term = `测试词-${Date.now()}`;
let keywordId = null;

await check('POST /api/keywords 可创建关键词', async () => {
  const { status, body } = await api('/api/keywords', {
    method: 'POST',
    body: JSON.stringify({ term, domain: 'AI 编程' }),
  });
  assert.equal(status, 201);
  assert.equal(body.term, term);
  keywordId = body.id;
});

await check('重复关键词返回 409', async () => {
  const { status } = await api('/api/keywords', { method: 'POST', body: JSON.stringify({ term }) });
  assert.equal(status, 409);
});

await check('PUT /api/keywords/:id 可切换启用状态', async () => {
  const { status, body } = await api(`/api/keywords/${keywordId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(status, 200);
  assert.equal(body.enabled, false);
});

await check('DELETE /api/keywords/:id 可删除关键词', async () => {
  const { status } = await api(`/api/keywords/${keywordId}`, { method: 'DELETE' });
  assert.equal(status, 200);
  const list = await api('/api/keywords');
  assert.ok(!list.body.items.some((item) => item.id === keywordId));
});

await check('GET /api/settings 不泄露密钥', async () => {
  const { status, body } = await api('/api/settings');
  assert.equal(status, 200);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('sk-'), '响应中包含疑似密钥');
  assert.ok(!('apiKey' in body));
  assert.equal(typeof body.capabilities.ai, 'boolean');
});

await check('PUT /api/settings 校验非法邮箱', async () => {
  const { status } = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ emailTo: 'not-an-email' }),
  });
  assert.equal(status, 400);
});

await check('GET /api/notifications 返回列表', async () => {
  const { status, body } = await api('/api/notifications?limit=5');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
});

if (process.env.RUN_COLLECT === '1') {
  console.log('\n[3] 真实抓取链路');
  await check('POST /api/collect 完成一轮采集', async () => {
    const { status, body } = await api('/api/collect', { method: 'POST' });
    assert.equal(status, 200);
    assert.ok(typeof body.found === 'number');
    assert.ok(typeof body.created === 'number');
  });
}

console.log(`\n结果：\x1b[32m${passed} 通过\x1b[0m / \x1b[31m${failed} 失败\x1b[0m\n`);
process.exit(failed ? 1 : 0);
