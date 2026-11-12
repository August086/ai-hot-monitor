import { config } from '../../config.js';

const HOUR = 3600_000;

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
        if (!title) return null;
        return {
          title,
          url,
          snippet: `${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments · HN`,
          author: hit.author ? `@${hit.author}` : 'Hacker News',
          publishedAt: hit.created_at || null,
          engagement: (hit.points || 0) + (hit.num_comments || 0) * 2,
        };
      })
      .filter(Boolean);

    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
