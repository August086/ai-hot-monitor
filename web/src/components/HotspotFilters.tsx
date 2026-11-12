import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AiStatus, Importance, SortKey, TrustFilter } from '../types';
import type { FilterControls, HotspotFilterState } from '../hooks/useHotspotFilters';
import { DEFAULT_FILTERS } from '../hooks/useHotspotFilters';
import { Icon } from './Primitives';

const IMPORTANCE_OPTIONS: { key: Importance; label: string }[] = [
  { key: 'urgent', label: '紧急' },
  { key: 'high', label: '高' },
  { key: 'medium', label: '中' },
  { key: 'low', label: '低' },
];

const TRUST_OPTIONS: { key: TrustFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'real', label: '可信' },
  { key: 'fake', label: '存疑' },
  { key: 'unknown', label: '未研判' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '最新发布' },
  { key: 'recommended', label: '综合推荐' },
  { key: 'importance', label: '等级优先' },
  { key: 'relevance', label: '相关度' },
  { key: 'engagement', label: '热度' },
  { key: 'pending', label: '待研判' },
  { key: 'unnotified', label: '未通知' },
];

const HOUR_OPTIONS: { key: string; label: string }[] = [
  { key: '6', label: '6 小时' },
  { key: '24', label: '24 小时' },
  { key: '48', label: '48 小时' },
  { key: '168', label: '7 天' },
  { key: '720', label: '30 天' },
  { key: 'all', label: '全部' },
];

const RELEVANCE_OPTIONS = [
  { key: 0, label: '不限' },
  { key: 60, label: '≥ 60' },
  { key: 80, label: '≥ 80' },
];

const HEAT_OPTIONS = [
  { key: 0, label: '不限' },
  { key: 100, label: '≥ 100' },
  { key: 300, label: '≥ 300' },
  { key: 800, label: '≥ 800' },
];

const STATUS_OPTIONS: { key: AiStatus; label: string }[] = [
  { key: 'analyzed', label: '已分析' },
  { key: 'heuristic', label: '启发式' },
  { key: 'pending', label: '待研判' },
  { key: 'failed', label: '失败' },
];

const SOURCE_OPTIONS: { key: string; label: string }[] = [
  { key: 'baidu', label: '百度资讯' },
  { key: 'ithome', label: 'IT之家' },
  { key: 'solidot', label: 'SOLIDOT' },
  { key: 'infoq', label: 'INFOQ' },
  { key: 'qbitai', label: '量子位' },
  { key: 'hackernews', label: 'HN' },
  { key: 'twitter', label: 'X / TWITTER' },
  { key: 'arxiv', label: 'ARXIV' },
  { key: 'huggingface', label: 'HF' },
  { key: 'gdelt', label: 'GDELT' },
  { key: 'bing', label: 'WEB / BING' },
  { key: 'seed', label: 'DEMO' },
];

const SOURCE_GROUPS: { label: string; keys: string[] }[] = [
  { label: '国内媒体', keys: ['baidu', 'ithome', 'solidot', 'infoq', 'qbitai'] },
  { label: '海外社区', keys: ['hackernews', 'twitter', 'arxiv', 'huggingface', 'gdelt', 'bing'] },
];

const NOTIFIED_OPTIONS: { key: 'all' | 'true' | 'false'; label: string }[] = [
  { key: 'all', label: '不限' },
  { key: 'false', label: '未通知' },
  { key: 'true', label: '已通知' },
];

const hourLabel = (value: string) => HOUR_OPTIONS.find((item) => item.key === value)?.label ?? value;
const importanceLabel = (value: string) =>
  IMPORTANCE_OPTIONS.find((item) => item.key === value)?.label ?? value;
const statusLabel = (value: string) => STATUS_OPTIONS.find((item) => item.key === value)?.label ?? value;
const sourceLabel = (value: string) => SOURCE_OPTIONS.find((item) => item.key === value)?.label ?? value;

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`chip-filter ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="filter-group">
      <header className="filter-group__head">
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </header>
      <div className="filter-group__body">{children}</div>
    </section>
  );
}

interface Pill {
  key: string;
  label: string;
  clear: () => void;
}

function buildPills(filters: HotspotFilterState, setFilters: FilterControls['setFilters']): Pill[] {
  const pills: Pill[] = [];
  if (filters.importance.length) {
    pills.push({
      key: 'importance',
      label: `等级 · ${filters.importance.map(importanceLabel).join(' / ')}`,
      clear: () => setFilters({ importance: [] }),
    });
  }
  if (filters.source.length) {
    pills.push({
      key: 'source',
      label: `来源 · ${filters.source.map(sourceLabel).join(' / ')}`,
      clear: () => setFilters({ source: [] }),
    });
  }
  if (filters.trust !== 'all') {
    pills.push({
      key: 'trust',
      label: `可信度 · ${TRUST_OPTIONS.find((item) => item.key === filters.trust)?.label ?? ''}`,
      clear: () => setFilters({ trust: 'all' }),
    });
  }
  if (filters.statuses.length) {
    pills.push({
      key: 'statuses',
      label: `AI 状态 · ${filters.statuses.map(statusLabel).join(' / ')}`,
      clear: () => setFilters({ statuses: [] }),
    });
  }
  if (filters.hours !== 'all') {
    pills.push({ key: 'hours', label: `时间 · ${hourLabel(filters.hours)}`, clear: () => setFilters({ hours: 'all' }) });
  }
  if (filters.from) {
    pills.push({ key: 'from', label: `起 · ${filters.from}`, clear: () => setFilters({ from: '' }) });
  }
  if (filters.to) {
    pills.push({ key: 'to', label: `止 · ${filters.to}`, clear: () => setFilters({ to: '' }) });
  }
  if (filters.relevanceMin > 0) {
    pills.push({
      key: 'relevance',
      label: `相关度 ≥ ${filters.relevanceMin}`,
      clear: () => setFilters({ relevanceMin: 0 }),
    });
  }
  if (filters.engagementMin > 0) {
    pills.push({
      key: 'engagement',
      label: `热度 ≥ ${filters.engagementMin}`,
      clear: () => setFilters({ engagementMin: 0 }),
    });
  }
  if (filters.keyword) {
    pills.push({
      key: 'keyword',
      label: `关键词 · ${filters.keyword}`,
      clear: () => setFilters({ keyword: '' }),
    });
  }
  if (filters.notified !== 'all') {
    pills.push({
      key: 'notified',
      label: filters.notified === 'true' ? '已通知' : '未通知',
      clear: () => setFilters({ notified: 'all' }),
    });
  }
  if (filters.qMode === 'title') {
    pills.push({ key: 'qMode', label: '仅标题匹配', clear: () => setFilters({ qMode: 'all' }) });
  }
  if (!filters.datedOnly) {
    pills.push({ key: 'dated', label: '含无发布时间', clear: () => setFilters({ datedOnly: true }) });
  }
  return pills;
}

export function HotspotFilters({
  controls,
  total,
  keywordOptions,
}: {
  controls: FilterControls;
  total: number;
  keywordOptions: { id: number; term: string }[];
}) {
  const { filters, setFilters, toggle, reset, activeCount, presets, savedViews, saveView, removeView } = controls;
  const [open, setOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const pills = useMemo(() => buildPills(filters, setFilters), [filters, setFilters]);

  const activePreset = presets.find(
    (preset) =>
      filters.hours === (preset.patch.hours ?? 'all') &&
      filters.sort === (preset.patch.sort ?? 'latest') &&
      filters.trust === (preset.patch.trust ?? 'all'),
  );

  return (
    <>
      <div className="filterbar">
        <div className="filterbar__group" role="group" aria-label="等级筛选">
          <button
            type="button"
            className={`chip-filter ${!filters.importance.length ? 'is-active is-all' : ''}`}
            onClick={() => setFilters({ importance: [] })}
          >
            全部等级
          </button>
          {IMPORTANCE_OPTIONS.map((item) => (
            <Chip
              key={item.key}
              active={filters.importance.includes(item.key)}
              onClick={() => toggle('importance', item.key)}
            >
              {item.label}
            </Chip>
          ))}
        </div>

        <div className="filterbar__group" role="group" aria-label="可信度筛选">
          {TRUST_OPTIONS.map((item) => (
            <Chip key={item.key} active={filters.trust === item.key} onClick={() => setFilters({ trust: item.key })}>
              {item.label}
            </Chip>
          ))}
        </div>

        <div className="filterbar__group filterbar__group--sort">
          <label className="filter-select">
            <span>排序</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters({ sort: event.target.value as SortKey })}
              aria-label="排序方式"
            >
              {SORT_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`filter-more ${activeCount ? 'is-active' : ''}`}
            onClick={() => setOpen(true)}
            aria-expanded={open}
          >
            更多筛选
            {activeCount > 0 && <b>{activeCount}</b>}
          </button>
        </div>

        <div className="filterbar__search">
          <Icon name="search" />
          <input
            value={filters.q}
            onChange={(event) => setFilters({ q: event.target.value })}
            placeholder="在结果中检索…"
            aria-label="在结果中检索"
          />
          {filters.q && (
            <button type="button" onClick={() => setFilters({ q: '' })} aria-label="清空检索">
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {(pills.length > 0 || activePreset) && (
        <div className="filter-pills">
          <span className="filter-pills__label">ACTIVE</span>
          {activePreset && <span className="filter-pill filter-pill--preset">{activePreset.label}</span>}
          {pills.map((pill) => (
            <span className="filter-pill" key={pill.key}>
              {pill.label}
              <button type="button" onClick={pill.clear} aria-label={`移除筛选 ${pill.label}`}>
                <Icon name="close" />
              </button>
            </span>
          ))}
          <button type="button" className="filter-pills__reset" onClick={reset}>
            清空全部
          </button>
        </div>
      )}

      {open && (
        <div className="filter-drawer" role="dialog" aria-modal="true" aria-label="更多筛选">
          <button type="button" className="filter-drawer__scrim" onClick={() => setOpen(false)} aria-label="关闭筛选" />
          <aside className="filter-drawer__panel">
            <header className="filter-drawer__head">
              <div>
                <span>FILTER MATRIX</span>
                <h2>更多筛选</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭">
                <Icon name="close" />
              </button>
            </header>

            <div className="filter-drawer__body">
              <Group title="时间窗口" hint="按发布时间，缺失时回落到入库时间">
                {HOUR_OPTIONS.map((item) => (
                  <Chip
                    key={item.key}
                    active={filters.hours === item.key}
                    onClick={() => setFilters({ hours: item.key, from: '', to: '' })}
                  >
                    {item.label}
                  </Chip>
                ))}
                <label className="filter-date">
                  <span>起</span>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilters({ from: event.target.value, hours: 'all' })}
                    aria-label="起始日期"
                  />
                </label>
                <label className="filter-date">
                  <span>止</span>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilters({ to: event.target.value, hours: 'all' })}
                    aria-label="结束日期"
                  />
                </label>
                <Chip
                  active={filters.datedOnly}
                  onClick={() => setFilters({ datedOnly: !filters.datedOnly })}
                  title="隐藏没有发布时间的官网/文档页"
                >
                  仅看有发布时间
                </Chip>
              </Group>

              <Group title="质量门槛" hint="相关度来自 AI 研判">
                {RELEVANCE_OPTIONS.map((item) => (
                  <Chip
                    key={item.key}
                    active={filters.relevanceMin === item.key}
                    onClick={() => setFilters({ relevanceMin: item.key })}
                  >
                    相关度 {item.label}
                  </Chip>
                ))}
                {STATUS_OPTIONS.map((item) => (
                  <Chip key={item.key} active={filters.statuses.includes(item.key)} onClick={() => toggle('statuses', item.key)}>
                    {item.label}
                  </Chip>
                ))}
              </Group>

              <Group title="热度" hint="HN 分数/评论、X 互动量">
                {HEAT_OPTIONS.map((item) => (
                  <Chip
                    key={item.key}
                    active={filters.engagementMin === item.key}
                    onClick={() => setFilters({ engagementMin: item.key })}
                  >
                    {item.label}
                  </Chip>
                ))}
              </Group>

              <Group title="来源" hint="可多选">
                <button
                  type="button"
                  className={`chip-filter ${!filters.source.length ? 'is-active is-all' : ''}`}
                  onClick={() => setFilters({ source: [] })}
                >
                  全部来源
                </button>
                {SOURCE_GROUPS.map((group) => (
                  <Chip
                    key={group.label}
                    active={group.keys.every((key) => filters.source.includes(key))}
                    onClick={() => setFilters({ source: group.keys })}
                  >
                    {group.label}
                  </Chip>
                ))}
                {SOURCE_OPTIONS.map((item) => (
                  <Chip key={item.key} active={filters.source.includes(item.key)} onClick={() => toggle('source', item.key)}>
                    {item.label}
                  </Chip>
                ))}
              </Group>

              <Group title="监控词" hint="按采集时命中的关键词">
                <div className="filter-select filter-select--block">
                  <select
                    value={filters.keyword}
                    onChange={(event) => setFilters({ keyword: event.target.value })}
                    aria-label="按监控关键词筛选"
                  >
                    <option value="">全部关键词</option>
                    {keywordOptions.map((item) => (
                      <option key={item.id} value={item.term}>
                        {item.term}
                      </option>
                    ))}
                  </select>
                </div>
              </Group>

              <Group title="通知与文本">
                {NOTIFIED_OPTIONS.map((item) => (
                  <Chip
                    key={item.key}
                    active={filters.notified === item.key}
                    onClick={() => setFilters({ notified: item.key })}
                  >
                    {item.label}
                  </Chip>
                ))}
                <Chip active={filters.qMode === 'all'} onClick={() => setFilters({ qMode: 'all' })}>
                  全文匹配
                </Chip>
                <Chip active={filters.qMode === 'title'} onClick={() => setFilters({ qMode: 'title' })}>
                  仅标题
                </Chip>
              </Group>

              <Group title="筛选视图" hint="常用组合一键切换">
                {presets.map((preset) => (
                  <Chip
                    key={preset.key}
                    active={activePreset?.key === preset.key}
                    onClick={() => setFilters({ ...DEFAULT_FILTERS, ...preset.patch })}
                    title={preset.hint}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </Group>

              <Group title="我的视图" hint="保存在本机浏览器">
                {savedViews.map((view) => (
                  <span className="filter-view" key={view.id}>
                    <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, ...view.state })}>
                      {view.label}
                    </button>
                    <button type="button" onClick={() => removeView(view.id)} aria-label={`删除视图 ${view.label}`}>
                      <Icon name="close" />
                    </button>
                  </span>
                ))}
                <div className="filter-save">
                  <input
                    value={viewName}
                    onChange={(event) => setViewName(event.target.value)}
                    placeholder="给当前条件命名…"
                    aria-label="视图名称"
                    maxLength={16}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={!viewName.trim()}
                    onClick={() => {
                      saveView(viewName);
                      setViewName('');
                    }}
                  >
                    保存
                  </button>
                </div>
              </Group>
            </div>

            <footer className="filter-drawer__foot">
              <button type="button" className="btn btn--ghost" onClick={reset}>
                清空全部
              </button>
              <button type="button" className="btn btn--lime" onClick={() => setOpen(false)}>
                查看 {total} 条
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
