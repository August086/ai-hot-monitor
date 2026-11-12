import * as cheerio from 'cheerio';
import { config } from '../../config.js';
import { matchesKeyword, normalizeText } from './match.js';

/**
 * 百度资讯搜索：唯一验证可用的国内资讯搜索入口。
 * 只保留白名单媒体、命中关键词、且在时效窗口内的条目。
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
];

const pickAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decodeHtml = (value) => {
  if (!value) return '';
  return cheerio.load(`<div>${value}</div>`).text().replace(/\s+/g, ' ').trim();
};

export const isWhitelistedMedia = (source, whitelist = config.baidu.mediaWhitelist) => {
  const normalized = normalizeText(source).replace(/\s+/g, '');
  if (!normalized) return false;
  return whitelist.some((name) => {
    const target = normalizeText(name).replace(/\s+/g, '');
    return target && (normalized === target || normalized.includes(target));
  });
};

export const parseRelativeTime = (text, now = Date.now()) => {
  const value = String(text || '').trim();
  if (!value) return null;

  if (/^(刚刚|今天)/.test(value)) return new Date(now).toISOString();

  if (/^昨天/.test(value)) {
    const clock = /(\d{1,2}):(\d{2})/.exec(value);
    const date = new Date(now - 86_400_000);
    if (clock) date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return date.toISOString();
  }

  const minute = /^(\d+)\s*分钟前/.exec(value);
  if (minute) return new Date(now - Number(minute[1]) * 60_000).toISOString();

  const hour = /^(\d+)\s*小时前/.exec(value);
  if (hour) return new Date(now - Number(hour[1]) * 3_600_000).toISOString();

  const day = /^(\d+)\s*天前/.exec(value);
  if (day) return new Date(now - Number(day[1]) * 86_400_000).toISOString();

  const full = /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/.exec(value);
  if (full) {
    const date = new Date(
      `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}T00:00:00+08:00`,
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const short = /^(\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (short) {
    const year = new Date(now).getFullYear();
    const date = new Date(
      `${year}-${String(short[1]).padStart(2, '0')}-${String(short[2]).padStart(2, '0')}T00:00:00+08:00`,
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
};

const isFresh = (publishedAt) => {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return false;
  return Date.now() - published <= config.baidu.freshnessHours * 3600_000;
};

const readDataComment = (nodeHtml) => {
  const match = /s-data:([\s\S]*?)-->/.exec(nodeHtml || '');
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
};

/**
 * 解析百度资讯结果；导出供单元测试使用。
 */
export const parseBaiduResults = (html, { term, now = Date.now() } = {}) => {
  const $ = cheerio.load(html);
  const items = [];

  $('div.result-op.c-container').each((_, node) => {
    if (items.length >= config.baidu.maxResults) return false;
    const data = readDataComment($(node).html());

    const title = decodeHtml(data?.title || $(node).find('h3').first().text());
    const url = data?.titleUrl || $(node).find('h3 a').first().attr('href') || '';
    const summary = decodeHtml(data?.summary || '');
    const source = decodeHtml(data?.sourceName || data?.rtses || $(node).find('[class*="news-source"]').first().text());
    const timeText = data?.dispTime || $(node).find('[class*="c-color-gray2"]').first().text().trim();

    if (!title || !url) return;
    if (!isWhitelistedMedia(source)) return;
    if (term && !matchesKeyword(`${title} ${summary}`, term)) return;

    const publishedAt = parseRelativeTime(timeText, now);
    if (!publishedAt || !isFresh(publishedAt)) return;

    items.push({
      title: title.replace(/\s+/g, ' ').trim(),
      url,
      snippet: summary.slice(0, 300),
      author: source,
      publishedAt,
      engagement: 0,
      source: 'baidu',
      tier: 'A',
    });
  });

  return items;
};

async function fetchNews(keyword, attempt = 0) {
  const params = new URLSearchParams({
    word: keyword.term,
    tn: 'news',
    from: 'news',
    cl: '2',
    rn: '20',
    ct: '1',
  });
  const response = await fetch(`https://news.baidu.com/ns?${params}`, {
    headers: {
      'User-Agent': pickAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (attempt === 0) {
      await sleep(1500 + Math.random() * 1500);
      return fetchNews(keyword, 1);
    }
    throw new Error(`百度资讯 HTTP ${response.status}`);
  }
  const html = await response.text();
  if (/百度安全验证|请输入验证码|wappass\.baidu\.com/.test(html)) {
    throw new Error('百度资讯触发反爬验证');
  }
  if (html.length < 10_000) {
    throw new Error('百度资讯返回异常页面');
  }
  return html;
}

export async function searchBaiduNews(keyword) {
  if (!config.sources.baidu) return { items: [], skipped: '已关闭' };

  try {
    const html = await fetchNews(keyword);
    const items = parseBaiduResults(html, { term: keyword.term });
    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
