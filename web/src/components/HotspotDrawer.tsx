import { useEffect, useState } from 'react';
import type { Hotspot } from '../types';
import { IMPORTANCE_LABEL, SOURCE_LABEL } from '../types';
import { api, formatTime } from '../api';
import { Icon, TrustBadge } from './Primitives';

export function HotspotDrawer({
  hotspot,
  onClose,
  onUpdated,
  notify,
}: {
  hotspot: Hotspot | null;
  onClose: () => void;
  onUpdated: (hotspot: Hotspot) => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hotspot) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [hotspot, onClose]);

  if (!hotspot) return null;
  const importance = hotspot.importance || 'low';

  const reanalyze = async () => {
    setBusy(true);
    try {
      const updated = await api.analyzeHotspot(hotspot.id);
      onUpdated(updated);
      notify('AI 研判已更新');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="热点详情">
      <button type="button" className="drawer__scrim" onClick={onClose} aria-label="关闭详情" />
      <aside className={`drawer__panel drawer__panel--${importance}`}>
        <div className="drawer__top">
          <span className="drawer__code">SIGNAL / {String(hotspot.id).padStart(4, '0')}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>

        <div className="hcard__badges">
          <TrustBadge isReal={hotspot.isReal} status={hotspot.aiStatus} />
          <span className={`tag tag--${importance}`}>{IMPORTANCE_LABEL[importance]}</span>
          <span className="tag tag--ghost">{SOURCE_LABEL[hotspot.source] || hotspot.source}</span>
          {hotspot.keyword && <span className="tag tag--keyword">#{hotspot.keyword}</span>}
        </div>

        <h2 className="drawer__title">{hotspot.title}</h2>

        <div className="drawer__meta">
          <div>
            <span>发现时间</span>
            <b>{formatTime(hotspot.createdAt)}</b>
          </div>
          <div>
            <span>发布时间</span>
            <b>{hotspot.publishedAt || '未知'}</b>
          </div>
          <div>
            <span>来源</span>
            <b>{hotspot.author || SOURCE_LABEL[hotspot.source] || hotspot.source}</b>
          </div>
          <div>
            <span>互动量</span>
            <b>{hotspot.engagement}</b>
          </div>
        </div>

        <section className="drawer__section">
          <h3>
            <span>[01]</span> AI 研判摘要
          </h3>
          <p className="drawer__summary">{hotspot.summary || '尚未生成摘要'}</p>
          {hotspot.aiReason && <p className="drawer__reason">判定依据：{hotspot.aiReason}</p>}
        </section>

        <section className="drawer__section">
          <h3>
            <span>[02]</span> 信号指标
          </h3>
          <div className="score">
            <span>相关性</span>
            <div className="score__track">
              <div className="score__fill" style={{ width: `${hotspot.relevance ?? 0}%` }} />
            </div>
            <b>{hotspot.relevance ?? '—'}</b>
          </div>
          <div className="score score--importance">
            <span>重要度</span>
            <div className="score__steps">
              {(['low', 'medium', 'high', 'urgent'] as const).map((level) => (
                <i
                  key={level}
                  className={
                    ['low', 'medium', 'high', 'urgent'].indexOf(importance) >=
                    ['low', 'medium', 'high', 'urgent'].indexOf(level)
                      ? 'is-on'
                      : ''
                  }
                />
              ))}
            </div>
            <b>{IMPORTANCE_LABEL[importance]}</b>
          </div>
          <div className="score">
            <span>模型</span>
            <b className="score__model">{hotspot.aiModel || 'PENDING'}</b>
            <b className="score__status">{hotspot.aiStatus}</b>
          </div>
        </section>

        <section className="drawer__section">
          <h3>
            <span>[03]</span> 原文摘录
          </h3>
          <p className="drawer__snippet">{hotspot.snippet || '无摘要内容'}</p>
        </section>

        <div className="drawer__actions">
          {hotspot.url && (
            <a className="btn btn--primary" href={hotspot.url} target="_blank" rel="noreferrer">
              <Icon name="external" /> 打开原文
            </a>
          )}
          <button type="button" className="btn" onClick={reanalyze} disabled={busy}>
            <Icon name="refresh" /> {busy ? '研判中…' : '重新研判'}
          </button>
        </div>

        <div className="drawer__foot">SOURCE: {hotspot.source.toUpperCase()} · FP {hotspot.fingerprint.slice(0, 10)}</div>
      </aside>
    </div>
  );
}
