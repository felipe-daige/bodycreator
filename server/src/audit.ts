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
  const visited = new WeakSet<object>();

  function scrubValue(value: unknown): unknown {
    // Valores primitivos passam intactos
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Datas são tratadas como valores, não como objetos a varrer
    if (value instanceof Date) {
      return value;
    }

    // Protege contra referência circular
    if (typeof value === 'object') {
      if (visited.has(value as object)) {
        return undefined;
      }
      visited.add(value as object);
    }

    // Arrays: processa cada elemento recursivamente
    if (Array.isArray(value)) {
      return value.map((item) => scrubValue(item));
    }

    // Objetos: remove chaves sensíveis e processa valores recursivamente
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (REDACTED_KEYS.includes(k)) continue;
        out[k] = scrubValue(v);
      }
      return out;
    }

    return value;
  }

  return scrubValue(payload) as Record<string, unknown>;
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
