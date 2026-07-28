import { all, get, run } from '../db/database.js';
import { audit } from './audit.js';
import { createNotification } from './inAppNotifications.js';
import { listBanRequestEvidence, persistEvidence } from './evidence.js';

const REQUEST_SELECT = `SELECT r.*,
    requester.username AS requester_username,
    reviewer.username AS reviewer_username
  FROM ban_requests r
  LEFT JOIN users requester ON requester.id = r.requester_user_id
  LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id`;

function actorLabel(actor) { return actor?.username || actor?.label || 'Discord member'; }

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function requestError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function decorateRequest(request) {
  if (!request) return null;
  return {
    ...request,
    requester_display: request.requester_label || request.requester_username || 'Discord member',
    reviewer_display: request.reviewed_by_label || request.reviewer_username || null
  };
}

async function decorateRequestWithEvidence(request) {
  const decorated = decorateRequest(request);
  if (!decorated) return decorated;
  return { ...decorated, evidence: await listBanRequestEvidence(decorated.id) };
}

async function notifyModerators(request, actor) {
  const users = await all('SELECT id, perms_json FROM users WHERE id <> ?', [actor?.id || 0]);
  for (const user of users) {
    const perms = parseJson(user.perms_json);
    if (!perms.canModerate && !perms.trial && !perms.mod && !perms.hmod && !perms.admin && !perms.top) continue;
    await createNotification({
      userId: user.id,
      type: 'ban_request_created',
      title: 'New ban request',
      body: `${request.requester_display} reported ${request.warthunder_username}.`,
      link: '/mod',
      metadata: { requestId: request.id }
    });
  }
}

export async function getBanRequest(id) {
  return decorateRequestWithEvidence(await get(`${REQUEST_SELECT} WHERE r.id=?`, [id]));
}

export async function listMyBanRequests(actor) {
  const rows = await all(`${REQUEST_SELECT} WHERE r.requester_user_id=? ORDER BY r.created_at DESC`, [actor.id]);
  return Promise.all(rows.map(decorateRequestWithEvidence));
}

export async function createBanRequest({ username, warthunderId, reason, evidenceUrl, evidenceFiles }, actor) {
  const target = String(username || '').trim();
  const cleanReason = String(reason || '').trim();
  if (!target) throw requestError('ban_request_target_required');
  if (cleanReason.length < 10) throw requestError('ban_request_reason_too_short');
  const existing = await get(`SELECT id FROM ban_requests
    WHERE requester_user_id=? AND status='pending' AND LOWER(warthunder_username)=LOWER(?) LIMIT 1`, [actor?.id, target]);
  if (existing) throw requestError('ban_request_already_pending', 409);
  const result = await run(`INSERT INTO ban_requests
    (requester_user_id, requester_label, warthunder_username, warthunder_id, reason, evidence_url)
    VALUES (?, ?, ?, ?, ?, ?)`, [actor.id, actorLabel(actor), target, warthunderId ? String(warthunderId).trim() : null, cleanReason, evidenceUrl ? String(evidenceUrl).trim() : null]);
  try {
    await persistEvidence(evidenceFiles, { banRequestId: result.insertId, uploadedByUserId: actor?.id });
  } catch (error) {
    await run('DELETE FROM ban_requests WHERE id=?', [result.insertId]).catch(() => {});
    throw error;
  }
  await audit({
    action: 'ban_request.create',
    actorUserId: actor.id,
    actorLabel: actorLabel(actor),
    targetType: 'ban_request',
    targetId: result.insertId,
    data: { username: target, warthunderId: warthunderId || null }
  });
  const request = await getBanRequest(result.insertId);
  try { await notifyModerators(request, actor); }
  catch (error) { console.warn('Could not create moderator ban-request notifications:', error.message); }
  return request;
}

export async function listPendingBanRequests({ search = '', page = 1, limit = 15 } = {}) {
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
      OR LOWER(r.reason) LIKE LOWER(?)
    )`);
    params.push(like, like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const count = await get(`SELECT COUNT(*) AS total
    FROM ban_requests r
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
    requests: await Promise.all(rows.map(decorateRequestWithEvidence)),
    page: currentPage,
    limit: safeLimit,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    search: cleanSearch
  };
}

export async function decideBanRequest(id, decision, reason, actor) {
  const request = await getBanRequest(id);
  if (!request) return null;
  if (request.status !== 'pending') throw requestError('ban_request_already_decided', 409);
  if (Number(request.requester_user_id) === Number(actor?.id)) throw requestError('cannot_decide_own_ban_request', 403);
  const cleanDecision = String(decision || '').toLowerCase();
  if (!['approve', 'deny'].includes(cleanDecision)) throw requestError('invalid_ban_request_decision');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw requestError('decision_reason_required');
  const label = actorLabel(actor);
  const status = cleanDecision === 'approve' ? 'approved' : 'denied';
  const result = await run(`UPDATE ban_requests
    SET status=?, reviewed_by_user_id=?, reviewed_by_label=?, reviewed_at=UTC_TIMESTAMP(), review_reason=?
    WHERE id=? AND status='pending'`, [status, actor.id, label, cleanReason, id]);
  if (!result.affectedRows) throw requestError('ban_request_already_decided', 409);
  await audit({
    action: `ban_request.${cleanDecision}`,
    actorUserId: actor.id,
    actorLabel: label,
    targetType: 'ban_request',
    targetId: id,
    data: { username: request.warthunder_username, reason: cleanReason }
  });
  try {
    await createNotification({
      userId: request.requester_user_id,
      type: `ban_request_${cleanDecision}`,
      title: cleanDecision === 'approve' ? 'Ban request accepted' : 'Ban request denied',
      body: cleanDecision === 'approve'
        ? `Your report for ${request.warthunder_username} was accepted by ${label}. A moderator will handle the ban separately.`
        : `Your report for ${request.warthunder_username} was denied by ${label}: ${cleanReason}`,
      link: '/',
      metadata: { requestId: request.id, decision: cleanDecision }
    });
  } catch (error) { console.warn('Could not create ban-request decision notification:', error.message); }
  return getBanRequest(id);
}
