import { Router } from 'express';
import { capabilities, config } from '../config.js';
import { getSettings, updateSettings } from '../db.js';
import { aiMeta } from '../services/ai.js';
import { emailConfigured, sendEmail } from '../services/notifier.js';

const router = Router();
const IMPORTANCE = new Set(['low', 'medium', 'high', 'urgent']);

const describe = () => ({
  settings: getSettings(),
  capabilities: { ...capabilities(), smtpHost: config.smtp.host || null },
  ai: aiMeta(),
  crawler: {
    intervalMinutes: config.crawler.intervalMinutes,
    delayMs: config.crawler.delayMs,
    perKeywordLimit: config.crawler.perKeywordLimit,
    maxKeywordsPerRun: config.crawler.maxKeywordsPerRun,
  },
  email: {
    configured: emailConfigured(),
    host: config.smtp.host || null,
    port: config.smtp.port,
    from: config.smtp.from || null,
  },
  twitter: { configured: Boolean(config.twitter.apiKey) },
});

router.get('/', (req, res) => {
  res.json(describe());
});

router.put('/', (req, res) => {
  const body = req.body ?? {};
  const patch = {};

  if (body.notifyBrowser !== undefined) patch.notifyBrowser = body.notifyBrowser ? 'true' : 'false';
  if (body.notifyEmail !== undefined) patch.notifyEmail = body.notifyEmail ? 'true' : 'false';
  if (body.autoAnalyze !== undefined) patch.autoAnalyze = body.autoAnalyze ? 'true' : 'false';

  if (body.emailTo !== undefined) {
    const emailTo = String(body.emailTo).trim();
    if (emailTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      return res.status(400).json({ error: '收件邮箱格式不正确' });
    }
    patch.emailTo = emailTo;
  }

  if (body.minImportance !== undefined) {
    if (!IMPORTANCE.has(body.minImportance)) return res.status(400).json({ error: '通知等级不合法' });
    patch.minImportance = body.minImportance;
  }

  if (body.scope !== undefined) {
    const scope = String(body.scope).trim();
    if (!scope) return res.status(400).json({ error: '监控范围不能为空' });
    patch.scope = scope.slice(0, 120);
  }

  if (body.retentionDays !== undefined) {
    const days = Number.parseInt(body.retentionDays, 10);
    if (Number.isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: '保留天数需在 1-365 之间' });
    }
    patch.retentionDays = String(days);
  }

  if (body.collectInterval !== undefined) {
    const minutes = Number.parseInt(body.collectInterval, 10);
    if (Number.isNaN(minutes) || minutes < 5 || minutes > 1440) {
      return res.status(400).json({ error: '抓取间隔需在 5-1440 分钟之间' });
    }
    patch.collectInterval = String(minutes);
  }

  updateSettings(patch);
  return res.json(describe());
});

router.post('/test-email', async (req, res) => {
  const to = String(req.body?.to ?? '').trim() || getSettings().emailTo || config.smtp.to;
  if (!to) return res.status(400).json({ error: '请先填写收件邮箱' });
  if (!emailConfigured()) {
    return res.status(400).json({ error: 'SMTP 未配置，请在 .env 中填写 SMTP_HOST / SMTP_USER / SMTP_PASS' });
  }
  try {
    await sendEmail({
      to,
      subject: '[TEST] NEON//WATCH 通知链路自检',
      html: `<div style="background:#05060a;color:#d7e3f4;font-family:monospace;padding:24px;border:1px solid #00f0ff55">
        <div style="color:#00f0ff;letter-spacing:3px;font-size:11px">NEON//WATCH · SMTP SELF-TEST</div>
        <p>邮件通道已连通，热点命中时将按你设置的等级阈值推送。</p>
        <p style="color:#7a8699;font-size:12px">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
      </div>`,
    });
    return res.json({ ok: true, to });
  } catch (error) {
    return res.status(502).json({ error: `发送失败：${error.message}` });
  }
});

export default router;
