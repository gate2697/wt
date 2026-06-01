import express from 'express';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { discordAuthUrl, exchangeCode, fetchDiscordUser, fetchGuildMember } from '../discord/oauth.js';
import { computePerms } from '../auth/perms.js';

export const authRouter = express.Router();

router.get("/discord", (req, res) => {
  const url = new URL("https://discord.com/oauth2/authorize");

  url.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", process.env.DISCORD_REDIRECT_URI);
  url.searchParams.set("scope", "identify guilds email");

  res.redirect(url.toString());
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

    const result = db.prepare(`INSERT INTO users (discord_id, username, avatar, email, email_verified, roles_json, perms_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, avatar=excluded.avatar,
      email=excluded.email, email_verified=excluded.email_verified,
      roles_json=excluded.roles_json, perms_json=excluded.perms_json, updated_at=CURRENT_TIMESTAMP`)
      .run(discordUser.id, username, discordUser.avatar || null, discordUser.email || null, discordUser.verified ? 1 : 0, JSON.stringify(roles), JSON.stringify(perms));

    const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordUser.id);
    req.session.user = { id: user.id, discordId: discordUser.id, username, avatar: discordUser.avatar, email: user.email, roles, perms };
    res.redirect(config.frontendUrl);
  } catch (err) {
    if (err.message === 'not_in_required_discord_server') {
      return res.status(403).send('This panel is locked to the configured CB Discord server. Join the server first, then log in again.');
    }
    next(err);
  }
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
