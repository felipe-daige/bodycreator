import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { seedAdmin } from '../../src/seed-admin.js';
import { users } from '../../src/db/schema.js';
import { verifyPassword } from '../../src/auth/password.js';

const t = withTestDb();
const params = { email: 'Admin@Exemplo.com', name: 'Admin', password: 'senha-inicial-123' };

describe('seedAdmin', () => {
  it('cria o admin com troca de senha obrigatória', async () => {
    const r = await seedAdmin(t.db, params);
    expect(r.created).toBe(true);
    const [u] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));
    expect(u!.role).toBe('admin');
    expect(u!.status).toBe('active');
    expect(u!.mustChangePassword).toBe(true);
  });

  it('guarda apenas o hash', async () => {
    await seedAdmin(t.db, params);
    const [u] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));
    expect(u!.passwordHash).not.toContain('senha-inicial-123');
    expect(await verifyPassword(u!.passwordHash, 'senha-inicial-123')).toBe(true);
  });

  it('é idempotente: rodar de novo não duplica nem sobrescreve a senha', async () => {
    await seedAdmin(t.db, params);
    const [antes] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));

    const r = await seedAdmin(t.db, { ...params, password: 'outra-senha-totalmente' });
    expect(r.created).toBe(false);

    const todos = await t.db.select().from(users);
    expect(todos).toHaveLength(1);
    expect(todos[0]!.passwordHash).toBe(antes!.passwordHash);
  });
});
