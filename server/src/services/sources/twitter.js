import { config } from '../../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTweet(tweet) {
  const author = tweet.author || {};
  const url =
    tweet.url ||
    (author.userName && tweet.id ? `https://x.com/${author.userName}/status/${tweet.id}` : '');
  const text = (tweet.text || '').replace(/\s+/g, ' ').trim();
  const title = text.length > 110 ? `${text.slice(0, 110)}…` : text;
  const engagement =
    (tweet.likeCount || 0) +
    (tweet.retweetCount || 0) * 2 +
    (tweet.replyCount || 0) +
    (tweet.quoteCount || 0);

  return {
    title: title || `@${author.userName || 'unknown'} 的推文`,
    url,
    snippet: text.slice(0, 500),
    author: author.userName ? `@${author.userName}` : null,
    publishedAt: tweet.createdAt || null,
    engagement,
  };
}

/**
 * 通过 twitterapi.io 做关键词搜索（Top 排序，兼顾热度）
 * @param {{term: string, domain?: string}} keyword
 */
export async function searchTwitter(keyword) {
  if (!config.twitter.apiKey) {
    return { items: [], skipped: '未配置 TWITTERAPI_KEY' };
  }

  const queryParts = [keyword.term];
  if (keyword.domain) queryParts.push(`(${keyword.domain})`);
  queryParts.push('-filter:retweets');
  const params = new URLSearchParams({
    query: queryParts.join(' '),
    queryType: 'Top',
  });

  const items = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${config.twitter.baseUrl}/twitter/tweet/advanced_search?${params}`, {
        headers: {
          'X-API-Key': config.twitter.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`twitterapi.io HTTP ${response.status}`);
      const payload = await response.json();
      const tweets = payload.tweets || payload.data || [];
      for (const tweet of tweets.slice(0, config.crawler.perKeywordLimit)) {
        const item = normalizeTweet(tweet);
        if (item.title && item.url) items.push(item);
      }
      return { items, skipped: null };
    } catch (error) {
      if (attempt === 0) await sleep(2000);
      else return { items: [], skipped: error.message };
    }
  }
  return { items, skipped: null };
}
