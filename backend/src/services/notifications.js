import nodemailer from 'nodemailer';
import { db } from '../db/database.js';
import { config } from '../config.js';

function formatDuration(ban) {
  if (!ban.ends_at) return 'Permanent / no scheduled end time';
  const ms = new Date(ban.ends_at).getTime() - new Date(ban.starts_at).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return `Until ${ban.ends_at}`;
  const hours = Math.round(ms / 36_000) / 100;
  if (hours < 24) return `${hours} hour(s), until ${ban.ends_at}`;
  return `${Math.round((hours / 24) * 100) / 100} day(s), until ${ban.ends_at}`;
}

export function buildBanNotice(ban) {
  const duration = formatDuration(ban);
  const appealText = config.publicBaseUrl ? `\n\nYou can check ban status here: ${config.frontendUrl || config.publicBaseUrl}` : '';
  return {
    subject: `CB ban notice for ${ban.warthunder_username}`,
    text: `You have been banned from CB.\n\nWar Thunder account: ${ban.warthunder_username}${ban.warthunder_id ? ` (${ban.warthunder_id})` : ''}\nReason: ${ban.reason}\nBan length: ${duration}\nStarts: ${ban.starts_at}\nEnds: ${ban.ends_at || 'No scheduled end time'}${appealText}`,
    discord: `You have been banned from CB.\n\n**War Thunder account:** ${ban.warthunder_username}${ban.warthunder_id ? ` (${ban.warthunder_id})` : ''}\n**Reason:** ${ban.reason}\n**Ban length:** ${duration}\n**Starts:** ${ban.starts_at}\n**Ends:** ${ban.ends_at || 'No scheduled end time'}${appealText}`
  };
}

function getLinkedUsersForBan(ban) {
  if (!ban.warthunder_id && !ban.warthunder_username) return [];
  return db.prepare(`
    SELECT DISTINCT users.*
    FROM users
    JOIN player_links ON player_links.user_id = users.id
    WHERE player_links.service_name = 'warthunder'
      AND (
        (? IS NOT NULL AND player_links.external_id = ?)
        OR lower(player_links.external_username) = lower(?)
      )
  `).all(ban.warthunder_id || null, ban.warthunder_id || null, ban.warthunder_username || '');
}

async function sendDiscordDm(discordId, message) {
  if (!config.discord.botToken || !discordId) return { skipped: true, reason: 'missing_discord_bot_token_or_id' };
  const headers = { authorization: `Bot ${config.discord.botToken}`, 'content-type': 'application/json' };
  const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST', headers, body: JSON.stringify({ recipient_id: String(discordId) })
  });
  if (!channelRes.ok) return { ok: false, error: `dm_channel_failed_${channelRes.status}` };
  const channel = await channelRes.json();
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: message.slice(0, 1900) })
  });
  if (!msgRes.ok) return { ok: false, error: `dm_send_failed_${msgRes.status}` };
  return { ok: true };
}

async function sendEmail(to, subject, text) {
  const smtp = config.notifications.smtp;
  if (!to || !smtp.host || !smtp.user || !smtp.pass || !config.notifications.fromEmail) {
    return { skipped: true, reason: 'missing_email_or_smtp_config' };
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
  await transporter.sendMail({ from: config.notifications.fromEmail, to, subject, text });
  return { ok: true };
}

export async function notifyLinkedUsersOfBan(ban) {
  const users = getLinkedUsersForBan(ban);
  const notice = buildBanNotice(ban);
  const results = [];
  for (const user of users) {
    const entry = { userId: user.id, discordId: user.discord_id, email: user.email || null };
    try { entry.discord = await sendDiscordDm(user.discord_id, notice.discord); }
    catch (err) { entry.discord = { ok: false, error: err.message }; }
    try { entry.emailResult = await sendEmail(user.email, notice.subject, notice.text); }
    catch (err) { entry.emailResult = { ok: false, error: err.message }; }
    db.prepare(`INSERT INTO notification_log (ban_id, user_id, discord_result_json, email_result_json)
      VALUES (?, ?, ?, ?)`).run(ban.id, user.id, JSON.stringify(entry.discord), JSON.stringify(entry.emailResult));
    results.push(entry);
  }
  return { linkedUsers: users.length, results };
}
