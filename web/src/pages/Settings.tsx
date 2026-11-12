import { useEffect, useState } from 'react';
import type { NotificationRecord, SettingsPayload } from '../types';
import { api, formatTime } from '../api';
import { Icon, Panel, Toggle } from '../components/Primitives';

export function Settings({
  notify,
  onChanged,
}: {
  notify: (message: string, tone?: 'ok' | 'error') => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [scope, setScope] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<NotificationRecord[]>([]);

  const load = async () => {
    try {
      const [settings, notifications] = await Promise.all([api.settings(), api.notifications()]);
      setData(settings);
      setEmailTo(settings.settings.emailTo);
      setScope(settings.settings.scope);
      setHistory(notifications.items.slice(0, 8));
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (next: Record<string, unknown>, successMessage = '配置已保存') => {
    setSaving(true);
    try {
      const updated = await api.updateSettings(next);
      setData(updated);
      setEmailTo(updated.settings.emailTo);
      setScope(updated.settings.scope);
      onChanged();
      notify(successMessage);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await api.testEmail(emailTo);
      notify(`测试邮件已发送至 ${emailTo}`);
      load();
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--tall" />
      </div>
    );
  }

  const { settings, capabilities, ai, email, twitter, crawler } = data;

  return (
    <div className="page page--settings">
      <div className="page-head">
        <div>
          <span className="page-head__eyebrow">SYSTEM CONFIG / 运行参数</span>
          <h1>设置</h1>
        </div>
        <div className="page-head__status">API 密钥仅存储于 .env，前端不可见</div>
      </div>

      <div className="settings-grid">
        <Panel title="通知渠道" code="[01]" accent="magenta">
          <div className="setting-row">
            <div>
              <b>浏览器实时推送</b>
              <span>通过 WebSocket 在页面内即时弹出新信号</span>
            </div>
            <Toggle
              checked={settings.notifyBrowser === 'true'}
              onChange={(next) => patch({ notifyBrowser: next })}
              label="浏览器推送"
            />
          </div>

          <div className="setting-row">
            <div>
              <b>邮件通知</b>
              <span>命中阈值时发送 HTML 邮件，SMTP 配置在 .env</span>
            </div>
            <Toggle
              checked={settings.notifyEmail === 'true'}
              onChange={(next) => patch({ notifyEmail: next })}
              disabled={!email.configured}
              label="邮件通知"
            />
          </div>

          <div className="setting-field">
            <label htmlFor="email-to">收件邮箱</label>
            <div className="field-inline">
              <input
                id="email-to"
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="you@example.com"
              />
              <button
                type="button"
                className="btn"
                onClick={() => patch({ emailTo }, '收件邮箱已保存')}
                disabled={saving}
              >
                保存
              </button>
              <button type="button" className="btn btn--ghost" onClick={testEmail} disabled={testing || !email.configured}>
                {testing ? '发送中…' : '发送测试'}
              </button>
            </div>
            <small className={email.configured ? 'is-ok' : 'is-warn'}>
              {email.configured ? `SMTP 已连接 · ${email.host}:${email.port}` : 'SMTP 未配置：填写 .env 中的 SMTP_HOST / SMTP_USER / SMTP_PASS'}
            </small>
          </div>

          <div className="setting-field">
            <label htmlFor="min-importance">通知等级阈值</label>
            <select
              id="min-importance"
              value={settings.minImportance}
              onChange={(event) => patch({ minImportance: event.target.value })}
            >
              <option value="low">低及以上（信息量优先）</option>
              <option value="medium">中及以上（推荐）</option>
              <option value="high">高及以上</option>
              <option value="urgent">仅紧急</option>
            </select>
          </div>

          <div className="setting-row setting-row--static">
            <div>
              <b>自动研判新热点</b>
              <span>采集完成后自动调用 AI 判断真假与重要度</span>
            </div>
            <Toggle
              checked={settings.autoAnalyze === 'true'}
              onChange={(next) => patch({ autoAnalyze: next })}
              label="自动研判"
            />
          </div>
        </Panel>

        <Panel title="采集策略" code="[02]" accent="lime">
          <div className="setting-field">
            <label htmlFor="scope">监控范围</label>
            <textarea
              id="scope"
              rows={3}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="例如：AI 编程、大模型、AI 编程工具与开发者生态"
            />
            <div className="field-inline">
              <button type="button" className="btn btn--lime" onClick={() => patch({ scope }, '监控范围已保存')} disabled={saving}>
                保存范围
              </button>
              <small>该描述会作为 AI 研判上下文，用于评估相关性。</small>
            </div>
          </div>

          <div className="setting-field">
            <label htmlFor="interval">抓取间隔</label>
            <select
              id="interval"
              value={settings.collectInterval}
              onChange={(event) => patch({ collectInterval: event.target.value }, '抓取间隔已更新')}
            >
              <option value="10">每 10 分钟</option>
              <option value="15">每 15 分钟</option>
              <option value="30">每 30 分钟（默认）</option>
              <option value="60">每 60 分钟</option>
              <option value="120">每 2 小时</option>
            </select>
            <small>当前生效：{crawler.intervalMinutes} 分钟 · 每个关键词每轮最多 {crawler.perKeywordLimit} 条</small>
          </div>

          <div className="setting-field">
            <label htmlFor="retention">历史数据保留</label>
            <select
              id="retention"
              value={settings.retentionDays}
              onChange={(event) => patch({ retentionDays: event.target.value }, '保留策略已更新')}
            >
              <option value="7">7 天</option>
              <option value="30">30 天</option>
              <option value="90">90 天</option>
              <option value="180">180 天</option>
            </select>
            <small>仅清理已推送过的历史记录，未通知的热点不会被删除。</small>
          </div>

          <div className="setting-row setting-row--static">
            <div>
              <b>请求节流</b>
              <span>爬虫请求间隔 {(crawler.delayMs / 1000).toFixed(0)} 秒，UA 轮换已启用</span>
            </div>
            <span className="led is-on" />
          </div>
        </Panel>

        <Panel title="AI 引擎" code="[03]" accent="cyan">
          <div className="cap-row">
            <span>OpenRouter</span>
            <b className={capabilities.ai ? 'ok' : 'warn'}>{capabilities.ai ? 'KEY LOADED' : 'NO KEY'}</b>
          </div>
          <div className="model-card">
            <span className="model-card__label">PRIMARY MODEL</span>
            <b>{ai.model}</b>
            <span className="model-card__label">FALLBACK</span>
            <b>{ai.fallbackModel}</b>
          </div>
          <div className="cap-row">
            <span>启发式兜底</span>
            <b className={ai.heuristicFallback ? 'ok' : 'warn'}>{ai.heuristicFallback ? 'ENABLED' : 'OFF'}</b>
          </div>
          <p className="setting-note">
            真假识别、相关性与摘要均通过 OpenRouter 调用。主模型失败会自动切换备用模型，两者都失败时才使用启发式规则并标记为
            HEURISTIC。
          </p>
          <div className="cap-row">
            <span>Twitter / X 数据源</span>
            <b className={twitter.configured ? 'ok' : 'warn'}>{twitter.configured ? 'CONNECTED' : 'SKIPPED'}</b>
          </div>
          <div className="cap-row">
            <span>资讯数据源</span>
            <b className="ok">HN + RSS + 百度资讯</b>
          </div>
        </Panel>

        <Panel title="通知历史" code="[04]" accent="muted">
          <ul className="history">
            {history.map((item) => (
              <li key={item.id}>
                <span className={`history__dot history__dot--${item.status}`} />
                <div>
                  <b>{item.title}</b>
                  <em>
                    {item.channel.toUpperCase()} · {item.status.toUpperCase()} · {formatTime(item.createdAt)}
                  </em>
                </div>
              </li>
            ))}
            {!history.length && <li className="empty-line">暂无通知记录</li>}
          </ul>
          <button type="button" className="text-btn" onClick={load}>
            <Icon name="refresh" /> 刷新记录
          </button>
        </Panel>
      </div>
    </div>
  );
}
