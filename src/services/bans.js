import { all, get, run, transaction } from '../db/database.js';
import { canReviewRank, levelName, maxBanHours, ROLE_LEVELS } from '../auth/perms.js';
import { resolveWarThunderPlayer } from './statshark.js';
import { audit } from './audit.js';
import { notifyLinkedUsersOfBan } from './notifications.js';
import { config } from '../config.js';
import { listBanEvidence, persistEvidence } from './evidence.js';
import { createNotification } from './inAppNotifications.js';

const BAN_SELECT = `SELECT b.*,
    creator.username AS creator_username,
    creator.discord_id AS creator_discord_id,
    reviewer.username AS reviewer_username,
    revoker.username AS revoker_username
  FROM bans b
  LEFT JOIN users creator ON creator.id = b.created_by_user_id
  LEFT JOIN users reviewer ON reviewer.id = b.reviewed_by_user_id
  LEFT JOIN users revoker ON revoker.id = b.revoked_by_user_id`;

function parseDate(value) {
  if (value instanceof Date) return value;
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const mysql = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw);
  const date = new Date(mysql ? `${raw.replace(' ', 'T')}Z` : raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function mysqlDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
}

function actorLevel(actor) {
  return Number(actor?.perms?.level ?? actor?.perms?.rank ?? 0) || 0;
}

function actorLabel(actor) {
  return actor?.username || actor?.label || 'system';
}

function parsePermissions(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function notifyHigherRanksOfBanRequest(ban, actor) {
  const creatorRank = Number(ban?.created_by_level || 0);
  const users = await all('SELECT id, perms_json FROM users WHERE id <> ?', [actor?.id || 0]);
  for (const user of users) {
    const perms = parsePermissions(user.perms_json);
    const rank = Number(perms.level ?? perms.rank ?? 0) || 0;
    if (rank <= creatorRank) continue;
    await createNotification({
      userId: user.id,
      type: 'ban_request_created',
      title: 'New ban request',
      body: `${ban.created_by_display || actorLabel(actor)} submitted a ban request for ${ban.warthunder_username}.`,
      link: '/mod',
      metadata: { banId: ban.id, requestType: 'moderation_ban' }
    });
  }
}

function policyError(code, statusCode = 403) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function decorateBan(ban) {
  if (!ban) return ban;
  const starts = parseDate(ban.starts_at);
  const ends = parseDate(ban.ends_at);
  const hours = starts && ends ? Math.max(0, (ends - starts) / 3_600_000) : null;
  const roundedHours = hours == null ? null : Math.round(hours * 10) / 10;
  return {
    ...ban,
    duration_hours: roundedHours,
    duration_label: ends ? formatDuration(roundedHours) : 'Permanent',
    is_permanent: !ends,
    created_by_level_name: ban.created_by_level_name || (Number(ban.created_by_level) > 0 ? levelName(ban.created_by_level) : 'Legacy record'),
    created_by_display: ban.created_by_label || ban.creator_username || 'Unknown staff',
    reviewed_by_display: ban.reviewed_by_label || ban.reviewer_username || null,
    revoked_by_display: ban.revoked_by_username || ban.revoker_username || null
  };
}

async function decorateBanWithEvidence(ban) {
  const decorated = decorateBan(ban);
  if (!decorated) return decorated;
  return { ...decorated, evidence: await listBanEvidence(decorated.id) };
}

export function formatDuration(hours) {
  if (hours == null) return 'Permanent';
  const rounded = Math.round(Number(hours) * 10) / 10;
  if (rounded >= 24 && Math.abs(rounded % 24) < 0.01) {
    const days = rounded / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (rounded >= 1) return `${rounded} hour${rounded === 1 ? '' : 's'}`;
  const minutes = Math.max(1, Math.round(rounded * 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Calculate the final ban window and enforce the rank ceiling. This function
 * is exported so the duration rules can be tested without a database.
 */
export function validateBanWindow(input, actor) {
  const rank = actorLevel(actor);
  if (rank < ROLE_LEVELS.trial) throw policyError('missing_trial_mod_perms');

  const starts = input.startsAt === undefined || input.startsAt === null || input.startsAt === ''
    ? new Date()
    : parseDate(input.startsAt);
  if (!starts) throw policyError('invalid_starts_at', 400);

  let ends = input.endsAt === undefined
    ? null
    : parseDate(input.endsAt);
  const suppliedDuration = input.durationHours == null || input.durationHours === ''
    ? null
    : Number(input.durationHours);

  if (suppliedDuration != null) {
    if (!Number.isFinite(suppliedDuration) || suppliedDuration <= 0) {
      throw policyError('invalid_duration', 400);
    }
    if (input.endsAt === undefined || input.endsAt === null || input.endsAt === '') {
      ends = new Date(starts.getTime() + suppliedDuration * 3_600_000);
    }
  }

  if (input.endsAt !== undefined && input.endsAt !== null && input.endsAt !== '' && !ends) {
    throw policyError('invalid_ends_at', 400);
  }
  if (ends && ends <= starts) throw policyError('ends_at_must_follow_starts_at', 400);

  const hours = ends ? (ends.getTime() - starts.getTime()) / 3_600_000 : null;
  const maximum = maxBanHours(rank);
  if (maximum != null && hours == null) throw policyError('permanent_ban_not_allowed');
  if (maximum != null && hours > maximum + 0.0001) {
    throw policyError(`ban_duration_exceeds_${maximum === 24 ? '24_hours' : '3_days'}`);
  }

  return {
    startsAt: starts.toISOString(),
    endsAt: ends ? ends.toISOString() : null,
    durationHours: hours == null ? null : Math.round(hours * 10) / 10
  };
}

function resolvedAccounts(resolved, requestedUsername) {
  const candidates = Array.isArray(resolved?.players) && resolved.players.length
    ? resolved.players
    : [resolved];
  const seen = new Set();
  const accounts = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const id = candidate.id ? String(candidate.id) : null;
    const username = String(candidate.username || requestedUsername || '').trim();
    const key = id ? `id:${id}` : `name:${username.toLowerCase()}`;
    if (!username || seen.has(key)) continue;
    seen.add(key);
    accounts.push({ ...candidate, id, username });
  }
  return accounts.length ? accounts : [{ id: null, username: requestedUsername }];
}

export async function resolveBanTargets(input) {
  if (Array.isArray(input.resolvedPlayers) && input.resolvedPlayers.length) {
    return resolvedAccounts({ players: input.resolvedPlayers }, input.username);
  }
  if (input.warthunderId) {
    return resolvedAccounts({ id: String(input.warthunderId), username: input.username, raw: null, players: [{ id: String(input.warthunderId), username: input.username, raw: null }] }, input.username);
  }
  const known = await resolveKnownPluginPlayers(input.username).catch(() => []);
  let resolved;
  try {
    resolved = known.length ? { players: known } : await resolveWarThunderPlayer(input.username);
  } catch (error) {
    if (!config.warthunder.allowUnresolvedBans) throw policyError('warthunder_id_resolution_required', 422);
    throw error;
  }
  return resolvedAccounts(resolved, input.username);
}

async function resolveKnownPluginPlayers(username) {
  const names = [String(username || '').trim()];
  if (username && !String(username).includes('@')) names.push(`${username}@live`, `${username}@psn`);
  const placeholders = names.map(() => '?').join(',');
  const rows = await all(`SELECT warthunder_id AS id, username
    FROM player_aliases WHERE warthunder_id IS NOT NULL AND LOWER(username) IN (${placeholders})
    UNION ALL
    SELECT warthunder_id AS id, warthunder_username AS username
    FROM active_players WHERE warthunder_id IS NOT NULL AND LOWER(warthunder_username) IN (${placeholders})`, [...names.map((name) => name.toLowerCase()), ...names.map((name) => name.toLowerCase())]);
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.id}:${String(row.username || '').toLowerCase()}`;
    if (!row.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({ id: String(row.id), username: String(row.username || username), resolvedLookupName: String(row.username || username), matchType: 'plugin-known-player' }));
}

export async function createBan(input, actor) {
  const window = validateBanWindow(input, actor);
  let accounts;
  if (Array.isArray(input.resolvedPlayers) && input.resolvedPlayers.length) {
    accounts = resolvedAccounts({ players: input.resolvedPlayers }, input.username);
  } else if (input.warthunderId) {
    const resolved = await resolveBanTargets(input);
    accounts = resolvedAccounts(resolved, input.username);
  } else {
    const known = await resolveKnownPluginPlayers(input.username).catch((error) => {
      console.warn('Could not read War Thunder IDs supplied by the plugin.', error.message);
      return [];
    });
    try {
      const resolved = known.length ? { players: known } : await resolveBanTargets(input);
      accounts = resolvedAccounts(resolved, input.username);
    } catch (error) {
      if (!config.warthunder.allowUnresolvedBans) throw policyError('warthunder_id_resolution_required', 422);
      throw error;
    }
  }
  if (!config.warthunder.allowUnresolvedBans && accounts.some((account) => !account.id)) {
    throw policyError('warthunder_id_resolution_required', 422);
  }
  const rank = actorLevel(actor);
  const reviewStatus = rank < ROLE_LEVELS.admin ? 'pending' : 'not_required';
  const createdByLevelName = actor?.perms?.levelName || levelName(rank);

  const inserted = await transaction(async (tx) => {
    const rows = [];
    for (const account of accounts) {
      const result = await tx.run(`INSERT INTO bans
        (warthunder_username, warthunder_id, reason, evidence_url, starts_at, ends_at,
         created_by_user_id, created_by_label, created_by_level, created_by_level_name, review_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        account.username || input.username,
        account.id || null,
        input.reason,
        input.evidenceUrl || null,
        mysqlDate(window.startsAt),
        mysqlDate(window.endsAt),
        actor?.id || null,
        actorLabel(actor),
        rank,
        createdByLevelName,
        reviewStatus
      ]);
      if (account.id) {
        await tx.run(`INSERT INTO player_aliases (warthunder_id, username) VALUES (?, ?)
          ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()`, [account.id, account.username || input.username]);
      }
      rows.push({ id: result.insertId, account });
    }
    return rows;
  });

  try {
    await persistEvidence(input.evidenceFiles, { banIds: inserted.map((row) => row.id), uploadedByUserId: actor?.id });
  } catch (error) {
    // Do not leave an enforceable ban behind when evidence storage fails.
    await Promise.all(inserted.map((row) => run(`UPDATE bans SET status='revoked', revoked_at=UTC_TIMESTAMP(), revoke_reason=? WHERE id=?`, ['Evidence upload failed', row.id]).catch(() => {})));
    throw error;
  }

  const bans = [];
  const { evidenceFiles: _evidenceFiles, ...auditInput } = input;
  for (const row of inserted) {
    await audit({
      action: 'ban.create',
      actorUserId: actor?.id,
      actorLabel: actorLabel(actor),
      targetType: 'ban',
      targetId: row.id,
      data: {
        input: auditInput,
        resolved: row.account,
        resolvedPlayers: accounts,
        rank,
        reviewStatus,
        window
      }
    });
    const ban = await getBan(row.id);
    let notifications = [];
    if (reviewStatus === 'pending') {
      try { await notifyHigherRanksOfBanRequest(ban, actor); }
      catch (error) { console.warn('Could not notify higher-ranked moderators about the ban request:', error.message); }
    } else {
      notifications = await notifyLinkedUsersOfBan(ban);
    }
    bans.push({ ...ban, notifications });
  }
  return {
    ban: bans[0],
    bans,
    request: reviewStatus === 'pending' ? bans[0] : null,
    createdCount: bans.length,
    resolvedPlayers: accounts.map((account) => ({
      id: account.id,
      username: account.username,
      resolvedLookupName: account.resolvedLookupName || account.username,
      matchType: account.matchType || null
    }))
  };
}

export async function getBan(id) {
  const ban = await get(`${BAN_SELECT} WHERE b.id = ?`, [id]);
  return decorateBanWithEvidence(ban);
}

export async function listActiveBans({ search = '', page = 1, limit = 15 } = {}) {
  const cleanSearch = String(search || '').trim().slice(0, 120);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 15, 15));
  const requestedPage = Math.max(1, Number(page) || 1);
  const where = [
    `b.status = 'active'`,
    `COALESCE(b.review_status, 'not_required') <> 'pending'`,
    `b.starts_at <= UTC_TIMESTAMP()`,
    `(b.ends_at IS NULL OR b.ends_at > UTC_TIMESTAMP())`
  ];
  const params = [];
  if (cleanSearch) {
    const like = `%${cleanSearch}%`;
    where.push(`(
      LOWER(b.warthunder_username) LIKE LOWER(?)
      OR COALESCE(b.warthunder_id, '') LIKE ?
      OR LOWER(b.reason) LIKE LOWER(?)
      OR CAST(b.id AS CHAR) LIKE ?
    )`);
    params.push(like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const count = await get(`SELECT COUNT(*) AS total FROM bans b WHERE ${whereSql}`, params);
  const total = Number(count?.total) || 0;
  const totalPages = total ? Math.ceil(total / safeLimit) : 0;
  const currentPage = totalPages ? Math.min(requestedPage, totalPages) : 1;
  const offset = (currentPage - 1) * safeLimit;
  const rows = total
    ? await all(`${BAN_SELECT}
      WHERE ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT ${safeLimit} OFFSET ${offset}`, params)
    : [];
  return {
    bans: await Promise.all(rows.map(decorateBanWithEvidence)),
    page: currentPage,
    limit: safeLimit,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    search: cleanSearch
  };
}

export async function listReviewQueue(actor) {
  const rank = actorLevel(actor);
  if (rank <= ROLE_LEVELS.trial) return [];
  const actorId = actor?.id || 0;
  const rows = await all(`${BAN_SELECT}
    WHERE b.status = 'active'
      AND b.review_status = 'pending'
      AND b.created_by_level < ?
      AND (b.created_by_user_id IS NULL OR b.created_by_user_id <> ?)
    ORDER BY b.created_at ASC`, [rank, actorId]);
  return Promise.all(rows.map(decorateBanWithEvidence));
}

export async function listBanHistory(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const rows = await all(`${BAN_SELECT} ORDER BY b.created_at DESC LIMIT ${safeLimit}`);
  return Promise.all(rows.map(decorateBanWithEvidence));
}

export async function listBanAudit(id) {
  const rows = await all(`SELECT id, action, actor_user_id, actor_label, target_type, target_id, data_json, created_at
    FROM audit_log WHERE target_type='ban' AND target_id=? ORDER BY created_at DESC`, [String(id)]);
  return rows.map((row) => {
    let data = {};
    try { data = JSON.parse(row.data_json || '{}'); } catch { data = { raw: row.data_json }; }
    return { ...row, data };
  });
}

export async function publicLookup(player) {
  const rows = await all(`SELECT id, warthunder_username, warthunder_id, reason, starts_at, ends_at, status, created_at
    FROM bans
    WHERE status='active'
      AND COALESCE(review_status, 'not_required') <> 'pending'
      AND starts_at <= UTC_TIMESTAMP()
      AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
      AND (LOWER(warthunder_username)=LOWER(?) OR warthunder_id=? OR EXISTS (
        SELECT 1 FROM player_aliases pa
        WHERE pa.warthunder_id = bans.warthunder_id AND LOWER(pa.username)=LOWER(?)
      ))
    ORDER BY created_at DESC`, [player, player, player]);
  return rows.map(decorateBan).map((ban) => ({
    id: ban.id,
    warthunder_username: ban.warthunder_username,
    warthunder_id: ban.warthunder_id,
    reason: ban.reason,
    starts_at: ban.starts_at,
    ends_at: ban.ends_at,
    status: ban.status,
    created_at: ban.created_at,
    duration_hours: ban.duration_hours,
    duration_label: ban.duration_label,
    is_permanent: ban.is_permanent
  }));
}

export async function findActiveBanForPlayer({ username, warthunderId }) {
  const ban = await get(`SELECT * FROM bans
    WHERE status='active'
      AND COALESCE(review_status, 'not_required') <> 'pending'
      AND starts_at <= UTC_TIMESTAMP()
      AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
      AND ((warthunder_id IS NOT NULL AND warthunder_id = ?) OR LOWER(warthunder_username)=LOWER(?))
    ORDER BY created_at DESC LIMIT 1`, [warthunderId || '', username || '']);
  return decorateBan(ban);
}

function canManageBan(current, actor) {
  const rank = actorLevel(actor);
  if (rank < ROLE_LEVELS.hmod) throw policyError('missing_hmod_perms');
  const creatorRank = Number(current.created_by_level) || 0;
  const isOwner = current.created_by_user_id && actor?.id && Number(current.created_by_user_id) === Number(actor.id);
  if (rank < creatorRank && !isOwner) throw policyError('cannot_manage_same_or_higher_rank');
}

export async function updateBan(id, patch, actor) {
  const current = await getBan(id);
  if (!current) return null;
  canManageBan(current, actor);
  const window = validateBanWindow({
    startsAt: patch.startsAt ?? current.starts_at,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : current.ends_at
  }, actor);
  await run(`UPDATE bans SET reason=?, evidence_url=?, starts_at=?, ends_at=? WHERE id=?`, [
    patch.reason ?? current.reason,
    patch.evidenceUrl ?? current.evidence_url,
    mysqlDate(window.startsAt),
    mysqlDate(window.endsAt),
    id
  ]);
  await audit({ action: 'ban.update', actorUserId: actor?.id, actorLabel: actorLabel(actor), targetType: 'ban', targetId: id, data: patch });
  return await getBan(id);
}

export async function revokeBan(id, reason, actor) {
  const current = await getBan(id);
  if (!current) return null;
  canManageBan(current, actor);
  await run(`UPDATE bans SET status='revoked', revoked_at=UTC_TIMESTAMP(), revoked_by_user_id=?, revoke_reason=? WHERE id=?`,
    [actor?.id || null, reason || null, id]);
  await audit({ action: 'ban.revoke', actorUserId: actor?.id, actorLabel: actorLabel(actor), targetType: 'ban', targetId: id, data: { reason } });
  return await getBan(id);
}

export async function reviewBan(id, decision, reason, actor) {
  const current = await getBan(id);
  if (!current) return null;
  const rank = actorLevel(actor);
  const creatorRank = Number(current.created_by_level) || 0;
  if (!canReviewRank(rank, creatorRank)) throw policyError('review_requires_higher_rank');
  if (current.created_by_user_id && actor?.id && Number(current.created_by_user_id) === Number(actor.id)) {
    throw policyError('cannot_review_own_ban');
  }
  if (current.review_status !== 'pending') throw policyError('ban_review_already_completed', 409);

  const cleanDecision = String(decision || '').toLowerCase();
  if (!['approve', 'reject'].includes(cleanDecision)) throw policyError('invalid_review_decision', 400);
  const reviewedLabel = actorLabel(actor);
  if (cleanDecision === 'approve') {
    await run(`UPDATE bans SET review_status='approved', reviewed_by_user_id=?, reviewed_by_label=?, reviewed_at=UTC_TIMESTAMP(), review_reason=? WHERE id=?`,
      [actor?.id || null, reviewedLabel, reason || null, id]);
  } else {
    await run(`UPDATE bans SET status='revoked', review_status='rejected', reviewed_by_user_id=?, reviewed_by_label=?, reviewed_at=UTC_TIMESTAMP(), review_reason=?, revoked_at=UTC_TIMESTAMP(), revoked_by_user_id=?, revoke_reason=? WHERE id=?`,
      [actor?.id || null, reviewedLabel, reason || null, actor?.id || null, reason || 'Rejected during moderation review', id]);
  }
  await audit({
    action: `ban.review.${cleanDecision}`,
    actorUserId: actor?.id,
    actorLabel: reviewedLabel,
    targetType: 'ban',
    targetId: id,
    data: { decision: cleanDecision, reason, creatorRank, reviewerRank: rank }
  });
  const updated = await getBan(id);
  if (cleanDecision === 'approve') {
    try { await notifyLinkedUsersOfBan(updated); }
    catch (error) { console.warn('Could not notify linked player after ban request approval:', error.message); }
  }
  return updated;
}

export async function upsertAlias(warthunderId, username) {
  await run(`INSERT INTO player_aliases (warthunder_id, username) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()`, [String(warthunderId), username]);
}
