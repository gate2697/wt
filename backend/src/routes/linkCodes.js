import express from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/database.js';
import { requireLogin } from '../middleware/auth.js';

export const linkCodesRouter = express.Router();

function normalizeServiceName(serviceName) {
  const s = String(serviceName || '').trim().toLowerCase();
  if (['wt', 'war-thunder', 'warthunder', 'war_thunder'].includes(s)) return 'warthunder';
  return s;
}

linkCodesRouter.post('/', requireLogin, (req, res) => {
  const schema = z.object({ serviceName: z.string().min(1), minutesValid: z.number().min(1).max(1440).default(15) });
  const body = schema.parse(req.body);
  const serviceName = normalizeServiceName(body.serviceName);
  const code = nanoid(10).toUpperCase();
  const expires = new Date(Date.now() + body.minutesValid * 60_000).toISOString();
  db.prepare('INSERT INTO link_codes (code, created_by_user_id, service_name, expires_at) VALUES (?, ?, ?, ?)')
    .run(code, req.session.user.id, serviceName, expires);
  res.json({ code, serviceName, expiresAt: expires });
});

linkCodesRouter.get('/me', requireLogin, (req, res) => {
  const links = db.prepare('SELECT id, service_name, external_id, external_username, created_at, updated_at FROM player_links WHERE user_id=? ORDER BY updated_at DESC')
    .all(req.session.user.id);
  res.json({ links });
});

linkCodesRouter.post('/claim', (req, res) => {
  const schema = z.object({
    code: z.string().min(4),
    externalId: z.string().min(1),
    serviceName: z.string().min(1),
    externalUsername: z.string().optional().nullable()
  });
  const body = schema.parse(req.body);
  const serviceName = normalizeServiceName(body.serviceName);
  const row = db.prepare('SELECT * FROM link_codes WHERE code=? AND service_name=?').get(body.code.toUpperCase(), serviceName);
  if (!row) return res.status(404).json({ error: 'code_not_found' });
  if (row.claimed_at) return res.status(409).json({ error: 'already_claimed' });
  if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE link_codes SET claimed_by_external_id=?, claimed_at=CURRENT_TIMESTAMP WHERE id=?').run(body.externalId, row.id);
    db.prepare(`INSERT INTO player_links (user_id, service_name, external_id, external_username)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(service_name, external_id) DO UPDATE SET
        user_id=excluded.user_id,
        external_username=COALESCE(excluded.external_username, player_links.external_username),
        updated_at=CURRENT_TIMESTAMP`)
      .run(row.created_by_user_id, serviceName, String(body.externalId), body.externalUsername || null);
  });
  tx();
  res.json({ ok: true, linked: { serviceName, externalId: String(body.externalId), externalUsername: body.externalUsername || null } });
});
