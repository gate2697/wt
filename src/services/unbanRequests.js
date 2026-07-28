import { all, get, run, transaction } from '../db/database.js';
import { audit } from './audit.js';
import { getBan } from './bans.js';
import { createNotification } from './inAppNotifications.js';
import { config } from '../config.js';
import { deliverAndRecord, discordDeliveryMessage } from './discordMessaging.js';

const REQUEST_SELECT = `SELECT r.*,
    b.status AS ban_status,
    b.starts_at AS ban_starts_at,
    b.ends_at AS ban_ends_at,
    b.reason AS ban_reason,
    b.revoked_at AS ban_revoked_at,
    b.revoke_reason AS ban_revoke_reason,
    CASE WHEN b.status = 'active'
      AND b.starts_at <= UTC_TIMESTAMP()
      AND (b.ends_at IS NULL OR b.ends_at > UTC_TIMESTAMP())
      THEN 1 ELSE 0 END AS ban_is_active,
    requester.username AS requester_username,
    requester.discord_id AS requester_discord_id,
    reviewer.username AS reviewer_username
  FROM unban_requests r
  JOIN bans b ON b.id = r.ban_id
  LEFT JOIN users requester ON requester.id = r.requester_user_id
  LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id`;

function actorLabel(actor) { return actor?.username || actor?.label || 'Discord member'; }

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function decorateRequest(request) {
  if (!request) return null;
  const banIsActive = Number(request.ban_is_active) === 1;
  const banStatus = String(request.ban_status || '').toLowerCase();
  const banStateLabel = banIsActive
    ? 'Active ban'
    : banStatus === 'active'
      ? 'Expired ban'
      : banStatus
        ? `${banStatus.charAt(0).toUpperCase()}${banStatus.slice(1)} ban`
        : 'Ban unavailable';
  return {
    ...request,
    requester_display: request.requester_label || request.requester_username || 'Discord member',
    reviewer_display: request.reviewed_by_label || request.reviewer_username || null,
    ban_duration_label: request.ban_ends_at ? null : 'Permanent',
    ban_is_active: banIsActive,
    discord_delivery_message: discordDeliveryMessage(request.discord_delivery_status, request.discord_delivery_reason),
    ban_state_label: banStateLabel,
    is_stale: !banIsActive,
    stale_reason: banIsActive
      ? null
      : banStatus === 'active'
        ? 'The ban has expired. This request remains here until a moderator closes it.'
        : `The ban is no longer active (${banStatus || 'unavailable'}). This request remains here until a moderator closes it.`
  };
}

function requestError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function canManage(perms = {}) {
  return Boolean(perms.canManage || perms.hmod || perms.admin || perms.top || perms.highmod);
}

async function notifyModerators(request, actor) {
  const users = await all('SELECT id, perms_json FROM users WHERE id <> ?', [actor?.id || 0]);
  for (const user of users) {
    if (!canManage(parseJson(user.perms_json))) continue;
    await createNotification({
      userId: user.id,
      type: 'unban_request_created',
      title: 'New unban request',
      body: `${request.requester_display} requested an unban for ${request.warthunder_username}.`,
      link: '/mod',
      metadata: { requestId: request.id, banId: request.ban_id }
    });
  }
}

function siteLink(path) {
  return config.frontendUrl ? `${config.frontendUrl}${path}` : path;
}

function unbanConfirmation(request) {
  return `Your CB unban request #${request.id} for ${request.warthunder_username} was received.\n\nReason: ${request.appeal_reason}\n\nTrack it on the site: ${siteLink('/')}`;
}

function unbanDecisionMessage(request, decision, label, reason) {
  return decision === 'approve'
    ? `Your CB unban request #${request.id} for ${request.warthunder_username} was approved by ${label}.\n\n${reason}\n\n${siteLink('/')}`
    : `Your CB unban request #${request.id} for ${request.warthunder_username} was denied by ${label}.\n\nReason: ${reason}\n\n${siteLink('/')}`;
}

export async function createUnbanRequest({ banId, reason }, actor) {
  const ban = await getBan(banId);
  if (!ban) throw requestError('ban_not_found', 404);
  if (ban.status !== 'active') throw requestError('ban_is_not_active', 409);

  const existing = await get(`SELECT id FROM unban_requests WHERE ban_id=? AND requester_user_id=? AND status='pending' LIMIT 1`, [banId, actor?.id]);
  if (existing) throw requestError('unban_request_already_pending', 409);

  const result = await run(`INSERT INTO unban_requests
    (ban_id, requester_user_id, requester_label, warthunder_username, warthunder_id, appeal_reason)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    ban.id,
    actor.id,
    actorLabel(actor),
    ban.warthunder_username,
    ban.warthunder_id || null,
    reason
  ]);
  await audit({
    action: 'unban_request.create',
    actorUserId: actor.id,
    actorLabel: actorLabel(actor),
    targetType: 'unban_request',
    targetId: result.insertId,
    data: { banId: ban.id, reason }
  });
  let request = await getUnbanRequest(result.insertId);
  try {
    await deliverAndRecord({
      table: 'unban_requests',
      id: result.insertId,
      discordId: actor?.discordId || request?.requester_discord_id,
      message: unbanConfirmation(request)
    });
    request = await getUnbanRequest(result.insertId);
  } catch (error) { console.warn('Could not record Discord unban-request delivery:', error.message); }
  try { await notifyModerators(request, actor); }
  catch (error) { console.warn('Could not create moderator unban-request notifications:', error.message); }
  return request;
}

export async function getUnbanRequest(id) {
  return decorateRequest(await get(`${REQUEST_SELECT} WHERE r.id=?`, [id]));
}

export async function listMyUnbanRequests(actor) {
  const rows = await all(`${REQUEST_SELECT} WHERE r.requester_user_id=? ORDER BY r.created_at DESC`, [actor.id]);
  return rows.map(decorateRequest);
}

export async function listPendingUnbanRequests({ search = '', page = 1, limit = 15 } = {}) {
  const cleanSearch = String(search || '').trim().slice(0, 120);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 15, 15));
  const requestedPage = Math.max(1, Number(page) || 1);
  const where = [`r.status='pending'`];
  const params = [];
  if (cleanSearch) {
    const like = `%${cleanSearch}%`;
    where.push(`(
      CAST(r.id AS CHAR) LIKE ?
      OR LOWER(r.warthunder_username) LIKE LOWER(?)
      OR COALESCE(r.warthunder_id, '') LIKE ?
      OR LOWER(r.requester_label) LIKE LOWER(?)
      OR LOWER(COALESCE(requester.username, '')) LIKE LOWER(?)
      OR LOWER(r.appeal_reason) LIKE LOWER(?)
      OR LOWER(b.reason) LIKE LOWER(?)
    )`);
    params.push(like, like, like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const count = await get(`SELECT COUNT(*) AS total
    FROM unban_requests r
    JOIN bans b ON b.id = r.ban_id
    LEFT JOIN users requester ON requester.id = r.requester_user_id
    WHERE ${whereSql}`, params);
  const total = Number(count?.total) || 0;
  const totalPages = total ? Math.ceil(total / safeLimit) : 0;
  const currentPage = totalPages ? Math.min(requestedPage, totalPages) : 1;
  const offset = (currentPage - 1) * safeLimit;
  const rows = total
    ? await all(`${REQUEST_SELECT} WHERE ${whereSql} ORDER BY r.created_at ASC LIMIT ${safeLimit} OFFSET ${offset}`, params)
    : [];
  return {
    requests: rows.map(decorateRequest),
    page: currentPage,
    limit: safeLimit,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    search: cleanSearch
  };
}

export async function decideUnbanRequest(id, decision, reason, actor) {
  const request = await getUnbanRequest(id);
  if (!request) return null;
  if (request.status !== 'pending') throw requestError('unban_request_already_decided', 409);
  if (Number(request.requester_user_id) === Number(actor?.id)) throw requestError('cannot_decide_own_unban_request', 403);

  const cleanDecision = String(decision || '').toLowerCase();
  if (!['approve', 'deny'].includes(cleanDecision)) throw requestError('invalid_unban_decision', 400);
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw requestError('decision_reason_required', 400);
  const label = actorLabel(actor);

  await transaction(async (tx) => {
    const updated = await tx.run(`UPDATE unban_requests
      SET status=?, reviewed_by_user_id=?, reviewed_by_label=?, reviewed_at=UTC_TIMESTAMP(), review_reason=?
      WHERE id=? AND status='pending'`, [cleanDecision === 'approve' ? 'approved' : 'denied', actor.id, label, cleanReason || null, id]);
    if (!updated.affectedRows) throw requestError('unban_request_already_decided', 409);
    if (cleanDecision === 'approve') {
      const revoked = await tx.run(`UPDATE bans SET status='revoked', revoked_at=UTC_TIMESTAMP(), revoked_by_user_id=?, revoke_reason=? WHERE id=? AND status='active'`, [actor.id, `Unban request approved${cleanReason ? `: ${cleanReason}` : ''}`, request.ban_id]);
      if (!revoked.affectedRows) throw requestError('ban_is_not_active', 409);
    }
  });

  await audit({
    action: `unban_request.${cleanDecision}`,
    actorUserId: actor.id,
    actorLabel: label,
    targetType: 'unban_request',
    targetId: id,
    data: { banId: request.ban_id, reason: cleanReason }
  });
  try {
    await createNotification({
      userId: request.requester_user_id,
      type: `unban_request_${cleanDecision}`,
      title: cleanDecision === 'approve' ? 'Unban request approved' : 'Unban request denied',
      body: cleanDecision === 'approve'
        ? `Your request for ${request.warthunder_username} was approved by ${label}.`
        : `Your request for ${request.warthunder_username} was denied by ${label}${cleanReason ? `: ${cleanReason}` : '.'}`,
      link: '/',
      metadata: { requestId: request.id, banId: request.ban_id, decision: cleanDecision }
    });
  } catch (error) { console.warn('Could not create unban decision notification:', error.message); }
  try {
    await deliverAndRecord({
      table: 'unban_requests',
      id,
      discordId: request.requester_discord_id,
      message: unbanDecisionMessage(request, cleanDecision, label, cleanReason)
    });
  } catch (error) { console.warn('Could not record Discord unban-decision delivery:', error.message); }
  return getUnbanRequest(id);
}

function canMessageAsStaff(actor) {
  const perms = actor?.perms || {};
  return Boolean(perms.canManage || perms.hmod || perms.admin || perms.top || perms.highmod);
}

async function getMessageRequest(id, actor) {
  const request = await getUnbanRequest(id);
  if (!request) return null;
  const isRequester = Number(request.requester_user_id) === Number(actor?.id);
  if (!isRequester && !canMessageAsStaff(actor)) throw requestError('unban_message_forbidden', 403);
  return request;
}

export async function listUnbanMessages(id, actor) {
  const request = await getMessageRequest(id, actor);
  if (!request) return null;
  const messages = await all(`SELECT id, unban_request_id, author_user_id, author_label, author_kind, body,
      discord_delivery_status, discord_delivery_reason, discord_delivery_at, discord_message_id, created_at
    FROM unban_messages WHERE unban_request_id=? ORDER BY created_at ASC, id ASC`, [id]);
  return { request, messages: messages.map((message) => ({
    ...message,
    discord_delivery_message: discordDeliveryMessage(message.discord_delivery_status, message.discord_delivery_reason)
  })) };
}

export async function createUnbanMessage(id, body, actor) {
  const request = await getMessageRequest(id, actor);
  if (!request) return null;
  const cleanBody = String(body || '').trim();
  if (!cleanBody) throw requestError('unban_message_required');
  const staff = canMessageAsStaff(actor);
  const authorKind = staff ? 'staff' : 'player';
  const result = await run(`INSERT INTO unban_messages
    (unban_request_id, author_user_id, author_label, author_kind, body)
    VALUES (?, ?, ?, ?, ?)`, [id, actor.id, actorLabel(actor), authorKind, cleanBody]);
  await audit({
    action: 'unban_request.message',
    actorUserId: actor.id,
    actorLabel: actorLabel(actor),
    targetType: 'unban_request',
    targetId: id,
    data: { messageId: result.insertId, authorKind }
  });
  try {
    if (staff) {
      await createNotification({
        userId: request.requester_user_id,
        type: 'unban_request_message',
        title: 'New message about your unban request',
        body: `${actorLabel(actor)} replied to your request for ${request.warthunder_username}.`,
        link: '/',
        metadata: { requestId: request.id, messageId: result.insertId }
      });
    } else {
      await notifyModerators({ ...request, requester_display: actorLabel(actor) }, actor);
    }
  } catch (error) { console.warn('Could not create unban-message notification:', error.message); }
  let delivery = null;
  if (staff) {
    try {
      delivery = await deliverAndRecord({
        table: 'unban_messages',
        id: result.insertId,
        discordId: request.requester_discord_id,
        message: `A moderator replied to your CB unban request #${request.id} for ${request.warthunder_username}.\n\n${cleanBody}\n\nReply on the site: ${siteLink('/')}`
      });
    } catch (error) { console.warn('Could not record Discord unban-message delivery:', error.message); }
  }
  const message = await get(`SELECT id, unban_request_id, author_user_id, author_label, author_kind, body,
      discord_delivery_status, discord_delivery_reason, discord_delivery_at, discord_message_id, created_at
    FROM unban_messages WHERE id=?`, [result.insertId]);
  return { ...message, discord_delivery_message: discordDeliveryMessage(message?.discord_delivery_status, message?.discord_delivery_reason), discord_delivery: delivery };
}
