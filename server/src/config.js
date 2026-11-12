import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// 优先读取项目根目录 .env
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });

const num = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const list = (value, fallback = []) => {
  if (value === undefined || value === '') return fallback;
  const items = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return items.length ? items : fallback;
};

// GDELT 只保留主流媒体与 AI 垂直站优先，未知域名仍保留
const GDELT_WHITELIST = [
  '36kr.com',
  'ithome.com',
  'jiqizhixin.com',
  'qbitai.com',
  'infoq.cn',
  'solidot.org',
  'techcrunch.com',
  'theverge.com',
  'arstechnica.com',
  'openai.com',
  'anthropic.com',
  'blog.google',
  'deepmind.google',
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'wsj.com',
  'nytimes.com',
  'theinformation.com',
  'venturebeat.com',
  'engadget.com',
  'wired.com',
  'technologyreview.com',
  'sina.com.cn',
  '163.com',
  'qq.com',
  'sohu.com',
  'people.com.cn',
  'xinhuanet.com',
  'cctv.com',
  'chinanews.com.cn',
];

// 百度资讯只保留有编辑责任的科技/财经媒体，百家号与未知来源默认丢弃
const BAIDU_MEDIA_WHITELIST = [
  'IT之家',
  '36氪',
  '机器之心',
  '量子位',
  'InfoQ',
  '钛媒体',
  '界面新闻',
  '财联社',
  '华尔街见闻',
  '金融界',
  '新浪科技',
  '同花顺',
  '每日经济新闻',
  '第一财经',
  '证券时报',
  '澎湃新闻',
  '新华网',
  '人民网',
  '央视新闻',
  '中国新闻网',
  'TechWeb',
  '快科技',
  '爱范儿',
  '少数派',
  '虎嗅',
  '品玩',
  '智东西',
  '雷峰网',
  '中关村在线',
  '太平洋电脑网',
];

// 聚合站 / 转载站，避免同一新闻反复出现
const GDELT_BLACKLIST = [
  'msn.com',
  'news.google.com',
  'flipboard.com',
  'newsnow.co.uk',
  'feedproxy.google.com',
  'rss.app',
];

const dataDir = path.join(SERVER_ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const config = {
  port: num(process.env.PORT, 8787, 1, 65535),
  dbPath: process.env.DB_PATH
    ? path.resolve(PROJECT_ROOT, process.env.DB_PATH)
    : path.join(dataDir, 'hotmonitor.db'),
  publicDir: path.join(PROJECT_ROOT, 'web', 'dist'),

  crawler: {
    intervalMinutes: num(process.env.COLLECT_INTERVAL_MINUTES, 30, 1, 1440),
    perKeywordLimit: num(process.env.PER_KEYWORD_LIMIT, 8, 1, 30),
    delayMs: num(process.env.CRAWL_DELAY_MS, 6000, 3000, 60000),
    maxKeywordsPerRun: num(process.env.MAX_KEYWORDS_PER_RUN, 10, 1, 100),
  },

  sources: {
    bing: bool(process.env.ENABLE_BING, false),
    hackernews: bool(process.env.ENABLE_HN, true),
    arxiv: bool(process.env.ENABLE_ARXIV, false),
    gdelt: bool(process.env.ENABLE_GDELT, false),
    huggingface: bool(process.env.ENABLE_HF, false),
    rss: bool(process.env.ENABLE_RSS_CN, true),
    baidu: bool(process.env.ENABLE_BAIDU_NEWS, true),
  },

  rss: {
    feeds: list(process.env.RSS_FEEDS, ['ithome', 'solidot', 'infoq', 'qbitai']),
    freshnessHours: num(process.env.RSS_FRESHNESS_HOURS, 48, 1, 720),
  },

  baidu: {
    mediaWhitelist: list(process.env.BAIDU_MEDIA_WHITELIST, BAIDU_MEDIA_WHITELIST),
    freshnessHours: num(process.env.BAIDU_FRESHNESS_HOURS, 48, 1, 720),
    maxResults: num(process.env.BAIDU_MAX_RESULTS, 8, 1, 20),
  },

  quality: {
    hnMinPoints: num(process.env.HN_MIN_POINTS, 5, 0, 10000),
    hnMinComments: num(process.env.HN_MIN_COMMENTS, 2, 0, 10000),
    minTitleLength: num(process.env.MIN_TITLE_LENGTH, 12, 1, 200),
    perSourceAiRatio: Math.min(
      Math.max(Number(process.env.PER_SOURCE_AI_RATIO ?? 0.4) || 0.4, 0.1),
      1,
    ),
    maxItemsPerSourcePerRun: num(process.env.MAX_ITEMS_PER_SOURCE_PER_RUN, 10, 1, 100),
    gdeltWhitelist: list(process.env.GDELT_DOMAIN_WHITELIST, GDELT_WHITELIST),
    gdeltBlacklist: list(process.env.GDELT_DOMAIN_BLACKLIST, GDELT_BLACKLIST),
  },

  freshness: {
    bing: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    hackernews: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    gdelt: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    arxiv: num(process.env.ARXIV_FRESHNESS_HOURS, 168, 1, 2160),
    huggingface: num(process.env.HF_FRESHNESS_HOURS, 336, 1, 4320),
    twitter: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    ithome: num(process.env.RSS_FRESHNESS_HOURS, 48, 1, 720),
    solidot: num(process.env.RSS_FRESHNESS_HOURS, 48, 1, 720),
    infoq: num(process.env.RSS_FRESHNESS_HOURS, 48, 1, 720),
    qbitai: num(process.env.RSS_FRESHNESS_HOURS, 48, 1, 720),
    baidu: num(process.env.BAIDU_FRESHNESS_HOURS, 48, 1, 720),
  },

  ai: {
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || '',
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5',
    fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-2.5-flash',
    heuristicFallback: bool(process.env.AI_HEURISTIC_FALLBACK, true),
    autoAnalyze: bool(process.env.AI_AUTO_ANALYZE, true),
    maxItemsPerRun: num(process.env.AI_MAX_ITEMS_PER_RUN, 12, 1, 50),
    scope: process.env.MONITOR_SCOPE || 'AI 编程、大模型、AI 编程工具与开发者生态',
  },

  twitter: {
    apiKey: process.env.TWITTERAPI_KEY?.trim() || '',
    baseUrl: (process.env.TWITTERAPI_BASE_URL || 'https://api.twitterapi.io').replace(/\/$/, ''),
  },

  smtp: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: num(process.env.SMTP_PORT, 465, 1, 65535),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || '',
    to: process.env.MAIL_TO?.trim() || '',
  },
};

export const capabilities = () => ({
  ai: Boolean(config.ai.apiKey),
  twitter: Boolean(config.twitter.apiKey),
  email: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
});
