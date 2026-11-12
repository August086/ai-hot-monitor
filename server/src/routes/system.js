import { Router } from 'express';
import { capabilities, config } from '../config.js';
import { listRuns, stats } from '../db.js';
import { analyzePending, isCollecting, runCollection } from '../services/collector.js';
import { onlineCount } from '../ws.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    online: onlineCount(),
    collecting: isCollecting(),
    intervalMinutes: config.crawler.intervalMinutes,
    capabilities: capabilities(),
    time: new Date().toISOString(),
  });
});

router.get('/stats', (req, res) => {
  res.json({ ...stats(), online: onlineCount(), collecting: isCollecting() });
});

router.get('/runs', (req, res) => {
  res.json({ items: listRuns(req.query.limit) });
});

router.post('/collect', async (req, res) => {
  if (isCollecting()) return res.status(409).json({ error: '已有采集任务正在运行' });
  const keywordIds = Array.isArray(req.body?.keywordIds) ? req.body.keywordIds : null;
  const result = await runCollection({ trigger: 'manual', keywordIds });
  return res.json(result);
});

router.post('/analyze-pending', async (req, res) => {
  const result = await analyzePending(Number(req.body?.limit) || config.ai.maxItemsPerRun);
  res.json(result);
});

export default router;
