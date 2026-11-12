import { Router } from 'express';
import { getHotspot, listHotspots, updateAnalysis } from '../db.js';
import { analyzeHotspot } from '../services/ai.js';
import { searchOnce } from '../services/collector.js';
import { broadcast } from '../ws.js';

const router = Router();

router.get('/', (req, res) => {
  const { limit, offset, importance, source, isReal, status, keyword, q, days, dated, sort } = req.query;
  res.json(listHotspots({ limit, offset, importance, source, isReal, status, keyword, q, days, dated, sort }));
});

router.get('/:id', (req, res) => {
  const hotspot = getHotspot(req.params.id);
  if (!hotspot) return res.status(404).json({ error: '热点不存在' });
  return res.json(hotspot);
});

router.post('/search', async (req, res) => {
  const term = String(req.body?.term ?? '').trim();
  if (!term) return res.status(400).json({ error: '请输入搜索关键词' });
  if (term.length > 60) return res.status(400).json({ error: '关键词过长' });

  const result = await searchOnce(term, {
    domain: String(req.body?.domain ?? '').trim(),
    analyze: req.body?.analyze !== false,
  });
  return res.json(result);
});

router.post('/:id/analyze', async (req, res) => {
  const hotspot = getHotspot(req.params.id);
  if (!hotspot) return res.status(404).json({ error: '热点不存在' });

  try {
    const analysis = await analyzeHotspot(hotspot);
    if (!analysis) return res.status(503).json({ error: 'AI 未配置，且未开启兜底分析' });
    const updated = updateAnalysis(hotspot.id, analysis);
    broadcast('hotspot:update', updated);
    return res.json(updated);
  } catch (error) {
    return res.status(502).json({ error: `AI 分析失败：${error.message}` });
  }
});

export default router;
