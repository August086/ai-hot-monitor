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
    hackernews: bool(process.env.ENABLE_HN, true),
    arxiv: bool(process.env.ENABLE_ARXIV, true),
    gdelt: bool(process.env.ENABLE_GDELT, true),
    huggingface: bool(process.env.ENABLE_HF, false),
  },

  freshness: {
    bing: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    hackernews: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    gdelt: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
    arxiv: num(process.env.ARXIV_FRESHNESS_HOURS, 168, 1, 2160),
    huggingface: num(process.env.HF_FRESHNESS_HOURS, 336, 1, 4320),
    twitter: num(process.env.FRESHNESS_HOURS, 48, 1, 720),
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
