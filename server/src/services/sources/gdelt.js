import { config } from '../../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN_INTERVAL = 10_000;
let lastCallAt = 0;

const parseSeenDate = (value) => {
  // GDELT: 20261111T093000Z
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
};

const request = (url) =>
  fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });

/**
 * GDELT DOC 2.0：全球新闻索引，约 15 分钟更新
 * 免费接口限流严格（≈5 秒/次），这里做 10 秒串行节流 + 429 重试一次。
 */
export async function searchGdelt(keyword) {
  if (!config.sources.gdelt) return { items: [], skipped: '已关闭' };

  const wait = MIN_INTERVAL - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const params = new URLSearchParams({
    query: keyword.term,
    mode: 'artlist',
    maxrecords: String(config.crawler.perKeywordLimit),
    format: 'json',
    timespan: '2d',
    sort: 'datedesc',
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;

  try {
    let response = await request(url);
    if (response.status === 429) {
      await sleep(12_000);
      lastCallAt = Date.now();
      response = await request(url);
    }
    if (response.status === 429) return { items: [], skipped: 'GDELT 限流（429）' };
    if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);

    const text = await response.text();
    if (!text.trim().startsWith('{')) return { items: [], skipped: 'GDELT 返回空结果' };
    const payload = JSON.parse(text);

    const items = (payload.articles || [])
      .map((article) => {
        const title = (article.title || '').trim();
        if (!title || !article.url) return null;
        return {
          title,
          url: article.url,
          snippet: `${article.domain || ''} · ${article.language || ''} · ${article.sourcecountry || ''}`.trim(),
          author: article.domain || 'GDELT',
          publishedAt: parseSeenDate(article.seendate),
          engagement: 0,
        };
      })
      .filter(Boolean);

    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
