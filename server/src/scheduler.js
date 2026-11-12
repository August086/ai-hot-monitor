import { getSettings, pruneOldData } from './db.js';
import { runCollection } from './services/collector.js';

let lastRunAt = Date.now();
let timer = null;
let lastPruneDay = '';

const MINUTE = 60_000;

export function startScheduler() {
  if (timer) clearInterval(timer);
  lastRunAt = Date.now();

  timer = setInterval(async () => {
    const settings = getSettings();
    const intervalMinutes = Number.parseInt(settings.collectInterval, 10) || 30;
    const elapsed = Date.now() - lastRunAt;

    if (elapsed >= intervalMinutes * MINUTE) {
      lastRunAt = Date.now();
      try {
        await runCollection({ trigger: 'scheduled' });
      } catch (error) {
        console.error('[scheduler] 采集失败:', error.message);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    if (today !== lastPruneDay) {
      lastPruneDay = today;
      try {
        const retention = Number.parseInt(settings.retentionDays, 10) || 30;
        const removed = pruneOldData(retention);
        if (removed) console.log(`[scheduler] 清理历史热点 ${removed} 条`);
      } catch (error) {
        console.error('[scheduler] 清理失败:', error.message);
      }
    }
  }, 30_000);

  timer.unref?.();
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const nextRunAt = () => {
  const interval = Number.parseInt(getSettings().collectInterval, 10) || 30;
  return new Date(lastRunAt + interval * MINUTE).toISOString();
};
