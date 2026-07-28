import express from 'express';
import { z } from 'zod';
import { requireLogin } from '../middleware/auth.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/inAppNotifications.js';

export const notificationsRouter = express.Router();

notificationsRouter.get('/', requireLogin, async (req, res, next) => {
  try { res.json(await listNotifications(req.session.user.id, req.query.limit)); }
  catch (err) { next(err); }
});

notificationsRouter.post('/read-all', requireLogin, async (req, res, next) => {
  try { res.json({ ok: true, marked: await markAllNotificationsRead(req.session.user.id) }); }
  catch (err) { next(err); }
});

notificationsRouter.post('/:id/read', requireLogin, async (req, res, next) => {
  try {
    z.coerce.number().int().positive().parse(req.params.id);
    const marked = await markNotificationRead(req.params.id, req.session.user.id);
    if (!marked) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
