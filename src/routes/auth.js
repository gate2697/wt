import express from 'express';
import crypto from 'node:crypto';
import { authConfigProblems, config } from '../config.js';
import { get, run } from '../db/database.js';
import { discordAuthUrl, exchangeCode, fetchDiscordUser, fetchGuildMember, fetchGuildMemberWithBotOnly } from '../discord/oauth.js';
import { computePerms } from '../auth/perms.js';

export const authRouter = express.Router();
const PERMISSION_REFRESH_INTERVAL_MS = 60_000;
const PERMISSION_MODEL_VERSION = 3;

function normalizeJoinedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function refreshSessionPermissions(req) {
  const sessionUser = req.session?.user;
  if (!sessionUser?.discordId) return;

  // Rebuild the label from the stored Discord role IDs/names once after a
  // permission-model change. This upgrades existing cookies immediately,
  // even when the deployment does not have a bot token for a live refresh.
  if (Number(req.session.permissionsModelVersion || 0) !== PERMISSION_MODEL_VERSION && sessionUser.id) {
    try {
      const stored = await get('SELECT roles_json FROM users WHERE id=?', [sessionUser.id]);
      let roles = {};
      try { roles = JSON.parse(stored?.roles_json || '{}'); } catch { roles = {}; }
      const perms = computePerms(roles.ids || [], roles.names || []);
      req.session.user = { ...sessionUser, perms };
      req.session.permissionsModelVersion = PERMISSION_MODEL_VERSION;
    } catch (error) {
      console.warn('Could not upgrade stored Discord role labels.', error.message);
    }
  }

  if (!config.discord.botToken) return;

  const now = Date.now();
  const lastChecked = Number(req.session.permissionsCheckedAt || 0);
  if (now - lastChecked < PERMISSION_REFRESH_INTERVAL_MS) return;
  req.session.permissionsCheckedAt = now;

  try {
    const member = await fetchGuildMemberWithBotOnly(sessionUser.discordId);
    const roles = member.roles || [];
    const roleNames = member.roleNames || [];
    const perms = computePerms(roles, roleNames);
    const discordJoinedAt = normalizeJoinedAt(member.joined_at) || sessionUser.discordJoinedAt || null;
    req.session.user = { ...sessionUser, perms, discordJoinedAt };
    req.session.permissionsModelVersion = PERMISSION_MODEL_VERSION;
    if (sessionUser.id) {
      await run('UPDATE users SET roles_json=?, perms_json=?, discord_joined_at=COALESCE(?, discord_joined_at) WHERE id=?', [JSON.stringify({ ids: roles, names: roleNames }), JSON.stringify(perms), discordJoinedAt, sessionUser.id]);
    }
  } catch (error) {
    if (error.statusCode === 404) {
      // A member removed from the locked guild should lose staff access on the
      // next refresh rather than retaining a stale moderation cookie.
      const perms = computePerms([], []);
      req.session.user = { ...sessionUser, perms };
      req.session.permissionsModelVersion = PERMISSION_MODEL_VERSION;
      if (sessionUser.id) {
        await run('UPDATE users SET roles_json=?, perms_json=? WHERE id=?', [JSON.stringify({ ids: [], names: [] }), JSON.stringify(perms), sessionUser.id]).catch(() => {});
      }
      return;
    }
    // A transient Discord/database failure should not turn a harmless session
    // check into a 500 response. Keep the last known permissions and retry.
    console.warn('Discord permission refresh failed; retaining the last known session roles.', error.message);
  }
}

authRouter.get('/discord', (req, res, next) => {
  try {
    const problems = authConfigProblems();
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
    if (req.query.error) {
      return res.status(400).send('Discord login was cancelled or denied. Start the login again when you are ready.');
    }

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

    let user;
    try {
      const discordJoinedAt = normalizeJoinedAt(member.joined_at);
      await run(`INSERT INTO users (discord_id, username, avatar, email, email_verified, roles_json, perms_json, discord_joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE username=VALUES(username), avatar=VALUES(avatar),
        email=VALUES(email), email_verified=VALUES(email_verified),
        roles_json=VALUES(roles_json), perms_json=VALUES(perms_json),
        discord_joined_at=COALESCE(VALUES(discord_joined_at), discord_joined_at)`,
        [discordUser.id, username, discordUser.avatar || null, discordUser.email || null, discordUser.verified ? 1 : 0, JSON.stringify({ ids: roles, names: roleNames }), JSON.stringify(perms), discordJoinedAt]);

      user = await get('SELECT * FROM users WHERE discord_id=?', [discordUser.id]);
    } catch (databaseError) {
      console.error('Discord OAuth database persistence failed:', databaseError);
      const error = new Error('auth_database_unavailable');
      error.statusCode = 503;
      throw error;
    }

    if (!user) {
      const error = new Error('auth_user_record_missing');
      error.statusCode = 503;
      throw error;
    }
    req.session.user = {
      id: user.id,
      discordId: discordUser.id,
      username,
      avatar: discordUser.avatar || null,
      discordJoinedAt: user.discord_joined_at || normalizeJoinedAt(member.joined_at),
      perms
    };
    req.session.permissionsCheckedAt = Date.now();
    req.session.permissionsModelVersion = PERMISSION_MODEL_VERSION;
    return res.redirect(config.frontendUrl);
  } catch (err) {
    if (err.message === 'not_in_required_discord_server') {
      return res.status(403).send('This panel is locked to the configured CB Discord server. Join the server first, then log in again.');
    }
    return next(err);
  }
});

authRouter.get('/me', async (req, res) => {
  if (req.query.refresh === '1' || Number(req.session?.permissionsModelVersion || 0) !== PERMISSION_MODEL_VERSION) await refreshSessionPermissions(req);
  res.json({ user: req.session?.user || null });
});

authRouter.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});
