import { all, get, run } from '../db/database.js';
import { config } from '../config.js';
import { audit } from './audit.js';
import { createNotification } from './inAppNotifications.js';
import { deliverAndRecord, discordDeliveryMessage } from './discordMessaging.js';

const APPLICATION_SELECT = `SELECT a.*,
    applicant.username AS applicant_username,
    applicant.discord_id AS applicant_discord_id,
    reviewer.username AS reviewer_username
  FROM staff_applications a
  LEFT JOIN users applicant ON applicant.id = a.applicant_user_id
  LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by_user_id`;

function actorLabel(actor) { return actor?.username || actor?.label || 'Discord member'; }

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function applicationError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

function mysqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function calculateAge(birthDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate || ''))) return null;
  const date = new Date(`${birthDate}T12:00:00Z`);
  const [year, birthMonth, day] = String(birthDate).split('-').map(Number);
  if (Number.isNaN(date.valueOf()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== birthMonth || date.getUTCDate() !== day) return null;
  if (date > new Date()) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const month = now.getUTCMonth() - date.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

export function guildDaysSince(joinedAt, now = new Date()) {
  const joined = normalizeDate(joinedAt);
  if (!joined || joined > now) return null;
  return Math.floor((now - joined) / 86_400_000);
}

function decorateApplication(application) {
  if (!application) return null;
  return {
    ...application,
    applicant_display: application.applicant_label || application.applicant_username || 'Discord member',
    reviewer_display: application.reviewed_by_label || application.reviewer_username || null,
    discord_delivery_message: discordDeliveryMessage(application.discord_delivery_status, application.discord_delivery_reason),
    rule_summary: `${application.age_at_submission}+ · ${application.guild_days_at_submission} days in Discord`
  };
}

async function notifyModerators(application, actor) {
  const users = await all('SELECT id, perms_json FROM users WHERE id <> ?', [actor?.id || 0]);
  for (const user of users) {
    const perms = parseJson(user.perms_json);
    if (!perms.canModerate && !perms.trial && !perms.mod && !perms.hmod && !perms.admin && !perms.top) continue;
    await createNotification({
      userId: user.id,
      type: 'staff_application_created',
      title: 'New staff application',
      body: `${application.applicant_display} submitted a staff application.`,
      link: '/mod',
      metadata: { applicationId: application.id }
    });
  }
}

function siteLink(path) {
  return config.frontendUrl ? `${config.frontendUrl}${path}` : path;
}

function applicationConfirmation(application) {
  return `Your CB staff application #${application.id} was received.\n\nThe moderation team will review it and the site will keep you updated.\n\nTrack it on the site: ${siteLink('/staff-applications')}`;
}

function applicationDecisionMessage(application, decision, label, reason) {
  return decision === 'approve'
    ? `Your CB staff application #${application.id} was approved by ${label}.\n\n${reason}\n\nA server administrator will assign the Discord role separately.\n\n${siteLink('/staff-applications')}`
    : `Your CB staff application #${application.id} was denied by ${label}.\n\nReason: ${reason}\n\n${siteLink('/staff-applications')}`;
}

export async function getStaffApplication(id) {
  return decorateApplication(await get(`${APPLICATION_SELECT} WHERE a.id=?`, [id]));
}

export async function listMyStaffApplications(actor) {
  const rows = await all(`${APPLICATION_SELECT} WHERE a.applicant_user_id=? ORDER BY a.created_at DESC`, [actor.id]);
  return rows.map(decorateApplication);
}

export async function createStaffApplication({ birthDate, experience, availability, motivation }, actor) {
  const age = calculateAge(birthDate);
  if (age == null) throw applicationError('valid_birth_date_required');
  if (age < config.staff.minimumAge) throw applicationError('staff_age_requirement_not_met', 403);

  const joinedAt = normalizeDate(actor?.discordJoinedAt);
  const guildDays = guildDaysSince(joinedAt);
  if (guildDays == null) throw applicationError('discord_join_date_unavailable', 409);
  if (guildDays < config.staff.minimumGuildDays) throw applicationError('staff_guild_time_requirement_not_met', 403);

  const existing = await get(`SELECT id FROM staff_applications WHERE applicant_user_id=? AND status='pending' LIMIT 1`, [actor?.id]);
  if (existing) throw applicationError('staff_application_already_pending', 409);

  const result = await run(`INSERT INTO staff_applications
    (applicant_user_id, applicant_label, age_at_submission, discord_joined_at, guild_days_at_submission, experience, availability, motivation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    actor.id,
    actorLabel(actor),
    age,
    mysqlDate(joinedAt),
    guildDays,
    String(experience || '').trim(),
    String(availability || '').trim(),
    String(motivation || '').trim()
  ]);
  await audit({
    action: 'staff_application.create',
    actorUserId: actor.id,
    actorLabel: actorLabel(actor),
    targetType: 'staff_application',
    targetId: result.insertId,
    data: { age, guildDays }
  });
  let application = await getStaffApplication(result.insertId);
  try {
    await deliverAndRecord({
      table: 'staff_applications',
      id: result.insertId,
      discordId: actor?.discordId || application?.applicant_discord_id,
      message: applicationConfirmation(application)
    });
    application = await getStaffApplication(result.insertId);
  } catch (error) { console.warn('Could not record Discord staff-application delivery:', error.message); }
  try { await notifyModerators(application, actor); }
  catch (error) { console.warn('Could not create staff-application notifications:', error.message); }
  return application;
}

export async function listPendingStaffApplications({ search = '', page = 1, limit = 15 } = {}) {
  const cleanSearch = String(search || '').trim().slice(0, 120);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 15, 15));
  const requestedPage = Math.max(1, Number(page) || 1);
  const where = [`a.status='pending'`];
  const params = [];
  if (cleanSearch) {
    const like = `%${cleanSearch}%`;
    where.push(`(
      CAST(a.id AS CHAR) LIKE ?
      OR LOWER(a.applicant_label) LIKE LOWER(?)
      OR LOWER(COALESCE(applicant.username, '')) LIKE LOWER(?)
      OR LOWER(a.experience) LIKE LOWER(?)
      OR LOWER(a.motivation) LIKE LOWER(?)
    )`);
    params.push(like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const count = await get(`SELECT COUNT(*) AS total
    FROM staff_applications a
    LEFT JOIN users applicant ON applicant.id = a.applicant_user_id
    WHERE ${whereSql}`, params);
  const total = Number(count?.total) || 0;
  const totalPages = total ? Math.ceil(total / safeLimit) : 0;
  const currentPage = totalPages ? Math.min(requestedPage, totalPages) : 1;
  const offset = (currentPage - 1) * safeLimit;
  const rows = total
    ? await all(`${APPLICATION_SELECT} WHERE ${whereSql} ORDER BY a.created_at ASC LIMIT ${safeLimit} OFFSET ${offset}`, params)
    : [];
  return {
    applications: rows.map(decorateApplication),
    page: currentPage,
    limit: safeLimit,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    search: cleanSearch
  };
}

export async function decideStaffApplication(id, decision, reason, actor) {
  const application = await getStaffApplication(id);
  if (!application) return null;
  if (application.status !== 'pending') throw applicationError('staff_application_already_decided', 409);
  if (Number(application.applicant_user_id) === Number(actor?.id)) throw applicationError('cannot_decide_own_staff_application', 403);
  const cleanDecision = String(decision || '').toLowerCase();
  if (!['approve', 'deny'].includes(cleanDecision)) throw applicationError('invalid_staff_application_decision');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw applicationError('decision_reason_required');
  const label = actorLabel(actor);
  const status = cleanDecision === 'approve' ? 'approved' : 'denied';
  const result = await run(`UPDATE staff_applications
    SET status=?, reviewed_by_user_id=?, reviewed_by_label=?, reviewed_at=UTC_TIMESTAMP(), review_reason=?
    WHERE id=? AND status='pending'`, [status, actor.id, label, cleanReason, id]);
  if (!result.affectedRows) throw applicationError('staff_application_already_decided', 409);
  await audit({
    action: `staff_application.${cleanDecision}`,
    actorUserId: actor.id,
    actorLabel: label,
    targetType: 'staff_application',
    targetId: id,
    data: { reason: cleanReason }
  });
  try {
    await createNotification({
      userId: application.applicant_user_id,
      type: `staff_application_${cleanDecision}`,
      title: cleanDecision === 'approve' ? 'Staff application approved' : 'Staff application denied',
      body: cleanDecision === 'approve'
        ? `Your staff application was approved by ${label}. A server administrator will assign the Discord role separately.`
        : `Your staff application was denied by ${label}: ${cleanReason}`,
      link: '/staff-applications',
      metadata: { applicationId: application.id, decision: cleanDecision }
    });
  } catch (error) { console.warn('Could not create staff-application decision notification:', error.message); }
  try {
    await deliverAndRecord({
      table: 'staff_applications',
      id,
      discordId: application.applicant_discord_id,
      message: applicationDecisionMessage(application, cleanDecision, label, cleanReason)
    });
  } catch (error) { console.warn('Could not record Discord staff-decision delivery:', error.message); }
  return getStaffApplication(id);
}
