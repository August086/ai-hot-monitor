import { Router } from 'express';
import { listNotifications } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ items: listNotifications(req.query.limit) });
});

export default router;
