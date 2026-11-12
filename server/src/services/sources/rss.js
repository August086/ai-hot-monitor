import * as cheerio from 'cheerio';
import { config } from '../../config.js';
import { matchesKeyword } from './match.js';

export { matchesKeyword, normalizeText } from './match.js';

/**
 * 国内科技媒体 RSS：补足“带发布时间”的中文 AI 资讯。
 * 只保留命中关键词、且在时效窗口内的条目。
 */
export const RSS_FEEDS = {
  ithome: { name: 'IT之家', url: 'https://www.ithome.com/rss/' },
  solidot: { name: 'Solidot', url: 'https://www.solidot.org/index.rss' },
  infoq: { name: 'InfoQ 中国', url: 'https://www.infoq.cn/feed' },
  qbitai: { name: '量子位', url: 'https://www.qbitai.com/feed' },
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CACHE_TTL = 5 * 60_000;
const feedCache = new Map();

export const clearRssCache = () => feedCache.clear();

const stripHtml = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const readDate = (node, $) => {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date']) {
    const child = node.children?.find((item) => item.name === tag);
    if (!child) continue;
    const parsed = new Date($(child).text().trim());
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
};

const readLink = (node, $) => {
  const link = node.children?.find((item) => item.name === 'link');
  if (!link) return '';
  return link.attribs?.href || $(link).text().trim();
};

const readText = (node, $, tags) => {
  for (const tag of tags) {
    const child = node.children?.find((item) => item.name === tag);
    if (child) return $(child).text().trim();
  }
  return '';
};

/**
 * 解析 RSS 2.0 / Atom，返回全部条目（不做关键词与时效过滤）。
 */
export const parseFeed = (xml, feedKey) => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const feedName = RSS_FEEDS[feedKey]?.name || feedKey;
  const nodes = $('item').length ? $('item') : $('entry');
  const items = [];

  nodes.each((_, node) => {
    const title = readText(node, $, ['title']).replace(/\s+/g, ' ').trim();
    const url = readLink(node, $);
    if (!title || !url) return;
    const publishedAt = readDate(node, $);
    if (!publishedAt) return;

    const rawSummary = readText(node, $, ['description', 'summary', 'content', 'content:encoded']);
    items.push({
      title,
      url,
      snippet: stripHtml(rawSummary).slice(0, 300),
      author: readText(node, $, ['dc:creator', 'author']) || feedName,
      publishedAt,
      engagement: 0,
      source: feedKey,
      tier: 'A',
    });
  });

  return items;
};

async function loadFeed(feedKey) {
  const feed = RSS_FEEDS[feedKey];
  if (!feed) throw new Error(`未知 RSS 源：${feedKey}`);

  const cached = feedCache.get(feedKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.items;

  const response = await fetch(feed.url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${feed.name} HTTP ${response.status}`);
  const xml = await response.text();
  const items = parseFeed(xml, feedKey);
  feedCache.set(feedKey, { at: Date.now(), items });
  return items;
}

const isFresh = (publishedAt) => {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return false;
  return Date.now() - published <= config.rss.freshnessHours * 3600_000;
};

/**
 * 按关键词从所有启用的 RSS 源取数。
 * @param {{term: string, domain?: string}} keyword
 */
export async function searchRssFeeds(keyword) {
  if (!config.sources.rss) return { items: [], errors: [], skipped: '已关闭' };

  const feedKeys = config.rss.feeds.filter((key) => RSS_FEEDS[key]);
  const results = await Promise.all(
    feedKeys.map(async (key) => {
      try {
        return { key, items: await loadFeed(key) };
      } catch (error) {
        return { key, error: error.message };
      }
    }),
  );

  const items = [];
  const errors = [];
  for (const result of results) {
    if (result.error) {
      errors.push({ source: result.key, message: result.error });
      continue;
    }
    const matched = result.items
      .filter((item) => isFresh(item.publishedAt) && matchesKeyword(`${item.title} ${item.snippet}`, keyword.term))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, config.crawler.perKeywordLimit);
    items.push(...matched);
  }

  return { items, errors, skipped: null };
}
