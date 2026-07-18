import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { hashPassword } from '../../src/auth/password.js';
import { createFakeMailer } from '../../src/email/send.js';
import { users } from '../../src/db/schema.js';

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

describe('GET /users', () => {
  it('lista para quem tem user.manage', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'GET', url: '/users', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('nunca devolve hash de senha', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'GET', url: '/users', headers: { cookie } });
    expect(JSON.stringify(res.json())).not.toContain('argon2');
  });

  it('recusa gerente com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({ method: 'GET', url: '/users', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /users/:id', () => {
  it('altera as permissões do gerente', async () => {
    const cookie = await criarELogar('admin');
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo@x.com', name: 'Alvo', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();

    const res = await app.inject({
      method: 'PATCH', url: `/users/${alvo!.id}`, headers: { cookie },
      payload: { permissions: ['sticker.import', 'pack.create'] },
    });
    expect(res.statusCode).toBe(200);
    const [depois] = await t.db.select().from(users).where(eq(users.id, alvo!.id));
    expect(depois!.permissions).toEqual(['sticker.import', 'pack.create']);
  });

  it('recusa conceder user.manage a gerente', async () => {
    const cookie = await criarELogar('admin');
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo2@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'PATCH', url: `/users/${alvo!.id}`, headers: { cookie },
      payload: { permissions: ['user.manage'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('recusa gerente sem user.manage com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo4@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'PATCH', url: `/users/${alvo!.id}`, headers: { cookie },
      payload: { permissions: ['pack.edit'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo5@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'PATCH', url: `/users/${alvo!.id}`,
      payload: { permissions: ['pack.edit'] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /users/:id/disable', () => {
  it('desativa o usuário', async () => {
    const cookie = await criarELogar('admin');
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo3@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'POST', url: `/users/${alvo!.id}/disable`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const [depois] = await t.db.select().from(users).where(eq(users.id, alvo!.id));
    expect(depois!.status).toBe('disabled');
  });

  it('impede o admin de desativar a si mesmo', async () => {
    const cookie = await criarELogar('admin');
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    const res = await app.inject({
      method: 'POST', url: `/users/${me.json().id}/disable`, headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('recusa gerente sem user.manage com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo6@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'POST', url: `/users/${alvo!.id}/disable`, headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const [alvo] = await t.db.insert(users).values({
      email: 'alvo7@x.com', name: 'A', passwordHash: 'h',
      role: 'gerente', permissions: [], status: 'active',
    }).returning();
    const res = await app.inject({
      method: 'POST', url: `/users/${alvo!.id}/disable`,
    });
    expect(res.statusCode).toBe(401);
  });
});
