import type { ReactNode } from 'react';
import { Icon } from './Primitives';
import type { IconName } from './Primitives';
import { HoverBorderGradient } from './ui/hover-border-gradient';
import type { LiveStatus } from '../hooks/useLive';

export type ViewKey = 'dashboard' | 'hotspots' | 'keywords' | 'settings';

export const NAV_ITEMS: { key: ViewKey; label: string; icon: IconName; sub: string }[] = [
  { key: 'dashboard', label: '指挥台', icon: 'radar', sub: 'SIGNAL DESK' },
  { key: 'hotspots', label: '热点流', icon: 'list', sub: 'LIVE FEED' },
  { key: 'keywords', label: '关键词', icon: 'tag', sub: 'KEYWORDS' },
  { key: 'settings', label: '设置', icon: 'gear', sub: 'CONFIG' },
];

const STATUS_TEXT: Record<LiveStatus, string> = {
  online: 'LIVE',
  connecting: 'SYNC',
  offline: 'OFFLINE',
};

export type TickerItem = {
  id: number;
  title: string;
  importance: string | null;
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
  headlines,
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
  headlines: TickerItem[];
  children: ReactNode;
}) {
  const current = NAV_ITEMS.find((item) => item.key === view) || NAV_ITEMS[0];
  const wire = headlines.length ? headlines : [{ id: 0, title: '等待第一轮扫描，接入实时信号…', importance: null }];
  const busy = scanning || collecting;

  return (
    <div className="shell shell--desk">
      <header className="masthead">
        <a
          className="brand"
          href="#/dashboard"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('dashboard');
          }}
        >
          <span className="brand__glyph" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="brand__text">
            <b>NEON//WATCH</b>
            <em>{current.sub}</em>
          </span>
        </a>

        <nav className="topnav" aria-label="主导航">
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={`topnav__item ${view === item.key ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={view === item.key ? 'page' : undefined}
            >
              <span className="topnav__no">0{index + 1}</span>
              <span className="topnav__label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="masthead__right">
          <div className={`live-pill live-pill--${status}`}>
            <i />
            {STATUS_TEXT[status]}
            <span>{online}</span>
          </div>
          <span className={`ai-pill ${aiReady ? 'is-on' : 'is-off'}`}>
            <Icon name="cpu" />
            {aiReady ? 'AI' : 'RULE'}
          </span>
          <HoverBorderGradient
            as="button"
            type="button"
            onClick={onScan}
            disabled={busy}
            duration={2}
            containerClassName={`scan-cta ${busy ? 'is-busy' : ''}`}
            className="scan-cta__inner"
          >
            <Icon name="bolt" />
            {busy ? 'SCANNING' : 'SCAN NOW'}
          </HoverBorderGradient>
        </div>
      </header>

      <div className="ticker" role="region" aria-label="最新信号走马灯，聚焦可暂停" tabIndex={0}>
        <span className="ticker__label">
          <i /> LIVE WIRE
        </span>
        <div className="ticker__viewport">
          <div className="ticker__track">
            {[...wire, ...wire].map((item, index) => (
              <span
                key={`${item.id}-${index}`}
                className={`ticker__item ticker__item--${item.importance || 'none'}`}
                aria-hidden={index >= wire.length ? true : undefined}
              >
                <i />
                {item.title}
              </span>
            ))}
          </div>
        </div>
        <span className="ticker__meta">每 30 分钟刷新</span>
      </div>

      <main className="content content--desk">{children}</main>

      <footer className="footer">
        <span>NEON//WATCH · 为第一时间发布的你而生</span>
        <span className="footer__diag">SIGNAL DESK · {aiReady ? 'AI CORE ONLINE' : 'HEURISTIC MODE'}</span>
      </footer>

      <nav className="mobile-nav" aria-label="移动端导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mobile-nav__item ${view === item.key ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
