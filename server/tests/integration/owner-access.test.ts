import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { enforceSingleAdministrator } from '../../src/auth/ownerAccess.js';
import { hashPassword } from '../../src/auth/password.js';
import { users } from '../../src/db/schema.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig } from '../setup/app.js';
import { withTestDb } from '../setup/db.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

async function login(email: string, password: string) {
  const response = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, password },
  });
  return `${response.cookies[0]!.name}=${response.cookies[0]!.value}`;
}

describe('política de administrador único', () => {
  it('promove somente o proprietário e limpa os privilégios das outras contas', async () => {
    await t.db.insert(users).values([
      {
        email: 'FelipeDaige@gmail.com', name: 'Felipe', passwordHash: 'h',
        role: 'gerente', permissions: ['pack.edit'], status: 'active',
      },
      {
        email: 'outro-admin@example.com', name: 'Outro', passwordHash: 'h',
        role: 'admin', permissions: ['pack.publish'], status: 'active',
      },
    ]);

    expect(await enforceSingleAdministrator(t.db, config.OWNER_ADMIN_EMAIL)).toBe(true);

    const [owner] = await t.db.select().from(users)
      .where(eq(users.email, 'FelipeDaige@gmail.com'));
    const [other] = await t.db.select().from(users)
      .where(eq(users.email, 'outro-admin@example.com'));
    expect(owner!.role).toBe('admin');
    expect(owner!.permissions).toEqual([]);
    expect(other!.role).toBe('gerente');
    expect(other!.permissions).toEqual([]);
  });

  it('recusa operações de gestão para outro e-mail, mesmo gravado como admin', async () => {
    const password = 'senha-de-teste-123';
    await t.db.insert(users).values({
      email: 'outro-admin@example.com', name: 'Outro', passwordHash: await hashPassword(password),
      role: 'admin', permissions: [], status: 'active',
    });
    const cookie = await login('outro-admin@example.com', password);

    const response = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'negado', name: 'Negado', authorName: 'Teste' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('autoriza o proprietário pela identidade, sem depender de permissões gravadas', async () => {
    const password = 'senha-de-teste-123';
    await t.db.insert(users).values({
      email: config.OWNER_ADMIN_EMAIL, name: 'Felipe', passwordHash: await hashPassword(password),
      role: 'gerente', permissions: [], status: 'active',
    });
    const cookie = await login(config.OWNER_ADMIN_EMAIL, password);

    const response = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'permitido', name: 'Permitido', authorName: 'Teste' },
    });
    expect(response.statusCode).toBe(201);
  });
});
