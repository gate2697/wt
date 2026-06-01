import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultResolverScript = path.resolve(__dirname, '../../../scripts/resolve_wt_user.py');

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

async function resolveWithConfiguredUrl(username) {
  const url = config.statshark.lookupUrl.replace('{username}', encodeURIComponent(username));
  const headers = { accept: 'application/json' };
  if (config.statshark.token) headers.authorization = `Bearer ${config.statshark.token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`statshark_lookup_failed_${res.status}`);
  const data = await res.json();
  const player = pickPlayer(data, username);
  if (!player) return { id: null, username, raw: data, warning: 'Player lookup returned no usable ID.' };
  return player;
}

function resolveWithPython(username) {
  return new Promise((resolve, reject) => {
    const pythonBin = config.warthunder.pythonBin;
    const resolverScript = config.warthunder.resolverScript || defaultResolverScript;

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

        resolve({
          id: String(payload.id),
          username: payload.username || username,
          raw: payload,
          source: 'wt-profile-tool',
          matchType: payload.matchType
        });
      }
    );

    child.stdin?.end();
  });
}

export async function resolveWarThunderPlayer(username) {
  if (!username || typeof username !== 'string') throw new Error('username_required');

  // Optional override: if you later get a real StatShark endpoint, set STATSHARK_LOOKUP_URL.
  // Otherwise the default/simple path is the Python wt-profile-tool resolver.
  if (config.statshark.lookupUrl) {
    return resolveWithConfiguredUrl(username);
  }

  try {
    return await resolveWithPython(username);
  } catch (error) {
    if (config.warthunder.allowUnresolvedBans) {
      return {
        id: null,
        username,
        raw: error.payload || null,
        warning: `${error.message}. Ban saved by username only.`
      };
    }
    throw error;
  }
}
