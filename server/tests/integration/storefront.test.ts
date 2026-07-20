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
const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackPublicavel = criarPackPublicavelComApp(t.db, () => app);

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

describe('GET/PUT /storefront', () => {
  it('GET devolve default vazio quando nunca salvo', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'GET', url: '/storefront', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hero: null, sections: [] });
  });

  it('PUT persiste e GET reflete', async () => {
    const cookie = await criarELogar('admin');
    await criarPackPublicavel(cookie, 'pack-a');
    const payload = { hero: 'pack-a', sections: [{ id: 's1', title: 'Novidades', packs: ['pack-a'] }] };
    const put = await app.inject({ method: 'PUT', url: '/storefront', headers: { cookie }, payload });
    expect(put.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/storefront', headers: { cookie } });
    expect(get.json()).toEqual(payload);
  });

  it('rejeita título vazio', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'PUT', url: '/storefront', headers: { cookie },
      payload: { hero: null, sections: [{ id: 's1', title: '   ', packs: [] }] } });
    expect(res.statusCode).toBe(400);
  });

  it('rejeita id de seção duplicado', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'PUT', url: '/storefront', headers: { cookie },
      payload: { hero: null, sections: [
        { id: 's1', title: 'A', packs: [] }, { id: 's1', title: 'B', packs: [] },
      ] } });
    expect(res.statusCode).toBe(400);
  });

  it('rejeita slug inexistente', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({ method: 'PUT', url: '/storefront', headers: { cookie },
      payload: { hero: 'fantasma', sections: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('recusa gerente sem pack.publish com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({ method: 'GET', url: '/storefront', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/storefront' });
    expect(res.statusCode).toBe(401);
  });
});
