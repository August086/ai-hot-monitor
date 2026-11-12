import { Router } from 'express';
import {
  createKeyword,
  deleteKeyword,
  findKeywordByTerm,
  listKeywords,
  updateKeyword,
} from '../db.js';

const router = Router();

const sanitize = (body) => ({
  term: String(body.term ?? '').trim().replace(/\s+/g, ' '),
  domain: String(body.domain ?? '').trim().slice(0, 60),
  enabled: body.enabled === undefined ? true : Boolean(body.enabled),
});

router.get('/', (req, res) => {
  res.json({ items: listKeywords() });
});

router.post('/', (req, res) => {
  const payload = sanitize(req.body ?? {});
  if (!payload.term) return res.status(400).json({ error: '关键词不能为空' });
  if (payload.term.length > 60) return res.status(400).json({ error: '关键词不能超过 60 个字符' });
  if (findKeywordByTerm(payload.term)) return res.status(409).json({ error: '该关键词已存在' });
  const keyword = createKeyword(payload);
  return res.status(201).json(keyword);
});

router.put('/:id', (req, res) => {
  const existing = listKeywords().find((item) => item.id === Number(req.params.id));
  if (!existing) return res.status(404).json({ error: '关键词不存在' });

  const payload = sanitize({ ...existing, ...(req.body ?? {}) });
  if (!payload.term) return res.status(400).json({ error: '关键词不能为空' });
  const duplicated = findKeywordByTerm(payload.term);
  if (duplicated && duplicated.id !== existing.id) return res.status(409).json({ error: '该关键词已存在' });

  return res.json(updateKeyword(existing.id, payload));
});

router.delete('/:id', (req, res) => {
  const removed = deleteKeyword(req.params.id);
  if (!removed) return res.status(404).json({ error: '关键词不存在' });
  return res.json({ ok: true });
});

export default router;
