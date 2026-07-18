import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { hashPassword } from '../../src/auth/password.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { users } from '../../src/db/schema.js';

const t = withTestDb();
let app: FastifyInstance;

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: t.url,
  SESSION_SECRET: 's'.repeat(32),
  PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
  R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x', R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
  MAIL_FROM: 'nao-responda@example.com',
});

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

async function criarUsuario(over: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await t.db.insert(users).values({
    email: 'medica@exemplo.com',
    name: 'Médica',
    passwordHash: await hashPassword('senha-correta-123'),
    role: 'gerente',
    permissions: ['pack.edit'],
    status: 'active',
    ...over,
  }).returning();
  return u!;
}

async function logar(email = 'medica@exemplo.com', password = 'senha-correta-123') {
  const res = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, password },
  });
  return { res, cookie: res.cookies[0] ? `${res.cookies[0].name}=${res.cookies[0].value}` : '' };
}

describe('POST /auth/login', () => {
  it('autentica e devolve cookie httpOnly', async () => {
    await criarUsuario();
    const { res } = await logar();
    expect(res.statusCode).toBe(200);
    expect(res.cookies[0]!.httpOnly).toBe(true);
    expect(res.cookies[0]!.sameSite?.toLowerCase()).toBe('lax');
  });

  it('recusa senha errada com mensagem genérica', async () => {
    await criarUsuario();
    const { res } = await logar('medica@exemplo.com', 'chute');
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('E-mail ou senha inválidos.');
  });

  it('devolve a mesma mensagem para e-mail inexistente', async () => {
    const { res } = await logar('ninguem@exemplo.com', 'x');
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('E-mail ou senha inválidos.');
  });

  it('recusa usuário desativado mesmo com a senha certa', async () => {
    await criarUsuario({ status: 'disabled' });
    const { res } = await logar();
    expect(res.statusCode).toBe(401);
  });

  it('nunca devolve o hash da senha', async () => {
    await criarUsuario();
    const { res } = await logar();
    expect(JSON.stringify(res.json())).not.toContain('argon2');
  });
});

describe('GET /auth/me', () => {
  it('recusa sem cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('devolve o usuário logado com as permissões', async () => {
    await criarUsuario();
    const { cookie } = await logar();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('medica@exemplo.com');
    expect(res.json().permissions).toEqual(['pack.edit']);
  });

  it('deixa de funcionar assim que o usuário é desativado', async () => {
    const u = await criarUsuario();
    const { cookie } = await logar();
    await t.db.update(users).set({ status: 'disabled' }).where(eq(users.id, u.id));
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('invalida o cookie', async () => {
    await criarUsuario();
    const { cookie } = await logar();
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: '' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/change-password', () => {
  it('tem rate limit próprio: a 6ª tentativa na janela recebe 429', async () => {
    await criarUsuario();
    const { cookie } = await logar();
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: 'POST', url: '/auth/change-password', headers: { cookie },
        payload: { currentPassword: 'senha-errada', newPassword: 'nova-senha-1234' },
      });
      expect(res.statusCode).toBe(400);
    }
    const bloqueada = await app.inject({
      method: 'POST', url: '/auth/change-password', headers: { cookie },
      payload: { currentPassword: 'senha-errada', newPassword: 'nova-senha-1234' },
    });
    expect(bloqueada.statusCode).toBe(429);
  });
});

describe('bloqueio de login por e-mail', () => {
  // Cada tentativa usa um remoteAddress diferente para provar que o bloqueio
  // é por e-mail, não pelo rate limit de IP da rota (que também existe, mas
  // é um mecanismo separado e não basta atrás de proxy nem contra um
  // atacante que rotaciona IP).
  async function tentarComIp(email: string, password: string, ip: string) {
    return app.inject({
      method: 'POST', url: '/auth/login', payload: { email, password }, remoteAddress: ip,
    });
  }

  it('bloqueia a 11ª tentativa para o mesmo e-mail após 10 falhas, mesmo de IPs diferentes', async () => {
    await criarUsuario();
    for (let i = 0; i < 10; i += 1) {
      const res = await tentarComIp('medica@exemplo.com', 'senha-errada', `10.0.1.${i}`);
      expect(res.statusCode).toBe(401);
    }
    // 11ª tentativa, mesmo com a senha certa: a janela de bloqueio já abriu
    // para este e-mail, então nem chega a consultar o banco.
    const bloqueada = await tentarComIp('medica@exemplo.com', 'senha-correta-123', '10.0.1.99');
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().error).toMatch(/tentativas/i);
  });

  it('não bloqueia um e-mail diferente que não compartilha o balde', async () => {
    await criarUsuario({ email: 'alvo@exemplo.com' });
    await criarUsuario({ email: 'outra@exemplo.com' });
    for (let i = 0; i < 10; i += 1) {
      await tentarComIp('alvo@exemplo.com', 'senha-errada', `10.0.2.${i}`);
    }
    const res = await tentarComIp('outra@exemplo.com', 'senha-correta-123', '10.0.2.99');
    expect(res.statusCode).toBe(200);
  });
});
