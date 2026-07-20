import { config } from '../config.js';

const API = 'https://discord.com/api/v10';
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
let guildRoleCache = { at: 0, map: new Map() };

async function discordJson(url, options = {}, label = 'Discord request') {
  const res = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': `CB-Ban-Panel/1.0 (${config.publicBaseUrl || 'https://golf-cb.xyz'})`,
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(10_000)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.message || data?.error_description || data?.error || text || res.statusText;
    const err = new Error(`${label} failed (${res.status}): ${detail}`);
    err.statusCode = res.status;
    err.discord = data;
    throw err;
  }
  return data;
}

export function discordAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: config.discord.oauthScopes,
    state
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri
  });
  return discordJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  }, 'Discord token exchange');
}

export async function fetchDiscordUser(accessToken) {
  return discordJson(`${API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 'Discord user fetch');
}

async function fetchMemberWithUserToken(accessToken) {
  return discordJson(`${API}/users/@me/guilds/${config.discord.guildId}/member`, {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 'Discord guild membership fetch');
}

async function fetchMemberWithBotToken(discordUserId) {
  return discordJson(`${API}/guilds/${config.discord.guildId}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${config.discord.botToken}` }
  }, 'Discord bot member fetch');
}

export async function fetchGuildRoles() {
  if (!config.discord.botToken || !config.discord.guildId) return new Map();
  const now = Date.now();
  if (guildRoleCache.map.size && now - guildRoleCache.at < 5 * 60_000) return guildRoleCache.map;
  const roles = await discordJson(`${API}/guilds/${config.discord.guildId}/roles`, {
    headers: { authorization: `Bot ${config.discord.botToken}` }
  }, 'Discord guild roles fetch');
  const map = new Map();
  for (const role of roles || []) map.set(String(role.id), role.name);
  guildRoleCache = { at: now, map };
  return map;
}

export async function fetchGuildMember(accessToken, discordUserId) {
  if (!config.discord.guildId) return { roles: [], roleNames: [] };

  let member = null;
  if (config.discord.botToken) {
    try {
      member = await fetchMemberWithBotToken(discordUserId);
    } catch (err) {
      // A stale bot token or a bot that is no longer in the guild must not break
      // user sign-in. The OAuth token is a valid fallback when the proper scope
      // was requested.
      console.warn('Discord bot member lookup failed; falling back to the OAuth user token.', err.message);
    }
  }

  try {
    member = member || await fetchMemberWithUserToken(accessToken);
  } catch (err) {
    if (err.statusCode === 404) {
      if (config.discord.requireGuildMembership) {
        const notInGuild = new Error('not_in_required_discord_server');
        notInGuild.statusCode = 403;
        throw notInGuild;
      }
      return { roles: [], roleNames: [] };
    }
    throw err;
  }

  const roleIds = (member.roles || []).map(String);
  let roleNames = [];
  try {
    const rolesById = await fetchGuildRoles();
    roleNames = roleIds.map((id) => rolesById.get(id)).filter(Boolean);
  } catch (err) {
    // Login should still work even if the bot cannot list role names. Role IDs can still be used in env.
    console.warn('Could not resolve Discord role names. Use role IDs in CB_*_PERMS or fix DISCORD_BOT_TOKEN permissions.', err.message);
  }

  return { ...member, roles: roleIds, roleNames };
}
