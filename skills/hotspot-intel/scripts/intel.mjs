#!/usr/bin/env node
/**
 * hotspot-intel Skill CLI —— 零第三方依赖，只通过 HTTP 读取/操作 NEON//WATCH。
 *
 * 设计约束：
 * 1. 不 import 服务端任何代码，整目录可复制到其它 agent 使用；
 * 2. 所有数据来自接口输出，CLI 只做「多次请求 + 本地计算」的组合；
 * 3. 输出统一 JSON（--md 时输出 markdown），便于 Agent 解析与引用。
 *
 * 环境变量：
 *   WATCH_API      服务地址，默认 http://localhost:8787
 *   WATCH_TIMEOUT  单次请求超时毫秒，默认 120000
 */
const BASE = (process.env.WATCH_API || 'http://localhost:8787').replace(/\/$/, '');
const TIMEOUT = Number(process.env.WATCH_TIMEOUT || 120_000);

const [command, ...rest] = process.argv.slice(2);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        index += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
      ...options,
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? `请求超时（>${TIMEOUT}ms）` : '连接失败';
    throw new Error(`${reason}：无法访问 ${BASE}${path}。请确认服务已启动，或用 WATCH_API 指定正确地址。`);
  }
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const out = (value) => console.log(JSON.stringify(value, null, 2));

// ---------- 本地计算：与 server/src/services/dedupe.js 同口径 ----------
function normalizeTitle(title) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

function bigrams(text) {
  const clean = normalizeTitle(text).replace(/\s+/g, '');
  const set = new Set();
  if (clean.length <= 2) {
    if (clean) set.add(clean);
    return set;
  }
  for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2));
  return set;
}

function titleSimilarity(a, b) {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) if (setB.has(token)) overlap += 1;
  return (2 * overlap) / (setA.size + setB.size);
}

const toMs = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? null : parsed;
};

function relativeTime(value) {
  const ms = toMs(value);
  if (ms === null) return '时间未知';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)} 小时前`;
  return `${Math.round(diff / 86_400_000)} 天前`;
}

const localTime = (value) => {
  const ms = toMs(value);
  if (ms === null) return value || '时间未知';
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
};

const IMPORTANCE_LABEL = { urgent: '紧急', high: '高', medium: '中', low: '低' };
const importanceText = (value) => IMPORTANCE_LABEL[value] || '未评级';

function caveat(item) {
  const notes = [];
  if (item.isReal === false) notes.push('AI 判定存疑');
  if (item.isReal === null || item.isReal === undefined) notes.push('未研判真假');
  if (item.aiStatus === 'heuristic') notes.push('启发式判定（未调用大模型）');
  if (item.aiStatus === 'pending') notes.push('待研判');
  if (item.aiStatus === 'failed') notes.push('研判失败');
  if (item.source === 'seed') notes.push('演示数据');
  return notes;
}

// ---------- 组合命令：brief ----------
/**
 * 同一事件常被多家转载，会导致「值得写」里出现两条几乎一样的条目。
 * 这里按标题相似度归并：保留排名靠前的那条，其余记录到 alsoIn（来源 + 链接）。
 */
function mergeSameEvent(items, limit, threshold) {
  const picked = [];
  for (const item of items) {
    if (picked.length >= limit) break;
    const duplicate = picked.find((entry) => titleSimilarity(entry.title, item.title) >= threshold);
    if (duplicate) {
      duplicate.alsoIn.push({ id: item.id, source: item.source, url: item.url });
      continue;
    }
    picked.push({ ...item, alsoIn: [] });
  }
  return picked;
}

async function cmdBrief(flags) {
  const hours = Math.max(1, Number(flags.hours) || 24);
  const limit = Math.min(20, Math.max(1, Number(flags.limit) || 5));
  const threshold = sameEventThreshold(flags);

  const query = new URLSearchParams({
    hours: String(hours),
    dated: 'true',
    sort: String(flags.sort || 'recommended'),
    limit: String(Math.min(60, Math.max(12, limit * 4))),
  });
  if (flags.importance) query.set('importance', String(flags.importance));
  if (flags.keyword) query.set('keyword', String(flags.keyword));
  if (flags.real) query.set('isReal', 'real');

  const suspiciousQuery = new URLSearchParams({
    hours: String(hours),
    dated: 'true',
    isReal: 'fake',
    sort: 'latest',
    limit: '5',
  });

  const [stats, top, suspicious, keywordPayload] = await Promise.all([
    request('/api/stats'),
    request(`/api/hotspots?${query.toString()}`),
    request(`/api/hotspots?${suspiciousQuery.toString()}`),
    request('/api/keywords').catch(() => ({ items: [] })),
  ]);

  const windowKey = hours <= 24 ? 'last24h' : hours <= 48 ? 'last48h' : 'last7d';
  const byKeyword = (keywordPayload.items || [])
    .filter((item) => item.stats && item.stats[windowKey] > 0)
    .map((item) => ({
      term: item.term,
      domain: item.domain,
      count: item.stats[windowKey],
      avgRelevance: item.stats.avgRelevance,
      pending: item.stats.pending,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const payload = {
    window: `${hours}h`,
    generatedAt: new Date().toISOString(),
    filters: {
      importance: flags.importance || null,
      keyword: flags.keyword || null,
      realOnly: Boolean(flags.real),
      sort: flags.sort || 'recommended',
    },
    counts: {
      total: stats.total,
      today: stats.today,
      urgent: stats.urgent,
      pending: stats.pending,
      listed: top.total,
    },
    top: mergeSameEvent(top.items, limit, threshold).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      importance: item.importance,
      relevance: item.relevance,
      summary: item.summary,
      reason: item.aiReason,
      publishedAt: item.publishedAt,
      publishedAgo: relativeTime(item.publishedAt || item.createdAt),
      url: item.url,
      alsoIn: item.alsoIn,
      caveats: caveat(item),
    })),
    suspicious: suspicious.items.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      reason: item.aiReason,
      url: item.url,
    })),
    byKeyword,
    sameEventThreshold: threshold,
  };

  payload.markdown = renderBriefMarkdown(payload);
  if (flags.md) {
    console.log(payload.markdown);
    return;
  }
  out(payload);
}

function renderBriefMarkdown(brief) {
  const lines = [];
  const label = brief.window === '24h' ? '近 24 小时' : brief.window === '48h' ? '近 48 小时' : `近 ${brief.window}`;
  lines.push(`# 热点简报 · ${label}`);
  lines.push('');
  lines.push(
    `> 生成于 ${localTime(brief.generatedAt)} · 库内共 ${brief.counts.total} 条（今日新增 ${brief.counts.today} · 紧急 ${brief.counts.urgent} · 待研判 ${brief.counts.pending}）`,
  );
  if (brief.filters.importance) lines.push(`> 等级过滤：${brief.filters.importance}`);
  if (brief.filters.keyword) lines.push(`> 监控词：${brief.filters.keyword}`);
  lines.push('');

  lines.push('## 值得写');
  if (!brief.top.length) {
    lines.push('_该窗口内没有符合条件的信号，可放宽时间窗口或触发一轮采集。_');
  }
  brief.top.forEach((item, index) => {
    const meta = [`${importanceText(item.importance)}`, item.relevance === null ? null : `REL ${item.relevance}`, item.source, item.publishedAgo]
      .filter(Boolean)
      .join(' · ');
    lines.push(`${index + 1}. **${item.title}**`);
    lines.push(`   - ${meta}`);
    if (item.summary) lines.push(`   - 摘要：${item.summary}`);
    if (item.reason) lines.push(`   - 判定：${item.reason}`);
    if (item.alsoIn && item.alsoIn.length) {
      lines.push(`   - 同事件另见：${item.alsoIn.map((entry) => entry.source).join(' / ')}`);
    }
    if (item.caveats.length) lines.push(`   - 注意：${item.caveats.join('；')}`);
    if (item.url) lines.push(`   - 原文：${item.url}`);
  });
  lines.push('');

  if (brief.suspicious.length) {
    lines.push('## 存疑（不建议直接作为选题）');
    for (const item of brief.suspicious) {
      lines.push(`- ${item.title}（${item.source}）${item.reason ? ` —— ${item.reason}` : ''}`);
      if (item.url) lines.push(`  ${item.url}`);
    }
    lines.push('');
  }

  if (brief.byKeyword.length) {
    lines.push('## 监控词产出');
    lines.push('');
    lines.push('| 关键词 | 条数 | 平均相关度 | 待研判 |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of brief.byKeyword) {
      lines.push(`| ${row.term} | ${row.count} | ${row.avgRelevance ?? '—'} | ${row.pending} |`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ---------- 组合命令：verify ----------
const SAME_EVENT_THRESHOLD = 0.62;

/** 允许用 --same-event 0.4 这类参数覆盖默认阈值（仅影响 brief / verify 的“同事件”判定） */
function sameEventThreshold(flags) {
  const raw = Number(flags['same-event']);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return SAME_EVENT_THRESHOLD;
  return raw;
}

async function resolveTarget(flags, positional) {
  const id = positional[0];
  if (id) {
    const hotspot = await request(`/api/hotspots/${encodeURIComponent(id)}`);
    return { hotspot, via: `id:${id}` };
  }

  if (flags.url) {
    const payload = await request(`/api/hotspots?q=${encodeURIComponent(String(flags.url))}&limit=10`);
    const items = payload.items || [];
    const exact = items.find((item) => item.url === flags.url);
    if (!exact && !items.length) throw new Error('库内没有找到该链接对应的条目');
    return { hotspot: exact || items[0], via: `url:${flags.url}` };
  }

  if (flags.q) {
    const text = String(flags.q);
    const payload = await request(`/api/hotspots?q=${encodeURIComponent(text)}&limit=20`);
    const items = payload.items || [];
    if (!items.length) throw new Error(`库内没有匹配「${text}」的条目`);
    const best = items
      .map((item) => ({ item, score: titleSimilarity(text, item.title) }))
      .sort((a, b) => b.score - a.score)[0];
    return { hotspot: best.item, via: `q:${text}` };
  }

  throw new Error('用法：verify <id> | verify --url <链接> | verify --q <标题/关键词>');
}

async function cmdVerify(flags, positional) {
  const { hotspot, via } = await resolveTarget(flags, positional);
  const threshold = sameEventThreshold(flags);
  const recent = await request('/api/hotspots?hours=168&limit=200');
  const pool = (recent.items || []).filter((item) => item.id !== hotspot.id);

  const sameEvent = pool
    .map((item) => ({ item, score: titleSimilarity(hotspot.title, item.title) }))
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ item, score }) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      author: item.author,
      publishedAt: item.publishedAt,
      publishedAgo: relativeTime(item.publishedAt || item.createdAt),
      similarity: Number(score.toFixed(2)),
      url: item.url,
    }));

  const sources = [...new Set([hotspot.source, ...sameEvent.map((item) => item.source)])];
  const analyzed = hotspot.aiStatus === 'analyzed';
  const reallyTrue = hotspot.isReal === true;

  let confidence = 'low';
  if (reallyTrue && analyzed && sources.length >= 2) confidence = 'high';
  else if (reallyTrue && (analyzed || hotspot.aiStatus === 'heuristic')) confidence = 'medium';

  const advice =
    confidence === 'high'
      ? '多来源交叉且 AI 判真，可以直接作为选题素材，写作时引用原文链接。'
      : confidence === 'medium'
        ? 'AI 判真但仅单一来源，建议先打开原文确认细节，再决定是否开写。'
        : 'AI 判定存疑或尚未研判，不建议直接开写；需要人工核实来源与事实。';

  const checks = [
    {
      key: 'aiVerdict',
      pass: reallyTrue,
      detail: `AI 判定：${hotspot.isReal === null ? '未研判' : reallyTrue ? '真实' : '存疑'}${hotspot.aiReason ? `（${hotspot.aiReason}）` : ''}`,
    },
    {
      key: 'aiStatus',
      pass: analyzed,
      detail: `研判状态：${hotspot.aiStatus}${hotspot.aiModel ? ` · ${hotspot.aiModel}` : ''}`,
    },
    {
      key: 'crossSource',
      pass: sources.length >= 2,
      detail: `来源数：${sources.length}（${sources.join(' / ')}）`,
    },
    {
      key: 'partialDuplicate',
      pass: sameEvent.length > 0,
      detail: sameEvent.length
        ? `发现 ${sameEvent.length} 条同事件报道，最高相似度 ${sameEvent[0].similarity}`
        : '未发现同事件的其它报道',
    },
  ];

  out({
    via,
    target: {
      id: hotspot.id,
      title: hotspot.title,
      source: hotspot.source,
      author: hotspot.author,
      publishedAt: hotspot.publishedAt,
      publishedAgo: relativeTime(hotspot.publishedAt || hotspot.createdAt),
      importance: hotspot.importance,
      relevance: hotspot.relevance,
      summary: hotspot.summary,
      aiStatus: hotspot.aiStatus,
      aiModel: hotspot.aiModel,
      isReal: hotspot.isReal,
      url: hotspot.url,
      caveats: caveat(hotspot),
    },
    sameEvent,
    sources: { count: sources.length, list: sources },
    confidence,
    advice,
    checks,
    threshold,
  });
}

// ---------- 组合命令：audit ----------
function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[\s\-_·.,，。]+/g, '');
}

/** 按词切分（英文/数字按非字母数字切，中文整段保留），用于判断「一个词是另一个词的前缀」 */
function termTokens(term) {
  return String(term || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const isPrefixOf = (shortTokens, longTokens) =>
  shortTokens.length > 0 &&
  shortTokens.length <= longTokens.length &&
  shortTokens.every((token, index) => token === longTokens[index]);

function auditLabel(entry) {
  const { stats, lastCheckedAt } = entry;
  if (!lastCheckedAt) return { health: '未扫描', hint: '还没有跑过采集，点一次「立即扫描」或在设置里等定时任务。' };
  if (!stats || stats.total === 0) return { health: '无产出', hint: '库内没有任何信号，换更具体的词或补范围限定。' };
  if (stats.last7d <= 2) return { health: '低产', hint: '近 7 天几乎没产出，考虑换词或停用，避免占满采集配额。' };
  if (stats.last7d >= 10 && stats.avgRelevance !== null && stats.avgRelevance < 45) {
    return { health: '过宽', hint: '条数多但平均相关度低，建议加范围限定（如「大模型 发布」）收窄。' };
  }
  if (stats.last7d >= 15 && (stats.avgRelevance ?? 0) >= 55) {
    return { health: '高产', hint: '持续高产出且相关度不错，可优先巡检这个词的信号。' };
  }
  return { health: '健康', hint: '产出与相关度都在合理区间。' };
}

async function cmdAudit() {
  const payload = await request('/api/keywords');
  const items = payload.items || [];

  const rows = items.map((item) => {
    const { health, hint } = auditLabel(item);
    return {
      id: item.id,
      term: item.term,
      domain: item.domain,
      enabled: item.enabled,
      lastCheckedAt: item.lastCheckedAt,
      lastCheckedAgo: item.lastCheckedAt ? relativeTime(item.lastCheckedAt) : '尚未扫描',
      last24h: item.stats?.last24h ?? 0,
      last7d: item.stats?.last7d ?? 0,
      total: item.stats?.total ?? 0,
      avgRelevance: item.stats?.avgRelevance ?? null,
      pending: item.stats?.pending ?? 0,
      health,
      hint,
    };
  });

  // 只把「完全相同」或「一个词是另一个词的前缀」视为可疑重复，避免 Agent / Agentic Coding 这类误报
  const duplicates = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = normalizeTerm(rows[i].term);
      const b = normalizeTerm(rows[j].term);
      if (a.length < 2 || b.length < 2) continue;
      if (a === b) {
        duplicates.push({ a: rows[i].term, b: rows[j].term, reason: '完全相同' });
        continue;
      }
      const tokensA = termTokens(rows[i].term);
      const tokensB = termTokens(rows[j].term);
      if (isPrefixOf(tokensA, tokensB) || isPrefixOf(tokensB, tokensA)) {
        duplicates.push({ a: rows[i].term, b: rows[j].term, reason: '一个词是另一个词的前缀' });
      }
    }
  }

  const suggestions = [];
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.health === '无产出' || row.health === '低产') suggestions.push(`「${row.term}」${row.health}：${row.hint}`);
    if (row.health === '过宽') suggestions.push(`「${row.term}」过宽：${row.hint}`);
  }
  for (const pair of duplicates) suggestions.push(`「${pair.a}」与「${pair.b}」疑似重复（${pair.reason}），建议合并或停用其一。`);

  const summary = {};
  for (const row of rows) summary[row.health] = (summary[row.health] || 0) + 1;

  out({
    generatedAt: new Date().toISOString(),
    count: rows.length,
    summary,
    duplicates,
    suggestions,
    keywords: rows,
  });
}

// ---------- 入口 ----------
async function main() {
  const { positional, flags } = parseArgs(rest);
  const limit = flags.limit ? Number(flags.limit) : undefined;

  switch (command) {
    case 'brief': {
      await cmdBrief(flags);
      return;
    }

    case 'verify': {
      await cmdVerify(flags, positional);
      return;
    }

    case 'audit': {
      await cmdAudit();
      return;
    }

    case 'stats': {
      out(await request('/api/stats'));
      return;
    }

    case 'hotspots': {
      const search = new URLSearchParams();
      if (limit) search.set('limit', String(limit));
      if (flags.importance) search.set('importance', String(flags.importance));
      if (flags.source) search.set('source', String(flags.source));
      if (flags.days) search.set('days', String(flags.days));
      if (flags.hours) search.set('hours', String(flags.hours));
      if (flags.q) search.set('q', String(flags.q));
      if (flags.keyword) search.set('keyword', String(flags.keyword));
      if (flags.real) search.set('isReal', 'real');
      if (flags.fake) search.set('isReal', 'fake');
      if (flags.unknown) search.set('isReal', 'unknown');
      if (flags.status) search.set('status', String(flags.status));
      if (flags['relevance-min']) search.set('relevanceMin', String(flags['relevance-min']));
      if (flags['engagement-min']) search.set('engagementMin', String(flags['engagement-min']));
      if (flags.from) search.set('from', String(flags.from));
      if (flags.to) search.set('to', String(flags.to));
      if (flags.notified) search.set('notified', String(flags.notified));
      if (flags.sort) search.set('sort', String(flags.sort));
      if (flags.dir) search.set('dir', String(flags.dir));
      if (flags['title-only']) search.set('qMode', 'title');
      if (flags.dated) search.set('dated', 'true');
      out(await request(`/api/hotspots?${search.toString()}`));
      return;
    }

    case 'get': {
      if (!positional[0]) throw new Error('用法：get <hotspotId>');
      out(await request(`/api/hotspots/${encodeURIComponent(positional[0])}`));
      return;
    }

    case 'search': {
      const term = positional.join(' ').trim();
      if (!term) throw new Error('用法：search <关键词> [--domain 范围]');
      out(
        await request('/api/hotspots/search', {
          method: 'POST',
          body: JSON.stringify({ term, domain: flags.domain || '', analyze: !flags['no-ai'] }),
        }),
      );
      return;
    }

    case 'analyze': {
      if (!positional[0]) throw new Error('用法：analyze <hotspotId>');
      out(await request(`/api/hotspots/${encodeURIComponent(positional[0])}/analyze`, { method: 'POST' }));
      return;
    }

    case 'keywords': {
      out(await request('/api/keywords'));
      return;
    }

    case 'add-keyword': {
      const term = positional.join(' ').trim();
      if (!term) throw new Error('用法：add-keyword <关键词> [--domain 范围]');
      out(
        await request('/api/keywords', {
          method: 'POST',
          body: JSON.stringify({ term, domain: flags.domain || '' }),
        }),
      );
      return;
    }

    case 'toggle-keyword': {
      const [id, state] = positional;
      if (!id || !state) throw new Error('用法：toggle-keyword <id> <on|off>');
      out(
        await request(`/api/keywords/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: state === 'on' }),
        }),
      );
      return;
    }

    case 'delete-keyword': {
      if (!positional[0]) throw new Error('用法：delete-keyword <id>');
      out(await request(`/api/keywords/${encodeURIComponent(positional[0])}`, { method: 'DELETE' }));
      return;
    }

    case 'collect': {
      out(await request('/api/collect', { method: 'POST', body: '{}' }));
      return;
    }

    case 'pending': {
      out(
        await request('/api/analyze-pending', {
          method: 'POST',
          body: JSON.stringify({ limit: limit || 5 }),
        }),
      );
      return;
    }

    case 'notifications': {
      out(await request(`/api/notifications${limit ? `?limit=${limit}` : ''}`));
      return;
    }

    case 'health': {
      out(await request('/api/health'));
      return;
    }

    default: {
      console.error(
        [
          'hotspot-intel Skill CLI（NEON//WATCH）',
          '',
          '组合命令（只读，推荐先用）：',
          '  brief [--hours 24] [--limit 5] [--importance urgent,high] [--keyword 词] [--real] [--md]',
          '  verify <id> | --url <链接> | --q <标题/关键词>',
          '  audit',
          '  以上均支持 --same-event 0.4 覆盖“同事件”相似度阈值（默认 0.62）',
          '',
          '查询命令：',
          '  stats',
          '  hotspots [--limit N] [--importance urgent,high] [--source baidu,ithome] [--hours N|--days N]',
          '           [--sort latest|importance|relevance|engagement|recommended|pending|unnotified]',
          '           [--relevance-min N] [--engagement-min N] [--status analyzed,heuristic]',
          '           [--notified true|false] [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
          '           [--q 文本] [--title-only] [--real|--fake|--unknown] [--keyword 词] [--dated]',
          '  get <id>',
          '  keywords',
          '  notifications [--limit N]',
          '  health',
          '',
          '写操作（执行前必须先向用户确认）：',
          '  search <关键词> [--domain 范围] [--no-ai]',
          '  analyze <id>',
          '  collect',
          '  pending [--limit N]',
          '  add-keyword <关键词> [--domain 范围]',
          '  toggle-keyword <id> <on|off>',
          '  delete-keyword <id>',
        ].join('\n'),
      );
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
