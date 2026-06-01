import express from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/database.js';
import { requireLogin } from '../middleware/auth.js';

export const linkCodesRouter = express.Router();

linkCodesRouter.post('/', requireLogin, (req, res) => {
  const schema = z.object({ serviceName: z.string().min(1), minutesValid: z.number().min(1).max(1440).default(15) });
  const body = schema.parse(req.body);
  const code = nanoid(10).toUpperCase();
  const expires = new Date(Date.now() + body.minutesValid * 60_000).toISOString();
  db.prepare('INSERT INTO link_codes (code, created_by_user_id, service_name, expires_at) VALUES (?, ?, ?, ?)')
    .run(code, req.session.user.id, body.serviceName, expires);
  res.json({ code, expiresAt: expires });
});

linkCodesRouter.post('/claim', (req, res) => {
  const schema = z.object({ code: z.string().min(4), externalId: z.string().min(1), serviceName: z.string().min(1) });
  const body = schema.parse(req.body);
  const row = db.prepare('SELECT * FROM link_codes WHERE code=? AND service_name=?').get(body.code.toUpperCase(), body.serviceName);
  if (!row) return res.status(404).json({ error: 'code_not_found' });
  if (row.claimed_at) return res.status(409).json({ error: 'already_claimed' });
  if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
  db.prepare('UPDATE link_codes SET claimed_by_external_id=?, claimed_at=CURRENT_TIMESTAMP WHERE id=?').run(body.externalId, row.id);
  res.json({ ok: true });
});
