import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hotspot, Keyword } from '../types';
import { api } from '../api';
import { HotspotCard } from '../components/HotspotCard';
import { HotspotFilters } from '../components/HotspotFilters';
import { Icon, Panel } from '../components/Primitives';
import { filtersToParams, useHotspotFilters } from '../hooks/useHotspotFilters';

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
  }, [filterKey, limit, pulse, notify]);

  useEffect(() => {
    let alive = true;
    api
      .keywords()
      .then((data) => alive && setKeywords(data.items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pulse]);

  const summarize = useMemo(() => {
    const urgent = items.filter((item) => item.importance === 'urgent').length;
    const pending = items.filter((item) => item.aiStatus === 'pending').length;
    return { urgent, pending };
  }, [items]);

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

      <HotspotFilters
        controls={controls}
        total={total}
        keywordOptions={keywords.map((item) => ({ id: item.id, term: item.term }))}
      />

      <div className="feed-meta">
        <span>匹配 {total} 条</span>
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
