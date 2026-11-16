import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hotspot, Keyword } from '../types';
import { api } from '../api';
import { HotspotCard } from '../components/HotspotCard';
import { HotspotFilters } from '../components/HotspotFilters';
import { SearchBox } from '../components/SearchBox';
import { Icon, Panel } from '../components/Primitives';
import { filtersToParams, useHotspotFilters } from '../hooks/useHotspotFilters';
import { parseSearchQuery } from '../search';

export function Hotspots({
  pulse,
  onOpen,
  notify,
}: {
  pulse: number;
  onOpen: (hotspot: Hotspot) => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const controls = useHotspotFilters();
  const { filters, setFilters } = controls;

  const [items, setItems] = useState<Hotspot[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [rescanning, setRescanning] = useState(false);

  const params = useMemo(() => filtersToParams(filters), [filters]);
  const filterKey = JSON.stringify(params);

  // 筛选条件变化时回到第一页
  const previousKey = useRef(filterKey);
  if (previousKey.current !== filterKey) {
    previousKey.current = filterKey;
    if (limit !== 20) setLimit(20);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .hotspots({ ...params, limit })
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((error) => alive && notify((error as Error).message, 'error'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, limit, pulse, reload, notify]);

  useEffect(() => {
    let alive = true;
    api
      .keywords()
      .then((data) => alive && setKeywords(data.items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pulse, reload]);

  const summarize = useMemo(() => {
    const urgent = items.filter((item) => item.importance === 'urgent').length;
    const pending = items.filter((item) => item.aiStatus === 'pending').length;
    return { urgent, pending };
  }, [items]);

  // 搜索命中词（排除词不参与高亮）
  const highlightTerms = useMemo(() => parseSearchQuery(filters.q).include, [filters.q]);

  // 当前生效的监控词（来自关键词页跳转或抽屉选择）
  const activeKeyword = useMemo(
    () => (filters.keyword ? keywords.find((item) => item.term === filters.keyword) : undefined),
    [keywords, filters.keyword],
  );

  const rescanKeyword = async () => {
    if (!activeKeyword) return;
    setRescanning(true);
    try {
      const result = await api.collect([activeKeyword.id]);
      notify(`「${activeKeyword.term}」扫描完成：新增 ${result.created ?? 0} 条信号`);
      setReload((value) => value + 1);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setRescanning(false);
    }
  };

  const runSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    try {
      const result = await api.searchHotspots(term);
      notify(`实时抓取完成：命中 ${result.found} 条，新增 ${result.created} 条`);
      setFilters({ q: term });
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const analyze = async (hotspot: Hotspot) => {
    setAnalyzingId(hotspot.id);
    try {
      const updated = await api.analyzeHotspot(hotspot.id);
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      notify('研判完成');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="page page--hotspots">
      <div className="page-head">
        <div>
          <span className="page-head__eyebrow">SIGNAL FEED / 去重后的实时情报流</span>
          <h1>
            热点流 <em>{total}</em>
          </h1>
        </div>
        <form
          className="quick-search"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <span className="quick-search__prompt">&gt;</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="临时抓取一个关键词，例如：GPT-5.5"
            aria-label="临时抓取关键词"
          />
          <button type="submit" disabled={searching}>
            {searching ? '抓取中…' : '实时抓取'}
          </button>
        </form>
      </div>

      <SearchBox value={filters.q} onCommit={(q) => setFilters({ q })} />

      {activeKeyword && (
        <div className="kw-context">
          <div className="kw-context__head">
            <span className="kw-context__label">MONITORED KEYWORD</span>
            <b>{activeKeyword.term}</b>
            {activeKeyword.domain && <em>{activeKeyword.domain}</em>}
          </div>
          <div className="kw-context__stats">
            <span>
              <i>24h</i>
              {activeKeyword.stats?.last24h ?? 0}
            </span>
            <span>
              <i>48h</i>
              {activeKeyword.stats?.last48h ?? 0}
            </span>
            <span>
              <i>7d</i>
              {activeKeyword.stats?.last7d ?? 0}
            </span>
            <span>
              <i>REL</i>
              {activeKeyword.stats?.avgRelevance ?? '—'}
            </span>
            <span className={activeKeyword.stats?.pending ? 'is-warn' : ''}>
              <i>待</i>
              {activeKeyword.stats?.pending ?? 0}
            </span>
          </div>
          <div className="kw-context__actions">
            <button type="button" className="text-btn" onClick={rescanKeyword} disabled={rescanning}>
              {rescanning ? '扫描中…' : '重新扫描该词'}
            </button>
            {filters.hours !== 'all' && (
              <button type="button" className="text-btn text-btn--muted" onClick={() => setFilters({ hours: 'all' })}>
                查看全部时间
              </button>
            )}
          </div>
        </div>
      )}

      <HotspotFilters
        controls={controls}
        total={total}
        keywordOptions={keywords.map((item) => ({ id: item.id, term: item.term }))}
      />

      <div className="feed-meta">
        <span>{filters.q ? `找到 ${total} 条信号` : `匹配 ${total} 条`}</span>
        <span className="feed-meta__warn">紧急 {summarize.urgent}</span>
        <span className="feed-meta__pending">待研判 {summarize.pending}</span>
        {filters.q && (
          <span>
            检索「{filters.q}」
            <button type="button" className="feed-meta__clear" onClick={() => setFilters({ q: '' })}>
              清除
            </button>
          </span>
        )}
      </div>

      <div className="hotspot-list">
        {loading && Array.from({ length: 4 }).map((_, index) => <div className="skeleton skeleton--card" key={index} />)}
        {!loading &&
          items.map((item, index) => (
            <HotspotCard
              key={item.id}
              hotspot={item}
              index={index + 1}
              onOpen={onOpen}
              onAnalyze={analyze}
              onFilterKeyword={(term) => setFilters({ keyword: term })}
              analyzing={analyzingId === item.id}
              highlight={highlightTerms}
            />
          ))}
        {!loading && !items.length && (
          <Panel accent="muted" className="empty-panel">
            <div className="empty-state">
              <Icon name="radar" />
              <p>当前过滤条件下没有信号</p>
              <span>尝试放宽筛选，或添加新的监控关键词</span>
            </div>
          </Panel>
        )}
      </div>

      {items.length < total && (
        <button type="button" className="load-more" onClick={() => setLimit((value) => value + 20)}>
          加载更多信号 ({items.length}/{total})
        </button>
      )}
    </div>
  );
}
