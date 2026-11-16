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
CREATE INDEX IF NOT EXISTS idx_hotspots_keyword_term ON hotspots(keyword);
CREATE INDEX IF NOT EXISTS idx_hotspots_importance ON hotspots(importance);
CREATE INDEX IF NOT EXISTS idx_hotspots_relevance ON hotspots(relevance DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_engagement ON hotspots(engagement DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_published ON hotspots(published_at DESC);

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
    ...(row.stats_total === undefined
      ? {}
      : {
          stats: {
            total: row.stats_total ?? 0,
            last24h: row.stats_last24h ?? 0,
            last48h: row.stats_last48h ?? 0,
            last7d: row.stats_last7d ?? 0,
            pending: row.stats_pending ?? 0,
            avgRelevance: row.stats_avg_relevance === null ? null : Math.round(row.stats_avg_relevance),
            latestAt: row.stats_latest_at ?? null,
          },
        }),
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
/**
 * 词表 + 每个词的产出统计（一次 LEFT JOIN 聚合完成）。
 * 时间窗口用与列表一致的“有效时间”（发布时间优先、缺失回落到入库时间），
 * 保证关键词页显示的条数与跳转到热点流后看到的条数一致。
 */
export const listKeywords = () => {
  const nowMs = Date.now();
  const since = (ms) => new Date(nowMs - ms).toISOString();
  // JOIN 场景必须限定表别名，不能复用不带前缀的 EFFECTIVE_TIME
  const hotspotTime = "COALESCE(NULLIF(h.published_at, ''), h.created_at)";
  const rows = db
    .prepare(
      `SELECT k.*,
         COUNT(h.id) AS stats_total,
         SUM(CASE WHEN ${hotspotTime} >= ? THEN 1 ELSE 0 END) AS stats_last24h,
         SUM(CASE WHEN ${hotspotTime} >= ? THEN 1 ELSE 0 END) AS stats_last48h,
         SUM(CASE WHEN ${hotspotTime} >= ? THEN 1 ELSE 0 END) AS stats_last7d,
         SUM(CASE WHEN h.ai_status IN ('pending', 'failed') THEN 1 ELSE 0 END) AS stats_pending,
         AVG(h.relevance) AS stats_avg_relevance,
         MAX(${hotspotTime}) AS stats_latest_at
       FROM keywords k
       LEFT JOIN hotspots h ON h.keyword = k.term
       GROUP BY k.id
       ORDER BY k.created_at DESC`,
    )
    .all(since(24 * 3600_000), since(48 * 3600_000), since(7 * 86_400_000));
  return rows.map(mapKeyword);
};

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

const IMPORTANCE_VALUES = ['urgent', 'high', 'medium', 'low'];
const AI_STATUS_VALUES = ['pending', 'analyzed', 'heuristic', 'failed'];
export const SORT_KEYS = [
  'latest',
  'importance',
  'relevance',
  'engagement',
  'recommended',
  'pending',
  'unnotified',
];

const EFFECTIVE_TIME = "COALESCE(NULLIF(published_at, ''), created_at)";
const UNDATED_LAST = "CASE WHEN NULLIF(published_at, '') IS NULL THEN 1 ELSE 0 END";
const IMPORTANCE_RANK =
  "CASE importance WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END";

/**
 * 综合推荐分：等级 40% + 相关度 30% + 48h 新鲜度 20% + 热度 10%。
 * 存疑条目扣 25，未研判扣 15，避免“噪音/空壳”占据榜首。
 */
const RECOMMEND_SCORE = `(
  (CASE importance WHEN 'urgent' THEN 100 WHEN 'high' THEN 70 WHEN 'medium' THEN 40 WHEN 'low' THEN 15 ELSE 25 END) * 0.4
  + COALESCE(relevance, 0) * 0.3
  + MIN(1.0, MAX(0.0, (48 - (julianday('now') - julianday(${EFFECTIVE_TIME})) * 24) / 48.0)) * 20
  + (CASE
      WHEN engagement >= 1000 THEN 10
      WHEN engagement >= 300 THEN 8
      WHEN engagement >= 100 THEN 6
      WHEN engagement >= 30 THEN 4
      WHEN engagement > 0 THEN 2
      ELSE 0
    END)
  + (CASE WHEN is_real = 0 THEN -25 ELSE 0 END)
  + (CASE WHEN ai_status IN ('pending', 'failed') THEN -15 ELSE 0 END)
)`;

// 支持 "a,b" 逗号分隔与数组两种写法
const asList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => String(item).trim()).filter(Boolean);
};

/**
 * 搜索语法解析：空格分词（多词 AND）、`-` 前缀排除、双引号精确短语。
 * 例：`openai "新模型" -股价` → include=[openai, 新模型]，exclude=[股价]。
 * 未闭合的引号按普通子串容错处理。
 */
export const parseSearchQuery = (input) => {
  const include = [];
  const exclude = [];
  const text = String(input ?? '').trim();
  if (!text) return { include, exclude };
  const re = /(-?)(?:"([^"]*)"|(\S+))/g;
  let match;
  while ((match = re.exec(text))) {
    const value = (match[2] !== undefined ? match[2] : match[3] || '').trim();
    if (!value || value === '-') continue;
    (match[1] === '-' ? exclude : include).push(value);
  }
  return { include, exclude };
};

// LIKE 通配符转义，保证用户输入的 % _ \ 按字面匹配
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// 全字段检索范围；qMode=title 时只匹配标题
const SEARCH_FIELDS = ['title', 'snippet', 'summary', 'url', 'author', 'source'];

/**
 * 命中位置分级：标题 0 < AI 摘要 1 < 原文片段 2 < 链接/作者/来源 3。
 * 数字越小越“贴身”，用于搜索时把标题/摘要命中排在原文沾边的前面。
 */
const MATCH_TIERS = [
  { rank: 0, fields: ['title'] },
  { rank: 1, fields: ['summary'] },
  { rank: 2, fields: ['snippet'] },
  { rank: 3, fields: ['url', 'author', 'source'] },
];
export const MATCH_RANK_LABEL = ['标题', 'AI 摘要', '原文', '链接/来源'];

const dateBound = (value, endOfDay = false) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    parsed.setTime(parsed.getTime() + 86_399_999);
  }
  return parsed.toISOString();
};

export const listHotspots = ({
  limit = 50,
  offset = 0,
  importance,
  source,
  isReal,
  status,
  keyword,
  q,
  qMode,
  days,
  hours,
  from,
  to,
  dated,
  notified,
  relevanceMin,
  engagementMin,
  sort = 'latest',
  dir = 'desc',
} = {}) => {
  const where = [];
  const params = [];
  // 命中位置表达式的占位符必须排在 WHERE 之前（出现在 SELECT 里）
  const matchRankParams = [];
  let matchRankExpr = null;

  const importanceList = asList(importance).filter((value) => IMPORTANCE_VALUES.includes(value));
  if (importanceList.length) {
    where.push(`importance IN (${importanceList.map(() => '?').join(', ')})`);
    params.push(...importanceList);
  }

  const sourceList = asList(source);
  if (sourceList.length) {
    where.push(`source IN (${sourceList.map(() => '?').join(', ')})`);
    params.push(...sourceList);
  }

  // true/real → 可信；false/fake → 存疑；unknown → 未研判
  const trustList = asList(isReal).map((value) => value.toLowerCase());
  if (trustList.length && !trustList.includes('all')) {
    const parts = [];
    if (trustList.some((value) => value === 'true' || value === 'real' || value === '1')) {
      parts.push('is_real = 1');
    }
    if (trustList.some((value) => value === 'false' || value === 'fake' || value === '0')) {
      parts.push('is_real = 0');
    }
    if (trustList.some((value) => value === 'unknown' || value === 'null')) {
      parts.push('is_real IS NULL');
    }
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  }

  const statusList = asList(status).filter((value) => AI_STATUS_VALUES.includes(value));
  if (statusList.length) {
    where.push(`ai_status IN (${statusList.map(() => '?').join(', ')})`);
    params.push(...statusList);
  }

  if (keyword) {
    // 按采集时命中的监控词精确关联；模糊文本检索交给 q
    where.push('keyword = ?');
    params.push(keyword);
  }

  if (q) {
    const { include, exclude } = parseSearchQuery(q);
    const fields = String(qMode) === 'title' ? ['title'] : SEARCH_FIELDS;
    // COALESCE 保证 NULL 字段（如 author）不产生三值逻辑误判
    const matchAny = `(${fields.map((field) => `COALESCE(${field}, '') LIKE ? ESCAPE '\\'`).join(' OR ')})`;
    for (const term of include) {
      const like = `%${escapeLike(term)}%`;
      where.push(matchAny);
      params.push(...fields.map(() => like));
    }
    for (const term of exclude) {
      const like = `%${escapeLike(term)}%`;
      where.push(`NOT ${matchAny}`);
      params.push(...fields.map(() => like));
    }

    // 命中位置分级：任一命中词出现在标题即为 0，其次摘要 1、原文 2、链接/来源 3
    if (include.length) {
      const tiers = String(qMode) === 'title' ? MATCH_TIERS.slice(0, 1) : MATCH_TIERS;
      const branches = tiers.map((tier) => {
        const ors = [];
        for (const term of include) {
          const like = `%${escapeLike(term)}%`;
          for (const field of tier.fields) {
            ors.push(`COALESCE(${field}, '') LIKE ? ESCAPE '\\'`);
            matchRankParams.push(like);
          }
        }
        return `WHEN (${ors.join(' OR ')}) THEN ${tier.rank}`;
      });
      matchRankExpr = `CASE ${branches.join(' ')} ELSE ${MATCH_TIERS.length} END`;
    }
  }

  const windowHours = Number(hours);
  const since =
    Number.isFinite(windowHours) && windowHours > 0
      ? new Date(Date.now() - windowHours * 3600_000).toISOString()
      : days
        ? new Date(Date.now() - Number(days) * 86_400_000).toISOString()
        : null;
  if (since) {
    where.push(`${EFFECTIVE_TIME} >= ?`);
    params.push(since);
  }

  const fromBound = dateBound(from);
  if (fromBound) {
    where.push(`${EFFECTIVE_TIME} >= ?`);
    params.push(fromBound);
  }
  const toBound = dateBound(to, true);
  if (toBound) {
    where.push(`${EFFECTIVE_TIME} <= ?`);
    params.push(toBound);
  }

  if (dated === true || dated === 'true') {
    where.push("published_at IS NOT NULL AND published_at != ''");
  }

  if (notified === true || notified === 'true') {
    where.push('notified = 1');
  } else if (notified === false || notified === 'false') {
    where.push('notified = 0');
  }

  const relevanceFloor = Number(relevanceMin);
  if (Number.isFinite(relevanceFloor) && relevanceFloor > 0) {
    where.push('relevance >= ?');
    params.push(Math.min(Math.max(relevanceFloor, 0), 100));
  }

  const engagementFloor = Number(engagementMin);
  if (Number.isFinite(engagementFloor) && engagementFloor > 0) {
    where.push('engagement >= ?');
    params.push(engagementFloor);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // dir 只影响时间/相关度/热度这类连续量；等级与综合分始终按“好在前”排序
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const timeOrder = `${UNDATED_LAST}, ${EFFECTIVE_TIME} ${direction}`;
  const orders = {
    latest: `${timeOrder}, ${IMPORTANCE_RANK}`,
    importance: `${IMPORTANCE_RANK}, ${timeOrder}`,
    relevance: `CASE WHEN relevance IS NULL THEN 1 ELSE 0 END, relevance ${direction}, ${EFFECTIVE_TIME} DESC`,
    engagement: `CASE WHEN engagement > 0 THEN 0 ELSE 1 END, engagement ${direction}, ${EFFECTIVE_TIME} DESC`,
    recommended: `${RECOMMEND_SCORE} DESC, ${UNDATED_LAST}, ${EFFECTIVE_TIME} DESC`,
    pending: `CASE WHEN ai_status IN ('pending', 'failed') THEN 0 ELSE 1 END, ${EFFECTIVE_TIME} DESC`,
    unnotified: `CASE WHEN notified = 0 THEN 0 ELSE 1 END, ${EFFECTIVE_TIME} DESC`,
  };
  const effectiveSort = orders[sort] ? sort : 'latest';
  // 搜索时「最新 / 综合推荐」两种时间向排序把命中位置提到首位：
  // 标题命中 > AI 摘要 > 原文 > 链接/来源，同档内再按原规则。
  // 显式选择等级/相关度/待研判等排序时尊重用户意图，不插入命中位置。
  const rankLead =
    matchRankExpr && (effectiveSort === 'latest' || effectiveSort === 'recommended') ? 'match_rank ASC, ' : '';
  const orderBy = rankLead + orders[effectiveSort];
  const rankSelect = matchRankExpr ? `, (${matchRankExpr}) AS match_rank` : '';

  const rows = db
    .prepare(
      `SELECT *${rankSelect} FROM hotspots ${clause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(
      ...matchRankParams,
      ...params,
      Math.min(Number(limit) || 50, 200),
      Number(offset) || 0,
    );
  const total = db.prepare(`SELECT COUNT(*) AS c FROM hotspots ${clause}`).get(...params).c;
  return {
    items: rows.map((row) => ({ ...mapHotspot(row), matchRank: row.match_rank ?? null })),
    total,
  };
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
