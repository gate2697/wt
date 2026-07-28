import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '../..');
const defaultResolverScript = path.resolve(appRoot, 'scripts/resolve_wt_user.py');

function pickPlayer(data, username) {
  const candidates = Array.isArray(data) ? data : (data.players || data.results || data.data || [data]);
  const wanted = username.toLowerCase();
  const found = candidates.find((p) => {
    const name = String(p.username || p.name || p.nickname || p.nick || '').toLowerCase();
    return name === wanted || name.includes(wanted);
  }) || candidates[0];
  if (!found) return null;
  const id = found.id || found.playerId || found.userId || found.warthunder_id || found.warthunderId;
  const name = found.username || found.name || found.nickname || found.nick || username;
  if (!id) return null;
  return { id: String(id), username: String(name), raw: found, source: 'statshark-url' };
}

function pickPlayers(data, username) {
  const candidates = Array.isArray(data)
    ? data
    : (data?.players || data?.accounts || data?.results || data?.data || [data]);
  return candidates.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') return null;
    const id = candidate.id || candidate.playerId || candidate.userId || candidate.warthunder_id || candidate.warthunderId;
    const name = candidate.username || candidate.name || candidate.nickname || candidate.nick || username;
    if (!id) return null;
    return {
      id: String(id),
      username: String(name),
      requestedUsername: username,
      resolvedLookupName: candidate.resolvedLookupName || candidate.lookupName || name,
      matchType: candidate.matchType || 'plugin',
      raw: candidate.raw || candidate
    };
  }).filter(Boolean);
}

async function resolveWithPlugin(username) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (config.warthunder.pluginResolverToken) headers.authorization = `Bearer ${config.warthunder.pluginResolverToken}`;
  const res = await fetch(config.warthunder.pluginResolverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username }),
    signal: AbortSignal.timeout(config.warthunder.resolverTimeoutMs)
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw new Error(`warthunder_plugin_resolver_failed_${res.status}`);
  const players = pickPlayers(data, username);
  if (!players.length) throw new Error('warthunder_plugin_resolver_returned_no_id');
  return { ...players[0], players, source: 'warthunder-plugin', raw: data };
}

async function resolveWithConfiguredUrl(username) {
  const url = config.statshark.lookupUrl.replace('{username}', encodeURIComponent(username));
  const headers = { accept: 'application/json' };
  if (config.statshark.token) headers.authorization = `Bearer ${config.statshark.token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`statshark_lookup_failed_${res.status}`);
  const data = await res.json();
  const player = pickPlayer(data, username);
  if (!player) {
    const unresolved = { id: null, username, raw: data, warning: 'Player lookup returned no usable ID.' };
    return { ...unresolved, players: [unresolved] };
  }
  return { ...player, players: [player] };
}

function resolveWithPython(username) {
  return new Promise((resolve, reject) => {
    const pythonBin = config.warthunder.pythonBin;
    const resolverScript = config.warthunder.resolverScript
      ? (path.isAbsolute(config.warthunder.resolverScript)
        ? config.warthunder.resolverScript
        : path.resolve(appRoot, config.warthunder.resolverScript))
      : defaultResolverScript;

    const child = execFile(
      pythonBin,
      [resolverScript, username],
      {
        timeout: config.warthunder.resolverTimeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        const text = String(stdout || '').trim();
        let payload = null;

        if (text) {
          try {
            payload = JSON.parse(text);
          } catch (parseError) {
            return reject(new Error(`resolver_bad_json: ${parseError.message}; stdout=${text}; stderr=${stderr || ''}`));
          }
        }

        if (error) {
          const message = payload?.message || payload?.error || stderr || error.message;
          const err = new Error(`warthunder_resolver_failed: ${message}`);
          err.payload = payload;
          return reject(err);
        }

        if (!payload?.ok || !payload.id) {
          const message = payload?.message || payload?.error || 'resolver returned no user ID';
          const err = new Error(`warthunder_resolver_failed: ${message}`);
          err.payload = payload;
          return reject(err);
        }

        const candidates = (Array.isArray(payload.accounts) && payload.accounts.length
          ? payload.accounts
          : [payload]).filter((candidate) => candidate && candidate.id);
        if (!candidates.length) {
          const err = new Error('warthunder_resolver_failed: resolver returned no usable accounts');
          err.payload = payload;
          return reject(err);
        }
        const players = candidates.map((candidate) => ({
          id: String(candidate.id),
          username: candidate.username || candidate.resolvedLookupName || payload.username || username,
          requestedUsername: candidate.requestedUsername || payload.requestedUsername || username,
          resolvedLookupName: candidate.resolvedLookupName || payload.resolvedLookupName || candidate.username || payload.username || username,
          usedFallback: Boolean(candidate.usedFallback ?? payload.usedFallback),
          raw: candidate.raw || payload,
          source: 'wt-profile-tool',
          matchType: candidate.matchType || payload.matchType
        }));
        resolve({
          ...players[0],
          players,
          id: players[0].id,
          username: players[0].username,
          requestedUsername: payload.requestedUsername || username,
          resolvedLookupName: players[0].resolvedLookupName,
          usedFallback: players[0].usedFallback,
          attemptedUsernames: payload.attemptedUsernames || [username],
          duplicateCheck: payload.duplicateCheck || null,
          raw: payload,
          source: 'wt-profile-tool',
          matchType: players[0].matchType
        });
      }
    );

    child.stdin?.end();
  });
}

export async function resolveWarThunderPlayer(username) {
  if (!username || typeof username !== 'string') throw new Error('username_required');

  if (config.warthunder.pluginResolverUrl) {
    try {
      return await resolveWithPlugin(username);
    } catch (error) {
      console.warn('War Thunder plugin resolver failed; trying the configured fallback resolver.', error.message);
    }
  }

  // Optional override: if you later get a real StatShark endpoint, set STATSHARK_LOOKUP_URL.
  // Otherwise the default/simple path is the Python wt-profile-tool resolver.
  if (config.statshark.lookupUrl) {
    return resolveWithConfiguredUrl(username);
  }

  try {
    return await resolveWithPython(username);
  } catch (error) {
    if (config.warthunder.allowUnresolvedBans) {
      const unresolved = {
        id: null,
        username,
        raw: error.payload || null,
        warning: `${error.message}. Ban saved by username only.`
      };
      return { ...unresolved, players: [unresolved] };
    }
    throw error;
  }
}
