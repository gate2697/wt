import express from 'express';
import { z } from 'zod';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { createBanRequest, decideBanRequest, getBanRequest, listMyBanRequests, listPendingBanRequests } from '../services/banRequests.js';
import { evidenceUpload } from '../middleware/evidenceUpload.js';
import { cleanupUploadedFiles, evidenceAbsolutePath, getBanRequestEvidence } from '../services/evidence.js';

export const banRequestsRouter = express.Router();

banRequestsRouter.post('/', requireLogin, evidenceUpload, async (req, res, next) => {
  try {
    const body = z.object({
      username: z.string().trim().min(2).max(255),
      warthunderId: z.string().trim().max(128).optional(),
      reason: z.string().trim().min(10).max(10_000),
      evidenceUrl: z.string().url().max(2_000).optional()
    }).parse(req.body || {});
    res.status(201).json({ request: await createBanRequest({ ...body, evidenceFiles: req.files || [] }, req.session.user) });
  } catch (err) {
    await cleanupUploadedFiles(req.files).catch(() => {});
    next(err);
  }
});

banRequestsRouter.get('/mine', requireLogin, async (req, res, next) => {
  try { res.json({ requests: await listMyBanRequests(req.session.user) }); }
  catch (err) { next(err); }
});

banRequestsRouter.get('/:id/evidence/:evidenceId', requireLogin, async (req, res, next) => {
  try {
    const evidence = await getBanRequestEvidence(req.params.id, req.params.evidenceId);
    if (!evidence) return res.status(404).json({ error: 'not_found' });
    const isStaff = Boolean(req.session.user.perms?.canModerate || req.session.user.perms?.trial || req.session.user.perms?.mod || req.session.user.perms?.hmod || req.session.user.perms?.admin || req.session.user.perms?.top);
    if (!isStaff) {
      const request = await getBanRequest(req.params.id);
      if (!request || Number(request.requester_user_id) !== Number(req.session.user.id)) return res.status(403).json({ error: 'forbidden' });
    }
    res.type(evidence.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(evidence.original_name)}`);
    res.sendFile(evidenceAbsolutePath(evidence));
  } catch (err) { next(err); }
});

banRequestsRouter.get('/', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const query = z.object({
      search: z.string().trim().max(120).optional().default(''),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(15).optional().default(15)
    }).parse(req.query || {});
    res.json(await listPendingBanRequests(query));
  } catch (err) { next(err); }
});

banRequestsRouter.post('/:id/decision', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const body = z.object({ decision: z.enum(['approve', 'deny']), reason: z.string().trim().min(3).max(10_000) }).parse(req.body || {});
    const request = await decideBanRequest(req.params.id, body.decision, body.reason, req.session.user);
    if (!request) return res.status(404).json({ error: 'not_found' });
    res.json({ request });
  } catch (err) { next(err); }
});
