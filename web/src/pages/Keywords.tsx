import { useEffect, useState } from 'react';
import type { Keyword } from '../types';
import { api, relativeTime } from '../api';
import { Icon, Panel, Toggle } from '../components/Primitives';

export function Keywords({
  pulse,
  onChanged,
  notify,
}: {
  pulse: number;
  onChanged: () => void;
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
    const value = term.trim();
    if (!value) return;
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
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
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
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      notify('关键词已更新');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const remove = async (keyword: Keyword) => {
    if (!window.confirm(`确认删除关键词「${keyword.term}」？历史热点会保留。`)) return;
    try {
      await api.deleteKeyword(keyword.id);
      setItems((current) => current.filter((item) => item.id !== keyword.id));
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
      load();
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setScanningId(null);
    }
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
        <div className="term-input">
          <span className="term-input__prompt">root@neonwatch:~$</span>
          <span className="term-input__cmd">monitor --add</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
            placeholder="关键词，如 DeepSeek / Claude Code / AI 编程"
            aria-label="关键词"
            maxLength={60}
          />
        </div>
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
          <button type="button" className="btn btn--lime" onClick={add} disabled={saving || !term.trim()}>
            <Icon name="plus" /> {saving ? '写入中…' : '写入监控表'}
          </button>
        </div>
        <p className="term-hint">
          // 系统每 30 分钟扫描一次；范围限定会拼接进 Bing 与 X 的检索语句，用于收窄结果。
        </p>
      </Panel>

      <Panel accent="cyan" title="监控表" code="[02]" flush>
        <div className="kw-table">
          <div className="kw-table__head">
            <span>ID</span>
            <span>关键词 / 范围</span>
            <span>状态</span>
            <span>最近扫描</span>
            <span>操作</span>
          </div>

          {loading && <div className="skeleton" />}

          {!loading &&
            items.map((keyword, index) => (
              <div className={`kw-row ${keyword.enabled ? '' : 'is-off'} ${editingId === keyword.id ? 'is-editing' : ''}`} key={keyword.id}>
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
                    <b>{keyword.term}</b>
                    <em>{keyword.domain || '全域扫描'}</em>
                  </div>
                )}

                <div className="kw-row__toggle">
                  <Toggle checked={keyword.enabled} onChange={(next) => toggle(keyword, next)} label={`${keyword.term} 启用`} />
                </div>

                <div className="kw-row__time">
                  <span>{keyword.lastCheckedAt ? relativeTime(keyword.lastCheckedAt) : '尚未扫描'}</span>
                  <i className={keyword.enabled ? 'is-live' : ''} />
                </div>

                <div className="kw-row__actions">
                  <button type="button" className="icon-btn" title="立即扫描" onClick={() => scanOne(keyword)} disabled={scanningId === keyword.id}>
                    <Icon name="bolt" className={scanningId === keyword.id ? 'spin' : ''} />
                  </button>
                  <button type="button" className="icon-btn" title="编辑" onClick={() => startEdit(keyword)}>
                    <Icon name="gear" />
                  </button>
                  <button type="button" className="icon-btn icon-btn--danger" title="删除" onClick={() => remove(keyword)}>
                    <Icon name="close" />
                  </button>
                </div>
              </div>
            ))}

          {!loading && !items.length && (
            <div className="empty-state">
              <Icon name="tag" />
              <p>监控表为空</p>
              <span>在上方终端输入第一个关键词</span>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
