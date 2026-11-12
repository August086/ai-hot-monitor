import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER,
  keyword TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  author TEXT,
  published_at TEXT,
  engagement INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL UNIQUE,
  is_real INTEGER,
  relevance INTEGER,
  importance TEXT,
  summary TEXT,
  ai_model TEXT,
  ai_status TEXT NOT NULL DEFAULT 'pending',
  ai_reason TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hotspots_created ON hotspots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_keyword ON hotspots(keyword_id);
CREATE INDEX IF NOT EXISTS idx_hotspots_importance ON hotspots(importance);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hotspot_id INTEGER,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  keywords INTEGER NOT NULL DEFAULT 0,
  found INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  analyzed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
`);

const now = () => new Date().toISOString();

// 历史数据里 published_at 可能被误写成 URL / 中文日期，置空避免参与时间排序
db.prepare(
  "UPDATE hotspots SET published_at = NULL WHERE published_at IS NOT NULL AND published_at NOT LIKE '____-__-__%'",
).run();

const DEFAULT_SETTINGS = {
  notifyBrowser: 'true',
  notifyEmail: 'false',
  emailTo: '',
  minImportance: 'medium',
  autoAnalyze: 'true',
  scope: config.ai.scope,
  retentionDays: '30',
  collectInterval: String(config.crawler.intervalMinutes),
};

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

const mapKeyword = (row) =>
  row && {
    id: row.id,
    term: row.term,
    domain: row.domain,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
  };

const mapHotspot = (row) =>
  row && {
    id: row.id,
    keywordId: row.keyword_id,
    keyword: row.keyword,
    title: row.title,
    url: row.url,
    source: row.source,
    snippet: row.snippet,
    author: row.author,
    publishedAt: row.published_at,
    engagement: row.engagement,
    fingerprint: row.fingerprint,
    isReal: row.is_real === null ? null : Boolean(row.is_real),
    relevance: row.relevance,
    importance: row.importance,
    summary: row.summary,
    aiModel: row.ai_model,
    aiStatus: row.ai_status,
    aiReason: row.ai_reason,
    notified: Boolean(row.notified),
    createdAt: row.created_at,
  };

const mapRun = (row) =>
  row && {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    keywords: row.keywords,
    found: row.found,
    created: row.created,
    analyzed: row.analyzed,
    error: row.error,
  };

const mapNotification = (row) =>
  row && {
    id: row.id,
    hotspotId: row.hotspot_id,
    channel: row.channel,
    status: row.status,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
  };

// ---------- keywords ----------
export const listKeywords = () =>
  db.prepare('SELECT * FROM keywords ORDER BY created_at DESC').all().map(mapKeyword);

export const getKeyword = (id) =>
  mapKeyword(db.prepare('SELECT * FROM keywords WHERE id = ?').get(Number(id)));

export const findKeywordByTerm = (term) =>
  mapKeyword(db.prepare('SELECT * FROM keywords WHERE lower(term) = lower(?)').get(term));

export const createKeyword = ({ term, domain = '', enabled = true }) => {
  const info = db
    .prepare('INSERT INTO keywords (term, domain, enabled, created_at) VALUES (?, ?, ?, ?)')
    .run(term, domain, enabled ? 1 : 0, now());
  return getKeyword(info.lastInsertRowid);
};

export const updateKeyword = (id, patch) => {
  const current = getKeyword(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare('UPDATE keywords SET term = ?, domain = ?, enabled = ? WHERE id = ?').run(
    next.term,
    next.domain ?? '',
    next.enabled ? 1 : 0,
    Number(id),
  );
  return getKeyword(id);
};

export const deleteKeyword = (id) =>
  db.prepare('DELETE FROM keywords WHERE id = ?').run(Number(id)).changes > 0;

export const touchKeyword = (id) =>
  db.prepare('UPDATE keywords SET last_checked_at = ? WHERE id = ?').run(now(), Number(id));

// ---------- hotspots ----------
export const findHotspotByFingerprint = (fingerprint) =>
  mapHotspot(db.prepare('SELECT * FROM hotspots WHERE fingerprint = ?').get(fingerprint));

export const recentHotspotTitles = (days = 7) => {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  return db
    .prepare('SELECT id, title FROM hotspots WHERE created_at >= ? ORDER BY created_at DESC')
    .all(since);
};

export const insertHotspot = (item) => {
  const info = db
    .prepare(
      `INSERT INTO hotspots
        (keyword_id, keyword, title, url, source, snippet, author, published_at, engagement, fingerprint, ai_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      item.keywordId ?? null,
      item.keyword ?? null,
      item.title,
      item.url ?? '',
      item.source,
      item.snippet ?? '',
      item.author ?? null,
      item.publishedAt ?? null,
      item.engagement ?? 0,
      item.fingerprint,
      now(),
    );
  return mapHotspot(db.prepare('SELECT * FROM hotspots WHERE id = ?').get(info.lastInsertRowid));
};

export const getHotspot = (id) =>
  mapHotspot(db.prepare('SELECT * FROM hotspots WHERE id = ?').get(Number(id)));

export const listHotspots = ({
  limit = 50,
  offset = 0,
  importance,
  source,
  isReal,
  status,
  keyword,
  q,
  days,
  dated,
  sort = 'latest',
} = {}) => {
  const where = [];
  const params = [];
  if (importance) {
    where.push('importance = ?');
    params.push(importance);
  }
  if (source) {
    where.push('source = ?');
    params.push(source);
  }
  if (isReal !== undefined && isReal !== null && isReal !== '') {
    where.push('is_real = ?');
    params.push(String(isReal) === 'true' ? 1 : 0);
  }
  if (status) {
    where.push('ai_status = ?');
    params.push(status);
  }
  if (keyword) {
    where.push('(keyword = ? OR title LIKE ?)');
    params.push(keyword, `%${keyword}%`);
  }
  if (q) {
    where.push('(title LIKE ? OR snippet LIKE ? OR summary LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (days) {
    where.push("COALESCE(NULLIF(published_at, ''), created_at) >= ?");
    params.push(new Date(Date.now() - Number(days) * 86400_000).toISOString());
  }
  if (dated === true || dated === 'true') {
    where.push("published_at IS NOT NULL AND published_at != ''");
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const effectiveTime = "COALESCE(NULLIF(published_at, ''), created_at)";
  const undatedLast = "CASE WHEN NULLIF(published_at, '') IS NULL THEN 1 ELSE 0 END";
  const importanceOrder =
    "CASE importance WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END";
  const orderBy =
    sort === 'importance'
      ? `${importanceOrder}, ${undatedLast}, ${effectiveTime} DESC`
      : `${undatedLast}, ${effectiveTime} DESC, ${importanceOrder}`;
  const rows = db
    .prepare(
      `SELECT * FROM hotspots ${clause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, Math.min(Number(limit) || 50, 200), Number(offset) || 0);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM hotspots ${clause}`).get(...params).c;
  return { items: rows.map(mapHotspot), total };
};

export const updateAnalysis = (id, analysis) => {
  db.prepare(
    `UPDATE hotspots
       SET is_real = ?, relevance = ?, importance = ?, summary = ?, ai_model = ?, ai_status = ?, ai_reason = ?
     WHERE id = ?`,
  ).run(
    analysis.isReal === null || analysis.isReal === undefined ? null : analysis.isReal ? 1 : 0,
    analysis.relevance ?? null,
    analysis.importance ?? null,
    analysis.summary ?? null,
    analysis.aiModel ?? null,
    analysis.aiStatus ?? 'analyzed',
    analysis.aiReason ?? null,
    Number(id),
  );
  return getHotspot(id);
};

export const pendingHotspots = (limit = 12) =>
  db
    .prepare("SELECT * FROM hotspots WHERE ai_status IN ('pending', 'failed') ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(mapHotspot);

export const markNotified = (id) =>
  db.prepare('UPDATE hotspots SET notified = 1 WHERE id = ?').run(Number(id));

export const stats = () => {
  const effective = "COALESCE(NULLIF(published_at, ''), created_at)";
  const total = db.prepare('SELECT COUNT(*) AS c FROM hotspots').get().c;
  const today = new Date(Date.now() - 86400_000).toISOString();
  const todayCount = db
    .prepare(`SELECT COUNT(*) AS c FROM hotspots WHERE ${effective} >= ?`)
    .get(today).c;
  const realCount = db.prepare('SELECT COUNT(*) AS c FROM hotspots WHERE is_real = 1').get().c;
  const fakeCount = db.prepare('SELECT COUNT(*) AS c FROM hotspots WHERE is_real = 0').get().c;
  const fresh = db
    .prepare("SELECT COUNT(*) AS c FROM hotspots WHERE NULLIF(published_at, '') IS NOT NULL AND published_at >= ?")
    .get(new Date(Date.now() - 48 * 3600_000).toISOString()).c;
  const urgent = db
    .prepare("SELECT COUNT(*) AS c FROM hotspots WHERE importance IN ('urgent','high')")
    .get().c;
  const keywordCount = db.prepare('SELECT COUNT(*) AS c FROM keywords WHERE enabled = 1').get().c;
  const byImportance = db
    .prepare('SELECT COALESCE(importance, \'unrated\') AS k, COUNT(*) AS c FROM hotspots GROUP BY k')
    .all()
    .map((r) => ({ key: r.k, count: r.c }));
  const bySource = db
    .prepare('SELECT source AS k, COUNT(*) AS c FROM hotspots GROUP BY k')
    .all()
    .map((r) => ({ key: r.k, count: r.c }));
  const timeline = db
    .prepare(
      `SELECT substr(${effective}, 1, 10) AS day, COUNT(*) AS c
       FROM hotspots WHERE ${effective} >= ? GROUP BY day ORDER BY day ASC`,
    )
    .all(new Date(Date.now() - 7 * 86400_000).toISOString())
    .map((r) => ({ day: r.day, count: r.c }));
  const analyzed = db
    .prepare("SELECT COUNT(*) AS c FROM hotspots WHERE ai_status IN ('analyzed','heuristic')")
    .get().c;
  return {
    total,
    today: todayCount,
    fresh,
    real: realCount,
    fake: fakeCount,
    urgent,
    keywords: keywordCount,
    analyzed,
    pending: Math.max(total - analyzed, 0),
    byImportance,
    bySource,
    timeline,
  };
};

// ---------- notifications ----------
export const addNotification = ({ hotspotId, channel, status, title, detail }) => {
  const info = db
    .prepare(
      'INSERT INTO notifications (hotspot_id, channel, status, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(hotspotId ?? null, channel, status, title, detail ? JSON.stringify(detail) : null, now());
  return mapNotification(db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid));
};

export const listNotifications = (limit = 50) =>
  db
    .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?')
    .all(Math.min(Number(limit) || 50, 200))
    .map(mapNotification);

// ---------- settings ----------
export const getSettings = () =>
  Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));

export const updateSettings = (patch) => {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    stmt.run(key, String(value));
  }
  return getSettings();
};

// ---------- runs ----------
export const startRun = (trigger) => {
  const info = db
    .prepare('INSERT INTO runs (trigger, status, started_at) VALUES (?, ?, ?)')
    .run(trigger, 'running', now());
  return Number(info.lastInsertRowid);
};

export const finishRun = (id, { status, keywords = 0, found = 0, created = 0, analyzed = 0, error = null }) => {
  db.prepare(
    'UPDATE runs SET status = ?, finished_at = ?, keywords = ?, found = ?, created = ?, analyzed = ?, error = ? WHERE id = ?',
  ).run(status, now(), keywords, found, created, analyzed, error, Number(id));
  return mapRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(id)));
};

export const listRuns = (limit = 10) =>
  db
    .prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?')
    .all(Math.min(Number(limit) || 10, 50))
    .map(mapRun);

export const pruneOldData = (days = 30) => {
  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
  const removed = db.prepare('DELETE FROM hotspots WHERE created_at < ? AND notified = 1').run(since).changes;
  db.prepare('DELETE FROM notifications WHERE created_at < ?').run(since);
  db.prepare('DELETE FROM runs WHERE started_at < ?').run(since);
  return removed;
};

export default db;
