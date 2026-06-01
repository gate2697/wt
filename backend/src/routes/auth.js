import express from 'express';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { discordAuthUrl, exchangeCode, fetchDiscordUser, fetchGuildMember } from '../discord/oauth.js';
import { computePerms } from '../auth/perms.js';

export const authRouter = express.Router();

authRouter.get('/discord', (req, res) => {
  const state = nanoid(32);
  req.session.oauthState = state;
  res.redirect(discordAuthUrl(state));
});

authRouter.get('/discord/callback', async (req, res, next) => {
  try {
    if (!req.query.code || req.query.state !== req.session.oauthState) {
      return res.status(400).send('Invalid Discord login state.');
    }
    const token = await exchangeCode(String(req.query.code));
    const discordUser = await fetchDiscordUser(token.access_token);
    const member = await fetchGuildMember(token.access_token);
    const roles = member.roles || [];
    const perms = computePerms(roles);
    const username = `${discordUser.username}${discordUser.discriminator && discordUser.discriminator !== '0' ? '#' + discordUser.discriminator : ''}`;

    const result = db.prepare(`INSERT INTO users (discord_id, username, avatar, roles_json, perms_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, avatar=excluded.avatar,
      roles_json=excluded.roles_json, perms_json=excluded.perms_json, updated_at=CURRENT_TIMESTAMP`)
      .run(discordUser.id, username, discordUser.avatar || null, JSON.stringify(roles), JSON.stringify(perms));

    const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordUser.id);
    req.session.user = { id: user.id, discordId: discordUser.id, username, avatar: discordUser.avatar, roles, perms };
    res.redirect(config.frontendUrl);
  } catch (err) { next(err); }
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
