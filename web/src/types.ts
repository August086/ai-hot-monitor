export type Importance = 'low' | 'medium' | 'high' | 'urgent';
export type AiStatus = 'pending' | 'analyzed' | 'heuristic' | 'failed';
export type SortKey =
  | 'latest'
  | 'importance'
  | 'relevance'
  | 'engagement'
  | 'recommended'
  | 'pending'
  | 'unnotified';
export type TrustFilter = 'all' | 'real' | 'fake' | 'unknown';
export type SourceKind =
  | 'bing'
  | 'twitter'
  | 'seed'
  | 'hackernews'
  | 'arxiv'
  | 'huggingface'
  | 'gdelt'
  | 'ithome'
  | 'solidot'
  | 'infoq'
  | 'qbitai'
  | 'baidu';

export interface Keyword {
  id: number;
  term: string;
  domain: string;
  enabled: boolean;
  createdAt: string;
  lastCheckedAt: string | null;
}

export interface Hotspot {
  id: number;
  keywordId: number | null;
  keyword: string | null;
  title: string;
  url: string;
  source: SourceKind | string;
  snippet: string;
  author: string | null;
  publishedAt: string | null;
  engagement: number;
  fingerprint: string;
  isReal: boolean | null;
  relevance: number | null;
  importance: Importance | null;
  summary: string | null;
  aiModel: string | null;
  aiStatus: AiStatus;
  aiReason: string | null;
  notified: boolean;
  createdAt: string;
}

export interface Stats {
  total: number;
  today: number;
  fresh: number;
  real: number;
  fake: number;
  urgent: number;
  keywords: number;
  analyzed: number;
  pending: number;
  online: number;
  collecting: boolean;
  byImportance: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
  timeline: { day: string; count: number }[];
}

export interface RunRecord {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  keywords: number;
  found: number;
  created: number;
  analyzed: number;
  error: string | null;
}

export interface NotificationRecord {
  id: number;
  hotspotId: number | null;
  channel: string;
  status: string;
  title: string;
  detail: string | null;
  createdAt: string;
}

export interface SettingsPayload {
  settings: {
    notifyBrowser: string;
    notifyEmail: string;
    emailTo: string;
    minImportance: Importance;
    autoAnalyze: string;
    scope: string;
    retentionDays: string;
    collectInterval: string;
  };
  capabilities: { ai: boolean; twitter: boolean; email: boolean; smtpHost: string | null };
  ai: { configured: boolean; model: string; fallbackModel: string; heuristicFallback: boolean };
  crawler: { intervalMinutes: number; delayMs: number; perKeywordLimit: number; maxKeywordsPerRun: number };
  email: { configured: boolean; host: string | null; port: number; from: string | null };
  twitter: { configured: boolean };
}

export interface HealthPayload {
  ok: boolean;
  uptime: number;
  online: number;
  collecting: boolean;
  intervalMinutes: number;
  capabilities: { ai: boolean; twitter: boolean; email: boolean };
  time: string;
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

export const SOURCE_LABEL: Record<string, string> = {
  bing: 'WEB',
  twitter: 'X',
  seed: 'DEMO',
  hackernews: 'HN',
  arxiv: 'ARXIV',
  huggingface: 'HF',
  gdelt: 'GDELT',
  ithome: 'IT之家',
  solidot: 'SOLIDOT',
  infoq: 'INFOQ',
  qbitai: '量子位',
  baidu: '百度资讯',
};
