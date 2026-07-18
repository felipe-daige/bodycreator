import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { hashPassword } from '../../src/auth/password.js';
import { createFakeMailer } from '../../src/email/send.js';
import { users, invites } from '../../src/db/schema.js';

const t = withTestDb();
let app: FastifyInstance;
let mailer: ReturnType<typeof createFakeMailer>;

const config = loadConfig({
  NODE_ENV: 'test', DATABASE_URL: t.url, SESSION_SECRET: 's'.repeat(32),
  PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
  R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x', R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
  MAIL_FROM: 'nao-responda@exemplo.com',
});

beforeEach(async () => {
  mailer = createFakeMailer();
  app = buildApp({ config, db: t.db, mailer });
  await app.ready();
});

async function criarELogar(role: 'admin' | 'gerente', permissions: string[] = []) {
  const email = `${role}-${Math.random().toString(36).slice(2)}@x.com`;
  await t.db.insert(users).values({
    email, name: role, passwordHash: await hashPassword('senha-de-teste-123'),
    role, permissions, status: 'active',
  });
  const res = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, password: 'senha-de-teste-123' },
  });
  return `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
}

describe('POST /invites', () => {
  it('admin convida e o e-mail sai com o link', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'nova@exemplo.com', role: 'gerente', permissions: ['pack.edit'] },
    });
    expect(res.statusCode).toBe(201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('nova@exemplo.com');
    expect(mailer.sent[0]!.text).toContain('/convite?token=');
  });

  it('grava apenas o hash do token, nunca o token', async () => {
    const cookie = await criarELogar('admin');
    await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'nova@exemplo.com', role: 'gerente', permissions: [] },
    });
    const [row] = await t.db.select().from(invites);
    const token = mailer.sent[0]!.text.match(/token=([a-f0-9]+)/)![1]!;
    expect(row!.tokenHash).not.toBe(token);
    expect(row!.tokenHash).toHaveLength(64);
  });

  it('recusa gerente sem user.manage com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'x@exemplo.com', role: 'gerente', permissions: [] },
    });
    expect(res.statusCode).toBe(403);
    expect(mailer.sent).toHaveLength(0);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({
      method: 'POST', url: '/invites',
      payload: { email: 'x@exemplo.com', role: 'gerente', permissions: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('recusa conceder user.manage a gerente', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'x@exemplo.com', role: 'gerente', permissions: ['user.manage'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/user\.manage/);
  });

  it('recusa e-mail que já tem conta', async () => {
    const cookie = await criarELogar('admin');
    await t.db.insert(users).values({
      email: 'existe@exemplo.com', name: 'X', passwordHash: 'h', role: 'gerente', status: 'active',
    });
    const res = await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'existe@exemplo.com', role: 'gerente', permissions: [] },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /invites/:id/resend', () => {
  async function convidar(cookie: string) {
    const res = await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'renovar@exemplo.com', role: 'gerente', permissions: [] },
    });
    return res.json().id as string;
  }

  it('gera um novo token e invalida o anterior', async () => {
    const cookie = await criarELogar('admin');
    const inviteId = await convidar(cookie);
    const tokenAntigo = mailer.sent.at(-1)!.text.match(/token=([a-f0-9]+)/)![1]!;

    const res = await app.inject({
      method: 'POST', url: `/invites/${inviteId}/resend`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(2);
    const tokenNovo = mailer.sent.at(-1)!.text.match(/token=([a-f0-9]+)/)![1]!;
    expect(tokenNovo).not.toBe(tokenAntigo);

    const usoAntigo = await app.inject({
      method: 'POST', url: '/invites/accept',
      payload: { token: tokenAntigo, name: 'No', password: 'senha-nova-1234' },
    });
    expect(usoAntigo.statusCode).toBe(400);
  });

  it('recusa gerente sem user.manage com 403', async () => {
    const cookieAdmin = await criarELogar('admin');
    const inviteId = await convidar(cookieAdmin);
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({
      method: 'POST', url: `/invites/${inviteId}/resend`, headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const cookieAdmin = await criarELogar('admin');
    const inviteId = await convidar(cookieAdmin);
    const res = await app.inject({ method: 'POST', url: `/invites/${inviteId}/resend` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /invites/accept', () => {
  async function convidar() {
    const cookie = await criarELogar('admin');
    await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'nova@exemplo.com', role: 'gerente', permissions: ['pack.edit'] },
    });
    return mailer.sent.at(-1)!.text.match(/token=([a-f0-9]+)/)![1]!;
  }

  it('devolve o e-mail do convite para um token válido', async () => {
    const token = await convidar();
    const res = await app.inject({ method: 'GET', url: `/invites/accept?token=${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('nova@exemplo.com');
  });

  it('recusa token inventado', async () => {
    const res = await app.inject({ method: 'GET', url: `/invites/accept?token=${'f'.repeat(64)}` });
    expect(res.statusCode).toBe(400);
  });

  it('recusa token expirado', async () => {
    const token = await convidar();
    await t.db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await app.inject({ method: 'GET', url: `/invites/accept?token=${token}` });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /invites/accept', () => {
  async function convidar() {
    const cookie = await criarELogar('admin');
    await app.inject({
      method: 'POST', url: '/invites', headers: { cookie },
      payload: { email: 'nova@exemplo.com', role: 'gerente', permissions: ['pack.edit'] },
    });
    return mailer.sent.at(-1)!.text.match(/token=([a-f0-9]+)/)![1]!;
  }

  it('cria a conta ativa com as permissões do convite', async () => {
    const token = await convidar();
    const res = await app.inject({
      method: 'POST', url: '/invites/accept',
      payload: { token, name: 'Nova Gerente', password: 'senha-nova-1234' },
    });
    expect(res.statusCode).toBe(201);
    const [u] = await t.db.select().from(users).where(eq(users.email, 'nova@exemplo.com'));
    expect(u!.status).toBe('active');
    expect(u!.permissions).toEqual(['pack.edit']);
  });

  it('recusa o mesmo token duas vezes', async () => {
    const token = await convidar();
    const payload = { token, name: 'N', password: 'senha-nova-1234' };
    await app.inject({ method: 'POST', url: '/invites/accept', payload });
    const res = await app.inject({ method: 'POST', url: '/invites/accept', payload });
    expect(res.statusCode).toBe(400);
  });

  it('recusa token expirado', async () => {
    const token = await convidar();
    await t.db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await app.inject({
      method: 'POST', url: '/invites/accept',
      // Nome com 2+ caracteres: precisa passar pela validação do schema para
      // que a checagem de expiração seja de fato exercitada.
      payload: { token, name: 'No', password: 'senha-nova-1234' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/expirou/i);
  });

  it('recusa token inventado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/invites/accept',
      payload: { token: 'f'.repeat(64), name: 'N', password: 'senha-nova-1234' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('recusa senha curta', async () => {
    const token = await convidar();
    const res = await app.inject({
      method: 'POST', url: '/invites/accept',
      payload: { token, name: 'N', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });
});
