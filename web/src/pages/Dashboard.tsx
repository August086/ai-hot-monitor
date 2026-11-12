import { useEffect, useMemo, useState } from 'react';
import type { Hotspot, RunRecord, Stats } from '../types';
import { api, relativeTime } from '../api';
import { Donut, Gauge, Icon, ImportanceBars, Panel, Sparkline, StatTile, Typewriter } from '../components/Primitives';
import { HotspotCard } from '../components/HotspotCard';
import type { ViewKey } from '../components/Layout';

const IMPORTANCE_ORDER = ['urgent', 'high', 'medium', 'low'];

export function Dashboard({
  pulse,
  onOpen,
  onNavigate,
  notify,
  aiReady,
}: {
  pulse: number;
  onOpen: (hotspot: Hotspot) => void;
  onNavigate: (view: ViewKey) => void;
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

  const realRate = stats && stats.real + stats.fake > 0 ? Math.round((stats.real / (stats.real + stats.fake)) * 100) : 0;

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
  const ticker = urgentQueue[0]?.title || latest[0]?.title || '等待首轮信号接入…';

  return (
    <div className="page page--dashboard">
      <Panel className="hero" accent="cyan" flush>
        <div className="hero__grid">
          <div className="hero__main">
            <div className="hero__eyebrow">
              <span className="blip" /> SIGNAL CORE / 实时侦察单元
            </div>
            <div className="hero__count">
              <span className="hero__number">{stats?.today ?? 0}</span>
              <span className="hero__unit">
                条新信号
                <em>过去 24 小时</em>
              </span>
            </div>

            <div className="hero__ticker">
              <span className="hero__ticker-label">TOP SIGNAL</span>
              <p key={ticker}>
                <Typewriter text={ticker} speed={22} />
              </p>
            </div>

            <div className="hero__bar">
              <div>
                <span>累计信号</span>
                <b>{stats?.total ?? 0}</b>
              </div>
              <div>
                <span>已研判</span>
                <b>{stats?.analyzed ?? 0}</b>
              </div>
              <div>
                <span>待处理</span>
                <b className={stats?.pending ? 'is-warn' : ''}>{stats?.pending ?? 0}</b>
              </div>
              <div>
                <span>高危急</span>
                <b className="is-danger">{stats?.urgent ?? 0}</b>
              </div>
            </div>
          </div>

          <div className="hero__gauge">
            <Gauge value={realRate} label="信号可信度" caption="REAL RATE / 100" accent="cyan" />
            <p className="hero__gauge-note">
              {aiReady ? 'OpenRouter 模型已接入，真假识别实时运行' : '未配置 AI Key，当前使用启发式规则兜底'}
            </p>
          </div>

          <div className="hero__queue">
            <div className="hero__queue-head">
              <span>优先队列</span>
              <button type="button" onClick={() => onNavigate('hotspots')}>
                全部 ↗
              </button>
            </div>
            {loading && <div className="skeleton" />}
            {urgentQueue.map((item, index) => (
              <button type="button" key={item.id} className="queue-item" onClick={() => onOpen(item)}>
                <span className={`queue-item__rank rank-${item.importance}`}>{String(index + 1).padStart(2, '0')}</span>
                <span className="queue-item__text">
                  <b>{item.title}</b>
                  <em>
                    {relativeTime(item.createdAt)} · REL {item.relevance ?? '—'}
                  </em>
                </span>
              </button>
            ))}
            {!loading && !urgentQueue.length && <p className="empty-line">暂无高优先信号</p>}
          </div>
        </div>
      </Panel>

      <div className="stat-grid">
        <StatTile label="信号总量" value={stats?.total ?? 0} icon="signal" accent="cyan" hint="全量去重后的热点条目" delay={40} />
        <StatTile label="今日新增" value={stats?.today ?? 0} icon="bolt" accent="lime" hint="每 30 分钟刷新一次" delay={80} />
        <StatTile label="可信信号" value={stats?.real ?? 0} icon="shield" accent="magenta" hint="AI 判定为真实内容" delay={120} />
        <StatTile label="监控关键词" value={stats?.keywords ?? 0} icon="tag" accent="red" hint={`在线信道 ${stats?.online ?? 0}`} delay={160} />
      </div>

      <div className="dash-grid">
        <Panel title="信号活动" code="[01]" accent="cyan" className="dash-grid__activity">
          <div className="activity">
            <div className="activity__head">
              <div>
                <span>近 7 日采集曲线</span>
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

        <Panel title="来源分布" code="[02]" accent="magenta">
          <Donut data={stats?.bySource ?? []} />
        </Panel>

        <Panel title="重要度" code="[03]" accent="lime">
          <ImportanceBars data={stats?.byImportance ?? []} />
          <div className="panel-note">AI 结合影响范围与互动量综合定级</div>
        </Panel>
      </div>

      <div className="feed-grid">
        <Panel
          title="实时信号流"
          code="[04]"
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
                <span>先添加关键词，然后点击右上角 RUN SCAN</span>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="系统状态" code="[05]" accent="muted" className="sys-panel">
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
