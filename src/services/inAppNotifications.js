import { all, get, run } from '../db/database.js';

function parseMetadata(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return { raw: value }; }
}

export async function createNotification({ userId, type, title, body, link = null, metadata = {} }) {
  if (!userId) return null;
  const result = await run(`INSERT INTO user_notifications
    (user_id, type, title, body, link, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    userId,
    type,
    title,
    body,
    link,
    JSON.stringify(metadata || {})
  ]);
  return result.insertId;
}

export async function listNotifications(userId, limit = 30) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  const rows = await all(`SELECT id, type, title, body, link, metadata_json, read_at, created_at
    FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ${safeLimit}`, [userId]);
  const unread = await get('SELECT COUNT(*) AS count FROM user_notifications WHERE user_id=? AND read_at IS NULL', [userId]);
  return {
    unreadCount: Number(unread?.count || 0),
    notifications: rows.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) }))
  };
}

export async function markNotificationRead(id, userId) {
  const result = await run('UPDATE user_notifications SET read_at=COALESCE(read_at, UTC_TIMESTAMP()) WHERE id=? AND user_id=?', [id, userId]);
  return result.affectedRows > 0;
}

export async function markAllNotificationsRead(userId) {
  const result = await run('UPDATE user_notifications SET read_at=UTC_TIMESTAMP() WHERE user_id=? AND read_at IS NULL', [userId]);
  return result.affectedRows;
}
