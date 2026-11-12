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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

export const isCollecting = () => running;

async function collectForKeyword(keyword) {
  const found = [];
  const errors = [];

  try {
    const results = await searchBing(keyword);
    for (const item of results) found.push({ ...item, source: 'bing' });
  } catch (error) {
    errors.push({ source: 'bing', message: error.message });
  }

  if (config.twitter.apiKey) {
    const twitter = await searchTwitter(keyword);
    if (twitter.skipped) errors.push({ source: 'twitter', message: twitter.skipped });
    for (const item of twitter.items) found.push({ ...item, source: 'twitter' });
  }

  return { found, errors };
}

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

  const summary = { runId, keywords: keywords.length, found: 0, created: 0, analyzed: 0, errors: [], newItems: [] };

  try {
    const fresh = [];
    for (let index = 0; index < keywords.length; index += 1) {
      const keyword = keywords[index];
      const { found, errors } = await collectForKeyword(keyword);
      summary.found += found.length;
      summary.errors.push(...errors.map((error) => ({ keyword: keyword.term, ...error })));

      for (const item of found) {
        const result = dedupe({ title: item.title, url: item.url });
        if (result.duplicate) continue;
        const inserted = insertHotspot({
          ...item,
          keywordId: keyword.id,
          keyword: keyword.term,
          fingerprint: result.fingerprint,
        });
        invalidateRecentCache();
        summary.created += 1;
        fresh.push(inserted);
      }

      touchKeyword(keyword.id);

      if (index < keywords.length - 1) {
        await sleep(config.crawler.delayMs);
      }
    }

    if (fresh.length) {
      const budget = config.ai.maxItemsPerRun;
      const queue = fresh.slice(0, budget);
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
