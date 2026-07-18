import { describe, it, expect } from 'vitest';
import { withTestDb } from '../setup/db.js';
import { recordAudit } from '../../src/audit.js';
import { users, auditLog } from '../../src/db/schema.js';

const t = withTestDb();

describe('recordAudit', () => {
  it('grava a ação com autor e payload', async () => {
    const [u] = await t.db.insert(users).values({
      email: 'a@x.com', name: 'A', passwordHash: 'h', role: 'admin', status: 'active',
    }).returning();

    await recordAudit(t.db, {
      actorId: u!.id, action: 'pack.publish', entityType: 'pack',
      entityId: 'pack-123', payload: { version: 4 },
    });

    const rows = await t.db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('pack.publish');
    expect(rows[0]!.payload).toEqual({ version: 4 });
  });

  it('aceita autor nulo para ações do sistema', async () => {
    await recordAudit(t.db, { actorId: null, action: 'seed.admin', entityType: 'user' });
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it('nunca deixa senha vazar para o payload', async () => {
    await recordAudit(t.db, {
      actorId: null, action: 'user.update', entityType: 'user',
      payload: { password: 'segredo', passwordHash: 'argon2...', name: 'Ana' },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(JSON.stringify(row!.payload)).not.toContain('segredo');
    expect(JSON.stringify(row!.payload)).not.toContain('argon2');
    expect(row!.payload).toEqual({ name: 'Ana' });
  });
});
