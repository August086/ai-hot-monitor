import * as cheerio from 'cheerio';
import { config } from '../../config.js';

/**
 * arXiv API：最新论文，按提交时间倒序
 */
export async function searchArxiv(keyword) {
  if (!config.sources.arxiv) return { items: [], skipped: '已关闭' };

  const params = new URLSearchParams({
    search_query: `all:${keyword.term}`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(config.crawler.perKeywordLimit),
  });

  try {
    const response = await fetch(`https://export.arxiv.org/api/query?${params}`, {
      headers: { Accept: 'application/atom+xml' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const items = [];
    $('entry').each((_, node) => {
      const title = $(node).find('title').first().text().replace(/\s+/g, ' ').trim();
      const summary = $(node).find('summary').first().text().replace(/\s+/g, ' ').trim();
      const link = $(node).find('id').first().text().trim();
      const published = $(node).find('published').first().text().trim();
      const author = $(node).find('author name').first().text().trim();
      if (!title || !link) return;
      items.push({
        title,
        url: link,
        snippet: summary.slice(0, 500),
        author: author || 'arXiv',
        publishedAt: published || null,
        engagement: 0,
      });
    });

    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
