import { db } from '../db/database.js';
import { resolveWarThunderPlayer } from './statshark.js';
import { audit } from './audit.js';
import { notifyLinkedUsersOfBan } from './notifications.js';

function nowIso() { return new Date().toISOString(); }
function activeWhere(now = nowIso()) {
  return `status = 'active' AND starts_at <= '${now}' AND (ends_at IS NULL OR ends_at > '${now}')`;
}

export async function createBan(input, actor) {
  const resolved = input.warthunderId
    ? { id: String(input.warthunderId), username: input.username, raw: null }
    : await resolveWarThunderPlayer(input.username);

  const startsAt = input.startsAt || nowIso();
  const endsAt = input.endsAt || (input.durationHours ? new Date(Date.now() + Number(input.durationHours) * 3600_000).toISOString() : null);
  const result = db.prepare(`INSERT INTO bans
    (warthunder_username, warthunder_id, reason, evidence_url, starts_at, ends_at, created_by_user_id, created_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      resolved.username || input.username,
      resolved.id,
      input.reason,
      input.evidenceUrl || null,
      startsAt,
      endsAt,
      actor?.id || null,
      actor?.username || actor?.label || 'system'
    );

  if (resolved.id) upsertAlias(resolved.id, resolved.username || input.username);
  audit({ action: 'ban.create', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: result.lastInsertRowid, data: { input, resolved } });
  const ban = getBan(result.lastInsertRowid);
  const notifications = await notifyLinkedUsersOfBan(ban);
  return { ...ban, notifications };
}

export function getBan(id) {
  return db.prepare('SELECT * FROM bans WHERE id = ?').get(id);
}

export function listActiveBans() {
  return db.prepare(`SELECT * FROM bans WHERE ${activeWhere()} ORDER BY created_at DESC`).all();
}

export function publicLookup(player) {
  const now = nowIso();
  const rows = db.prepare(`SELECT id, warthunder_username, warthunder_id, reason, starts_at, ends_at, status, created_at
    FROM bans
    WHERE status='active'
      AND starts_at <= ?
      AND (ends_at IS NULL OR ends_at > ?)
      AND (lower(warthunder_username)=lower(?) OR warthunder_id=?)
    ORDER BY created_at DESC`).all(now, now, player, player);
  return rows;
}

export function findActiveBanForPlayer({ username, warthunderId }) {
  const now = nowIso();
  return db.prepare(`SELECT * FROM bans
    WHERE status='active'
      AND starts_at <= ?
      AND (ends_at IS NULL OR ends_at > ?)
      AND ((warthunder_id IS NOT NULL AND warthunder_id = ?) OR lower(warthunder_username)=lower(?))
    ORDER BY created_at DESC LIMIT 1`).get(now, now, warthunderId || '', username || '');
}

export function updateBan(id, patch, actor) {
  const current = getBan(id);
  if (!current) return null;
  const merged = {
    reason: patch.reason ?? current.reason,
    evidence_url: patch.evidenceUrl ?? current.evidence_url,
    starts_at: patch.startsAt ?? current.starts_at,
    ends_at: patch.endsAt ?? current.ends_at,
    status: patch.status ?? current.status
  };
  db.prepare(`UPDATE bans SET reason=?, evidence_url=?, starts_at=?, ends_at=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(merged.reason, merged.evidence_url, merged.starts_at, merged.ends_at, merged.status, id);
  audit({ action: 'ban.update', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: id, data: patch });
  return getBan(id);
}

export function revokeBan(id, reason, actor) {
  const current = getBan(id);
  if (!current) return null;
  db.prepare(`UPDATE bans SET status='revoked', revoked_at=?, revoked_by_user_id=?, revoke_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(nowIso(), actor?.id || null, reason || null, id);
  audit({ action: 'ban.revoke', actorUserId: actor?.id, actorLabel: actor?.username, targetType: 'ban', targetId: id, data: { reason } });
  return getBan(id);
}

export function upsertAlias(warthunderId, username) {
  db.prepare(`INSERT INTO player_aliases (warthunder_id, username) VALUES (?, ?)
    ON CONFLICT(warthunder_id, username) DO UPDATE SET last_seen_at=CURRENT_TIMESTAMP`).run(String(warthunderId), username);
}
