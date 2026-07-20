import express from 'express';
import { z } from 'zod';
import { requirePerm } from '../middleware/auth.js';
import { createBan, getBan, listActiveBans, publicLookup, revokeBan, updateBan } from '../services/bans.js';

export const bansRouter = express.Router();
export const publicBansRouter = express.Router();

bansRouter.post('/', requirePerm('mod'), async (req, res, next) => {
  try {
    const schema = z.object({
      username: z.string().min(1),
      warthunderId: z.string().optional(),
      reason: z.string().min(1),
      evidenceUrl: z.string().url().optional().or(z.literal('')),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional().nullable(),
      durationHours: z.number().positive().optional()
    });
    const body = schema.parse(req.body);
    const ban = await createBan(body, req.session.user);
    res.status(201).json({ ban });
  } catch (err) { next(err); }
});

bansRouter.get('/active', requirePerm('mod'), async (req, res, next) => {
  try { res.json({ bans: await listActiveBans() }); }
  catch (err) { next(err); }
});

bansRouter.get('/:id', requirePerm('mod'), async (req, res, next) => {
  try {
    const ban = await getBan(req.params.id);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

bansRouter.patch('/:id', requirePerm('hmod'), async (req, res, next) => {
  try {
    const ban = await updateBan(req.params.id, req.body, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

bansRouter.post('/:id/revoke', requirePerm('hmod'), async (req, res, next) => {
  try {
    const ban = await revokeBan(req.params.id, req.body?.reason, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

publicBansRouter.get('/:player', async (req, res, next) => {
  try {
    const bans = await publicLookup(req.params.player);
    res.json({ banned: bans.length > 0, bans });
  } catch (err) { next(err); }
});
