import express from 'express';
import { z } from 'zod';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { createStaffApplication, decideStaffApplication, listMyStaffApplications, listPendingStaffApplications } from '../services/staffApplications.js';

export const staffApplicationsRouter = express.Router();

staffApplicationsRouter.post('/', requireLogin, async (req, res, next) => {
  try {
    const body = z.object({
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      experience: z.string().trim().min(20).max(10_000),
      availability: z.string().trim().min(5).max(2_000),
      motivation: z.string().trim().min(20).max(10_000)
    }).parse(req.body || {});
    res.status(201).json({ application: await createStaffApplication(body, req.session.user) });
  } catch (err) { next(err); }
});

staffApplicationsRouter.get('/mine', requireLogin, async (req, res, next) => {
  try { res.json({ applications: await listMyStaffApplications(req.session.user) }); }
  catch (err) { next(err); }
});

staffApplicationsRouter.get('/', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const query = z.object({
      search: z.string().trim().max(120).optional().default(''),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(15).optional().default(15)
    }).parse(req.query || {});
    res.json(await listPendingStaffApplications(query));
  } catch (err) { next(err); }
});

staffApplicationsRouter.post('/:id/decision', requirePerm('canManage'), async (req, res, next) => {
  try {
    const body = z.object({ decision: z.enum(['approve', 'deny']), reason: z.string().trim().min(3).max(10_000) }).parse(req.body || {});
    const application = await decideStaffApplication(req.params.id, body.decision, body.reason, req.session.user);
    if (!application) return res.status(404).json({ error: 'not_found' });
    res.json({ application });
  } catch (err) { next(err); }
});
