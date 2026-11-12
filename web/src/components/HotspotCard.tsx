import type { Hotspot } from '../types';
import { IMPORTANCE_LABEL, SOURCE_LABEL } from '../types';
import { relativeTime } from '../api';
import { TrustBadge } from './Primitives';
import { CardSpotlight } from './ui/card-spotlight';

export function HotspotCard({
  hotspot,
  index,
  onOpen,
  onAnalyze,
  analyzing = false,
  compact = false,
}: {
  hotspot: Hotspot;
  index?: number;
  onOpen: (hotspot: Hotspot) => void;
  onAnalyze?: (hotspot: Hotspot) => void;
  analyzing?: boolean;
  compact?: boolean;
}) {
  const importance = hotspot.importance || 'low';
  return (
    <CardSpotlight className="hcard-wrap" radius={300}>
      <article
        className={`hcard hcard--${importance} ${compact ? 'hcard--compact' : ''} ${
          hotspot.aiStatus === 'pending' ? 'is-pending' : ''
        }`}
        onClick={() => onOpen(hotspot)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(hotspot);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className="hcard__edge" />
        <span className="hcard__index">{String(index ?? hotspot.id).padStart(2, '0')}</span>

        <div className="hcard__body">
          <div className="hcard__badges">
            <TrustBadge isReal={hotspot.isReal} status={hotspot.aiStatus} />
            <span className={`tag tag--${importance}`}>{IMPORTANCE_LABEL[importance]}</span>
            <span className="tag tag--ghost">{SOURCE_LABEL[hotspot.source] || hotspot.source}</span>
            {hotspot.keyword && <span className="tag tag--keyword">#{hotspot.keyword}</span>}
          </div>

          <h3 className="hcard__title">{hotspot.title}</h3>

          {!compact && (
            <p className="hcard__summary">
              <span className="hcard__prompt">//AI</span>
              {hotspot.summary || hotspot.snippet || '等待研判…'}
            </p>
          )}

          <div className="hcard__meta">
            <span>{relativeTime(hotspot.createdAt)}</span>
            <span className="dot" />
            <span>{hotspot.aiModel || 'AI PENDING'}</span>
            {hotspot.relevance !== null && (
              <>
                <span className="dot" />
                <span className="hcard__rel">REL {hotspot.relevance}</span>
              </>
            )}
            {hotspot.engagement > 0 && (
              <>
                <span className="dot" />
                <span className="hcard__heat">HEAT {hotspot.engagement}</span>
              </>
            )}
            {hotspot.aiStatus === 'pending' && onAnalyze && (
              <button
                type="button"
                className="hcard__action"
                onClick={(event) => {
                  event.stopPropagation();
                  onAnalyze(hotspot);
                }}
                disabled={analyzing}
              >
                {analyzing ? '研判中…' : '立即研判'}
              </button>
            )}
            <span className="hcard__enter">OPEN ↗</span>
          </div>
        </div>
      </article>
    </CardSpotlight>
  );
}
