import { config } from '../config.js';

const API = 'https://discord.com/api/v10';

export function discordAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify email guilds guilds.members.read',
    state
  });
  return `${API}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri
  });
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
  return res.json();
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchGuildMember(accessToken) {
  if (!config.discord.guildId) return { roles: [] };
  const res = await fetch(`${API}/users/@me/guilds/${config.discord.guildId}/member`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 404) {
    if (config.discord.requireGuildMembership) {
      const err = new Error('not_in_required_discord_server');
      err.statusCode = 403;
      throw err;
    }
    return { roles: [] };
  }
  if (!res.ok) throw new Error(`Discord guild member fetch failed: ${res.status}`);
  return res.json();
}
