import { db } from '../db/database.js';

export function audit({ action, actorUserId = null, actorLabel = null, targetType = null, targetId = null, data = {} }) {
  db.prepare(`INSERT INTO audit_log (action, actor_user_id, actor_label, target_type, target_id, data_json)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(action, actorUserId, actorLabel, targetType, targetId ? String(targetId) : null, JSON.stringify(data));
}
