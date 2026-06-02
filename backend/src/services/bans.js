import { all, get, run } from '../db/database.js';
import { resolveWarThunderPlayer } from './statshark.js';
import { audit } from './audit.js';
import { notifyLinkedUsersOfBan } from './notifications.js';

function nowIso() { return new Date().toISOString(); }
function mysqlDate(iso) { return iso ? new Date(iso).toISOString().slice(0, 19).replace('T', ' ') : null; }

export async function createBan(input, actor) {
  const resolved = input.warthunderId
    ? { id: String(input.warthunderId), username: input.username, raw: null }
    : await resolveWarThunderPlayer(input.username);

  const startsAt = input.startsAt || nowIso();
  const endsAt = input.endsAt || (input.durationHours ? new Date(Date.now() + Number(input.durationHours) * 3600_000).toISOString() : null);
  const result = await run(`INSERT INTO bans
    (warthunder_username, warthunder_id, reason, evidence_url, starts_at, ends_at, created_by_user_id, created_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      resolved.username || input.username,
      resolved.id || null,
      input.reason,
      input.evidenceUrl || null,
      mysqlDate(startsAt),
      mysqlDate(endsAt),
      actor?.id || null,
      actor?.username || actor?.label || 'system'
    ]);

  if (resolved.id) await upsertAlias(resolved.id, resolved.username || input.username);
  await audit({ action: 'ban.create', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: result.insertId, data: { input, resolved } });
  const ban = await getBan(result.insertId);
  const notifications = await notifyLinkedUsersOfBan(ban);
  return { ...ban, notifications };
}

export async function getBan(id) {
  return await get('SELECT * FROM bans WHERE id = ?', [id]);
}

export async function listActiveBans() {
  return await all(`SELECT * FROM bans WHERE status = 'active' AND starts_at <= UTC_TIMESTAMP() AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP()) ORDER BY created_at DESC`);
}

export async function publicLookup(player) {
  return await all(`SELECT id, warthunder_username, warthunder_id, reason, starts_at, ends_at, status, created_at
    FROM bans
    WHERE status='active'
      AND starts_at <= UTC_TIMESTAMP()
      AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
      AND (LOWER(warthunder_username)=LOWER(?) OR warthunder_id=?)
    ORDER BY created_at DESC`, [player, player]);
}

export async function findActiveBanForPlayer({ username, warthunderId }) {
  return await get(`SELECT * FROM bans
    WHERE status='active'
      AND starts_at <= UTC_TIMESTAMP()
      AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
      AND ((warthunder_id IS NOT NULL AND warthunder_id = ?) OR LOWER(warthunder_username)=LOWER(?))
    ORDER BY created_at DESC LIMIT 1`, [warthunderId || '', username || '']);
}

export async function updateBan(id, patch, actor) {
  const current = await getBan(id);
  if (!current) return null;
  const merged = {
    reason: patch.reason ?? current.reason,
    evidence_url: patch.evidenceUrl ?? current.evidence_url,
    starts_at: patch.startsAt ?? current.starts_at,
    ends_at: patch.endsAt ?? current.ends_at,
    status: patch.status ?? current.status
  };
  await run(`UPDATE bans SET reason=?, evidence_url=?, starts_at=?, ends_at=?, status=? WHERE id=?`,
    [merged.reason, merged.evidence_url, mysqlDate(merged.starts_at), mysqlDate(merged.ends_at), merged.status, id]);
  await audit({ action: 'ban.update', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: id, data: patch });
  return await getBan(id);
}

export async function revokeBan(id, reason, actor) {
  const current = await getBan(id);
  if (!current) return null;
  await run(`UPDATE bans SET status='revoked', revoked_at=UTC_TIMESTAMP(), revoked_by_user_id=?, revoke_reason=? WHERE id=?`,
    [actor?.id || null, reason || null, id]);
  await audit({ action: 'ban.revoke', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: id, data: { reason } });
  return await getBan(id);
}

export async function upsertAlias(warthunderId, username) {
  await run(`INSERT INTO player_aliases (warthunder_id, username) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()`, [String(warthunderId), username]);
}
