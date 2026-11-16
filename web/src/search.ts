/**
 * 搜索语法（与后端 server/src/db.js parseSearchQuery 保持一致）：
 * 空格分词（多词 AND）· `-` 前缀排除 · 双引号精确短语。
 */
export interface ParsedQuery {
  include: string[];
  exclude: string[];
}

export function parseSearchQuery(input: string): ParsedQuery {
  const include: string[] = [];
  const exclude: string[] = [];
  const text = String(input ?? '').trim();
  if (!text) return { include, exclude };
  const re = /(-?)(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const value = (match[2] !== undefined ? match[2] : match[3] || '').trim();
    if (!value || value === '-') continue;
    (match[1] === '-' ? exclude : include).push(value);
  }
  return { include, exclude };
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * 把文本按命中词切分成分段，用于高亮渲染。
 * 大小写不敏感（ASCII）；长词优先，避免 open 命中吞掉 openai。
 */
export function splitHighlights(text: string, terms: string[]): TextPart[] {
  if (!text || !terms.length) return [{ text, hit: false }];
  const escaped = terms
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return [{ text, hit: false }];
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

const HISTORY_KEY = 'neon-watch:search-history';
const HISTORY_MAX = 10;

export function readSearchHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(term: string): string[] {
  const value = term.trim();
  if (!value) return readSearchHistory();
  const next = [value, ...readSearchHistory().filter((item) => item !== value)].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下忽略
  }
  return next;
}

export function clearSearchHistory(): string[] {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // 隐私模式下忽略
  }
  return [];
}
