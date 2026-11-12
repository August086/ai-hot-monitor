import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { addNotification, getSettings, markNotified } from '../db.js';
import { broadcast, broadcastHotspot } from '../ws.js';

const RANK = { low: 0, medium: 1, high: 2, urgent: 3 };
const COLORS = { urgent: '#ff2b5e', high: '#ff2bd6', medium: '#00f0ff', low: '#7a8699' };

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

function buildEmailHtml(hotspot) {
  const accent = COLORS[hotspot.importance] || COLORS.medium;
  const confidence = hotspot.relevance ?? '—';
  return `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#05060a;font-family:'Menlo','Consolas',monospace;color:#d7e3f4;">
  <div style="max-width:640px;margin:0 auto;border:1px solid ${accent}55;background:linear-gradient(180deg,#0b0f18,#060810);padding:28px;">
    <div style="font-size:11px;letter-spacing:4px;color:${accent};">NEON//WATCH · HOTSPOT SIGNAL</div>
    <h1 style="font-size:20px;line-height:1.5;margin:16px 0 8px;">${escapeHtml(hotspot.title)}</h1>
    <div style="font-size:12px;color:#7a8699;margin-bottom:18px;">
      等级 <span style="color:${accent};">${(hotspot.importance || 'unknown').toUpperCase()}</span>
      · 相关性 ${confidence}/100
      · 来源 ${escapeHtml(hotspot.source)}${hotspot.author ? ` / ${escapeHtml(hotspot.author)}` : ''}
    </div>
    <p style="font-size:14px;line-height:1.8;color:#b7c7da;">${escapeHtml(hotspot.summary || hotspot.snippet || '暂无摘要')}</p>
    ${
      hotspot.url
        ? `<a href="${escapeHtml(hotspot.url)}" style="display:inline-block;margin-top:16px;padding:10px 18px;border:1px solid ${accent};color:${accent};text-decoration:none;font-size:12px;letter-spacing:2px;">打开原文 →</a>`
        : ''
    }
    <div style="margin-top:24px;padding-top:14px;border-top:1px dashed #1c2534;font-size:11px;color:#4d5a6b;">
      由 NEON//WATCH 自动研判并推送 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
    </div>
  </div>
</body></html>`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendEmail({ to, subject, html }) {
  const tx = getTransporter();
  if (!tx) throw new Error('SMTP 未配置（检查 SMTP_HOST / SMTP_USER / SMTP_PASS）');
  return tx.sendMail({
    from: config.smtp.from || config.smtp.user,
    to,
    subject,
    html,
  });
}

/**
 * 按设置分发通知：浏览器推送 + 邮件
 */
export async function dispatchHotspot(hotspot) {
  const settings = getSettings();
  if (hotspot.notified) return { skipped: 'already-notified' };

  const threshold = RANK[settings.minImportance] ?? RANK.high;
  if ((RANK[hotspot.importance] ?? 0) < threshold) return { skipped: 'below-threshold' };

  const channels = [];
  const browserEnabled = settings.notifyBrowser === 'true';
  const emailEnabled = settings.notifyEmail === 'true';
  const emailTo = (settings.emailTo || config.smtp.to || '').trim();

  if (browserEnabled) {
    broadcastHotspot(hotspot);
    addNotification({
      hotspotId: hotspot.id,
      channel: 'browser',
      status: 'sent',
      title: hotspot.title,
      detail: { importance: hotspot.importance, relevance: hotspot.relevance },
    });
    channels.push('browser');
  }

  if (emailEnabled && emailTo) {
    try {
      await sendEmail({
        to: emailTo,
        subject: `[${(hotspot.importance || 'hot').toUpperCase()}] ${hotspot.title}`.slice(0, 120),
        html: buildEmailHtml(hotspot),
      });
      addNotification({
        hotspotId: hotspot.id,
        channel: 'email',
        status: 'sent',
        title: hotspot.title,
        detail: { to: emailTo },
      });
      channels.push('email');
    } catch (error) {
      addNotification({
        hotspotId: hotspot.id,
        channel: 'email',
        status: 'failed',
        title: hotspot.title,
        detail: { to: emailTo, error: error.message },
      });
    }
  }

  if (channels.length) {
    markNotified(hotspot.id);
    broadcast('notification', { hotspotId: hotspot.id, title: hotspot.title, channels });
  }
  return { channels };
}

export const emailConfigured = () =>
  Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
