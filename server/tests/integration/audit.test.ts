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

  it('remove password de objeto aninhado', async () => {
    await recordAudit(t.db, {
      actorId: null, action: 'user.update', entityType: 'user',
      payload: { user: { name: 'Ana', password: 'segredo' } },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(row!.payload).toEqual({ user: { name: 'Ana' } });
  });

  it('remove token de aninhamento profundo (3+ níveis)', async () => {
    await recordAudit(t.db, {
      actorId: null, action: 'auth.create', entityType: 'session',
      payload: { session: { data: { metadata: { token: 'super-secret', userId: 'u1' } } } },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(row!.payload).toEqual({ session: { data: { metadata: { userId: 'u1' } } } });
  });

  it('remove password de cada objeto num array', async () => {
    await recordAudit(t.db, {
      actorId: null, action: 'users.bulk', entityType: 'user',
      payload: { usuarios: [{ name: 'A', password: 'x' }, { name: 'B', passwordHash: 'y' }] },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(row!.payload).toEqual({ usuarios: [{ name: 'A' }, { name: 'B' }] });
  });

  it('preserva valores primitivos e datas intactos', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    await recordAudit(t.db, {
      actorId: null, action: 'audit.test', entityType: 'test',
      payload: { count: 42, active: true, nullable: null, date: now, text: 'hello' },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(row!.payload).toEqual({
      count: 42,
      active: true,
      nullable: null,
      date: '2024-01-01T00:00:00.000Z',
      text: 'hello',
    });
  });

  it('não trava em referência circular', async () => {
    const obj: Record<string, unknown> = { name: 'circular' };
    obj.self = obj;
    await recordAudit(t.db, {
      actorId: null, action: 'test.circular', entityType: 'test',
      payload: obj,
    });
    const rows = await t.db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ name: 'circular' });
  });
});
