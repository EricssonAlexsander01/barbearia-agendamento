import { nowIso } from './time.js';

export function auditStatement(db, { actorType = 'SYSTEM', actorId = null, action, entityType, entityId = null, reason = null, requestId = null, after = null }) {
  // Never pass customer name, full phone, password, token, cookie, or credential data here.
  const safeAfter = after ? JSON.stringify(after) : null;
  return db.prepare(`INSERT INTO audit_logs (id, occurred_at, actor_type, actor_id, action, entity_type, entity_id, after_json, reason, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), nowIso(), actorType, actorId, action, entityType, entityId, safeAfter, reason, requestId);
}
