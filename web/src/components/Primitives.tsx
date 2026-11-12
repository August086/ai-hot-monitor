import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Importance } from '../types';

/* ---------------- Panel ---------------- */
export function Panel({
  title,
  code,
  accent = 'cyan',
  actions,
  children,
  className = '',
  flush = false,
}: {
  title?: string;
  code?: string;
  accent?: 'cyan' | 'magenta' | 'lime' | 'red' | 'muted';
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`panel panel--${accent} ${className}`}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__title">
            {code && <span className="panel__code">{code}</span>}
            <h2>{title}</h2>
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  );
}

/* ---------------- CountUp ---------------- */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const start = previous.current;
    const diff = target - start;
    if (diff === 0) {
      setValue(target);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      previous.current = target;
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(start + diff * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        previous.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/* ---------------- StatTile ---------------- */
export function StatTile({
  label,
  value,
  suffix,
  hint,
  accent = 'cyan',
  icon,
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  accent?: 'cyan' | 'magenta' | 'lime' | 'red';
  icon?: IconName;
  delay?: number;
}) {
  const display = useCountUp(value);
  return (
    <div className={`stat stat--${accent}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {icon && <Icon name={icon} className="stat__icon" />}
      </div>
      <div className="stat__value">
        {display}
        {suffix && <em>{suffix}</em>}
      </div>
      <div className="stat__hint">{hint || '\u00A0'}</div>
      <span className="stat__corner" />
    </div>
  );
}

/* ---------------- Importance ---------------- */
export const IMPORTANCE_RANK: Record<Importance, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/* ---------------- Gauge ---------------- */
export function Gauge({
  value,
  max = 100,
  label,
  caption,
  accent = 'cyan',
}: {
  value: number;
  max?: number;
  label: string;
  caption?: string;
  accent?: 'cyan' | 'magenta';
}) {
  const animated = useCountUp(value, 1200);
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(animated / max, 1));
  const ticks = Array.from({ length: 44 });

  return (
    <div className={`gauge gauge--${accent}`}>
      <svg viewBox="0 0 200 200" className="gauge__svg" role="img" aria-label={`${label} ${value}`}>
        <defs>
          <linearGradient id={`gauge-${accent}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent === 'cyan' ? '#ff5c1a' : '#ffb020'} />
            <stop offset="100%" stopColor={accent === 'cyan' ? '#c6ff3d' : '#ff5c1a'} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} className="gauge__track" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          className="gauge__value"
          stroke={`url(#gauge-${accent})`}
          strokeDasharray={`${circumference * ratio} ${circumference}`}
        />
        {ticks.map((_, index) => {
          const angle = (index / ticks.length) * Math.PI * 2 - Math.PI / 2;
          const inner = 84;
          const outer = index % 4 === 0 ? 90 : 87;
          return (
            <line
              key={index}
              x1={100 + Math.cos(angle) * inner}
              y1={100 + Math.sin(angle) * inner}
              x2={100 + Math.cos(angle) * outer}
              y2={100 + Math.sin(angle) * outer}
              className={index / ticks.length <= ratio ? 'gauge__tick gauge__tick--on' : 'gauge__tick'}
            />
          );
        })}
        <text x="100" y="96" textAnchor="middle" className="gauge__number">
          {animated}
        </text>
        <text x="100" y="118" textAnchor="middle" className="gauge__unit">
          {caption || '/ 100'}
        </text>
      </svg>
      <div className="gauge__label">
        <span>{label}</span>
        <span className="gauge__sub">LIVE METRIC</span>
      </div>
    </div>
  );
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({ points, accent = 'cyan' }: { points: number[]; accent?: 'cyan' | 'magenta' }) {
  const path = useMemo(() => {
    if (!points.length) return { line: '', area: '' };
    const width = 320;
    const height = 88;
    const max = Math.max(...points, 1);
    const step = points.length > 1 ? width / (points.length - 1) : width;
    const coords = points.map((point, index) => {
      const x = index * step;
      const y = height - (point / max) * (height - 12) - 6;
      return [x, y] as const;
    });
    const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [points]);

  return (
    <svg viewBox="0 0 320 88" className={`spark spark--${accent}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-fill-${accent}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent === 'cyan' ? '#ff5c1a' : '#ffb020'} stopOpacity="0.34" />
          <stop offset="100%" stopColor={accent === 'cyan' ? '#ff5c1a' : '#ffb020'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#spark-fill-${accent})`} />
      <path d={path.line} className="spark__line" />
    </svg>
  );
}

/* ---------------- Donut ---------------- */
const DONUT_COLORS: Record<string, string> = {
  bing: '#ff5c1a',
  hackernews: '#ffb020',
  gdelt: '#ffd166',
  arxiv: '#c6ff3d',
  huggingface: '#7ee787',
  twitter: '#90cdf4',
  seed: '#55677e',
};

export function Donut({ data }: { data: { key: string; count: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0) || 1;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="46" className="donut__track" />
        {data.map((item) => {
          const ratio = item.count / total;
          const dash = ratio * 2 * Math.PI * 46;
          const circle = (
            <circle
              key={item.key}
              cx="60"
              cy="60"
              r="46"
              className="donut__seg"
              stroke={DONUT_COLORS[item.key] || '#7a8699'}
              strokeDasharray={`${dash} ${2 * Math.PI * 46 - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
        <text x="60" y="57" textAnchor="middle" className="donut__total">
          {total}
        </text>
        <text x="60" y="73" textAnchor="middle" className="donut__caption">
          SIGNALS
        </text>
      </svg>
      <ul className="donut__legend">
        {data.map((item) => (
          <li key={item.key}>
            <i style={{ background: DONUT_COLORS[item.key] || '#7a8699' }} />
            <span>{item.key.toUpperCase()}</span>
            <b>{item.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Bars ---------------- */
const IMPORTANCE_COLOR: Record<string, string> = {
  urgent: '#ff3b5c',
  high: '#ffb020',
  medium: '#ff5c1a',
  low: '#61708a',
  unrated: '#3d4757',
};

export function ImportanceBars({ data }: { data: { key: string; count: number }[] }) {
  const order = ['urgent', 'high', 'medium', 'low', 'unrated'];
  const sorted = [...data].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const max = Math.max(...sorted.map((item) => item.count), 1);
  return (
    <div className="bars">
      {sorted.map((item) => (
        <div className="bars__row" key={item.key}>
          <span className="bars__label">{item.key === 'unrated' ? '待研判' : item.key.toUpperCase()}</span>
          <div className="bars__track">
            <div
              className="bars__fill"
              style={{
                width: `${(item.count / max) * 100}%`,
                background: IMPORTANCE_COLOR[item.key] || '#61708a',
              }}
            />
          </div>
          <b>{item.count}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
      <span className="toggle__text">{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}

/* ---------------- TrustBadge ---------------- */
export function TrustBadge({ isReal, status }: { isReal: boolean | null; status: string }) {
  if (status === 'pending') return <span className="badge badge--pending">待研判</span>;
  if (isReal === null) return <span className="badge badge--pending">未知</span>;
  const heuristic = status === 'heuristic';
  return (
    <span className={`badge ${isReal ? 'badge--real' : 'badge--fake'}`}>
      {isReal ? '可信' : '存疑'}
      {heuristic && <i title="启发式判定，未调用大模型">H</i>}
    </span>
  );
}

/* ---------------- Typewriter ---------------- */
export function Typewriter({ text, speed = 16 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!text) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    let index = 0;
    setShown('');
    const timer = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, speed]);
  return <span>{shown}</span>;
}

/* ---------------- Icons ---------------- */
export type IconName =
  | 'pulse'
  | 'radar'
  | 'list'
  | 'tag'
  | 'gear'
  | 'shield'
  | 'external'
  | 'plus'
  | 'search'
  | 'refresh'
  | 'close'
  | 'bolt'
  | 'signal'
  | 'cpu';

const PATHS: Record<IconName, ReactNode> = {
  pulse: <path d="M2 12h4l2-7 4 14 2-7h6" />,
  radar: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 12 18 6" />
    </>
  ),
  list: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l9 9-8 8-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />,
  external: <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  signal: <path d="M4 20V10M10 20V4M16 20v-8M22 20V8" />,
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
