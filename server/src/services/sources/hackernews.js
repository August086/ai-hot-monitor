import { config } from '../../config.js';
import { matchesKeyword } from './match.js';

const HOUR = 3600_000;

/**
 * 质量门槛：有赞或有讨论才值得进入情报流。
 * 阈值可在 .env 调整（HN_MIN_POINTS / HN_MIN_COMMENTS）。
 */
export const passesQuality = (points = 0, comments = 0) =>
  points >= config.quality.hnMinPoints || comments >= config.quality.hnMinComments;

/**
 * Hacker News（Algolia API）：开发者圈的一手讨论，按时间倒序
 */
export async function searchHackerNews(keyword) {
  if (!config.sources.hackernews) return { items: [], skipped: '已关闭' };

  const since = Math.floor((Date.now() - config.freshness.hackernews * HOUR) / 1000);
  const params = new URLSearchParams({
    query: keyword.term,
    tags: 'story',
    hitsPerPage: String(config.crawler.perKeywordLimit),
    numericFilters: `created_at_i>${since}`,
  });

  try {
    const response = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HN HTTP ${response.status}`);
    const payload = await response.json();

    const items = (payload.hits || [])
      .map((hit) => {
        const title = (hit.title || '').trim();
        const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const points = hit.points ?? 0;
        const comments = hit.num_comments ?? 0;
        if (!title || !passesQuality(points, comments)) return null;
        if (!matchesKeyword(title, keyword.term) && !matchesKeyword(url, keyword.term)) return null;
        return {
          title,
          url,
          snippet: `${points} points · ${comments} comments · HN`,
          author: hit.author ? `@${hit.author}` : 'Hacker News',
          publishedAt: hit.created_at || null,
          engagement: points + comments * 2,
          tier: 'B',
        };
      })
      .filter(Boolean);

    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
