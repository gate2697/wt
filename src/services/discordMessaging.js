import { run } from '../db/database.js';
import { config } from '../config.js';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_REASON_LENGTH = 240;
const DELIVERY_TABLES = new Set(['unban_requests', 'staff_applications', 'unban_messages']);

function clip(value, length = MAX_REASON_LENGTH) {
  return String(value || '').trim().slice(0, length);
}

function result(status, reason, extra = {}) {
  return {
    ok: status === 'sent',
    status,
    reason: clip(reason),
    ...extra
  };
}

function explainDiscordFailure(statusCode, detail = '') {
  if (statusCode === 401) return 'The site’s Discord bot token was rejected. Ask an administrator to update DISCORD_BOT_TOKEN.';
  if (statusCode === 403) return 'Discord refused the direct message. The member may have disabled direct messages from this server or blocked the bot.';
  if (statusCode === 404) return 'Discord could not find the member or DM channel. The account may have left the server or changed availability.';
  if (statusCode === 429) return 'Discord rate-limited the bot while sending this message. The in-site notification is still available; try again later.';
  if (statusCode >= 500) return `Discord returned a temporary server error (${statusCode}). The in-site notification is still available.`;
  return detail ? `Discord could not deliver the message (${statusCode}): ${clip(detail, 160)}` : `Discord could not deliver the message (${statusCode}).`;
}

async function discordJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10_000),
    headers: {
      accept: 'application/json',
      'user-agent': `CB-Ban-Panel/1.0 (${config.publicBaseUrl || 'https://golf-cb.xyz'})`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { response, data, text };
}

/**
 * Send a DM through the configured Discord bot and return a safe, user-facing
 * delivery result. Network/token/permission failures never throw so creating
 * an appeal or application cannot be lost because Discord is unavailable.
 */
export async function sendDiscordDirectMessage(discordId, message) {
  if (!config.discord.botToken) return result('not_configured', 'Discord bot messaging is not configured on the server.');
  if (!discordId) return result('unavailable', 'Your Discord ID was not available to the site, so it could not open a DM.');
  const headers = { authorization: `Bot ${config.discord.botToken}`, 'content-type': 'application/json' };
  try {
    const channelResult = await discordJson(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST', headers, body: JSON.stringify({ recipient_id: String(discordId) })
    });
    if (!channelResult.response.ok) {
      return result(channelResult.response.status === 403 ? 'blocked' : 'failed', explainDiscordFailure(channelResult.response.status, channelResult.data?.message || channelResult.text));
    }
    const channelId = channelResult.data?.id;
    if (!channelId) return result('failed', 'Discord did not return a DM channel for this member.');
    const messageResult = await discordJson(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ content: String(message || '').slice(0, 1900) })
    });
    if (!messageResult.response.ok) {
      return result(messageResult.response.status === 403 ? 'blocked' : 'failed', explainDiscordFailure(messageResult.response.status, messageResult.data?.message || messageResult.text));
    }
    return result('sent', 'Sent through the CB Discord bot.', { messageId: messageResult.data?.id || null });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'Discord did not respond before the delivery timed out. The in-site notification is still available.'
      : 'The site could not reach Discord. The in-site notification is still available.';
    return result('failed', reason);
  }
}

export function discordDeliveryMessage(status, reason) {
  if (status === 'sent') return reason || 'Sent through the CB Discord bot.';
  return reason || 'Discord delivery was not completed; check the in-site notification inbox.';
}

/** Persist the latest Discord delivery result on a request/application/message. */
export async function deliverAndRecord({ table, id, discordId, message }) {
  if (!DELIVERY_TABLES.has(table)) throw new Error('invalid_discord_delivery_table');
  const delivery = await sendDiscordDirectMessage(discordId, message);
  await run(`UPDATE ${table}
    SET discord_delivery_status=?, discord_delivery_reason=?, discord_delivery_at=UTC_TIMESTAMP(), discord_message_id=?
    WHERE id=?`, [delivery.status, delivery.reason, delivery.messageId || null, id]);
  return delivery;
}

