/**
 * 演示数据种子：仅在需要预览 UI 时手动执行 `npm run seed -w server`
 * 所有数据 source=seed，不会被误认为真实抓取结果。
 */
import db, { insertHotspot, updateAnalysis, listKeywords, createKeyword } from '../src/db.js';
import { fingerprintOf } from '../src/services/dedupe.js';

const KEYWORDS = [
  { term: 'AI 编程', domain: '' },
  { term: 'DeepSeek', domain: '' },
  { term: 'Claude Code', domain: '' },
];

const DEMO = [
  {
    keyword: 'DeepSeek',
    source: 'seed',
    title: 'DeepSeek-V4.1-Flash-1017 上线：552B MoE，激活参数仅 8B/16B',
    url: 'https://api-docs.deepseek.com/zh-cn/updates/',
    snippet: '官方更新日志显示 V4.1 Flash 已升级至 1017 版本，API 调用方式与价格保持不变，旧模型名请求将路由到新版本。',
    author: 'DeepSeek',
    engagement: 1240,
    analysis: {
      isReal: true,
      relevance: 96,
      importance: 'urgent',
      summary: 'DeepSeek V4.1 Flash 升级 1017 版本，采用非对称架构，API 价格不变。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: '官方文档更新，来源可核实。',
    },
  },
  {
    keyword: 'Claude Code',
    source: 'seed',
    title: 'Claude Code 新增多智能体并行任务与终端内代码审查',
    url: 'https://www.anthropic.com/news',
    snippet: '新版本支持在同一项目内并行运行多个子代理，并在终端内直接生成可交互的代码审查意见。',
    author: 'Anthropic',
    engagement: 860,
    analysis: {
      isReal: true,
      relevance: 94,
      importance: 'high',
      summary: 'Claude Code 支持多智能体并行与终端内代码审查，开发者效率进一步提升。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: '官方渠道发布。',
    },
  },
  {
    keyword: 'AI 编程',
    source: 'seed',
    title: '某博主称「AI 已完全取代初级程序员」，引发社区激烈争论',
    url: 'https://example.com/thread/ai-jobs',
    snippet: '一篇未标注来源的帖子声称多家公司已停止招聘初级工程师，评论区出现大量反驳与辟谣。',
    author: '@unknown',
    engagement: 320,
    analysis: {
      isReal: false,
      relevance: 72,
      importance: 'medium',
      summary: '网传 AI 取代初级程序员，缺乏数据来源，社区普遍质疑。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: '无来源的断言，标题夸张。',
    },
  },
  {
    keyword: 'AI 编程',
    source: 'seed',
    title: '开源终端编码代理发布 0.9 版本，支持本地模型离线推理',
    url: 'https://github.com/example/terminal-agent/releases',
    snippet: '该版本引入本地推理后端，可在无网络环境下完成仓库级重构，并提供可插拔的工具协议。',
    author: 'GitHub',
    engagement: 150,
    analysis: {
      isReal: true,
      relevance: 88,
      importance: 'medium',
      summary: '开源终端编码代理 0.9 支持本地模型离线推理与仓库级重构。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: 'Release 页面可核实。',
    },
  },
  {
    keyword: '大模型',
    source: 'seed',
    title: '多模态大模型在 SWE-bench 上刷新纪录，但复现实验存在争议',
    url: 'https://arxiv.org/abs/0000.00000',
    snippet: '论文报告了新的基准成绩，社区指出评测集可能泄漏，作者已回应将补充消融实验。',
    author: 'arXiv',
    engagement: 90,
    analysis: {
      isReal: true,
      relevance: 81,
      importance: 'medium',
      summary: '新模型刷新 SWE-bench，但评测集泄漏争议尚未有定论。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: '论文可查，争议点明确。',
    },
  },
  {
    keyword: 'DeepSeek',
    source: 'seed',
    title: '网传 DeepSeek 将发布千亿参数视觉模型（未获官方确认）',
    url: 'https://example.com/rumor/deepseek-vision',
    snippet: '匿名爆料称新模型将在下月发布，配图为模糊截图，官方尚未回应。',
    author: '@leaker',
    engagement: 60,
    analysis: {
      isReal: false,
      relevance: 78,
      importance: 'low',
      summary: '匿名爆料 DeepSeek 将发视觉模型，无官方来源，暂不可信。',
      aiModel: 'demo-seed',
      aiStatus: 'analyzed',
      aiReason: '匿名截图，无官方确认。',
    },
  },
];

db.prepare("DELETE FROM hotspots WHERE source = 'seed'").run();

for (const keyword of KEYWORDS) {
  if (!listKeywords().some((item) => item.term === keyword.term)) createKeyword(keyword);
}

const keywordMap = new Map(listKeywords().map((item) => [item.term, item]));
let created = 0;

for (const demo of DEMO) {
  const keyword = keywordMap.get(demo.keyword);
  const inserted = insertHotspot({
    keywordId: keyword?.id ?? null,
    keyword: demo.keyword,
    title: demo.title,
    url: demo.url,
    source: demo.source,
    snippet: demo.snippet,
    author: demo.author,
    publishedAt: null,
    engagement: demo.engagement,
    fingerprint: fingerprintOf({ title: demo.title, url: demo.url }),
  });
  updateAnalysis(inserted.id, demo.analysis);
  created += 1;
}

console.log(`已写入 ${created} 条演示热点与 ${KEYWORDS.length} 个关键词（source=seed）。`);
