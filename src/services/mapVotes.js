import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/database.js';
import { config } from '../config.js';
import { decorateMap, getMap } from './maps.js';

const DEFAULT_DURATION_SECONDS = Math.max(30, Number(process.env.MAP_VOTE_DURATION_SECONDS || 900));

function voteError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function actorLabel(actor) { return actor?.username || actor?.label || 'Discord bot'; }

function toMysqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw voteError('valid_vote_end_time_required');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isoDate(value) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function ensureMapVoteToken(req) {
  req.session = req.session || {};
  if (!req.session.mapVoteToken) req.session.mapVoteToken = crypto.randomBytes(32).toString('hex');
  return req.session.mapVoteToken;
}

export function voterKeyForRequest(req) {
  const user = req.session?.user;
  if (user?.discordId) return `discord:${user.discordId}`;
  return `anonymous:${ensureMapVoteToken(req)}`;
}

export function hashVoterKey(key) {
  return crypto.createHmac('sha256', config.sessionSecret).update(String(key)).digest('hex');
}

async function readState(tx = null, lock = false) {
  const read = tx ? tx.get : get;
  const suffix = lock ? ' FOR UPDATE' : '';
  return read(`SELECT s.*, r.status AS round_status, r.current_map_id AS round_current_map_id,
      r.started_at AS round_started_at, r.ends_at AS round_ends_at, r.ended_at AS round_ended_at,
      r.selected_map_id, r.selection_reason
    FROM map_vote_state s
    LEFT JOIN map_vote_rounds r ON r.id=s.current_round_id
    WHERE s.id=1 LIMIT 1${suffix}`);
}

async function mapCounts(roundId, currentMapId = null, tx = null) {
  const readAll = tx ? tx.all : all;
  const rows = await readAll(`SELECT m.*, (
      SELECT COUNT(*) FROM map_votes v WHERE v.map_id=m.id AND v.round_id=?
    ) AS vote_count
    FROM maps m
    WHERE m.active=1 AND (? IS NULL OR m.id<>?)
    ORDER BY m.name ASC, m.id ASC`, [roundId, currentMapId, currentMapId]);
  return rows;
}

async function currentVoteMap(roundId, voterHash, tx = null) {
  if (!roundId || !voterHash) return null;
  const read = tx ? tx.get : get;
  const row = await read('SELECT map_id FROM map_votes WHERE round_id=? AND voter_key_hash=? LIMIT 1', [roundId, voterHash]);
  return row ? Number(row.map_id) : null;
}

export async function getCurrentMapVote({ voterKeyHash = null } = {}) {
  const state = await readState();
  if (!state) return { status: 'idle', round: null, current_map: null, candidates: [], my_vote_map_id: null };
  const open = state.status === 'open' && state.current_round_id;
  const currentMap = state.current_map_id ? await getMap(state.current_map_id) : null;
  if (!open) {
    return {
      status: state.status || 'idle',
      round: null,
      current_map: currentMap,
      candidates: [],
      my_vote_map_id: null
    };
  }
  const rows = await mapCounts(state.current_round_id, state.current_map_id);
  return {
    status: 'open',
    current_map: currentMap,
    round: {
      id: Number(state.current_round_id),
      started_at: isoDate(state.round_started_at),
      ends_at: isoDate(state.round_ends_at),
      current_map_id: state.current_map_id ? Number(state.current_map_id) : null
    },
    candidates: rows.map((row) => ({ ...decorateMap(row, state.current_map_id), vote_count: Number(row.vote_count) || 0 })),
    my_vote_map_id: await currentVoteMap(state.current_round_id, voterKeyHash)
  };
}

export async function castMapVote(mapId, { voterKeyHash, voterUserId = null, voterDiscordId = null, voterLabel = null } = {}) {
  const targetId = Number(mapId);
  if (!Number.isInteger(targetId) || targetId < 1) throw voteError('valid_map_required');
  if (!voterKeyHash) throw voteError('voter_identity_required', 400);
  await transaction(async (tx) => {
    const state = await readState(tx, true);
    if (!state || state.status !== 'open' || !state.current_round_id) throw voteError('map_vote_not_open', 409);
    const candidate = await tx.get(`SELECT id FROM maps WHERE id=? AND active=1
      AND (? IS NULL OR id<>?) LIMIT 1`, [targetId, state.current_map_id, state.current_map_id]);
    if (!candidate) throw voteError('map_not_available_for_vote', 400);
    try {
      await tx.run(`INSERT INTO map_votes
        (round_id, map_id, voter_key_hash, voter_user_id, voter_discord_id, voter_label)
        VALUES (?, ?, ?, ?, ?, ?)`, [
        state.current_round_id,
        targetId,
        voterKeyHash,
        voterUserId || null,
        voterDiscordId || null,
        voterLabel || null
      ]);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw voteError('map_vote_already_cast', 409);
      throw error;
    }
  });
  return getCurrentMapVote({ voterKeyHash });
}

export async function startMapVote({ currentMapId = null, endsAt = null, durationSeconds = DEFAULT_DURATION_SECONDS, actorLabel: startedBy = 'Discord bot' } = {}) {
  const suppliedCurrent = currentMapId == null || currentMapId === '' ? null : Number(currentMapId);
  if (suppliedCurrent != null && (!Number.isInteger(suppliedCurrent) || suppliedCurrent < 1)) throw voteError('valid_current_map_required');
  return transaction(async (tx) => {
    const state = await readState(tx, true);
    if (state?.status === 'open' && state.current_round_id) throw voteError('map_vote_already_open', 409);
    const currentId = suppliedCurrent ?? (state?.current_map_id ? Number(state.current_map_id) : null);
    if (currentId != null) {
      // A creator may hide the current map while the server is still running
      // it; keep the round valid and exclude that ID from new candidates.
      const current = await tx.get('SELECT id FROM maps WHERE id=? LIMIT 1', [currentId]);
      if (!current) throw voteError('current_map_not_found', 404);
    }
    const mapCount = await tx.get('SELECT COUNT(*) AS total FROM maps WHERE active=1');
    if (!Number(mapCount?.total)) throw voteError('no_active_maps', 409);
    let endTime;
    if (endsAt) endTime = toMysqlDate(endsAt);
    else {
      const seconds = Math.max(30, Math.min(7 * 24 * 60 * 60, Number(durationSeconds) || DEFAULT_DURATION_SECONDS));
      endTime = new Date(Date.now() + seconds * 1_000).toISOString().slice(0, 19).replace('T', ' ');
    }
    const startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await tx.run(`INSERT INTO map_vote_rounds
      (current_map_id, status, started_at, ends_at, started_by_label)
      VALUES (?, 'open', ?, ?, ?)`, [currentId, startedAt, endTime, String(startedBy || 'Discord bot').slice(0, 255)]);
    await tx.run(`UPDATE map_vote_state
      SET current_round_id=?, current_map_id=?, status='open', started_at=?, ends_at=?
      WHERE id=1`, [result.insertId, currentId, startedAt, endTime]);
    return { roundId: result.insertId, currentMapId: currentId, startedAt, endsAt: endTime };
  });
}

export async function endMapVote({ roundId = null, actorLabel: endedBy = 'Discord bot' } = {}) {
  const requestedRound = roundId == null || roundId === '' ? null : Number(roundId);
  return transaction(async (tx) => {
    const state = await readState(tx, true);
    if (!state?.current_round_id || state.status !== 'open') throw voteError('map_vote_not_open', 409);
    if (requestedRound != null && requestedRound !== Number(state.current_round_id)) throw voteError('map_vote_round_mismatch', 409);
    const round = await tx.get('SELECT * FROM map_vote_rounds WHERE id=? FOR UPDATE', [state.current_round_id]);
    if (!round || round.status !== 'open') throw voteError('map_vote_not_open', 409);
    const rows = await mapCounts(round.id, round.current_map_id, tx);
    const eligible = rows.map((row) => ({ ...row, votes: Number(row.vote_count) || 0 }));
    let selected = null;
    let reason = 'no_eligible_maps';
    if (eligible.length) {
      const highest = Math.max(...eligible.map((row) => row.votes));
      const tied = eligible.filter((row) => row.votes === highest);
      selected = tied[crypto.randomInt(tied.length)];
      reason = highest === 0 ? 'random_no_votes' : tied.length > 1 ? 'random_tie' : 'plurality';
    }
    const endedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await tx.run(`UPDATE map_vote_rounds
      SET status='ended', ended_at=?, selected_map_id=?, selection_reason=?, ended_by_label=?
      WHERE id=?`, [endedAt, selected?.id || null, reason, String(endedBy || 'Discord bot').slice(0, 255), round.id]);
    await tx.run(`UPDATE map_vote_state
      SET current_round_id=NULL, current_map_id=COALESCE(?, current_map_id), status='idle', ends_at=NULL
      WHERE id=1`, [selected?.id || null]);
    return {
      roundId: Number(round.id),
      status: 'ended',
      selectedMap: selected ? decorateMap(selected, selected.id) : null,
      selectionReason: reason,
      voteCounts: eligible.map((row) => ({ mapId: Number(row.id), name: row.name, votes: row.votes }))
    };
  });
}

export async function getMapVoteBotState() {
  const state = await readState();
  const rows = await all('SELECT * FROM maps ORDER BY name ASC, id ASC');
  const maps = rows.filter((row) => Boolean(row.active));
  return {
    status: state?.status || 'idle',
    roundId: state?.current_round_id ? Number(state.current_round_id) : null,
    currentMap: state?.current_map_id ? decorateMap(rows.find((row) => Number(row.id) === Number(state.current_map_id)), state.current_map_id) : null,
    maps: maps.map((row) => decorateMap(row, state?.current_map_id)),
    startedAt: isoDate(state?.started_at),
    endsAt: isoDate(state?.ends_at)
  };
}

export { DEFAULT_DURATION_SECONDS };
