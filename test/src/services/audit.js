import { run } from '../db/database.js';

export async function audit({ action, actorUserId = null, actorLabel = null, targetType = null, targetId = null, data = {} }) {
  await run(`INSERT INTO audit_log (action, actor_user_id, actor_label, target_type, target_id, data_json)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [action, actorUserId || null, actorLabel || null, targetType || null, targetId ? String(targetId) : null, JSON.stringify(data)]);
}
