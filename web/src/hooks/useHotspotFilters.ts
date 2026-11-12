import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AiStatus, Importance, SortKey, TrustFilter } from '../types';

export interface HotspotFilterState {
  importance: Importance[];
  source: string[];
  trust: TrustFilter;
  statuses: AiStatus[];
  sort: SortKey;
  hours: string;
  from: string;
  to: string;
  relevanceMin: number;
  engagementMin: number;
  keyword: string;
  notified: 'all' | 'true' | 'false';
  datedOnly: boolean;
  q: string;
  qMode: 'all' | 'title';
}

export interface FilterPreset {
  key: string;
  label: string;
  hint: string;
  patch: Partial<HotspotFilterState>;
}

export interface SavedView {
  id: string;
  label: string;
  state: HotspotFilterState;
}

export interface FilterControls {
  filters: HotspotFilterState;
  setFilters: (patch: Partial<HotspotFilterState>) => void;
  toggle: (key: 'importance' | 'source' | 'statuses', value: string) => void;
  reset: () => void;
  activeCount: number;
  presets: FilterPreset[];
  savedViews: SavedView[];
  saveView: (label: string) => void;
  removeView: (id: string) => void;
}

export const DEFAULT_FILTERS: HotspotFilterState = {
  importance: [],
  source: [],
  trust: 'all',
  statuses: [],
  sort: 'latest',
  hours: 'all',
  from: '',
  to: '',
  relevanceMin: 0,
  engagementMin: 0,
  keyword: '',
  notified: 'all',
  datedOnly: true,
  q: '',
  qMode: 'all',
};

const IMPORTANCE_VALUES: Importance[] = ['urgent', 'high', 'medium', 'low'];
const STATUS_VALUES: AiStatus[] = ['pending', 'analyzed', 'heuristic', 'failed'];
const SORT_VALUES: SortKey[] = [
  'latest',
  'importance',
  'relevance',
  'engagement',
  'recommended',
  'pending',
  'unnotified',
];
export const HOUR_VALUES = ['6', '24', '48', '168', '720', 'all'];

const split = (value: string | null) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const toNumber = (value: string | null, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTrust = (value: string | null): TrustFilter => {
  if (value === 'real' || value === 'true') return 'real';
  if (value === 'fake' || value === 'false') return 'fake';
  if (value === 'unknown') return 'unknown';
  return 'all';
};

export const parseFilters = (search: string): HotspotFilterState => {
  const params = new URLSearchParams(search);
  const sortRaw = params.get('sort') as SortKey | null;
  const hoursRaw = params.get('hours');
  const statuses = split(params.get('status')).filter((value): value is AiStatus =>
    STATUS_VALUES.includes(value as AiStatus),
  );
  const notifiedRaw = params.get('notified');

  return {
    importance: split(params.get('importance')).filter((value): value is Importance =>
      IMPORTANCE_VALUES.includes(value as Importance),
    ),
    source: split(params.get('source')),
    trust: toTrust(params.get('isReal') ?? params.get('trust')),
    statuses,
    sort: sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : DEFAULT_FILTERS.sort,
    hours: hoursRaw && HOUR_VALUES.includes(hoursRaw) ? hoursRaw : DEFAULT_FILTERS.hours,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    relevanceMin: toNumber(params.get('relevanceMin')),
    engagementMin: toNumber(params.get('engagementMin')),
    keyword: params.get('keyword') ?? '',
    notified: notifiedRaw === 'true' || notifiedRaw === 'false' ? notifiedRaw : 'all',
    datedOnly: params.get('dated') !== 'false',
    q: params.get('q') ?? '',
    qMode: params.get('qMode') === 'title' ? 'title' : 'all',
  };
};

/** 写入地址栏的查询串（只保留非默认值，保持 URL 干净） */
export const buildSearch = (state: HotspotFilterState) => {
  const params = new URLSearchParams();
  if (state.importance.length) params.set('importance', state.importance.join(','));
  if (state.source.length) params.set('source', state.source.join(','));
  if (state.trust !== 'all') params.set('isReal', state.trust);
  if (state.statuses.length) params.set('status', state.statuses.join(','));
  if (state.sort !== DEFAULT_FILTERS.sort) params.set('sort', state.sort);
  if (state.hours !== 'all') params.set('hours', state.hours);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.relevanceMin > 0) params.set('relevanceMin', String(state.relevanceMin));
  if (state.engagementMin > 0) params.set('engagementMin', String(state.engagementMin));
  if (state.keyword) params.set('keyword', state.keyword);
  if (state.notified !== 'all') params.set('notified', state.notified);
  if (!state.datedOnly) params.set('dated', 'false');
  if (state.q) params.set('q', state.q);
  if (state.qMode === 'title' && state.q) params.set('qMode', 'title');
  return params.toString();
};

/** 请求 /api/hotspots 的参数 */
export const filtersToParams = (state: HotspotFilterState) => {
  const params: Record<string, string | number | boolean> = { sort: state.sort };
  if (state.importance.length) params.importance = state.importance.join(',');
  if (state.source.length) params.source = state.source.join(',');
  if (state.trust !== 'all') params.isReal = state.trust;
  if (state.statuses.length) params.status = state.statuses.join(',');
  if (state.hours !== 'all') params.hours = state.hours;
  if (state.from) params.from = state.from;
  if (state.to) params.to = state.to;
  if (state.relevanceMin > 0) params.relevanceMin = state.relevanceMin;
  if (state.engagementMin > 0) params.engagementMin = state.engagementMin;
  if (state.keyword) params.keyword = state.keyword;
  if (state.notified !== 'all') params.notified = state.notified;
  if (state.datedOnly) params.dated = true;
  if (state.q) params.q = state.q;
  if (state.qMode === 'title' && state.q) params.qMode = 'title';
  return params;
};

export const PRESETS: FilterPreset[] = [
  {
    key: 'morning',
    label: '早间巡检',
    hint: '近 48h · 紧急/高优 · 综合推荐排序',
    patch: { hours: '48', importance: ['urgent', 'high'], sort: 'recommended' },
  },
  {
    key: 'write',
    label: '高优先待写',
    hint: '近 48h · 仅可信 · 综合推荐排序',
    patch: { hours: '48', trust: 'real', sort: 'recommended' },
  },
  {
    key: 'verify',
    label: '存疑待核实',
    hint: '近 48h · 存疑条目 · 按时间',
    patch: { hours: '48', trust: 'fake', sort: 'latest' },
  },
  {
    key: 'pending',
    label: '待研判',
    hint: '所有 AI 未完成的条目',
    patch: { sort: 'pending', statuses: ['pending', 'failed'], datedOnly: false },
  },
];

const STORAGE_KEY = 'neon-watch:filter-views';

const readViews = (): SavedView[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((view) => view && view.id && view.label && view.state).slice(0, 8)
      : [];
  } catch {
    return [];
  }
};

const writeViews = (views: SavedView[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // 隐私模式下忽略
  }
};

const hashSearch = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const index = hash.indexOf('?');
  return index === -1 ? '' : hash.slice(index + 1);
};

export function useHotspotFilters(): FilterControls {
  const [filters, setFiltersState] = useState<HotspotFilterState>(() => parseFilters(hashSearch()));
  const [savedViews, setSavedViews] = useState<SavedView[]>(readViews);

  // 筛选变化后同步到地址栏，刷新/分享/前进后退都能还原
  useEffect(() => {
    const search = buildSearch(filters);
    const next = `#/hotspots${search ? `?${search}` : ''}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
    }
  }, [filters]);

  // 浏览器前进/后退时从地址栏恢复
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (!hash.startsWith('hotspots')) return;
      setFiltersState(parseFilters(hashSearch()));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setFilters = useCallback((patch: Partial<HotspotFilterState>) => {
    setFiltersState((current) => ({ ...current, ...patch }));
  }, []);

  const toggle = useCallback((key: 'importance' | 'source' | 'statuses', value: string) => {
    setFiltersState((current) => {
      const list = current[key] as string[];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [key]: next } as HotspotFilterState;
    });
  }, []);

  const reset = useCallback(() => setFiltersState({ ...DEFAULT_FILTERS }), []);

  const saveView = useCallback((label: string) => {
    const name = label.trim().slice(0, 16);
    if (!name) return;
    setSavedViews((current) => {
      const next = [
        ...current.filter((view) => view.label !== name),
        { id: `${Date.now()}`, label: name, state: { ...filters } },
      ].slice(-8);
      writeViews(next);
      return next;
    });
  }, [filters]);

  const removeView = useCallback((id: string) => {
    setSavedViews((current) => {
      const next = current.filter((view) => view.id !== id);
      writeViews(next);
      return next;
    });
  }, []);

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.importance.length) count += 1;
    if (filters.source.length) count += 1;
    if (filters.trust !== 'all') count += 1;
    if (filters.statuses.length) count += 1;
    if (filters.hours !== 'all') count += 1;
    if (filters.from) count += 1;
    if (filters.to) count += 1;
    if (filters.relevanceMin > 0) count += 1;
    if (filters.engagementMin > 0) count += 1;
    if (filters.keyword) count += 1;
    if (filters.notified !== 'all') count += 1;
    if (filters.qMode === 'title') count += 1;
    return count;
  }, [filters]);

  return {
    filters,
    setFilters,
    toggle,
    reset,
    activeCount,
    presets: PRESETS,
    savedViews,
    saveView,
    removeView,
  };
}
