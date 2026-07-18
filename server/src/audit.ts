import type { Db } from './db/index.js';
import { auditLog } from './db/schema.js';

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

const REDACTED_KEYS = ['password', 'newPassword', 'currentPassword', 'passwordHash', 'token', 'tokenHash'];

function scrub(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (REDACTED_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: scrub(entry.payload ?? {}),
  });
}
