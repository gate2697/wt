import express from 'express';
import { z } from 'zod';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { createUnbanMessage, createUnbanRequest, decideUnbanRequest, listMyUnbanRequests, listPendingUnbanRequests, listUnbanMessages } from '../services/unbanRequests.js';

export const unbanRequestsRouter = express.Router();

unbanRequestsRouter.post('/', requireLogin, async (req, res, next) => {
  try {
    const body = z.object({
      banId: z.coerce.number().int().positive(),
      reason: z.string().trim().min(10).max(10_000)
    }).parse(req.body || {});
    const request = await createUnbanRequest(body, req.session.user);
    res.status(201).json({ request });
  } catch (err) { next(err); }
});

unbanRequestsRouter.get('/mine', requireLogin, async (req, res, next) => {
  try { res.json({ requests: await listMyUnbanRequests(req.session.user) }); }
  catch (err) { next(err); }
});

unbanRequestsRouter.get('/', requirePerm('canManage'), async (req, res, next) => {
  try {
    const query = z.object({
      search: z.string().trim().max(120).optional().default(''),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(15).optional().default(15)
    }).parse(req.query || {});
    res.json(await listPendingUnbanRequests(query));
  } catch (err) { next(err); }
});

unbanRequestsRouter.get('/:id/messages', requireLogin, async (req, res, next) => {
  try {
    z.coerce.number().int().positive().parse(req.params.id);
    const result = await listUnbanMessages(req.params.id, req.session.user);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  } catch (err) { next(err); }
});

unbanRequestsRouter.post('/:id/messages', requireLogin, async (req, res, next) => {
  try {
    z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({ body: z.string().trim().min(1).max(5_000) }).parse(req.body || {});
    const message = await createUnbanMessage(req.params.id, body.body, req.session.user);
    if (!message) return res.status(404).json({ error: 'not_found' });
    res.status(201).json({ message });
  } catch (err) { next(err); }
});

unbanRequestsRouter.post('/:id/decision', requirePerm('canManage'), async (req, res, next) => {
  try {
    const body = z.object({
      decision: z.enum(['approve', 'deny']),
      reason: z.string().trim().min(3).max(10_000)
    }).parse(req.body || {});
    const request = await decideUnbanRequest(req.params.id, body.decision, body.reason, req.session.user);
    if (!request) return res.status(404).json({ error: 'not_found' });
    res.json({ request });
  } catch (err) { next(err); }
});
