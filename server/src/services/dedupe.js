import crypto from 'node:crypto';
import { findHotspotByFingerprint, recentHotspotTitles } from '../db.js';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'spm',
  'ref',
  'ref_src',
];

export function canonicalUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of TRACKING_PARAMS) url.searchParams.delete(key);
    url.searchParams.sort();
    let pathname = url.pathname.replace(/\/+$/, '');
    if (pathname === '') pathname = '/';
    return `${url.protocol}//${url.hostname}${pathname}${url.search}`;
  } catch {
    return rawUrl.trim();
  }
}

export function normalizeTitle(title) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

const bigrams = (text) => {
  const clean = normalizeTitle(text).replace(/\s+/g, '');
  const set = new Set();
  if (clean.length <= 2) {
    if (clean) set.add(clean);
    return set;
  }
  for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2));
  return set;
};

export function titleSimilarity(a, b) {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) if (setB.has(token)) overlap += 1;
  return (2 * overlap) / (setA.size + setB.size);
}

export function fingerprintOf({ title, url }) {
  const canonical = canonicalUrl(url);
  const basis = canonical && canonical.length > 12 ? `u:${canonical}` : `t:${normalizeTitle(title)}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

let recentCache = { at: 0, rows: [] };
const getRecentTitles = () => {
  if (Date.now() - recentCache.at > 60_000) {
    recentCache = { at: Date.now(), rows: recentHotspotTitles(2) };
  }
  return recentCache.rows;
};

export function invalidateRecentCache() {
  recentCache = { at: 0, rows: [] };
}

/**
 * 去重：URL 指纹精确命中，或 7 天内标题相似度 >= 0.86 视为重复
 */
export function dedupe(item) {
  const fingerprint = fingerprintOf(item);
  if (findHotspotByFingerprint(fingerprint)) {
    return { duplicate: true, reason: 'fingerprint', fingerprint };
  }
  const recent = getRecentTitles();
  for (const row of recent) {
    if (titleSimilarity(row.title, item.title) >= 0.86) {
      return { duplicate: true, reason: `similar:#${row.id}`, fingerprint };
    }
  }
  return { duplicate: false, fingerprint };
}
