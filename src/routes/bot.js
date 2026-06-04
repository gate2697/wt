import express from 'express';
import { z } from 'zod';
import { all, get, run, transaction } from '../db/database.js';
import { requireBot, requireLogin } from '../middleware/auth.js';
import { findActiveBanForPlayer, upsertAlias } from '../services/bans.js';

export const botRouter = express.Router();

botRouter.post('/playerlist', requireBot, async (req, res, next) => {
  try {
    const schema = z.object({ source: z.string().default('bot'), players: z.array(z.object({ username: z.string(), warthunderId: z.string().optional().nullable() })) });
    const body = schema.parse(req.body);
    await transaction(async (tx) => {
      await tx.run('DELETE FROM active_players WHERE source=?', [body.source]);
      for (const p of body.players) {
        await tx.run(`INSERT INTO active_players (source, warthunder_username, warthunder_id, raw_json)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE warthunder_id=VALUES(warthunder_id), raw_json=VALUES(raw_json), seen_at=UTC_TIMESTAMP()`,
          [body.source, p.username, p.warthunderId || null, JSON.stringify(p)]);
        if (p.warthunderId) {
          await tx.run(`INSERT INTO player_aliases (warthunder_id, username) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()`, [String(p.warthunderId), p.username]);
        }
      }
    });
    res.json({ ok: true, count: body.players.length });
  } catch (err) { next(err); }
});

botRouter.get('/playerlist', requireLogin, async (req, res, next) => {
  try {
    if (!req.session.user.perms?.mod) return res.status(403).json({ error: 'missing_mod_perms' });
    const players = await all('SELECT * FROM active_players ORDER BY seen_at DESC');
    res.json({ players });
  } catch (err) { next(err); }
});

botRouter.post('/check-ban', requireBot, async (req, res, next) => {
  try {
    const schema = z.object({ username: z.string(), warthunderId: z.string().optional().nullable() });
    const body = schema.parse(req.body);
    if (body.warthunderId) await upsertAlias(body.warthunderId, body.username);
    const ban = await findActiveBanForPlayer(body);
    res.json({ banned: Boolean(ban), action: ban ? 'kick' : 'allow', ban });
  } catch (err) { next(err); }
});

botRouter.post('/name-change', requireBot, async (req, res, next) => {
  try {
    const schema = z.object({ warthunderId: z.string(), username: z.string() });
    const body = schema.parse(req.body);
    await upsertAlias(body.warthunderId, body.username);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

botRouter.get('/cb-status', async (req, res, next) => {
  try {
    const status = await get('SELECT * FROM cb_status WHERE id=1');
    res.json({ online: Boolean(status?.online), status });
  } catch (err) { next(err); }
});

botRouter.post('/cb-status', requireBot, async (req, res, next) => {
  try {
    const schema = z.object({ online: z.boolean(), name: z.string().optional(), inviteHint: z.string().optional() });
    const body = schema.parse(req.body);
    await run(`UPDATE cb_status SET online=?, name=COALESCE(?, name), invite_hint=COALESCE(?, invite_hint) WHERE id=1`,
      [body.online ? 1 : 0, body.name || null, body.inviteHint || null]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
