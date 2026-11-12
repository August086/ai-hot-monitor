import { useEffect, useMemo, useState } from 'react';
import type { Hotspot, RunRecord, Stats } from '../types';
import { api, relativeTime } from '../api';
import { Donut, Gauge, Icon, Panel, Sparkline, Typewriter } from '../components/Primitives';
import { HotspotCard } from '../components/HotspotCard';
import { BackgroundBeams } from '../components/ui/background-beams';
import { Spotlight } from '../components/ui/spotlight';
import { TextGenerateEffect } from '../components/ui/text-generate-effect';
import type { ViewKey } from '../components/Layout';

const IMPORTANCE_ORDER = ['urgent', 'high', 'medium', 'low'];

export function Dashboard({
  pulse,
  onOpen,
  onNavigate,
  onScan,
  scanning,
  notify,
  aiReady,
}: {
  pulse: number;
  onOpen: (hotspot: Hotspot) => void;
  onNavigate: (view: ViewKey) => void;
  onScan: () => void;
  scanning: boolean;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  aiReady: boolean;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [latest, setLatest] = useState<Hotspot[]>([]);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [statsData, hotspotsData, runsData] = await Promise.all([
          api.stats(),
          api.hotspots({ limit: 7 }),
          api.runs(),
        ]);
        if (!alive) return;
        setStats(statsData);
        setLatest(hotspotsData.items);
        setLastRun(runsData.items[0] ?? null);
      } catch (error) {
        if (alive) notify((error as Error).message, 'error');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pulse, notify]);

  const realRate =
    stats && stats.real + stats.fake > 0 ? Math.round((stats.real / (stats.real + stats.fake)) * 100) : 0;

  const urgentQueue = useMemo(
    () =>
      latest
        .filter((item) => item.importance && IMPORTANCE_ORDER.includes(item.importance))
        .sort(
          (a, b) => IMPORTANCE_ORDER.indexOf(a.importance || 'low') - IMPORTANCE_ORDER.indexOf(b.importance || 'low'),
        )
        .slice(0, 3),
    [latest],
  );

  const timeline = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 86_400_000);
      return date.toISOString().slice(0, 10);
    });
    const map = new Map((stats?.timeline ?? []).map((item) => [item.day, item.count]));
    return days.map((day) => ({ day, count: map.get(day) || 0 }));
  }, [stats]);

  const maxDay = Math.max(...timeline.map((item) => item.count), 1);
  const today = new Date();
  const dateLabel = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="page page--desk">
      <section className="desk-hero">
        <BackgroundBeams className="desk-hero__beams" />
        <Spotlight className="desk-hero__spotlight" fill="#ff5c1a" />

        <div className="desk-hero__grid">
          <div className="desk-hero__copy">
            <span className="desk-eyebrow">
              <i /> LIVE SIGNAL DESK · {dateLabel}
            </span>
            <h1 className="desk-title">
              比别人早 30 分钟
              <span className="desk-title__accent">
                <TextGenerateEffect words="知道 AI 圈发生了什么" duration={0.35} />
              </span>
            </h1>
            <p className="desk-sub">
              关键词自动巡线，AI 先替你筛掉噪音与标题党；值得写的那一条，直接推到眼前。
            </p>

            <div className="desk-actions">
              <button type="button" className="cta-primary" onClick={onScan} disabled={scanning}>
                <Icon name="bolt" className={scanning ? 'spin' : ''} />
                {scanning ? '正在扫描…' : '立即扫描一轮'}
              </button>
              <button type="button" className="cta-ghost" onClick={() => onNavigate('hotspots')}>
                查看热点流
                <Icon name="external" />
              </button>
            </div>

            <div className="desk-meta">
              <span>
                <i className={`desk-dot ${aiReady ? 'is-live' : ''}`} />
                AI {aiReady ? 'ONLINE' : 'HEURISTIC'}
              </span>
              <span>SOURCE · BING{stats?.bySource?.some((item) => item.key === 'twitter') ? ' + X' : ''}</span>
              <span>{lastRun ? `LAST RUN ${relativeTime(lastRun.startedAt)}` : '等待首轮扫描'}</span>
            </div>
          </div>

          <aside className="desk-now">
            <header className="desk-now__head">
              <span>
                <i className="blip" /> NOW · 优先队列
              </span>
              <div className="desk-now__count">
                <b>{stats?.urgent ?? 0}</b>
                <em>待处理</em>
              </div>
            </header>

            <div className="desk-now__list">
              {loading && <div className="skeleton skeleton--tall" />}
              {urgentQueue.map((item, index) => (
                <button type="button" key={item.id} className="now-item" onClick={() => onOpen(item)}>
                  <span className={`now-item__rank rank-${item.importance}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className="now-item__body">
                    <b>{item.title}</b>
                    <em>
                      {relativeTime(item.createdAt)} · REL {item.relevance ?? '—'} · {item.source.toUpperCase()}
                    </em>
                  </span>
                  <span className="now-item__arrow">↗</span>
                </button>
              ))}
              {!loading && !urgentQueue.length && (
                <div className="desk-now__empty">
                  <Icon name="radar" />
                  <p>暂无高优先信号</p>
                  <span>点击「立即扫描一轮」抓取最新动态</span>
                </div>
              )}
            </div>

            {latest[0] && (
              <p className="desk-now__ticker" key={latest[0].id}>
                <span>LATEST</span>
                <Typewriter text={latest[0].title} speed={18} />
              </p>
            )}
          </aside>
        </div>

        <div className="desk-hero__strip">
          <div className="strip-cell">
            <span>48H 新动态</span>
            <b>{stats?.fresh ?? 0}</b>
          </div>
          <div className="strip-cell">
            <span>累计信号</span>
            <b>{stats?.total ?? 0}</b>
          </div>
          <div className="strip-cell">
            <span>可信信号</span>
            <b>{stats?.real ?? 0}</b>
          </div>
          <div className="strip-cell">
            <span>待研判</span>
            <b className={stats?.pending ? 'is-warn' : ''}>{stats?.pending ?? 0}</b>
          </div>
          <div className="strip-cell strip-cell--wide">
            <span>监控关键词</span>
            <b>{stats?.keywords ?? 0}</b>
            <em>在线 {stats?.online ?? 0}</em>
          </div>
        </div>
      </section>

      <div className="bento">
        <Panel
          title="信号活动"
          code="01"
          accent="cyan"
          className="bento__activity"
          actions={<span className="panel-kicker">近 7 日采集曲线</span>}
        >
          <div className="activity">
            <div className="activity__head">
              <div>
                <span>总捕获</span>
                <b>{timeline.reduce((sum, item) => sum + item.count, 0)} 条</b>
              </div>
              <span className="activity__legend">
                <i /> DAILY SIGNALS
              </span>
            </div>
            <Sparkline points={timeline.map((item) => item.count)} accent="cyan" />
            <div className="activity__cols">
              {timeline.map((item) => (
                <div className="activity__col" key={item.day}>
                  <div className="activity__bar" style={{ height: `${Math.max((item.count / maxDay) * 64, 3)}px` }} />
                  <span>{item.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="AI 可信度" code="02" accent="lime" className="bento__verdict">
          <Gauge value={realRate} label="信号可信度" caption="REAL RATE / 100" accent="cyan" />
          <p className="verdict-note">
            {aiReady
              ? 'OpenRouter 模型在线，真假识别与摘要实时生成'
              : '未配置 AI Key，当前使用启发式规则并明确标记'}
          </p>
        </Panel>

        <Panel title="来源分布" code="03" accent="magenta" className="bento__sources">
          <Donut data={stats?.bySource ?? []} />
        </Panel>
      </div>

      <div className="feed-grid">
        <Panel
          title="实时信号流"
          code="04"
          accent="cyan"
          actions={
            <button type="button" className="text-btn" onClick={() => onNavigate('hotspots')}>
              进入热点流 ↗
            </button>
          }
        >
          <div className="feed">
            {loading && <div className="skeleton skeleton--tall" />}
            {latest.map((item, index) => (
              <HotspotCard key={item.id} hotspot={item} index={index + 1} onOpen={onOpen} compact />
            ))}
            {!loading && !latest.length && (
              <div className="empty-state">
                <Icon name="radar" />
                <p>尚未捕获信号</p>
                <span>先添加关键词，然后点击右上角 SCAN NOW</span>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="系统状态" code="05" accent="muted" className="sys-panel">
          <ul className="sys-list">
            <li>
              <span>AI 研判引擎</span>
              <b className={aiReady ? 'ok' : 'warn'}>{aiReady ? 'ONLINE' : 'HEURISTIC'}</b>
            </li>
            <li>
              <span>采集调度</span>
              <b className="ok">EVERY 30 MIN</b>
            </li>
            <li>
              <span>实时信道</span>
              <b className={stats?.online ? 'ok' : 'warn'}>{stats?.online ? `${stats.online} CLIENT` : 'IDLE'}</b>
            </li>
            <li>
              <span>最近扫描</span>
              <b>{lastRun ? relativeTime(lastRun.startedAt) : '尚未运行'}</b>
            </li>
            <li>
              <span>上轮结果</span>
              <b className={lastRun?.status === 'success' ? 'ok' : lastRun ? 'warn' : ''}>
                {lastRun ? `${lastRun.created} NEW / ${lastRun.found} HIT` : '—'}
              </b>
            </li>
          </ul>

          <div className="sys-terminal">
            <div className="sys-terminal__bar">
              <i /> <i /> <i /> <span>watch.log</span>
            </div>
            <div className="sys-terminal__body">
              <p>&gt; scheduler armed · interval 30m</p>
              <p>&gt; sources: bing{aiReady ? ' + twitter' : ''}</p>
              <p>&gt; fingerprint dedupe: active</p>
              <p className="is-active">&gt; {lastRun ? `run#${lastRun.id} ${lastRun.status}` : 'awaiting first run'}_</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
