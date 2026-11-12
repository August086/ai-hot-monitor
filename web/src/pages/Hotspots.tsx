import { useEffect, useMemo, useState } from 'react';
import type { Hotspot, Importance } from '../types';
import { api } from '../api';
import { HotspotCard } from '../components/HotspotCard';
import { Icon, Panel } from '../components/Primitives';

const IMPORTANCE_FILTERS: { key: Importance | 'all'; label: string }[] = [
  { key: 'all', label: '全部等级' },
  { key: 'urgent', label: '紧急' },
  { key: 'high', label: '高' },
  { key: 'medium', label: '中' },
  { key: 'low', label: '低' },
];

const SOURCE_FILTERS = [
  { key: 'all', label: '全部来源' },
  { key: 'baidu', label: '百度资讯' },
  { key: 'ithome', label: 'IT之家' },
  { key: 'solidot', label: 'SOLIDOT' },
  { key: 'infoq', label: 'INFOQ' },
  { key: 'qbitai', label: '量子位' },
  { key: 'hackernews', label: 'HN' },
  { key: 'gdelt', label: 'GDELT' },
  { key: 'arxiv', label: 'ARXIV' },
  { key: 'huggingface', label: 'HF' },
  { key: 'bing', label: 'WEB / BING' },
  { key: 'twitter', label: 'X / TWITTER' },
];

export function Hotspots({
  pulse,
  onOpen,
  notify,
}: {
  pulse: number;
  onOpen: (hotspot: Hotspot) => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const [items, setItems] = useState<Hotspot[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [importance, setImportance] = useState<Importance | 'all'>('all');
  const [source, setSource] = useState('all');
  const [trust, setTrust] = useState<'all' | 'real' | 'fake'>('all');
  const [sort, setSort] = useState<'latest' | 'importance'>('latest');
  const [datedOnly, setDatedOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .hotspots({
        limit,
        importance: importance === 'all' ? undefined : importance,
        source: source === 'all' ? undefined : source,
        isReal: trust === 'all' ? undefined : trust === 'real',
        q: query || undefined,
        sort,
        dated: datedOnly ? true : undefined,
      })
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
  }, [importance, source, trust, query, limit, sort, datedOnly, pulse, notify]);

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
      setQuery(term);
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

      <div className="filterbar">
        <div className="filterbar__group">
          {IMPORTANCE_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip-filter ${importance === item.key ? 'is-active' : ''} ${item.key === 'all' ? 'is-all' : ''}`}
              onClick={() => setImportance(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filterbar__group">
          {SOURCE_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip-filter ${source === item.key ? 'is-active' : ''} ${item.key === 'all' ? 'is-all' : ''}`}
              onClick={() => setSource(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filterbar__group">
          {[
            { key: 'all', label: '全部可信度' },
            { key: 'real', label: '可信' },
            { key: 'fake', label: '存疑' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip-filter ${trust === item.key ? 'is-active' : ''} ${item.key === 'all' ? 'is-all' : ''}`}
              onClick={() => setTrust(item.key as 'all' | 'real' | 'fake')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filterbar__group">
          <button
            type="button"
            className={`chip-filter ${sort === 'latest' ? 'is-active' : ''}`}
            onClick={() => setSort('latest')}
          >
            最新优先
          </button>
          <button
            type="button"
            className={`chip-filter ${sort === 'importance' ? 'is-active' : ''}`}
            onClick={() => setSort('importance')}
          >
            等级优先
          </button>
          <button
            type="button"
            className={`chip-filter ${datedOnly ? 'is-active' : ''}`}
            onClick={() => setDatedOnly((value) => !value)}
            title="隐藏没有发布时间的官网/文档页"
          >
            仅有发布时间
          </button>
        </div>
        <div className="filterbar__search">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="在结果中检索…"
            aria-label="在结果中检索"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空检索">
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      <div className="feed-meta">
        <span>匹配 {total} 条</span>
        <span className="feed-meta__warn">紧急 {summarize.urgent}</span>
        <span className="feed-meta__pending">待研判 {summarize.pending}</span>
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
