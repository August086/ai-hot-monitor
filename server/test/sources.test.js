/**
 * 信息源与质量闸门单元测试：不依赖网络，也不需要启动服务。
 */
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { passesQuality } from '../src/services/sources/hackernews.js';
import { matchesKeyword, parseFeed } from '../src/services/sources/rss.js';
import { inDomainList } from '../src/services/sources/gdelt.js';
import { isWhitelistedMedia, parseBaiduResults, parseRelativeTime } from '../src/services/sources/baidu.js';
import { qualityScore, selectForAnalysis } from '../src/services/collector.js';

// 固定阈值，避免本地 .env 影响断言
config.quality.hnMinPoints = 5;
config.quality.hnMinComments = 2;
config.quality.perSourceAiRatio = 0.4;
config.ai.maxItemsPerRun = 12;

let passed = 0;
let failed = 0;

const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${error.message}`);
  }
};

console.log('\n[1] HN 质量门槛');
check('5 赞 0 评论通过', () => assert.equal(passesQuality(5, 0), true));
check('0 赞 2 评论通过', () => assert.equal(passesQuality(0, 2), true));
check('4 赞 1 评论被过滤', () => assert.equal(passesQuality(4, 1), false));
check('0 赞 0 评论被过滤', () => assert.equal(passesQuality(0, 0), false));

console.log('\n[2] 关键词匹配');
check('英文整词命中', () => assert.equal(matchesKeyword('OpenAI 发布新模型', 'OpenAI'), true));
check('Open AI 与 OpenAI 等价命中', () => assert.equal(matchesKeyword('Open AI 发布新模型', 'OpenAI'), true));
check('中文命中', () => assert.equal(matchesKeyword('DeepSeek V4 发布', 'DeepSeek'), true));
check('多词全部命中才算', () => assert.equal(matchesKeyword('AI 编程工具更新', 'AI 编程'), true));
check('无关内容不命中', () => assert.equal(matchesKeyword('苹果发布新款耳机', 'DeepSeek'), false));
check('短词按词边界，不误命中 training', () =>
  assert.equal(matchesKeyword('training data is useful', 'AI'), false));
check('短词可命中独立单词 AI', () => assert.equal(matchesKeyword('AI is useful', 'AI'), true));
check('URL 路径可命中关键词', () => assert.equal(matchesKeyword('https://openai.com/index/gpt', 'OpenAI'), true));

console.log('\n[3] RSS 解析');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <item>
      <title>OpenAI 发布新模型</title>
      <link>https://example.com/a</link>
      <description><![CDATA[<p>Hello <b>world</b></p>]]></description>
      <pubDate>Tue, 11 Nov 2026 10:00:00 GMT</pubDate>
      <dc:creator>Alice</dc:creator>
    </item>
    <item>
      <title>没有发布时间的旧文</title>
      <link>https://example.com/b</link>
    </item>
  </channel>
</rss>`;
const rssItems = parseFeed(rss, 'ithome');
check('解析出 1 条有效条目', () => assert.equal(rssItems.length, 1));
check('字段映射正确', () => {
  const [item] = rssItems;
  assert.equal(item.title, 'OpenAI 发布新模型');
  assert.equal(item.url, 'https://example.com/a');
  assert.equal(item.snippet, 'Hello world');
  assert.equal(item.author, 'Alice');
  assert.equal(item.source, 'ithome');
  assert.equal(item.tier, 'A');
  assert.equal(item.publishedAt, '2026-11-11T10:00:00.000Z');
});

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Anthropic 更新</title>
    <link href="https://example.com/atom" />
    <published>2026-11-11T08:00:00Z</published>
    <summary>atom summary</summary>
    <author><name>Bob</name></author>
  </entry>
</feed>`;
const atomItems = parseFeed(atom, 'qbitai');
check('Atom 条目解析正确', () => {
  assert.equal(atomItems.length, 1);
  assert.equal(atomItems[0].url, 'https://example.com/atom');
  assert.equal(atomItems[0].author, 'Bob');
});

console.log('\n[4] GDELT 域名清洗');
check('白名单主域命中', () => assert.equal(inDomainList('ithome.com', ['ithome.com']), true));
check('白名单子域命中', () => assert.equal(inDomainList('news.ithome.com', ['ithome.com']), true));
check('相似域名不误伤', () => assert.equal(inDomainList('notithome.com', ['ithome.com']), false));
check('黑名单命中', () => assert.equal(inDomainList('www.msn.com', ['msn.com']), true));

console.log('\n[5] 来源配额与质量排序');
const makeItems = (source, count, tier = 'B') =>
  Array.from({ length: count }, (_, index) => ({
    id: `${source}-${index}`,
    source,
    tier,
    engagement: index,
    publishedAt: new Date(Date.now() - index * 60_000).toISOString(),
  }));

check('三源时单源不超过 40%', () => {
  const selected = selectForAnalysis(
    [...makeItems('a', 20), ...makeItems('b', 20), ...makeItems('c', 20)],
    12,
  );
  const counts = selected.reduce((map, item) => map.set(item.source, (map.get(item.source) || 0) + 1), new Map());
  assert.equal(selected.length, 12);
  for (const count of counts.values()) assert.ok(count <= 4, `单源 ${count} 条超过配额`);
});

check('两源时剩余预算平均回填', () => {
  const selected = selectForAnalysis([...makeItems('a', 20), ...makeItems('b', 20)], 12);
  const counts = selected.reduce((map, item) => map.set(item.source, (map.get(item.source) || 0) + 1), new Map());
  assert.equal(selected.length, 12);
  assert.equal(counts.get('a'), 6);
  assert.equal(counts.get('b'), 6);
});

check('只有一个来源时仍能填满预算', () => {
  const selected = selectForAnalysis(makeItems('a', 20), 12);
  assert.equal(selected.length, 12);
});

check('新鲜条目优先于陈旧条目', () => {
  const now = Date.now();
  const fresh = qualityScore({ tier: 'B', engagement: 0, publishedAt: new Date(now - 3600_000).toISOString() }, now);
  const stale = qualityScore({ tier: 'B', engagement: 0, publishedAt: new Date(now - 47 * 3600_000).toISOString() }, now);
  assert.ok(fresh > stale, `fresh=${fresh} stale=${stale}`);
});

console.log('\n[6] 百度资讯解析与白名单');
check('相对时间：小时/天/昨天/日期', () => {
  const now = Date.parse('2026-11-12T12:00:00+08:00');
  assert.equal(parseRelativeTime('2小时前', now), new Date(now - 2 * 3600_000).toISOString());
  assert.equal(parseRelativeTime('3天前', now), new Date(now - 3 * 86400_000).toISOString());
  assert.ok(parseRelativeTime('昨天08:13', now)?.startsWith('2026-11-11'));
  assert.equal(parseRelativeTime('2026-11-11', now), '2026-11-10T16:00:00.000Z');
  assert.equal(parseRelativeTime('未知时间', now), null);
});

check('白名单媒体识别', () => {
  assert.equal(isWhitelistedMedia('IT之家', ['it之家']), true);
  assert.equal(isWhitelistedMedia('金融界', ['金融界']), true);
  assert.equal(isWhitelistedMedia('某自媒体', ['IT之家', '金融界']), false);
  assert.equal(isWhitelistedMedia('百家号', ['IT之家']), false);
});

const baiduHtml = `
<div class="result-op c-container"><!--s-data:{"title":"<em>OpenAI</em> 发布新模型","titleUrl":"https://example.com/a","summary":"OpenAI 新模型摘要","sourceName":"IT之家","dispTime":"2小时前"}--></div>
<div class="result-op c-container"><!--s-data:{"title":"OpenAI 旧闻","titleUrl":"https://example.com/b","summary":"OpenAI 旧闻摘要","sourceName":"金融界","dispTime":"3天前"}--></div>
<div class="result-op c-container"><!--s-data:{"title":"OpenAI 自媒体","titleUrl":"https://example.com/c","summary":"OpenAI 自媒体摘要","sourceName":"某自媒体","dispTime":"1小时前"}--></div>
<div class="result-op c-container"><!--s-data:{"title":"苹果发布耳机","titleUrl":"https://example.com/d","summary":"与关键词无关","sourceName":"量子位","dispTime":"1小时前"}--></div>
`;
const baiduItems = parseBaiduResults(baiduHtml, { term: 'OpenAI' });
check('百度结果只保留白名单 + 关键词 + 48h', () => {
  assert.equal(baiduItems.length, 1);
  const [item] = baiduItems;
  assert.equal(item.title, 'OpenAI 发布新模型');
  assert.equal(item.url, 'https://example.com/a');
  assert.equal(item.author, 'IT之家');
  assert.equal(item.source, 'baidu');
  assert.equal(item.tier, 'A');
  assert.ok(item.snippet.includes('OpenAI'));
});

console.log(`\n结果：\x1b[32m${passed} 通过\x1b[0m / \x1b[31m${failed} 失败\x1b[0m\n`);
process.exit(failed ? 1 : 0);
