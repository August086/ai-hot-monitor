import { useEffect, useRef, useState } from 'react';
import type { Hotspot, Keyword } from '../types';
import { api, relativeTime } from '../api';
import { HotspotCard } from '../components/HotspotCard';
import { Icon, Panel, Toggle } from '../components/Primitives';

/** 监控词 → 信号流：只保留该词，固定近 48h + 综合推荐，其余筛选全部重置 */
const feedHref = (term: string) =>
  `#/hotspots?keyword=${encodeURIComponent(term)}&hours=48&sort=recommended`;

const jumpToKeyword = (term: string) => {
  window.location.hash = feedHref(term).slice(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

export function Keywords({
  pulse,
  onChanged,
  onOpen,
  notify,
}: {
  pulse: number;
  onChanged: () => void;
  onOpen: (hotspot: Hotspot) => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const [items, setItems] = useState<Keyword[]>([]);
  const [term, setTerm] = useState('');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ term: '', domain: '' });
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [previewTerm, setPreviewTerm] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<Hotspot[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const termRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await api.keywords();
      setItems(data.items);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  const add = async () => {
    if (saving) return;
    const value = term.trim();
    if (!value) {
      notify('请先输入关键词', 'error');
      termRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await api.createKeyword({ term: value, domain: domain.trim() });
      setTerm('');
      setDomain('');
      await load();
      onChanged();
      notify(`已添加监控关键词「${value}」`);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (keyword: Keyword, enabled: boolean) => {
    try {
      const updated = await api.updateKeyword(keyword.id, { enabled });
      setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const startEdit = (keyword: Keyword) => {
    setEditingId(keyword.id);
    setDraft({ term: keyword.term, domain: keyword.domain });
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    try {
      const updated = await api.updateKeyword(editingId, {
        term: draft.term.trim(),
        domain: draft.domain.trim(),
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setEditingId(null);
      notify('关键词已更新');
      load();
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const remove = async (keyword: Keyword) => {
    if (!window.confirm(`确认删除关键词「${keyword.term}」？历史热点会保留。`)) return;
    try {
      await api.deleteKeyword(keyword.id);
      setItems((current) => current.filter((item) => item.id !== keyword.id));
      if (previewTerm === keyword.term) setPreviewTerm(null);
      onChanged();
      notify('关键词已删除');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const scanOne = async (keyword: Keyword) => {
    setScanningId(keyword.id);
    try {
      const result = await api.collect([keyword.id]);
      notify(`「${keyword.term}」扫描完成：新增 ${result.created ?? 0} 条信号`);
      await load();
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setScanningId(null);
    }
  };

  // 行内预览：近 48h 的 5 条，排序与跳转后的信号流一致
  const togglePreview = async (keyword: Keyword) => {
    if (previewTerm === keyword.term) {
      setPreviewTerm(null);
      return;
    }
    setPreviewTerm(keyword.term);
    setPreviewItems([]);
    setPreviewLoading(true);
    try {
      const data = await api.hotspots({
        keyword: keyword.term,
        hours: 48,
        sort: 'recommended',
        dated: true,
        limit: 5,
      });
      setPreviewItems(data.items);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const ranking = [...items]
    .filter((item) => item.stats)
    .sort((a, b) => (b.stats?.last7d ?? 0) - (a.stats?.last7d ?? 0))
    .slice(0, 8);
  const rankingMax = Math.max(1, ...ranking.map((item) => item.stats?.last7d ?? 0));

  const healthBadge = (keyword: Keyword) => {
    if (!keyword.stats) return null;
    if (!keyword.lastCheckedAt) return <span className="kw-badge kw-badge--new">待首扫</span>;
    if (keyword.lastCheckedAt && keyword.stats.last7d === 0) {
      return <span className="kw-badge kw-badge--idle">低产</span>;
    }
    return null;
  };

  return (
    <div className="page page--keywords">
      <div className="page-head">
        <div>
          <span className="page-head__eyebrow">KEYWORD REGISTRY / 监控词表</span>
          <h1>
            关键词 <em>{items.length}</em>
          </h1>
        </div>
      </div>

      <Panel accent="lime" className="terminal-panel" title="添加监控关键词" code="[01]">
        <form
          className="kw-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label className="term-input">
            <span className="term-input__prompt">root@neonwatch:~$</span>
            <span className="term-input__cmd">monitor --add</span>
            <input
              ref={termRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="关键词，如 DeepSeek / Claude Code / AI 编程"
              aria-label="关键词"
              maxLength={60}
            />
          </label>
          <div className="term-sub">
            <label>
              <span>范围限定（可选）</span>
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="如：大模型 / 编程工具 / 官方发布"
                maxLength={60}
              />
            </label>
            <button type="submit" className="btn btn--lime" disabled={saving}>
              <Icon name="plus" /> {saving ? '写入中…' : '写入监控表'}
            </button>
          </div>
        </form>
        <p className="term-hint">
          // 系统每 30 分钟扫描一次；范围限定会拼接进检索语句，用于收窄结果。
        </p>
      </Panel>

      <Panel accent="cyan" title="监控表" code="[02]" flush>
        <div className="kw-table">
          <div className="kw-table__head">
            <span>ID</span>
            <span>关键词 / 范围</span>
            <span>产出 · 质量</span>
            <span>状态</span>
            <span>最近扫描</span>
            <span>操作</span>
          </div>

          {loading && <div className="skeleton" />}

          {!loading &&
            items.map((keyword, index) => {
              const stats = keyword.stats;
              const expanded = previewTerm === keyword.term;
              return (
                <div key={keyword.id}>
                  <div
                    className={`kw-row ${keyword.enabled ? '' : 'is-off'} ${
                      editingId === keyword.id ? 'is-editing' : ''
                    } ${expanded ? 'is-expanded' : ''}`}
                  >
                    <span className="kw-row__id">K-{String(index + 1).padStart(2, '0')}</span>

                    {editingId === keyword.id ? (
                      <div className="kw-row__edit">
                        <input
                          value={draft.term}
                          onChange={(event) => setDraft({ ...draft, term: event.target.value })}
                          aria-label="编辑关键词"
                        />
                        <input
                          value={draft.domain}
                          onChange={(event) => setDraft({ ...draft, domain: event.target.value })}
                          placeholder="范围"
                          aria-label="编辑范围"
                        />
                        <button type="button" className="text-btn" onClick={saveEdit}>
                          保存
                        </button>
                        <button type="button" className="text-btn text-btn--muted" onClick={() => setEditingId(null)}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="kw-row__term">
                        <b>
                          <button
                            type="button"
                            className="kw-link"
                            onClick={() => jumpToKeyword(keyword.term)}
                            title={`查看「${keyword.term}」的信号`}
                          >
                            {keyword.term}
                          </button>
                          {healthBadge(keyword)}
                        </b>
                        <em>{keyword.domain || '全域扫描'}</em>
                      </div>
                    )}

                    <div className="kw-row__stats">
                      <span title="近 48 小时信号数">
                        <i>48h</i>
                        {stats?.last48h ?? 0}
                      </span>
                      <span title="近 7 天信号数">
                        <i>7d</i>
                        {stats?.last7d ?? 0}
                      </span>
                      <span title="平均相关性（AI 研判）">
                        <i>REL</i>
                        {stats?.avgRelevance ?? '—'}
                      </span>
                      <span className={stats?.pending ? 'is-warn' : ''} title="待研判条目">
                        <i>待</i>
                        {stats?.pending ?? 0}
                      </span>
                    </div>

                    <div className="kw-row__toggle">
                      <Toggle
                        checked={keyword.enabled}
                        onChange={(next) => toggle(keyword, next)}
                        label={`${keyword.term} 启用`}
                      />
                    </div>

                    <div className="kw-row__time">
                      <span>{keyword.lastCheckedAt ? relativeTime(keyword.lastCheckedAt) : '尚未扫描'}</span>
                      <i className={keyword.enabled ? 'is-live' : ''} />
                    </div>

                    <div className="kw-row__actions">
                      <button
                        type="button"
                        className={`text-btn kw-feed-btn ${expanded ? 'is-active' : ''}`}
                        title="预览该词最近信号"
                        onClick={() => togglePreview(keyword)}
                      >
                        信号 {stats?.last48h ?? 0}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="立即扫描"
                        onClick={() => scanOne(keyword)}
                        disabled={scanningId === keyword.id}
                      >
                        <Icon name="bolt" className={scanningId === keyword.id ? 'spin' : ''} />
                      </button>
                      <button type="button" className="icon-btn" title="编辑" onClick={() => startEdit(keyword)}>
                        <Icon name="gear" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        title="删除"
                        onClick={() => remove(keyword)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="kw-preview">
                      <div className="kw-preview__head">
                        <span>
                          预览 · 「{keyword.term}」近 48h 优先信号
                        </span>
                        <div className="kw-preview__actions">
                          <a className="text-btn" href={feedHref(keyword.term)}>
                            查看全部 {stats?.last48h ?? 0} 条 ↗
                          </a>
                          <button type="button" className="text-btn text-btn--muted" onClick={() => setPreviewTerm(null)}>
                            收起
                          </button>
                        </div>
                      </div>
                      {previewLoading && <div className="skeleton skeleton--card" />}
                      {!previewLoading &&
                        previewItems.map((item, itemIndex) => (
                          <HotspotCard
                            key={item.id}
                            hotspot={item}
                            index={itemIndex + 1}
                            compact
                            onOpen={onOpen}
                          />
                        ))}
                      {!previewLoading && !previewItems.length && (
                        <p className="kw-preview__empty">该词近 48 小时没有新信号，可点「立即扫描」抓一轮。</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {!loading && !items.length && (
            <div className="empty-state">
              <Icon name="tag" />
              <p>监控表为空</p>
              <span>在上方终端输入第一个关键词</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        accent="lime"
        title="监控词产出"
        code="[03]"
        actions={<span className="kw-rank__hint">近 7 天信号数 · 点击进入信号流</span>}
      >
        <div className="kw-rank">
          {ranking.map((keyword) => {
            const count = keyword.stats?.last7d ?? 0;
            return (
              <button
                type="button"
                className="kw-rank__row"
                key={keyword.id}
                onClick={() => jumpToKeyword(keyword.term)}
                title={`查看「${keyword.term}」近 48 小时信号`}
              >
                <span className="kw-rank__term">{keyword.term}</span>
                <span className="kw-rank__bar">
                  <i style={{ width: `${Math.max(4, Math.round((count / rankingMax) * 100))}%` }} />
                </span>
                <span className="kw-rank__count">{count}</span>
                <span className="kw-rank__meta">
                  REL {keyword.stats?.avgRelevance ?? '—'}
                  {keyword.stats?.pending ? ` · 待 ${keyword.stats.pending}` : ''}
                </span>
              </button>
            );
          })}
          {!ranking.length && <p className="kw-preview__empty">还没有产出数据，等第一轮采集完成。</p>}
        </div>
      </Panel>
    </div>
  );
}
