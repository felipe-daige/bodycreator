import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig, criarELogarComApp, criarPackComCategoriaComApp } from '../setup/app.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackComCategoria = criarPackComCategoriaComApp(() => app);

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

describe('GET /packs', () => {
  it('lista pacotes para qualquer usuário autenticado', async () => {
    const cookie = await criarELogar('admin');
    await criarPackComCategoria(cookie, 'listagem');
    const res = await app.inject({ method: 'GET', url: '/packs', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/packs' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /packs/:id', () => {
  it('devolve o pacote com categorias e figurinhas', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie, 'detalhe');
    const res = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().categories).toHaveLength(1);
    expect(res.json().stickers).toHaveLength(0);
  });

  it('404 quando o pacote não existe', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({
      method: 'GET', url: '/packs/00000000-0000-0000-0000-000000000000', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({
      method: 'GET', url: '/packs/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /packs', () => {
  it('cria pacote em rascunho', async () => {
    const cookie = await criarELogar('admin');
    const res = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'harmonizacao', name: 'Harmonização', authorName: 'Maiara' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('draft');
  });

  it('recusa gerente sem pack.create com 403', async () => {
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'x', name: 'X', authorName: 'Autora Teste' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa slug duplicado', async () => {
    const cookie = await criarELogar('admin');
    const payload = { slug: 'igual', name: 'Igual', authorName: 'Autora Teste' };
    await app.inject({ method: 'POST', url: '/packs', headers: { cookie }, payload });
    const res = await app.inject({ method: 'POST', url: '/packs', headers: { cookie }, payload });
    expect(res.statusCode).toBe(409);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({
      method: 'POST', url: '/packs',
      payload: { slug: 'x', name: 'X', authorName: 'Autora Teste' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /packs/:id', () => {
  it('atualiza o nome do pacote', async () => {
    const cookie = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'renomear', name: 'Nome Antigo', authorName: 'Autora Teste' },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/packs/${criado.json().id}`, headers: { cookie },
      payload: { name: 'Nome Novo' },
    });
    expect(res.statusCode).toBe(200);

    const consulta = await app.inject({
      method: 'GET', url: `/packs/${criado.json().id}`, headers: { cookie },
    });
    expect(consulta.json().name).toBe('Nome Novo');
  });

  it('recusa quem tem pack.create mas não pack.edit', async () => {
    const admin = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie: admin },
      payload: { slug: 'p', name: 'Pacote P', authorName: 'Autora Teste' },
    });
    const cookie = await criarELogar('gerente', ['pack.create']);
    const res = await app.inject({
      method: 'PATCH', url: `/packs/${criado.json().id}`, headers: { cookie },
      payload: { name: 'Outro nome' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie: admin },
      payload: { slug: 'p2', name: 'P2', authorName: 'Autora Teste' },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/packs/${criado.json().id}`,
      payload: { name: 'Outro nome' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /packs/:id/categories', () => {
  it('cria categoria dentro do pacote', async () => {
    const cookie = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: 'com-categoria', name: 'Com Categoria', authorName: 'Autora Teste' },
    });
    const res = await app.inject({
      method: 'POST', url: `/packs/${criado.json().id}/categories`, headers: { cookie },
      payload: { name: 'Rostos' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Rostos');
  });

  it('recusa gerente sem pack.edit com 403', async () => {
    const admin = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie: admin },
      payload: { slug: 'sem-permissao', name: 'Sem Permissão', authorName: 'Autora Teste' },
    });
    const cookie = await criarELogar('gerente', ['pack.create']);
    const res = await app.inject({
      method: 'POST', url: `/packs/${criado.json().id}/categories`, headers: { cookie },
      payload: { name: 'Rostos' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie: admin },
      payload: { slug: 'sem-sessao', name: 'Sem Sessão', authorName: 'Autora Teste' },
    });
    const res = await app.inject({
      method: 'POST', url: `/packs/${criado.json().id}/categories`,
      payload: { name: 'Rostos' },
    });
    expect(res.statusCode).toBe(401);
  });
});
