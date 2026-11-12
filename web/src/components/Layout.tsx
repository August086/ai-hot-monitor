import type { ReactNode } from 'react';
import { Icon } from './Primitives';
import type { IconName } from './Primitives';
import type { LiveStatus } from '../hooks/useLive';

export type ViewKey = 'dashboard' | 'hotspots' | 'keywords' | 'settings';

export const NAV_ITEMS: { key: ViewKey; label: string; icon: IconName; sub: string }[] = [
  { key: 'dashboard', label: '仪表盘', icon: 'radar', sub: 'DASHBOARD' },
  { key: 'hotspots', label: '热点流', icon: 'list', sub: 'SIGNAL FEED' },
  { key: 'keywords', label: '关键词', icon: 'tag', sub: 'KEYWORDS' },
  { key: 'settings', label: '设置', icon: 'gear', sub: 'CONFIG' },
];

const STATUS_TEXT: Record<LiveStatus, string> = {
  online: '链路在线',
  connecting: '链路同步中',
  offline: '链路中断',
};

export function Layout({
  view,
  onNavigate,
  status,
  online,
  collecting,
  scanning,
  onScan,
  aiReady,
  children,
}: {
  view: ViewKey;
  onNavigate: (next: ViewKey) => void;
  status: LiveStatus;
  online: number;
  collecting: boolean;
  scanning: boolean;
  onScan: () => void;
  aiReady: boolean;
  children: ReactNode;
}) {
  const current = NAV_ITEMS.find((item) => item.key === view) || NAV_ITEMS[0];

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail__logo" title="NEON//WATCH">
          <svg viewBox="0 0 48 48" className="rail__mark">
            <polygon points="24,3 42,13 42,35 24,45 6,35 6,13" />
            <path d="M16 32V16l16 16V16" />
          </svg>
          <span className="rail__ring" />
        </div>

        <nav className="rail__nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`rail__item ${view === item.key ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={view === item.key ? 'page' : undefined}
            >
              <Icon name={item.icon} className="rail__icon" />
              <span className="rail__label">{item.label}</span>
              <span className="rail__glow" />
            </button>
          ))}
        </nav>

        <div className="rail__foot">
          <div className={`rail__pulse ${status === 'online' ? 'is-live' : ''}`}>
            <i />
            <span>{online}</span>
          </div>
          <span className="rail__version">v1.0</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="topbar__mark">NEON<span>//</span>WATCH</span>
            <span className="topbar__sep">/</span>
            <span className="topbar__crumb">
              {current.sub} <i>{current.label}</i>
            </span>
          </div>

          <div className="topbar__right">
            <div className={`chip chip--${status}`}>
              <span className="chip__dot" />
              {STATUS_TEXT[status]}
            </div>
            <div className={`chip ${aiReady ? 'chip--ok' : 'chip--warn'}`}>
              <Icon name="cpu" />
              AI {aiReady ? 'READY' : 'HEURISTIC'}
            </div>
            <button
              type="button"
              className={`scan-btn ${scanning || collecting ? 'is-busy' : ''}`}
              onClick={onScan}
              disabled={scanning || collecting}
            >
              <Icon name="refresh" />
              <span>{scanning || collecting ? 'SCANNING…' : 'RUN SCAN'}</span>
            </button>
          </div>
        </header>

        <main className="content">{children}</main>

        <footer className="footer">
          <span>NEON//WATCH · AI HOTSPOT INTELLIGENCE</span>
          <span className="footer__diag">SIGNAL CHANNEL 0x7F · ENCRYPTED</span>
        </footer>
      </div>
    </div>
  );
}
