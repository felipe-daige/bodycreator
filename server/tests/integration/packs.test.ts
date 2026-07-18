import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import FormData from 'form-data';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import {
  buildTestConfig, criarELogarComApp, criarPackComCategoriaComApp, criarPackPublicavelComApp,
} from '../setup/app.js';
import { pngComAlfa, pngSemAlfa } from '../fixtures/make-fixtures.js';
import { packs } from '../../src/db/schema.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;
let storage: ReturnType<typeof createMemoryStorage>;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackComCategoria = criarPackComCategoriaComApp(() => app);
const criarPackPublicavel = criarPackPublicavelComApp(t.db, () => app);

beforeEach(async () => {
  storage = createMemoryStorage();
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage });
  await app.ready();
});

async function subirFigurinha(cookie: string, packId: string, categoryId: string, id: string) {
  const form = new FormData();
  form.append('id', id);
  form.append('name', 'Figurinha de teste');
  form.append('categoryId', categoryId);
  form.append('tags', JSON.stringify([]));
  form.append('file', await pngComAlfa(), { filename: `${id}.png`, contentType: 'image/png' });
  return app.inject({
    method: 'POST', url: `/packs/${packId}/stickers`,
    headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
  });
}

async function subirCapa(cookie: string, packId: string, buffer: Buffer) {
  const form = new FormData();
  form.append('file', buffer, { filename: 'cover.png', contentType: 'image/png' });
  return app.inject({
    method: 'POST', url: `/packs/${packId}/cover`,
    headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
  });
}

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

describe('POST /packs/:id/publish', () => {
  it('publica pacote completo (com figurinha e capa)', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackPublicavel(cookie);

    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/publish`, headers: { cookie } });
    expect(res.statusCode).toBe(200);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.status).toBe('published');
    expect(pack!.publishedAt).not.toBeNull();
  });

  it('recusa publicar pacote sem nenhuma figurinha, com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);

    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/publish`, headers: { cookie } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/figurinha/i);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.status).toBe('draft');
  });

  it('recusa publicar pacote sem capa, com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const upload = await subirFigurinha(cookie, packId, categoryId, 'com-figurinha-sem-capa');
    expect(upload.statusCode).toBe(201);

    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/publish`, headers: { cookie } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/capa/i);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.status).toBe('draft');
  });

  it('recusa gerente sem pack.publish com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(admin);
    const cookie = await criarELogar('gerente', ['pack.edit', 'sticker.import']);
    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/publish`, headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(admin);
    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/publish` });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /packs/:id/unpublish', () => {
  it('devolve o pacote publicado para draft', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackPublicavel(cookie);

    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/unpublish`, headers: { cookie } });
    expect(res.statusCode).toBe(200);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.status).toBe('draft');
  });

  it('recusa gerente sem pack.publish com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackPublicavel(admin);
    const cookie = await criarELogar('gerente', ['pack.edit']);
    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/unpublish`, headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackPublicavel(admin);
    const res = await app.inject({ method: 'POST', url: `/packs/${packId}/unpublish` });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /packs/:id/cover', () => {
  it('grava os bytes idênticos no storage e preenche coverKey', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);
    const original = await pngComAlfa();

    const res = await subirCapa(cookie, packId, original);
    expect(res.statusCode).toBe(200);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.coverKey).toBe(`packs/${pack!.slug}/cover.png`);
    expect(await storage.get(pack!.coverKey!)).toEqual(original);
  });

  it('recusa PNG inválido com a mensagem do validador', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);

    const res = await subirCapa(cookie, packId, await pngSemAlfa());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/transparente/i);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, packId));
    expect(pack!.coverKey).toBeNull();
  });

  it('recusa gerente sem pack.edit com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(admin);
    const cookie = await criarELogar('gerente', ['pack.create']);
    const res = await subirCapa(cookie, packId, await pngComAlfa());
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(admin);
    const form = new FormData();
    form.append('file', await pngComAlfa(), { filename: 'cover.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST', url: `/packs/${packId}/cover`,
      headers: { ...form.getHeaders() }, payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(401);
  });
});
