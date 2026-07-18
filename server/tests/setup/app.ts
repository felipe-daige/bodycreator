import type { FastifyInstance } from 'fastify';
import { loadConfig, type Config } from '../../src/config.js';
import { hashPassword } from '../../src/auth/password.js';
import { users } from '../../src/db/schema.js';
import type { Db } from '../../src/db/index.js';

// Bloco de config reaproveitado dos testes de convites (Task 7): mesmos
// valores fictícios, apenas a DATABASE_URL muda conforme a base de teste
// usada por cada arquivo (todas apontam para o mesmo Postgres de teste).
export function buildTestConfig(databaseUrl: string): Config {
  return loadConfig({
    NODE_ENV: 'test', DATABASE_URL: databaseUrl, SESSION_SECRET: 's'.repeat(32),
    PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
    R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x',
    R2_BUCKET: 'x', R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
    MAIL_FROM: 'nao-responda@exemplo.com',
  });
}

// getApp() é lido no momento da chamada (não da criação), então funciona com
// o padrão `let app; beforeEach(() => { app = buildApp(...) })` de cada
// arquivo de teste, onde `app` é recriado a cada caso.
export function criarELogarComApp(db: Db, getApp: () => FastifyInstance) {
  return async function criarELogar(role: 'admin' | 'gerente', permissions: string[] = []) {
    const email = `${role}-${Math.random().toString(36).slice(2)}@x.com`;
    await db.insert(users).values({
      email, name: role, passwordHash: await hashPassword('senha-de-teste-123'),
      role, permissions, status: 'active',
    });
    const res = await getApp().inject({
      method: 'POST', url: '/auth/login', payload: { email, password: 'senha-de-teste-123' },
    });
    return `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
  };
}

export function criarPackComCategoriaComApp(getApp: () => FastifyInstance) {
  return async function criarPackComCategoria(cookie: string, slug?: string) {
    const packSlug = slug ?? `pack-${Math.random().toString(36).slice(2)}`;
    const packRes = await getApp().inject({
      method: 'POST', url: '/packs', headers: { cookie },
      payload: { slug: packSlug, name: `Pacote ${packSlug}`, authorName: 'Autora Teste' },
    });
    const packId = packRes.json().id as string;

    const catRes = await getApp().inject({
      method: 'POST', url: `/packs/${packId}/categories`, headers: { cookie },
      payload: { name: 'Categoria Teste' },
    });
    const categoryId = catRes.json().id as string;

    return { packId, categoryId };
  };
}
