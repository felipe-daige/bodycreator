import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig } from '../setup/app.js';
import { hashPassword } from '../../src/auth/password.js';
import { users } from '../../src/db/schema.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

async function criarComSenhaSemeada() {
  await t.db.insert(users).values({
    email: 'semeada@exemplo.com', name: 'Conta Semeada',
    passwordHash: await hashPassword('senha-semeada-123'),
    role: 'admin', permissions: [], status: 'active', mustChangePassword: true,
  });
  const res = await app.inject({
    method: 'POST', url: '/auth/login',
    payload: { email: 'semeada@exemplo.com', password: 'senha-semeada-123' },
  });
  return `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
}

// A senha semeada é tratada como comprometida (spec). O React já bloqueia a
// navegação, mas isso é só UX — a API precisa impor a mesma regra, senão a
// conta com senha semeada continua plenamente utilizável para sempre via
// chamada direta.
describe('mustChangePassword imposto no servidor', () => {
  it('recusa qualquer rota fora da lista mínima com 403 em pt-BR', async () => {
    const cookie = await criarComSenhaSemeada();
    const res = await app.inject({ method: 'GET', url: '/packs', headers: { cookie } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/troque sua senha/i);
  });

  it('permite GET /auth/me mesmo com mustChangePassword', async () => {
    const cookie = await criarComSenhaSemeada();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it('permite trocar a senha, e depois disso as outras rotas voltam a funcionar', async () => {
    const cookie = await criarComSenhaSemeada();

    const troca = await app.inject({
      method: 'POST', url: '/auth/change-password', headers: { cookie },
      payload: { currentPassword: 'senha-semeada-123', newPassword: 'senha-nova-de-verdade-123' },
    });
    expect(troca.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/packs', headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });
});
