import express from 'express';
import { z } from 'zod';
import { requirePerm } from '../middleware/auth.js';
import {
  createBan,
  getBan,
  listActiveBans,
  listBanAudit,
  listBanHistory,
  listReviewQueue,
  publicLookup,
  resolveBanTargets,
  reviewBan,
  revokeBan,
  updateBan
} from '../services/bans.js';
import { evidenceAbsolutePath, getBanEvidence } from '../services/evidence.js';
import { cleanupUploadedFiles } from '../services/evidence.js';
import { evidenceUpload } from '../middleware/evidenceUpload.js';

export const bansRouter = express.Router();
export const publicBansRouter = express.Router();

const dateTime = z.string().datetime({ offset: true });

bansRouter.post('/', requirePerm('canModerate'), evidenceUpload, async (req, res, next) => {
  try {
    const rawBody = { ...(req.body || {}) };
    if (typeof rawBody.resolvedPlayers === 'string') {
      try { rawBody.resolvedPlayers = JSON.parse(rawBody.resolvedPlayers); }
      catch { rawBody.resolvedPlayers = undefined; }
    }
    const schema = z.object({
      username: z.string().trim().min(1).max(255),
      warthunderId: z.string().trim().max(128).optional().nullable(),
      resolvedPlayers: z.array(z.object({
        id: z.string().trim().max(128).optional().nullable(),
        username: z.string().trim().min(1).max(255),
        resolvedLookupName: z.string().trim().max(255).optional(),
        matchType: z.string().trim().max(64).optional().nullable()
      })).max(20).optional(),
      reason: z.string().trim().min(1).max(10_000),
      evidenceUrl: z.string().url().optional().or(z.literal('')),
      startsAt: dateTime.optional(),
      endsAt: dateTime.optional().nullable(),
      durationHours: z.coerce.number().positive().optional()
    });
    const body = schema.parse(rawBody);
    const result = await createBan({ ...body, evidenceFiles: req.files || [] }, req.session.user);
    res.status(201).json(result);
  } catch (err) {
    await cleanupUploadedFiles(req.files).catch(() => {});
    next(err);
  }
});

bansRouter.post('/resolve', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const body = z.object({
      username: z.string().trim().min(1).max(255),
      warthunderId: z.string().trim().max(128).optional().nullable()
    }).parse(req.body || {});
    const players = await resolveBanTargets(body);
    res.json({
      requestedUsername: body.username,
      players: players.map((player) => ({
        id: player.id,
        username: player.username,
        resolvedLookupName: player.resolvedLookupName || player.username,
        matchType: player.matchType || null
      }))
    });
  } catch (err) { next(err); }
});

bansRouter.get('/active', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const query = z.object({
      search: z.string().trim().max(120).optional().default(''),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(15).optional().default(15)
    }).parse(req.query || {});
    res.json(await listActiveBans(query));
  }
  catch (err) { next(err); }
});

bansRouter.get('/review', requirePerm('canReview'), async (req, res, next) => {
  try { res.json({ bans: await listReviewQueue(req.session.user) }); }
  catch (err) { next(err); }
});

// A lower-rank ban is a request until a strictly higher rank approves it.
// Keep /review as a compatibility alias for older clients.
bansRouter.get('/requests', requirePerm('canReview'), async (req, res, next) => {
  try {
    const requests = await listReviewQueue(req.session.user);
    res.json({ requests, bans: requests });
  } catch (err) { next(err); }
});

bansRouter.get('/history', requirePerm('canModerate'), async (req, res, next) => {
  try { res.json({ bans: await listBanHistory(req.query.limit) }); }
  catch (err) { next(err); }
});

bansRouter.get('/:id/audit', requirePerm('canManage'), async (req, res, next) => {
  try { res.json({ audit: await listBanAudit(req.params.id) }); }
  catch (err) { next(err); }
});

bansRouter.get('/:id/evidence/:evidenceId', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const evidence = await getBanEvidence(req.params.id, req.params.evidenceId);
    if (!evidence) return res.status(404).json({ error: 'not_found' });
    res.type(evidence.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(evidence.original_name)}`);
    res.sendFile(evidenceAbsolutePath(evidence));
  } catch (err) { next(err); }
});

bansRouter.get('/:id', requirePerm('canModerate'), async (req, res, next) => {
  try {
    const ban = await getBan(req.params.id);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

bansRouter.post('/:id/review', requirePerm('canReview'), async (req, res, next) => {
  try {
    const body = z.object({
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().max(10_000).optional().or(z.literal(''))
    }).parse(req.body || {});
    const ban = await reviewBan(req.params.id, body.decision, body.reason, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

bansRouter.post('/:id/request/decision', requirePerm('canReview'), async (req, res, next) => {
  try {
    const body = z.object({
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().max(10_000).optional().or(z.literal(''))
    }).parse(req.body || {});
    const ban = await reviewBan(req.params.id, body.decision, body.reason, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ request: ban, ban });
  } catch (err) { next(err); }
});

bansRouter.patch('/:id', requirePerm('canManage'), async (req, res, next) => {
  try {
    const body = z.object({
      reason: z.string().trim().min(1).max(10_000).optional(),
      evidenceUrl: z.string().url().optional().or(z.literal('')),
      startsAt: dateTime.optional(),
      endsAt: dateTime.optional().nullable()
    }).parse(req.body || {});
    const ban = await updateBan(req.params.id, body, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

bansRouter.post('/:id/revoke', requirePerm('canManage'), async (req, res, next) => {
  try {
    const body = z.object({ reason: z.string().trim().max(10_000).optional().or(z.literal('')) }).parse(req.body || {});
    const ban = await revokeBan(req.params.id, body.reason, req.session.user);
    if (!ban) return res.status(404).json({ error: 'not_found' });
    res.json({ ban });
  } catch (err) { next(err); }
});

publicBansRouter.get('/:player', async (req, res, next) => {
  try {
    const player = String(req.params.player || '').trim();
    if (!player) return res.status(400).json({ error: 'player_required' });
    const bans = await publicLookup(player);
    res.json({ banned: bans.length > 0, bans });
  } catch (err) { next(err); }
});
