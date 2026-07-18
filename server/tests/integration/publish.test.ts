import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig, criarELogarComApp, criarPackPublicavelComApp } from '../setup/app.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;
let storage: ReturnType<typeof createMemoryStorage>;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackPublicavel = criarPackPublicavelComApp(t.db, () => app);

beforeEach(async () => {
  storage = createMemoryStorage();
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage });
  await app.ready();
});

describe('POST /publish', () => {
  it('grava o manifesto no storage e registra a versão', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie);

    const res = await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(1);

    const bytes = await storage.get('catalog/v1.json');
    expect(bytes).not.toBeNull();
    expect(JSON.parse(bytes!.toString()).version).toBe(1);
  });

  it('atualiza o ponteiro da versão corrente', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie);
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    const ponteiro = JSON.parse((await storage.get('catalog/current.json'))!.toString());
    expect(ponteiro.version).toBe(1);
  });

  it('incrementa a versão e nunca reescreve a anterior', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie);
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    const v1 = await storage.get('catalog/v1.json');
    const segunda = await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    expect(segunda.json().version).toBe(2);
    expect(await storage.get('catalog/v1.json')).toEqual(v1);
  });

  it('recusa gerente sem pack.publish com 403', async () => {
    const admin = await criarELogar('admin');
    await criarPackPublicavel(admin);
    const cookie = await criarELogar('gerente', ['pack.edit', 'sticker.import']);
    const res = await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'POST', url: '/publish' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /publish/rollback', () => {
  it('devolve o ponteiro para a versão anterior sem apagar nada', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie);
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });

    const res = await app.inject({
      method: 'POST', url: '/publish/rollback', headers: { cookie }, payload: { version: 1 },
    });
    expect(res.statusCode).toBe(200);
    const ponteiro = JSON.parse((await storage.get('catalog/current.json'))!.toString());
    expect(ponteiro.version).toBe(1);
    expect(await storage.get('catalog/v2.json')).not.toBeNull();
  });

  it('recusa versão inexistente', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({
      method: 'POST', url: '/publish/rollback', headers: { cookie }, payload: { version: 99 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('recusa gerente sem pack.publish com 403', async () => {
    const admin = await criarELogar('admin');
    await criarPackPublicavel(admin);
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie: admin } });
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({
      method: 'POST', url: '/publish/rollback', headers: { cookie }, payload: { version: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'POST', url: '/publish/rollback', payload: { version: 1 } });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /publish/versions', () => {
  it('lista versões publicadas da mais recente para a mais antiga', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie);
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });
    await app.inject({ method: 'POST', url: '/publish', headers: { cookie } });

    const res = await app.inject({ method: 'GET', url: '/publish/versions', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const versoes = res.json() as Array<{ version: number }>;
    expect(versoes.map((v) => v.version)).toEqual([2, 1]);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/publish/versions' });
    expect(res.statusCode).toBe(401);
  });
});
