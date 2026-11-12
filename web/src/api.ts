import type {
  HealthPayload,
  Hotspot,
  Keyword,
  NotificationRecord,
  RunRecord,
  SettingsPayload,
  Stats,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error || `请求失败 (${response.status})`);
  }
  return data as T;
}

export const api = {
  health: () => request<HealthPayload>('/api/health'),
  stats: () => request<Stats>('/api/stats'),
  runs: () => request<{ items: RunRecord[] }>('/api/runs'),

  keywords: () => request<{ items: Keyword[] }>('/api/keywords'),
  createKeyword: (payload: { term: string; domain?: string }) =>
    request<Keyword>('/api/keywords', { method: 'POST', body: JSON.stringify(payload) }),
  updateKeyword: (id: number, payload: Partial<Pick<Keyword, 'term' | 'domain' | 'enabled'>>) =>
    request<Keyword>(`/api/keywords/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteKeyword: (id: number) => request<{ ok: boolean }>(`/api/keywords/${id}`, { method: 'DELETE' }),

  hotspots: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const query = search.toString();
    return request<{ items: Hotspot[]; total: number }>(`/api/hotspots${query ? `?${query}` : ''}`);
  },
  analyzeHotspot: (id: number) => request<Hotspot>(`/api/hotspots/${id}/analyze`, { method: 'POST' }),
  searchHotspots: (term: string, domain = '', analyze = true) =>
    request<{ found: number; created: number; items: Hotspot[]; errors: unknown[] }>('/api/hotspots/search', {
      method: 'POST',
      body: JSON.stringify({ term, domain, analyze }),
    }),

  settings: () => request<SettingsPayload>('/api/settings'),
  updateSettings: (patch: Record<string, unknown>) =>
    request<SettingsPayload>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  testEmail: (to: string) =>
    request<{ ok: boolean; to: string }>('/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to }),
    }),

  notifications: () => request<{ items: NotificationRecord[] }>('/api/notifications'),
  collect: (keywordIds?: number[]) =>
    request<{ created: number; found: number; analyzed: number }>('/api/collect', {
      method: 'POST',
      body: JSON.stringify({ keywordIds }),
    }),
  analyzePending: () => request<{ analyzed: number }>('/api/analyze-pending', { method: 'POST' }),
};

export const formatTime = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const relativeTime = (iso?: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return iso;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};
