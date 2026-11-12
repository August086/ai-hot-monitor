import * as cheerio from 'cheerio';
import { config } from '../../config.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

const pickAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildQuery(term, domain) {
  const scope = domain?.trim();
  if (!scope) return term;
  return `${term} ${scope}`;
}

function isBlockedPage(html) {
  const sample = html.slice(0, 4000).toLowerCase();
  return (
    sample.includes('unusual traffic') ||
    sample.includes('captcha') ||
    sample.includes('verify you are human') ||
    sample.includes('异常流量')
  );
}

function parsePublishedDate(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const now = Date.now();

  const relative = /^(\d+)\s*(分钟|小时|天)前/.exec(trimmed);
  if (relative) {
    const unit = { 分钟: 60_000, 小时: 3_600_000, 天: 86_400_000 }[relative[2]];
    return new Date(now - Number(relative[1]) * unit).toISOString();
  }
  if (/^昨天/.test(trimmed)) return new Date(now - 86_400_000).toISOString();
  if (/^今天|^刚刚/.test(trimmed)) return new Date().toISOString();

  const match = /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/.exec(trimmed);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 8));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function isNavigational(title, href) {
  try {
    const url = new URL(href);
    if (url.pathname === '/' || url.pathname === '') return true;
    if (/(百度百科|维基百科|App Store|应用商店|官方入口|官方网址|官网首页)/.test(title)) return true;
    if (/^(GitHub|DeepSeek|OpenAI|Anthropic|Claude)$/i.test(title.trim())) return true;
  } catch {
    return false;
  }
  return false;
}

function parseResults(html, limit) {
  const $ = cheerio.load(html);
  const results = [];
  const nodes = $('li.b_algo');
  nodes.each((_, node) => {
    if (results.length >= limit) return false;
    const link = $(node).find('h2 a').first();
    const title = link.text().trim();
    const href = link.attr('href') || '';
    if (!title || !/^https?:\/\//.test(href) || isNavigational(title, href)) return;
    const snippet = $(node)
      .find('.b_caption p, .b_snippet, .b_lineclamp2, .b_algoSlug')
      .first()
      .text()
      .trim();
    const rawDate = $(node).find('.news_dt').first().text().trim();
    const attribution = $(node).find('.b_attribution').first().text().trim();
    const publishedAt = parsePublishedDate(rawDate) || parsePublishedDate(attribution);
    results.push({
      title: title.replace(/\s+/g, ' '),
      url: href,
      snippet: snippet.replace(/\s+/g, ' ').slice(0, 500),
      publishedAt,
    });
    return undefined;
  });
  return results;
}

async function fetchBingPage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': pickAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      Referer: 'https://www.bing.com/',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
  const html = await response.text();
  if (isBlockedPage(html)) throw new Error('Bing 返回了反爬验证页');
  return html;
}

/**
 * 抓取 Bing 搜索结果
 * @param {{term: string, domain?: string}} keyword
 */
export async function searchBing(keyword) {
  const query = buildQuery(keyword.term, keyword.domain);
  const params = new URLSearchParams({
    q: query,
    count: String(Math.max(config.crawler.perKeywordLimit * 2, 10)),
    setlang: 'zh-hans',
    setmkt: 'zh-CN',
    mkt: 'zh-CN',
    cc: 'CN',
    form: 'QBLH',
  });
  const url = `https://www.bing.com/search?${params.toString()}`;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const html = await fetchBingPage(url);
      return parseResults(html, config.crawler.perKeywordLimit);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(1500 + Math.random() * 1500);
    }
  }
  throw lastError;
}
