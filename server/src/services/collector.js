import { config } from '../config.js';
import {
  finishRun,
  insertHotspot,
  listKeywords,
  pendingHotspots,
  startRun,
  stats,
  touchKeyword,
  updateAnalysis,
} from '../db.js';
import { broadcast } from '../ws.js';
import { analyzeBatch } from './ai.js';
import { dedupe, invalidateRecentCache } from './dedupe.js';
import { dispatchHotspot } from './notifier.js';
import { searchBing } from './sources/bing.js';
import { searchTwitter } from './sources/twitter.js';
import { searchHackerNews } from './sources/hackernews.js';
import { searchArxiv } from './sources/arxiv.js';
import { searchGdelt } from './sources/gdelt.js';
import { searchHuggingFace } from './sources/huggingface.js';
import { searchRssFeeds } from './sources/rss.js';
import { searchBaiduNews } from './sources/baidu.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

export const isCollecting = () => running;

const TIER_SCORE = { S: 40, A: 30, B: 20, C: 10 };

/**
 * 质量分：新鲜度（0-50）+ 来源等级（10-40）+ 互动量（0-20）。
 * 只用于决定谁进入 AI 研判，不落库。
 */
export const qualityScore = (item, now = Date.now()) => {
  const published = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
  const ageHours = Number.isNaN(published) ? 72 : Math.max(0, (now - published) / 3600_000);
  const freshness = (Math.max(0, 48 - ageHours) / 48) * 50;
  const tier = TIER_SCORE[item.tier] ?? TIER_SCORE.B;
  const engagement = Math.min((item.engagement || 0) / 50, 1) * 20;
  return freshness + tier + engagement;
};

/**
 * 按来源轮转选择进入 AI 的条目：单源不超过预算的 40%。
 * 若其他来源没有候选，则回填剩余预算，避免浪费。
 */
export const selectForAnalysis = (items, budget = config.ai.maxItemsPerRun) => {
  const cap = Math.max(1, Math.floor(budget * config.quality.perSourceAiRatio));
  const ranked = [...items].sort((a, b) => qualityScore(b) - qualityScore(a));
  const buckets = new Map();

  for (const item of ranked) {
    const source = item.source || 'unknown';
    if (!buckets.has(source)) buckets.set(source, []);
    buckets.get(source).push(item);
  }

  const selected = [];
  const counts = new Map();
  let progressed = true;

  while (selected.length < budget && progressed) {
    progressed = false;
    for (const [source, list] of buckets) {
      if (selected.length >= budget) break;
      if ((counts.get(source) || 0) >= cap) continue;
      const next = list.shift();
      if (!next) continue;
      selected.push(next);
      counts.set(source, (counts.get(source) || 0) + 1);
      progressed = true;
    }
  }

  // 所有来源都达到配额后，剩余预算在各来源之间平均回填，避免退回单一来源
  if (selected.length < budget) {
    let added = true;
    while (selected.length < budget && added) {
      added = false;
      for (const [, list] of buckets) {
        if (selected.length >= budget) break;
        const next = list.shift();
        if (!next) continue;
        selected.push(next);
        added = true;
      }
    }
  }

  return selected;
};

async function collectForKeyword(keyword) {
  const found = [];
  const errors = [];

  const merge = (result, source) => {
    if (result.skipped && result.skipped !== '已关闭') {
      errors.push({ source, message: result.skipped });
    }
    for (const item of result.items || []) found.push({ ...item, source: item.source || source });
  };

  // Bing 默认关闭：结果普遍没有发布时间，保留代码便于回滚
  if (config.sources.bing) {
    try {
      merge({ items: await searchBing(keyword) }, 'bing');
    } catch (error) {
      errors.push({ source: 'bing', message: error.message });
    }
  }

  // 三个免费实时源可并行
  const [hn, arxiv, hf] = await Promise.all([
    searchHackerNews(keyword),
    searchArxiv(keyword),
    searchHuggingFace(keyword),
  ]);
  merge(hn, 'hackernews');
  merge(arxiv, 'arxiv');
  merge(hf, 'huggingface');

  // 国内科技媒体 RSS：只收关键词命中，条目自带发布时间
  const rss = await searchRssFeeds(keyword);
  for (const error of rss.errors || []) errors.push(error);
  for (const item of rss.items || []) found.push(item);

  // 百度资讯：只保留白名单媒体
  merge(await searchBaiduNews(keyword), 'baidu');

  // GDELT 有频率限制，内部已串行节流
  merge(await searchGdelt(keyword), 'gdelt');

  if (config.twitter.apiKey) {
    merge(await searchTwitter(keyword), 'twitter');
  }

  return { found, errors };
}

const isFresh = (item) => {
  if (!item.publishedAt) return true;
  const published = Date.parse(item.publishedAt);
  if (Number.isNaN(published)) return true;
  const limitHours = config.freshness[item.source] ?? 48;
  return Date.now() - published <= limitHours * 3600_000;
};

function publishStats() {
  broadcast('stats:update', stats());
}

/**
 * 执行一轮采集
 */
export async function runCollection({ trigger = 'scheduled', keywordIds = null } = {}) {
  if (running) return { skipped: 'already-running' };
  running = true;

  let keywords = listKeywords().filter((keyword) => keyword.enabled);
  if (Array.isArray(keywordIds) && keywordIds.length) {
    const allowed = new Set(keywordIds.map(Number));
    keywords = keywords.filter((keyword) => allowed.has(keyword.id));
  }
  keywords = keywords.slice(0, config.crawler.maxKeywordsPerRun);

  const runId = startRun(trigger);
  broadcast('run:update', { id: runId, status: 'running', trigger, keywords: keywords.length });

  const summary = {
    runId,
    keywords: keywords.length,
    found: 0,
    stale: 0,
    filtered: 0,
    created: 0,
    analyzed: 0,
    errors: [],
    newItems: [],
  };

  try {
    const fresh = [];
    const sourceCounts = new Map();
    for (let index = 0; index < keywords.length; index += 1) {
      const keyword = keywords[index];
      const { found, errors } = await collectForKeyword(keyword);
      summary.found += found.length;
      summary.errors.push(...errors.map((error) => ({ keyword: keyword.term, ...error })));

      for (const item of found) {
        const title = String(item.title || '').trim();
        if (title.length < config.quality.minTitleLength) {
          summary.filtered += 1;
          continue;
        }
        if (!isFresh(item)) {
          summary.stale += 1;
          continue;
        }
        const source = item.source || 'unknown';
        if ((sourceCounts.get(source) || 0) >= config.quality.maxItemsPerSourcePerRun) {
          summary.filtered += 1;
          continue;
        }
        const result = dedupe({ title, url: item.url });
        if (result.duplicate) continue;
        const inserted = insertHotspot({
          ...item,
          title,
          keywordId: keyword.id,
          keyword: keyword.term,
          fingerprint: result.fingerprint,
        });
        invalidateRecentCache();
        sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        summary.created += 1;
        fresh.push({ ...inserted, tier: item.tier || 'B' });
      }

      touchKeyword(keyword.id);

      if (index < keywords.length - 1) {
        await sleep(config.crawler.delayMs);
      }
    }

    if (fresh.length) {
      const budget = config.ai.maxItemsPerRun;
      const queue = selectForAnalysis(fresh, budget);
      const results = await analyzeBatch(queue, { scope: config.ai.scope });
      for (const result of results) {
        const updated = result.analysis ? updateAnalysis(result.id, result.analysis) : null;
        if (!updated) continue;
        summary.analyzed += 1;
        summary.newItems.push(updated);
        broadcast('hotspot:new', updated);
        await dispatchHotspot(updated);
      }

      // 还剩额度时，顺手清掉历史积压，避免 pending 越堆越多
      if (summary.analyzed < budget) {
        const extra = await analyzePending(budget - summary.analyzed);
        summary.analyzed += extra.analyzed;
      }
    } else if (config.ai.autoAnalyze) {
      // 本轮没有新信号时，用剩余额度补研判历史积压
      const extra = await analyzePending(config.ai.maxItemsPerRun);
      summary.analyzed += extra.analyzed;
    }

    finishRun(runId, {
      status: 'success',
      keywords: keywords.length,
      found: summary.found,
      created: summary.created,
      analyzed: summary.analyzed,
      error: summary.errors.length ? JSON.stringify(summary.errors).slice(0, 1000) : null,
    });
    broadcast('run:update', { id: runId, status: 'success', ...summary });
    publishStats();
    return summary;
  } catch (error) {
    finishRun(runId, {
      status: 'failed',
      keywords: keywords.length,
      found: summary.found,
      created: summary.created,
      analyzed: summary.analyzed,
      error: error.message,
    });
    broadcast('run:update', { id: runId, status: 'failed', error: error.message });
    throw error;
  } finally {
    running = false;
  }
}

/**
 * 分析积压的 pending 热点（用于补跑/手动触发）
 */
export async function analyzePending(limit = config.ai.maxItemsPerRun) {
  const items = pendingHotspots(limit);
  if (!items.length) return { analyzed: 0, items: [] };
  const results = await analyzeBatch(items, { scope: config.ai.scope });
  const updatedItems = [];
  for (const result of results) {
    const updated = result.analysis ? updateAnalysis(result.id, result.analysis) : null;
    if (!updated) continue;
    updatedItems.push(updated);
    broadcast('hotspot:update', updated);
    if (!updated.notified) await dispatchHotspot(updated);
  }
  publishStats();
  return { analyzed: updatedItems.length, items: updatedItems };
}

/**
 * 手动搜索：关键词不存在则临时创建（不落库）
 */
export async function searchOnce(term, { domain = '', analyze = true } = {}) {
  const keyword = { term, domain };
  const { found, errors } = await collectForKeyword(keyword);
  const created = [];

  for (const item of found) {
    if (String(item.title || '').trim().length < config.quality.minTitleLength) continue;
    if (!isFresh(item)) continue;
    const fingerprint = dedupe({ title: item.title, url: item.url });
    if (fingerprint.duplicate) continue;
    const inserted = insertHotspot({
      ...item,
      keywordId: null,
      keyword: term,
      fingerprint: fingerprint.fingerprint,
    });
    invalidateRecentCache();
    created.push(inserted);
  }

  const output = [];
  if (analyze && created.length) {
    const results = await analyzeBatch(created.slice(0, config.ai.maxItemsPerRun), { scope: config.ai.scope });
    for (const result of results) {
      const updated = result.analysis ? updateAnalysis(result.id, result.analysis) : null;
      if (!updated) continue;
      output.push(updated);
      broadcast('hotspot:new', updated);
      await dispatchHotspot(updated);
    }
  }

  publishStats();
  return { found: found.length, created: created.length, items: output, errors };
}
