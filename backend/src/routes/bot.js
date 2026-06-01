import express from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { requireBot, requireLogin, requirePerm } from '../middleware/auth.js';
import { findActiveBanForPlayer, upsertAlias } from '../services/bans.js';

export const botRouter = express.Router();

botRouter.post('/playerlist', requireBot, (req, res) => {
  const schema = z.object({ source: z.string().default('bot'), players: z.array(z.object({ username: z.string(), warthunderId: z.string().optional().nullable() })) });
  const body = schema.parse(req.body);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM active_players WHERE source=?').run(body.source);
    for (const p of body.players) {
      db.prepare(`INSERT INTO active_players (source, warthunder_username, warthunder_id, raw_json) VALUES (?, ?, ?, ?)`)
        .run(body.source, p.username, p.warthunderId || null, JSON.stringify(p));
      if (p.warthunderId) upsertAlias(p.warthunderId, p.username);
    }
  });
  tx();
  res.json({ ok: true, count: body.players.length });
});

botRouter.get('/playerlist', requireLogin, (req, res) => {
  if (!req.session.user.perms?.mod) return res.status(403).json({ error: 'missing_mod_perms' });
  const players = db.prepare('SELECT * FROM active_players ORDER BY seen_at DESC').all();
  res.json({ players });
});

botRouter.post('/check-ban', requireBot, (req, res) => {
  const schema = z.object({ username: z.string(), warthunderId: z.string().optional().nullable() });
  const body = schema.parse(req.body);
  if (body.warthunderId) upsertAlias(body.warthunderId, body.username);
  const ban = findActiveBanForPlayer(body);
  res.json({ banned: Boolean(ban), action: ban ? 'kick' : 'allow', ban });
});

botRouter.post('/name-change', requireBot, (req, res) => {
  const schema = z.object({ warthunderId: z.string(), username: z.string() });
  const body = schema.parse(req.body);
  upsertAlias(body.warthunderId, body.username);
  res.json({ ok: true });
});

botRouter.get('/cb-status', (req, res) => {
  const status = db.prepare('SELECT * FROM cb_status WHERE id=1').get();
  res.json({ online: Boolean(status.online), status });
});

botRouter.post('/cb-status', requireBot, (req, res) => {
  const schema = z.object({ online: z.boolean(), name: z.string().optional(), inviteHint: z.string().optional() });
  const body = schema.parse(req.body);
  db.prepare(`UPDATE cb_status SET online=?, name=COALESCE(?, name), invite_hint=COALESCE(?, invite_hint), updated_at=CURRENT_TIMESTAMP WHERE id=1`)
    .run(body.online ? 1 : 0, body.name || null, body.inviteHint || null);
  res.json({ ok: true });
});
