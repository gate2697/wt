import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { get, run } from '../db/database.js';
import { discordAuthUrl, exchangeCode, fetchDiscordUser, fetchGuildMember } from '../discord/oauth.js';
import { computePerms } from '../auth/perms.js';

export const authRouter = express.Router();

function oauthConfigProblems() {
  const problems = [];
  if (!config.discord.clientId) problems.push('DISCORD_CLIENT_ID');
  if (!config.discord.clientSecret) problems.push('DISCORD_CLIENT_SECRET');
  if (!config.discord.redirectUri) problems.push('DISCORD_REDIRECT_URI');
  else {
    try {
      const redirect = new URL(config.discord.redirectUri);
      if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
        problems.push('DISCORD_REDIRECT_URI must use HTTPS');
      }
    } catch {
      problems.push('DISCORD_REDIRECT_URI is not a valid absolute URL');
    }
  }
  return problems;
}

authRouter.get('/discord', (req, res, next) => {
  try {
    const problems = oauthConfigProblems();
    if (problems.length) {
      return res.status(503).json({
        error: 'discord_oauth_not_configured',
        missing_or_invalid: problems,
        expected_redirect_uri: `${config.publicBaseUrl || 'https://golf-cb.xyz'}/auth/discord/callback`
      });
    }

    const state = crypto.randomBytes(32).toString('base64url');
    // A stale/invalid cookie must never make the login route crash.
    req.session = req.session || {};
    req.session.oauthState = state;
    req.session.oauthStateCreatedAt = Date.now();

    return res.redirect(302, discordAuthUrl(state));
  } catch (err) {
    return next(err);
  }
});

authRouter.get('/discord/callback', async (req, res, next) => {
  try {
    const storedState = req.session?.oauthState;
    const stateCreatedAt = Number(req.session?.oauthStateCreatedAt || 0);
    const stateExpired = !stateCreatedAt || Date.now() - stateCreatedAt > 10 * 60_000;

    if (!req.query.code || !storedState || stateExpired || req.query.state !== storedState) {
      return res.status(400).send('Invalid or expired Discord login state. Start the login again.');
    }

    // State is single-use.
    delete req.session.oauthState;
    delete req.session.oauthStateCreatedAt;

    const token = await exchangeCode(String(req.query.code));
    const discordUser = await fetchDiscordUser(token.access_token);
    const member = await fetchGuildMember(token.access_token, discordUser.id);
    const roles = member.roles || [];
    const roleNames = member.roleNames || [];
    const perms = computePerms(roles, roleNames);
    const username = `${discordUser.username}${discordUser.discriminator && discordUser.discriminator !== '0' ? '#' + discordUser.discriminator : ''}`;

    await run(`INSERT INTO users (discord_id, username, avatar, email, email_verified, roles_json, perms_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE username=VALUES(username), avatar=VALUES(avatar),
      email=VALUES(email), email_verified=VALUES(email_verified),
      roles_json=VALUES(roles_json), perms_json=VALUES(perms_json)`,
      [discordUser.id, username, discordUser.avatar || null, discordUser.email || null, discordUser.verified ? 1 : 0, JSON.stringify({ ids: roles, names: roleNames }), JSON.stringify(perms)]);

    const user = await get('SELECT * FROM users WHERE discord_id=?', [discordUser.id]);
    req.session.user = {
      id: user.id,
      discordId: discordUser.id,
      username,
      avatar: discordUser.avatar || null,
      perms
    };
    return res.redirect(config.frontendUrl);
  } catch (err) {
    if (err.message === 'not_in_required_discord_server') {
      return res.status(403).send('This panel is locked to the configured CB Discord server. Join the server first, then log in again.');
    }
    return next(err);
  }
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

authRouter.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});
