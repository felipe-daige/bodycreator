# P1 — Backend e Painel Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar no ar um backend e um painel web onde admin e gerentes, convidados por e-mail e com permissões granulares, sobem figurinhas, montam pacotes e publicam um catálogo versionado consumível pelo app iOS.

**Architecture:** API Fastify/TypeScript e Postgres rodando em Docker Compose num VPS em São Paulo, atrás do Caddy (TLS automático). Os PNGs e os manifestos publicados ficam no Cloudflare R2, servidos pelo CDN da Cloudflare — o VPS só emite URLs assinadas, o que o torna descartável. Publicar gera um manifesto imutável `catalog/v{N}.json`, de modo que rollback é trocar um ponteiro.

**Tech Stack:** Node 22 LTS · TypeScript · Fastify 5 · Postgres 16 · Drizzle ORM · Zod · Argon2id · sharp · AWS SDK v3 (S3 API do R2) · Vitest · React 19 + Vite · Caddy · Docker Compose · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-07-18-infoproduto-p1-backend-admin-design.md`

## Global Constraints

Todo task herda estas regras. Valores copiados literalmente do spec.

- **Mensagens de erro voltadas ao usuário em pt-BR.** Logs e nomes de código em inglês.
- **O servidor valida os bytes do PNG mas nunca reencoda o arquivo.** Reencodar pode descartar o canal alfa, e a transparência é o produto inteiro. Os bytes originais vão para o R2 intactos.
- **Regras de validação de figurinha:** PNG válido · possui canal alfa · até 2 MB · maior lado entre 512 e 2048 px · `id` inédito no sistema.
- **O `id` da figurinha é único globalmente, não por pacote** — os favoritos no app iOS são gravados como id puro. Imposto por constraint no banco, nunca por convenção.
- **Senhas com Argon2id.** Nunca em texto, nunca no git, nunca em log.
- **Sessão em cookie `httpOnly`, `SameSite=Lax`, `Secure`.** Não usar JWT em `localStorage`.
- **Toda checagem de permissão acontece no servidor, em middleware.** Botão escondido no React não é controle de acesso.
- **`user.manage` nunca pode ser concedida a um `gerente`.** Só admin gerencia gente.
- **Sem cadastro público.** A única porta de entrada é convite com token de 32 bytes aleatórios, guardado como hash, uso único, expira em 7 dias.
- **Nenhum segredo no repositório.** Tudo vem de variável de ambiente, validada na subida.
- **Toda rota protegida tem um teste do caminho negativo** (403 para quem não tem a permissão). Controle de acesso sem teste negativo é controle de acesso não testado.

## File Structure

```
server/
  package.json                     deps e scripts
  tsconfig.json
  vitest.config.ts
  drizzle.config.ts
  src/
    config.ts                      env validado com Zod; falha na subida se faltar
    db/schema.ts                   tabelas Drizzle (única definição de esquema)
    db/index.ts                    conexão e tipo Db
    auth/password.ts               hash e verificação Argon2id
    auth/permissions.ts            tipo Permission e canDo() — puro, sem I/O
    auth/session.ts                criar/ler/destruir sessão em cookie
    auth/guards.ts                 preHandlers requireAuth e requirePermission
    audit.ts                       recordAudit()
    email/send.ts                  interface Mailer + implementações real e fake
    content/validatePng.ts         porte de Scripts/validate_content.py
    content/manifest.ts            buildManifest() — puro sobre dados já lidos
    storage/index.ts               interface Storage
    storage/r2.ts                  implementação R2
    storage/memory.ts              implementação em memória para testes
    routes/health.ts
    routes/auth.ts                 login, logout, me, trocar senha
    routes/invites.ts              criar, reenviar, aceitar
    routes/users.ts                listar, alterar permissões, desativar
    routes/packs.ts                CRUD de pacotes e categorias
    routes/stickers.ts             upload e remoção de figurinhas
    routes/publish.ts              publicar e rollback
    app.ts                         buildApp() — fábrica testável, sem listen()
    server.ts                      entrypoint: lê config, chama listen()
    seed-admin.ts                  seeder idempotente
  tests/
    setup/db.ts                    sobe schema num banco de teste e limpa entre casos
    unit/*.test.ts
    integration/*.test.ts
admin/                             painel React (Vite)
  src/api.ts                       cliente HTTP com credentials: 'include'
  src/auth.tsx                     contexto de sessão
  src/App.tsx                      rotas
  src/pages/Login.tsx
  src/pages/Packs.tsx
  src/pages/PackEditor.tsx
  src/pages/Users.tsx
infra/
  docker-compose.yml               produção
  docker-compose.dev.yml           postgres de desenvolvimento e teste
  Caddyfile
  backup.sh                        pg_dump diário para o R2
  restore-check.sh                 restauração verificada mensal
  Dockerfile.api
  Dockerfile.admin
.github/workflows/ci.yml
.github/workflows/deploy.yml
```

O app iOS (`App/`, `Catalog/`, `Export/`, `Favorites/`, `UI/`) **não é tocado neste plano**.

---

### Task 1: Esqueleto do servidor com health check

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- Create: `server/src/config.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/routes/health.ts`
- Create: `server/.env.example`, `server/.gitignore`
- Create: `infra/docker-compose.dev.yml`
- Test: `server/tests/integration/health.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildApp(deps: AppDeps): FastifyInstance` de `src/app.ts`; `loadConfig(env: NodeJS.ProcessEnv): Config` de `src/config.ts`. `AppDeps` cresce nos próximos tasks — começa como `{ config: Config }`.

`buildApp` nunca chama `listen()`. É isso que permite testar rotas sem abrir porta.

- [ ] **Step 1: Criar o projeto Node**

`server/package.json`:

```json
{
  "name": "bodycreator-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "seed:admin": "tsx src/seed-admin.ts"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cookie": "^11.0.1",
    "@fastify/cors": "^10.0.1",
    "@fastify/rate-limit": "^10.2.1",
    "@fastify/multipart": "^9.0.1",
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4.5",
    "zod": "^3.24.1",
    "@node-rs/argon2": "^2.0.2",
    "sharp": "^0.33.5",
    "@aws-sdk/client-s3": "^3.717.0",
    "@aws-sdk/s3-request-presigner": "^3.717.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "tsx": "^4.19.2",
    "vitest": "^2.1.8",
    "drizzle-kit": "^0.31.10",
    "@types/node": "^22.10.2"
  }
}
```

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
```

`server/.gitignore`:

```
node_modules/
dist/
.env
```

- [ ] **Step 2: Escrever o teste que falha**

`server/tests/integration/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://x/x',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
  R2_ACCOUNT_ID: 'x',
  R2_ACCESS_KEY_ID: 'x',
  R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
  MAIL_FROM: 'nao-responda@example.com',
});

describe('GET /health', () => {
  it('responde 200 com status ok', async () => {
    const app = buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd server && npm install && npm test`
Expected: FAIL — `Cannot find module '../../src/app.js'`

- [ ] **Step 4: Implementar config, app e rota**

`server/src/config.ts`:

```ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de ao menos 32 caracteres'),
  PUBLIC_PANEL_ORIGIN: z.string().url(),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  MAIL_FROM: z.string().email(),
  RESEND_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
```

Falhar na subida por variável faltando é deliberado: melhor não subir do que subir sem R2 e descobrir no primeiro upload.

`server/src/routes/health.ts`:

```ts
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));
}
```

`server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { healthRoutes } from './routes/health.js';

export type AppDeps = { config: Config };

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== 'test',
    bodyLimit: 5 * 1024 * 1024,
  });
  app.decorate('deps', deps);
  app.register(healthRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
```

`server/src/server.ts`:

```ts
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const app = buildApp({ config });

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

`server/.env.example` — sem nenhum valor real:

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://bodycreator:bodycreator@localhost:5432/bodycreator
SESSION_SECRET=
PUBLIC_PANEL_ORIGIN=http://localhost:5173
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
MAIL_FROM=
RESEND_API_KEY=
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd server && npm test`
Expected: PASS — 1 teste

- [ ] **Step 6: Subir o Postgres de desenvolvimento**

`infra/docker-compose.dev.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bodycreator
      POSTGRES_PASSWORD: bodycreator
      POSTGRES_DB: bodycreator
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bodycreator
      POSTGRES_PASSWORD: bodycreator
      POSTGRES_DB: bodycreator_test
    ports: ["55432:5432"]
    tmpfs: ["/var/lib/postgresql/data"]

volumes:
  pgdata:
```

O banco de teste usa `tmpfs`: some ao parar o container, é rápido, e não há risco de um teste sujar dado de desenvolvimento.

Run: `docker compose -f infra/docker-compose.dev.yml up -d`
Expected: dois containers `running`

- [ ] **Step 7: Commit**

```bash
git add server infra/docker-compose.dev.yml
git commit -m "feat(server): esqueleto Fastify com health check e config validada"
```

---

### Task 2: Esquema do banco e migrações

**Files:**
- Create: `server/src/db/schema.ts`, `server/src/db/index.ts`, `server/src/db/migrate.ts`, `server/drizzle.config.ts`
- Create: `server/tests/setup/db.ts`
- Test: `server/tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1).
- Produces: tabelas `users`, `invites`, `packs`, `categories`, `stickers`, `catalogVersions`, `auditLog` de `src/db/schema.ts`; `createDb(url: string): Db` e o tipo `Db` de `src/db/index.ts`; `withTestDb()` de `tests/setup/db.ts`.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/integration/schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { withTestDb } from '../setup/db.js';
import { stickers, packs, categories, users } from '../../src/db/schema.js';

const t = withTestDb();

describe('esquema', () => {
  it('impede duas figurinhas com o mesmo id em pacotes diferentes', async () => {
    const [autor] = await t.db.insert(users).values({
      email: 'a@x.com', name: 'A', passwordHash: 'h', role: 'admin',
    }).returning();

    const [p1] = await t.db.insert(packs).values({
      slug: 'pack-um', name: 'Pack Um', authorName: 'A', createdBy: autor!.id,
    }).returning();
    const [p2] = await t.db.insert(packs).values({
      slug: 'pack-dois', name: 'Pack Dois', authorName: 'A', createdBy: autor!.id,
    }).returning();

    const [c1] = await t.db.insert(categories).values({ packId: p1!.id, name: 'C' }).returning();
    const [c2] = await t.db.insert(categories).values({ packId: p2!.id, name: 'C' }).returning();

    await t.db.insert(stickers).values({
      id: 'seta-reta', packId: p1!.id, categoryId: c1!.id, name: 'Seta',
      fileKey: 'k1', width: 1024, height: 1024, bytes: 100, checksum: 'x',
    });

    await expect(
      t.db.insert(stickers).values({
        id: 'seta-reta', packId: p2!.id, categoryId: c2!.id, name: 'Seta',
        fileKey: 'k2', width: 1024, height: 1024, bytes: 100, checksum: 'y',
      }),
    ).rejects.toThrow();
  });

  it('apaga as figurinhas junto com o pacote', async () => {
    const [autor] = await t.db.insert(users).values({
      email: 'b@x.com', name: 'B', passwordHash: 'h', role: 'admin',
    }).returning();
    const [p] = await t.db.insert(packs).values({
      slug: 'pack-tres', name: 'Pack Três', authorName: 'B', createdBy: autor!.id,
    }).returning();
    const [c] = await t.db.insert(categories).values({ packId: p!.id, name: 'C' }).returning();
    await t.db.insert(stickers).values({
      id: 'circulo', packId: p!.id, categoryId: c!.id, name: 'Círculo',
      fileKey: 'k', width: 512, height: 512, bytes: 100, checksum: 'z',
    });

    await t.db.delete(packs).where(eq(packs.id, p!.id));
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });
});
```

Acrescente `import { eq } from 'drizzle-orm';` no topo do arquivo.

O primeiro teste é o que mais importa: ele prova a invariante herdada do MVP. Um `id` duplicado em pacotes diferentes corromperia os favoritos de todo mundo no app.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- schema`
Expected: FAIL — `Cannot find module '../../src/db/schema.js'`

- [ ] **Step 3: Escrever o esquema**

`server/src/db/schema.ts`:

```ts
import {
  pgTable, text, timestamp, integer, boolean, jsonb, uuid, pgEnum, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'gerente']);
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'disabled']);
export const packStatusEnum = pgEnum('pack_status', ['draft', 'published', 'archived']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('gerente'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  status: userStatusEnum('status').notNull().default('invited'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: roleEnum('role').notNull().default('gerente'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packs = pgTable('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  coverKey: text('cover_key'),
  authorName: text('author_name').notNull(),
  status: packStatusEnum('status').notNull().default('draft'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// id é text e chave primária: é o mesmo identificador gravado nos favoritos do
// app iOS, então precisa ser único no sistema inteiro, não por pacote.
export const stickers = pgTable('stickers', {
  id: text('id').primaryKey(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  fileKey: text('file_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  checksum: text('checksum').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogVersions = pgTable('catalog_versions', {
  version: integer('version').primaryKey(),
  manifestKey: text('manifest_key').notNull(),
  checksum: text('checksum').notNull(),
  publishedBy: uuid('published_by').notNull().references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  isCurrent: boolean('is_current').notNull().default(false),
}, (t) => ({
  onlyOneCurrent: uniqueIndex('catalog_only_one_current')
    .on(t.isCurrent).where(sql`${t.isCurrent} = true`),
}));

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Acrescente `import { sql } from 'drizzle-orm';` no topo.

O índice parcial `catalog_only_one_current` faz o banco garantir que existe no máximo uma versão corrente. Sem ele, uma corrida entre dois publish deixaria duas versões marcadas e o app receberia catálogo indeterminado.

- [ ] **Step 4: Conexão e migração**

`server/src/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

`server/drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

`server/src/db/migrate.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Migrações aplicadas.');
```

- [ ] **Step 5: Setup de teste**

`server/tests/setup/db.ts`:

```ts
import { beforeAll, afterEach, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://bodycreator:bodycreator@localhost:55432/bodycreator_test';

export function withTestDb() {
  const client = postgres(TEST_URL, { max: 5 });
  const db = drizzle(client, { schema });
  const holder = { db, url: TEST_URL };

  beforeAll(async () => {
    await migrate(drizzle(postgres(TEST_URL, { max: 1 })), { migrationsFolder: './drizzle' });
  });

  // Truncar entre casos, em vez de recriar o schema: mais rápido e garante que
  // um teste nunca enxerga o que o anterior escreveu.
  afterEach(async () => {
    await db.execute(sql`
      TRUNCATE audit_log, catalog_versions, stickers, categories, packs, invites, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => { await client.end(); });

  return holder;
}
```

- [ ] **Step 6: Gerar a migração e rodar os testes**

```bash
cd server
DATABASE_URL=postgres://bodycreator:bodycreator@localhost:5432/bodycreator npm run db:generate
npm test -- schema
```

Expected: `drizzle/0000_*.sql` criado; 2 testes PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/db server/drizzle server/drizzle.config.ts server/tests/setup
git commit -m "feat(db): esquema com id de figurinha único global e versão corrente única"
```

---

### Task 3: Senhas e modelo de permissões

**Files:**
- Create: `server/src/auth/password.ts`, `server/src/auth/permissions.ts`
- Test: `server/tests/unit/password.test.ts`, `server/tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: nada — os dois módulos são puros e sem I/O de banco.
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `type Permission` (união de literais) e `ALL_PERMISSIONS: readonly Permission[]`
  - `canDo(actor: { role: 'admin' | 'gerente'; permissions: string[] }, permission: Permission): boolean`
  - `assignablePermissions(role: 'admin' | 'gerente'): Permission[]`
  - `validatePermissionAssignment(role, permissions): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Escrever os testes que falham**

`server/tests/unit/permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canDo, ALL_PERMISSIONS, assignablePermissions, validatePermissionAssignment,
} from '../../src/auth/permissions.js';

const admin = { role: 'admin' as const, permissions: [] };
const gerente = (p: string[]) => ({ role: 'gerente' as const, permissions: p });

describe('canDo', () => {
  it('dá todas as permissões ao admin, mesmo com lista vazia', () => {
    for (const p of ALL_PERMISSIONS) expect(canDo(admin, p)).toBe(true);
  });

  it('dá ao gerente apenas o que foi concedido', () => {
    const g = gerente(['sticker.import']);
    expect(canDo(g, 'sticker.import')).toBe(true);
    expect(canDo(g, 'pack.publish')).toBe(false);
  });

  it('separa editar de publicar', () => {
    const g = gerente(['pack.create', 'pack.edit']);
    expect(canDo(g, 'pack.edit')).toBe(true);
    expect(canDo(g, 'pack.publish')).toBe(false);
  });

  it('nunca reconhece user.manage num gerente, mesmo se gravado no banco', () => {
    expect(canDo(gerente(['user.manage']), 'user.manage')).toBe(false);
  });

  it('ignora permissão desconhecida', () => {
    expect(canDo(gerente(['pack.destroy.everything']), 'pack.edit')).toBe(false);
  });
});

describe('validatePermissionAssignment', () => {
  it('recusa conceder user.manage a gerente', () => {
    const r = validatePermissionAssignment('gerente', ['user.manage']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/user\.manage/);
  });

  it('aceita permissões válidas para gerente', () => {
    expect(validatePermissionAssignment('gerente', ['pack.edit']).ok).toBe(true);
  });

  it('recusa permissão inexistente', () => {
    expect(validatePermissionAssignment('gerente', ['voar']).ok).toBe(false);
  });
});

describe('assignablePermissions', () => {
  it('não oferece user.manage para gerente', () => {
    expect(assignablePermissions('gerente')).not.toContain('user.manage');
  });
});
```

`server/tests/unit/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';

describe('senhas', () => {
  it('verifica a senha correta', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(await verifyPassword(hash, 'senha-de-teste-123')).toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(await verifyPassword(hash, 'senha-errada')).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('usa Argon2id', async () => {
    expect(await hashPassword('x')).toMatch(/^\$argon2id\$/);
  });

  it('devolve false em hash corrompido em vez de estourar', async () => {
    expect(await verifyPassword('não-é-um-hash', 'x')).toBe(false);
  });
});
```

O último caso importa: um hash inválido no banco não pode derrubar a rota de login com 500.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd server && npm test -- unit`
Expected: FAIL — módulos não encontrados

- [ ] **Step 3: Implementar**

`server/src/auth/permissions.ts`:

```ts
export const ALL_PERMISSIONS = [
  'sticker.import',
  'pack.create',
  'pack.edit',
  'pack.publish',
  'pack.price',
  'report.view',
  'user.manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type Role = 'admin' | 'gerente';

// user.manage é exclusiva de admin: se um gerente pudesse conceder permissões,
// o teto de privilégio do sistema deixaria de ser raciocinável.
const ADMIN_ONLY: readonly Permission[] = ['user.manage'];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function assignablePermissions(role: Role): Permission[] {
  return role === 'admin'
    ? [...ALL_PERMISSIONS]
    : ALL_PERMISSIONS.filter((p) => !ADMIN_ONLY.includes(p));
}

export function canDo(
  actor: { role: Role; permissions: string[] },
  permission: Permission,
): boolean {
  if (actor.role === 'admin') return true;
  if (ADMIN_ONLY.includes(permission)) return false;
  return actor.permissions.includes(permission);
}

export function validatePermissionAssignment(
  role: Role,
  permissions: string[],
): { ok: true } | { ok: false; error: string } {
  for (const p of permissions) {
    if (!isPermission(p)) {
      return { ok: false, error: `Permissão desconhecida: ${p}` };
    }
    if (role !== 'admin' && ADMIN_ONLY.includes(p)) {
      return { ok: false, error: `A permissão ${p} é exclusiva de administradores.` };
    }
  }
  return { ok: true };
}
```

`canDo` recusa `user.manage` para gerente **mesmo que o banco tenha essa string gravada**. Validar só na escrita deixaria o sistema vulnerável a um registro adulterado; a checagem na leitura fecha isso.

`server/src/auth/password.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

const OPTIONS = {
  memoryCost: 19456, // 19 MiB — mínimo recomendado pela OWASP para Argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    // Hash malformado no banco não pode virar 500 na rota de login.
    return false;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `cd server && npm test -- unit`
Expected: PASS — 13 testes

- [ ] **Step 5: Commit**

```bash
git add server/src/auth server/tests/unit
git commit -m "feat(auth): Argon2id e modelo de permissões com user.manage restrita a admin"
```

---

### Task 4: Sessão, login e guardas de rota

**Files:**
- Create: `server/src/auth/session.ts`, `server/src/auth/guards.ts`, `server/src/routes/auth.ts`
- Modify: `server/src/app.ts` (registrar cookie, rate limit, cors e as rotas de auth)
- Test: `server/tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `canDo`, `Permission` (Task 3); `verifyPassword`, `hashPassword` (Task 3); `Db` e `users` (Task 2).
- Produces:
  - `setSession(reply, userId)` e `clearSession(reply)` de `src/auth/session.ts`
  - `requireAuth` e `requirePermission(p: Permission)` de `src/auth/guards.ts` — preHandlers Fastify
  - `request.currentUser` tipado como `AuthedUser` após `requireAuth`
  - `AppDeps` passa a ser `{ config: Config; db: Db }`

**Decisão:** a sessão é um cookie assinado carregando só o `userId`; o usuário é relido do banco a cada requisição. Não há tabela de sessões. Isso mantém a desativação de conta **imediata** — um usuário marcado `disabled` perde o acesso na requisição seguinte, sem precisar caçar sessões para invalidar.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/integration/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { hashPassword } from '../../src/auth/password.js';
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
  app = buildApp({ config, db: t.db });
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
```

Acrescente `import { eq } from 'drizzle-orm';` no topo.

A mensagem idêntica para senha errada e e-mail inexistente é deliberada: mensagens diferentes permitem descobrir quais e-mails têm conta.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- auth`
Expected: FAIL — `Cannot find module '../../src/auth/session.js'`

- [ ] **Step 3: Implementar sessão e guardas**

`server/src/auth/session.ts`:

```ts
import type { FastifyReply } from 'fastify';

export const SESSION_COOKIE = 'bc_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

export function setSession(reply: FastifyReply, userId: string, isProduction: boolean) {
  reply.setCookie(SESSION_COOKIE, userId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    signed: true,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSession(reply: FastifyReply, isProduction: boolean) {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: isProduction,
  });
}
```

`server/src/auth/guards.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { canDo, type Permission, type Role } from './permissions.js';
import { SESSION_COOKIE } from './session.js';

export type AuthedUser = {
  id: string; email: string; name: string; role: Role;
  permissions: string[]; mustChangePassword: boolean;
};

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) {
    return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });
  }

  const [user] = await request.server.deps.db
    .select().from(users).where(eq(users.id, unsigned.value)).limit(1);

  // Recarregar do banco a cada requisição é o que faz a desativação valer na hora.
  if (!user || user.status !== 'active') {
    return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });
  }

  request.currentUser = {
    id: user.id, email: user.email, name: user.name, role: user.role,
    permissions: user.permissions, mustChangePassword: user.mustChangePassword,
  };
}

export function requirePermission(permission: Permission) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser;
    if (!user) return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });
    if (!canDo(user, permission)) {
      return reply.code(403).send({ error: 'Você não tem permissão para esta ação.' });
    }
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthedUser;
  }
}
```

`server/src/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { setSession, clearSession } from '../auth/session.js';
import { requireAuth } from '../auth/guards.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const changeSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) });

export async function authRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;
  const isProd = config.NODE_ENV === 'production';

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send({ error: 'E-mail ou senha inválidos.' });

    const [user] = await db.select().from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);

    // Mensagem única para senha errada, e-mail inexistente e conta desativada:
    // respostas diferentes permitiriam enumerar quem tem conta.
    const invalid = { error: 'E-mail ou senha inválidos.' };
    if (!user || user.status !== 'active') return reply.code(401).send(invalid);
    if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return reply.code(401).send(invalid);
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    setSession(reply, user.id, isProd);
    return {
      id: user.id, email: user.email, name: user.name, role: user.role,
      permissions: user.permissions, mustChangePassword: user.mustChangePassword,
    };
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSession(reply, isProd);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => request.currentUser);

  app.post('/auth/change-password', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = changeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A nova senha precisa de ao menos 10 caracteres.' });
    }
    const me = request.currentUser!;
    const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      return reply.code(400).send({ error: 'Senha atual incorreta.' });
    }
    await db.update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false })
      .where(eq(users.id, me.id));
    return { ok: true };
  });
}
```

- [ ] **Step 4: Ligar tudo no app**

Substitua `server/src/app.ts` por:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

export type AppDeps = { config: Config; db: Db };

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== 'test',
    bodyLimit: 5 * 1024 * 1024,
  });
  app.decorate('deps', deps);

  app.register(cookie, { secret: deps.config.SESSION_SECRET });
  app.register(cors, { origin: deps.config.PUBLIC_PANEL_ORIGIN, credentials: true });
  app.register(rateLimit, { global: false });

  app.register(healthRoutes);
  app.register(authRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
```

Atualize `server/src/server.ts` para construir o `db`:

```ts
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';

const config = loadConfig(process.env);
const app = buildApp({ config, db: createDb(config.DATABASE_URL) });

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

O teste de health do Task 1 agora precisa passar `db`. Atualize-o para `buildApp({ config, db: {} as never })`.

- [ ] **Step 5: Rodar e confirmar que passam**

Run: `cd server && npm test`
Expected: PASS — todos os testes, incluindo os 9 de auth

- [ ] **Step 6: Commit**

```bash
git add server/src server/tests
git commit -m "feat(auth): login por cookie assinado, guardas de permissão e troca de senha"
```

---

### Task 5: Registro de auditoria

**Files:**
- Create: `server/src/audit.ts`
- Test: `server/tests/integration/audit.test.ts`

**Interfaces:**
- Consumes: `Db`, `auditLog` (Task 2).
- Produces: `recordAudit(db, entry: AuditEntry): Promise<void>` onde
  `AuditEntry = { actorId: string | null; action: string; entityType: string; entityId?: string | null; payload?: Record<string, unknown> }`.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/integration/audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withTestDb } from '../setup/db.js';
import { recordAudit } from '../../src/audit.js';
import { users, auditLog } from '../../src/db/schema.js';

const t = withTestDb();

describe('recordAudit', () => {
  it('grava a ação com autor e payload', async () => {
    const [u] = await t.db.insert(users).values({
      email: 'a@x.com', name: 'A', passwordHash: 'h', role: 'admin', status: 'active',
    }).returning();

    await recordAudit(t.db, {
      actorId: u!.id, action: 'pack.publish', entityType: 'pack',
      entityId: 'pack-123', payload: { version: 4 },
    });

    const rows = await t.db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('pack.publish');
    expect(rows[0]!.payload).toEqual({ version: 4 });
  });

  it('aceita autor nulo para ações do sistema', async () => {
    await recordAudit(t.db, { actorId: null, action: 'seed.admin', entityType: 'user' });
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it('nunca deixa senha vazar para o payload', async () => {
    await recordAudit(t.db, {
      actorId: null, action: 'user.update', entityType: 'user',
      payload: { password: 'segredo', passwordHash: 'argon2...', name: 'Ana' },
    });
    const [row] = await t.db.select().from(auditLog);
    expect(JSON.stringify(row!.payload)).not.toContain('segredo');
    expect(JSON.stringify(row!.payload)).not.toContain('argon2');
    expect(row!.payload).toEqual({ name: 'Ana' });
  });
});
```

O terceiro caso existe porque o payload de auditoria é o lugar mais fácil de vazar credencial sem perceber: alguém passa o corpo da requisição inteiro e a senha vai junto para uma tabela que ninguém audita.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- audit`
Expected: FAIL — `Cannot find module '../../src/audit.js'`

- [ ] **Step 3: Implementar**

`server/src/audit.ts`:

```ts
import type { Db } from './db/index.js';
import { auditLog } from './db/schema.js';

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

const REDACTED_KEYS = ['password', 'newPassword', 'currentPassword', 'passwordHash', 'token', 'tokenHash'];

function scrub(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (REDACTED_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: scrub(entry.payload ?? {}),
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npm test -- audit`
Expected: PASS — 3 testes

- [ ] **Step 5: Commit**

```bash
git add server/src/audit.ts server/tests/integration/audit.test.ts
git commit -m "feat(audit): registro de auditoria com remoção de campos sensíveis"
```

---

### Task 6: Envio de e-mail

**Files:**
- Create: `server/src/email/send.ts`
- Test: `server/tests/unit/email.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  - `type Mailer = { send(msg: { to: string; subject: string; html: string; text: string }): Promise<void> }`
  - `createResendMailer(config: Config): Mailer`
  - `createFakeMailer(): Mailer & { sent: SentMessage[] }` — usado em todo teste
  - `renderInviteEmail(params: { inviteUrl: string; invitedByName: string }): { subject; html; text }`
  - `AppDeps` passa a ser `{ config; db; mailer: Mailer }`

**Decisão:** SMTP direto do VPS está fora de escopo — IP novo cai em spam e administrar reputação de remetente não é o problema deste projeto. Usa-se serviço transacional com domínio verificado por SPF/DKIM.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/unit/email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createFakeMailer, renderInviteEmail } from '../../src/email/send.js';

describe('renderInviteEmail', () => {
  it('inclui o link do convite no html e no texto', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://painel.exemplo.com/convite?token=abc',
      invitedByName: 'Maiara',
    });
    expect(msg.html).toContain('https://painel.exemplo.com/convite?token=abc');
    expect(msg.text).toContain('https://painel.exemplo.com/convite?token=abc');
  });

  it('está em português e diz quem convidou', () => {
    const msg = renderInviteEmail({ inviteUrl: 'https://x/y', invitedByName: 'Maiara' });
    expect(msg.subject).toMatch(/Body Creator/);
    expect(msg.html).toContain('Maiara');
  });

  it('avisa que o convite expira', () => {
    const msg = renderInviteEmail({ inviteUrl: 'https://x/y', invitedByName: 'M' });
    expect(msg.text).toMatch(/7 dias/);
  });
});

describe('createFakeMailer', () => {
  it('guarda as mensagens em vez de enviar', async () => {
    const mailer = createFakeMailer();
    await mailer.send({ to: 'a@x.com', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('a@x.com');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- email`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

`server/src/email/send.ts`:

```ts
import type { Config } from '../config.js';

export type Message = { to: string; subject: string; html: string; text: string };
export type SentMessage = Message & { sentAt: Date };
export type Mailer = { send(msg: Message): Promise<void> };

export function createFakeMailer(): Mailer & { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  return {
    sent,
    async send(msg) { sent.push({ ...msg, sentAt: new Date() }); },
  };
}

export function createResendMailer(config: Config): Mailer {
  const key = config.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY é obrigatória em produção.');
  return {
    async send(msg) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: config.MAIL_FROM, to: msg.to, subject: msg.subject,
          html: msg.html, text: msg.text,
        }),
      });
      if (!res.ok) {
        throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
      }
    },
  };
}

export function renderInviteEmail(params: { inviteUrl: string; invitedByName: string }) {
  const { inviteUrl, invitedByName } = params;
  const subject = 'Seu acesso ao painel do Body Creator';
  const text = [
    `${invitedByName} convidou você para o painel do Body Creator.`,
    '',
    'Crie sua senha neste link:',
    inviteUrl,
    '',
    'O convite vale por 7 dias. Depois disso, peça um novo.',
    'Se você não esperava este e-mail, pode ignorá-lo.',
  ].join('\n');
  const html = `
    <p>${invitedByName} convidou você para o painel do <strong>Body Creator</strong>.</p>
    <p><a href="${inviteUrl}">Criar minha senha</a></p>
    <p>O convite vale por 7 dias. Depois disso, peça um novo.</p>
    <p style="color:#666;font-size:12px">Se você não esperava este e-mail, pode ignorá-lo.</p>
  `;
  return { subject, html, text };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npm test -- email`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add server/src/email server/tests/unit/email.test.ts
git commit -m "feat(email): mailer transacional com implementação fake para testes"
```

---

### Task 7: Convites e gestão de usuários

**Files:**
- Create: `server/src/routes/invites.ts`, `server/src/routes/users.ts`
- Modify: `server/src/app.ts` (registrar as rotas e receber `mailer` em `AppDeps`)
- Test: `server/tests/integration/invites.test.ts`, `server/tests/integration/users.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requirePermission` (Task 4); `validatePermissionAssignment`, `assignablePermissions` (Task 3); `recordAudit` (Task 5); `Mailer`, `renderInviteEmail` (Task 6).
- Produces: rotas `POST /invites`, `POST /invites/:id/resend`, `GET /invites/accept?token=`, `POST /invites/accept`, `GET /users`, `PATCH /users/:id`, `POST /users/:id/disable`.

- [ ] **Step 1: Escrever os testes que falham**

`server/tests/integration/invites.test.ts`:

```ts
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
      payload: { token, name: 'N', password: 'senha-nova-1234' },
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
```

`server/tests/integration/users.test.ts` — reaproveite os helpers `criarELogar` e o bloco de config acima:

```ts
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
});
```

O último caso evita o cenário em que o único admin se tranca para fora do próprio painel.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd server && npm test -- invites users`
Expected: FAIL — rotas inexistentes (404) e módulos ausentes

- [ ] **Step 3: Implementar convites**

`server/src/routes/invites.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { users, invites } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { validatePermissionAssignment } from '../auth/permissions.js';
import { hashPassword } from '../auth/password.js';
import { renderInviteEmail } from '../email/send.js';
import { recordAudit } from '../audit.js';

const INVITE_TTL_DAYS = 7;

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'gerente']),
  permissions: z.array(z.string()).default([]),
});

const acceptSchema = z.object({
  token: z.string().min(32),
  name: z.string().min(2),
  password: z.string().min(10),
});

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function inviteRoutes(app: FastifyInstance) {
  const { db, config, mailer } = app.deps;

  app.post('/invites', {
    preHandler: [requireAuth, requirePermission('user.manage')],
  }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados do convite inválidos.' });
    const { email, role, permissions } = parsed.data;

    const check = validatePermissionAssignment(role, permissions);
    if (!check.ok) return reply.code(400).send({ error: check.error });

    const lower = email.toLowerCase();
    const [existe] = await db.select().from(users).where(eq(users.email, lower)).limit(1);
    if (existe) return reply.code(409).send({ error: 'Já existe uma conta com esse e-mail.' });

    // O token só existe em claro dentro do e-mail. O banco guarda o hash, então
    // um vazamento do banco não permite aceitar convite pendente.
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [invite] = await db.insert(invites).values({
      email: lower, tokenHash: hashToken(token), role, permissions,
      invitedBy: request.currentUser!.id, expiresAt,
    }).returning();

    const inviteUrl = `${config.PUBLIC_PANEL_ORIGIN}/convite?token=${token}`;
    const msg = renderInviteEmail({ inviteUrl, invitedByName: request.currentUser!.name });
    await mailer.send({ to: lower, ...msg });

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'invite.create',
      entityType: 'invite', entityId: invite!.id, payload: { email: lower, role, permissions },
    });

    return reply.code(201).send({ id: invite!.id, email: lower, expiresAt });
  });

  app.post('/invites/:id/resend', {
    preHandler: [requireAuth, requirePermission('user.manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invite] = await db.select().from(invites)
      .where(and(eq(invites.id, id), isNull(invites.acceptedAt))).limit(1);
    if (!invite) return reply.code(404).send({ error: 'Convite não encontrado ou já aceito.' });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db.update(invites).set({ tokenHash: hashToken(token), expiresAt })
      .where(eq(invites.id, id));

    const inviteUrl = `${config.PUBLIC_PANEL_ORIGIN}/convite?token=${token}`;
    await mailer.send({
      to: invite.email,
      ...renderInviteEmail({ inviteUrl, invitedByName: request.currentUser!.name }),
    });

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'invite.resend',
      entityType: 'invite', entityId: id,
    });
    return { ok: true };
  });

  app.post('/invites/accept', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = acceptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Convite ou senha inválidos. A senha precisa de ao menos 10 caracteres.' });
    }
    const { token, name, password } = parsed.data;

    const [invite] = await db.select().from(invites)
      .where(eq(invites.tokenHash, hashToken(token))).limit(1);
    if (!invite || invite.acceptedAt) {
      return reply.code(400).send({ error: 'Este convite não é mais válido. Peça um novo.' });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: 'Este convite expirou. Peça um novo.' });
    }

    const [user] = await db.insert(users).values({
      email: invite.email, name, passwordHash: await hashPassword(password),
      role: invite.role, permissions: invite.permissions, status: 'active',
      mustChangePassword: false,
    }).returning();

    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    await recordAudit(db, {
      actorId: user!.id, action: 'invite.accept', entityType: 'user', entityId: user!.id,
    });

    return reply.code(201).send({ id: user!.id, email: user!.email });
  });
}
```

- [ ] **Step 4: Implementar gestão de usuários**

`server/src/routes/users.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { validatePermissionAssignment } from '../auth/permissions.js';
import { recordAudit } from '../audit.js';

const patchSchema = z.object({
  permissions: z.array(z.string()).optional(),
  name: z.string().min(2).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  app.get('/users', {
    preHandler: [requireAuth, requirePermission('user.manage')],
  }, async () => {
    // Seleção explícita de colunas: um select() cru passaria o passwordHash adiante.
    return db.select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      permissions: users.permissions, status: users.status,
      createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
    }).from(users).orderBy(users.createdAt);
  });

  app.patch('/users/:id', {
    preHandler: [requireAuth, requirePermission('user.manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    const [alvo] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!alvo) return reply.code(404).send({ error: 'Usuário não encontrado.' });

    if (parsed.data.permissions) {
      const check = validatePermissionAssignment(alvo.role, parsed.data.permissions);
      if (!check.ok) return reply.code(400).send({ error: check.error });
    }

    await db.update(users).set({
      ...(parsed.data.permissions ? { permissions: parsed.data.permissions } : {}),
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
    }).where(eq(users.id, id));

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'user.update',
      entityType: 'user', entityId: id, payload: { ...parsed.data },
    });
    return { ok: true };
  });

  app.post('/users/:id/disable', {
    preHandler: [requireAuth, requirePermission('user.manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.currentUser!.id) {
      // Sem isto, o único admin consegue se trancar para fora do painel.
      return reply.code(400).send({ error: 'Você não pode desativar a própria conta.' });
    }
    const [alvo] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!alvo) return reply.code(404).send({ error: 'Usuário não encontrado.' });

    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, id));
    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'user.disable',
      entityType: 'user', entityId: id,
    });
    return { ok: true };
  });
}
```

- [ ] **Step 5: Registrar no app**

Em `server/src/app.ts`: acrescente `mailer: Mailer` ao tipo `AppDeps`, importe `inviteRoutes` e `userRoutes`, e registre ambas após `authRoutes`. Em `server/src/server.ts`, construa o mailer real:

```ts
import { createResendMailer } from './email/send.js';
const app = buildApp({ config, db: createDb(config.DATABASE_URL), mailer: createResendMailer(config) });
```

Atualize os testes anteriores que chamam `buildApp` para passar `mailer: createFakeMailer()`.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd server && npm test`
Expected: PASS — todos os testes

- [ ] **Step 7: Commit**

```bash
git add server/src server/tests
git commit -m "feat(users): convite por e-mail com token hasheado e gestão de permissões"
```

---

### Task 8: Seeder do admin

**Files:**
- Create: `server/src/seed-admin.ts`
- Test: `server/tests/integration/seed-admin.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 3), `recordAudit` (Task 5), `Db` e `users` (Task 2).
- Produces: `seedAdmin(db: Db, params: { email: string; name: string; password: string }): Promise<{ created: boolean }>`.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/integration/seed-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { seedAdmin } from '../../src/seed-admin.js';
import { users } from '../../src/db/schema.js';
import { verifyPassword } from '../../src/auth/password.js';

const t = withTestDb();
const params = { email: 'Admin@Exemplo.com', name: 'Admin', password: 'senha-inicial-123' };

describe('seedAdmin', () => {
  it('cria o admin com troca de senha obrigatória', async () => {
    const r = await seedAdmin(t.db, params);
    expect(r.created).toBe(true);
    const [u] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));
    expect(u!.role).toBe('admin');
    expect(u!.status).toBe('active');
    expect(u!.mustChangePassword).toBe(true);
  });

  it('guarda apenas o hash', async () => {
    await seedAdmin(t.db, params);
    const [u] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));
    expect(u!.passwordHash).not.toContain('senha-inicial-123');
    expect(await verifyPassword(u!.passwordHash, 'senha-inicial-123')).toBe(true);
  });

  it('é idempotente: rodar de novo não duplica nem sobrescreve a senha', async () => {
    await seedAdmin(t.db, params);
    const [antes] = await t.db.select().from(users).where(eq(users.email, 'admin@exemplo.com'));

    const r = await seedAdmin(t.db, { ...params, password: 'outra-senha-totalmente' });
    expect(r.created).toBe(false);

    const todos = await t.db.select().from(users);
    expect(todos).toHaveLength(1);
    expect(todos[0]!.passwordHash).toBe(antes!.passwordHash);
  });
});
```

O terceiro caso é o que evita o pior acidente possível: um deploy rodando o seeder de novo e devolvendo a senha do admin ao valor inicial.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- seed-admin`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

`server/src/seed-admin.ts`:

```ts
import { eq } from 'drizzle-orm';
import { createDb, type Db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './auth/password.js';
import { recordAudit } from './audit.js';

export async function seedAdmin(
  db: Db,
  params: { email: string; name: string; password: string },
): Promise<{ created: boolean }> {
  const email = params.email.toLowerCase();
  const [existe] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Idempotente de verdade: se o admin já existe, não toca na senha dele.
  // Um seeder que sobrescreve senha transforma cada deploy num incidente.
  if (existe) return { created: false };

  const [criado] = await db.insert(users).values({
    email, name: params.name,
    passwordHash: await hashPassword(params.password),
    role: 'admin', permissions: [], status: 'active',
    mustChangePassword: true,
  }).returning();

  await recordAudit(db, {
    actorId: null, action: 'seed.admin', entityType: 'user', entityId: criado!.id,
  });
  return { created: true };
}

// Entrypoint de linha de comando. A senha nunca aparece em código ou no git.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { DATABASE_URL, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, ADMIN_SEED_NAME } = process.env;
  if (!DATABASE_URL || !ADMIN_SEED_EMAIL || !ADMIN_SEED_PASSWORD) {
    throw new Error('Defina DATABASE_URL, ADMIN_SEED_EMAIL e ADMIN_SEED_PASSWORD.');
  }
  if (ADMIN_SEED_PASSWORD.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD precisa de ao menos 12 caracteres.');
  }
  const result = await seedAdmin(createDb(DATABASE_URL), {
    email: ADMIN_SEED_EMAIL,
    name: ADMIN_SEED_NAME ?? 'Administrador',
    password: ADMIN_SEED_PASSWORD,
  });
  console.log(result.created ? 'Admin criado.' : 'Admin já existia — nada alterado.');
  process.exit(0);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npm test -- seed-admin`
Expected: PASS — 3 testes

- [ ] **Step 5: Commit**

```bash
git add server/src/seed-admin.ts server/tests/integration/seed-admin.test.ts
git commit -m "feat(seed): seeder idempotente de admin lendo senha do ambiente"
```

---

### Task 9: Validação de PNG

**Files:**
- Create: `server/src/content/validatePng.ts`
- Create: `server/tests/fixtures/make-fixtures.ts`
- Test: `server/tests/unit/validatePng.test.ts`

**Interfaces:**
- Consumes: nada — módulo puro sobre um `Buffer`.
- Produces: `validatePng(buffer: Buffer): Promise<PngValidation>` onde
  `PngValidation = { ok: true; width: number; height: number; bytes: number; checksum: string } | { ok: false; error: string }`.

Este é o porte de `Scripts/validate_content.py` do MVP. As regras são as mesmas, agora rodando no upload.

- [ ] **Step 1: Gerador de fixtures**

`server/tests/fixtures/make-fixtures.ts`:

```ts
import sharp from 'sharp';

export function pngComAlfa(width = 1024, height = 1024): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 90, b: 156, alpha: 0.5 } },
  }).png().toBuffer();
}

export function pngSemAlfa(width = 1024, height = 1024): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 10, b: 10 } },
  }).png().toBuffer();
}

export function jpegQualquer(): Promise<Buffer> {
  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 1, g: 2, b: 3 } },
  }).jpeg().toBuffer();
}

export async function pngTruncado(): Promise<Buffer> {
  const inteiro = await pngComAlfa();
  return inteiro.subarray(0, 40);
}
```

- [ ] **Step 2: Escrever o teste que falha**

`server/tests/unit/validatePng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validatePng } from '../../src/content/validatePng.js';
import { pngComAlfa, pngSemAlfa, jpegQualquer, pngTruncado } from '../fixtures/make-fixtures.js';

describe('validatePng', () => {
  it('aceita PNG com alfa dentro dos limites', async () => {
    const r = await validatePng(await pngComAlfa(1024, 1024));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.width).toBe(1024);
      expect(r.height).toBe(1024);
      expect(r.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('recusa arquivo sem canal alfa', async () => {
    const r = await validatePng(await pngSemAlfa());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/transparência|alfa/i);
  });

  it('recusa arquivo que não é PNG', async () => {
    const r = await validatePng(await jpegQualquer());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PNG/);
  });

  it('recusa PNG truncado sem estourar', async () => {
    const r = await validatePng(await pngTruncado());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PNG/);
  });

  it('recusa maior lado abaixo de 512', async () => {
    const r = await validatePng(await pngComAlfa(300, 300));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/512/);
  });

  it('recusa maior lado acima de 2048', async () => {
    const r = await validatePng(await pngComAlfa(2500, 800));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2048/);
  });

  it('aceita nos extremos exatos da faixa', async () => {
    expect((await validatePng(await pngComAlfa(512, 300))).ok).toBe(true);
    expect((await validatePng(await pngComAlfa(2048, 300))).ok).toBe(true);
  });

  it('recusa acima de 2 MB', async () => {
    const grande = Buffer.concat([await pngComAlfa(), Buffer.alloc(2 * 1024 * 1024)]);
    const r = await validatePng(grande);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2 MB/);
  });

  it('recusa buffer vazio', async () => {
    const r = await validatePng(Buffer.alloc(0));
    expect(r.ok).toBe(false);
  });
});
```

O caso do PNG truncado não é hipotético: foi um bug real do MVP, em que o validador quebrava com traceback em inglês em vez de recusar o arquivo (commit `a66df43`).

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd server && npm test -- validatePng`
Expected: FAIL — módulo não encontrado

- [ ] **Step 4: Implementar**

`server/src/content/validatePng.ts`:

```ts
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MIN_LONGEST_SIDE = 512;
export const MAX_LONGEST_SIDE = 2048;

export type PngValidation =
  | { ok: true; width: number; height: number; bytes: number; checksum: string }
  | { ok: false; error: string };

export async function validatePng(buffer: Buffer): Promise<PngValidation> {
  if (buffer.length === 0) {
    return { ok: false, error: 'O arquivo está vazio.' };
  }
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: 'A figurinha passa de 2 MB. Exporte com menos peso.' };
  }

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // Arquivo corrompido ou truncado cai aqui. Vira recusa em pt-BR, nunca 500.
    return { ok: false, error: 'O arquivo não é um PNG válido.' };
  }

  if (meta.format !== 'png') {
    return { ok: false, error: 'O arquivo precisa ser PNG.' };
  }
  if (!meta.hasAlpha) {
    return { ok: false, error: 'O PNG precisa ter fundo transparente (canal alfa).' };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longest = Math.max(width, height);
  if (longest < MIN_LONGEST_SIDE) {
    return { ok: false, error: `O maior lado precisa ter ao menos ${MIN_LONGEST_SIDE} px (tem ${longest} px).` };
  }
  if (longest > MAX_LONGEST_SIDE) {
    return { ok: false, error: `O maior lado precisa ter no máximo ${MAX_LONGEST_SIDE} px (tem ${longest} px).` };
  }

  return {
    ok: true, width, height, bytes: buffer.length,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}
```

Note que `sharp` é usado **apenas para ler metadados**. O buffer original nunca passa por `.toBuffer()` neste caminho — reencodar poderia descartar o canal alfa, e a transparência é o produto.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npm test -- validatePng`
Expected: PASS — 9 testes

- [ ] **Step 6: Commit**

```bash
git add server/src/content server/tests/unit/validatePng.test.ts server/tests/fixtures
git commit -m "feat(content): validação de PNG portada do validador do MVP"
```

---

### Task 10: Armazenamento no R2

**Files:**
- Create: `server/src/storage/index.ts`, `server/src/storage/memory.ts`, `server/src/storage/r2.ts`
- Test: `server/tests/unit/storage-memory.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  - `type Storage = { put(key, body: Buffer, contentType: string): Promise<void>; get(key): Promise<Buffer | null>; publicUrl(key): string }`
  - `createMemoryStorage(): Storage & { objects: Map<string, { body: Buffer; contentType: string }> }`
  - `createR2Storage(config: Config): Storage`
  - `AppDeps` passa a ser `{ config; db; mailer; storage }`

Toda rota consome a interface `Storage`. Nenhum teste toca o R2 de verdade — a implementação em memória cobre o comportamento, e a real é fina o bastante para ser verificada uma vez em staging.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/unit/storage-memory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryStorage } from '../../src/storage/memory.js';

describe('memory storage', () => {
  it('devolve os mesmos bytes que recebeu, sem alterar nada', async () => {
    const s = createMemoryStorage();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await s.put('packs/x/seta.png', bytes, 'image/png');
    expect(await s.get('packs/x/seta.png')).toEqual(bytes);
  });

  it('devolve null para chave inexistente', async () => {
    expect(await createMemoryStorage().get('não/existe.png')).toBeNull();
  });

  it('monta a URL pública a partir da chave', () => {
    const s = createMemoryStorage('https://cdn.exemplo.com');
    expect(s.publicUrl('catalog/v3.json')).toBe('https://cdn.exemplo.com/catalog/v3.json');
  });
});
```

O primeiro teste guarda a invariante mais importante do sistema: os bytes que entram são os bytes que saem.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npm test -- storage`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

`server/src/storage/index.ts`:

```ts
export type Storage = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  publicUrl(key: string): string;
};
```

`server/src/storage/memory.ts`:

```ts
import type { Storage } from './index.js';

export function createMemoryStorage(baseUrl = 'https://cdn.test') {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const storage: Storage & { objects: typeof objects } = {
    objects,
    async put(key, body, contentType) { objects.set(key, { body, contentType }); },
    async get(key) { return objects.get(key)?.body ?? null; },
    publicUrl(key) { return `${baseUrl}/${key}`; },
  };
  return storage;
}
```

`server/src/storage/r2.ts`:

```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from '../config.js';
import type { Storage } from './index.js';

export function createR2Storage(config: Config): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: config.R2_BUCKET, Key: key, Body: body, ContentType: contentType,
        // Manifesto versionado e figurinha são imutáveis: cache eterno.
        // O ponteiro catalog/current.json MUDA a cada publicação — cache curto,
        // senão publicar catálogo novo nunca chega ao app.
        CacheControl: isMutablePointer(key)
          ? 'public, max-age=60, must-revalidate'
          : 'public, max-age=31536000, immutable',
      }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
        return Buffer.from(await res.Body!.transformToByteArray());
      } catch {
        return null;
      }
    },
    publicUrl(key) {
      return `${config.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npm test -- storage`
Expected: PASS — 3 testes

- [ ] **Step 5: Ligar no app**

Acrescente `storage: Storage` a `AppDeps` em `server/src/app.ts`. Em `server/src/server.ts`, use `createR2Storage(config)`. Nos testes existentes que chamam `buildApp`, passe `storage: createMemoryStorage()`.

- [ ] **Step 6: Commit**

```bash
git add server/src/storage server/tests/unit/storage-memory.test.ts
git commit -m "feat(storage): interface de storage com R2 e implementação em memória"
```

---

### Task 11: Pacotes, categorias e upload de figurinhas

**Files:**
- Create: `server/src/routes/packs.ts`, `server/src/routes/stickers.ts`
- Modify: `server/src/app.ts` (registrar multipart e as rotas)
- Test: `server/tests/integration/packs.test.ts`, `server/tests/integration/stickers.test.ts`

**Interfaces:**
- Consumes: guardas (Task 4), `recordAudit` (Task 5), `validatePng` (Task 9), `Storage` (Task 10).
- Produces: `POST /packs`, `GET /packs`, `GET /packs/:id`, `PATCH /packs/:id`, `POST /packs/:id/categories`, `POST /packs/:id/stickers` (multipart), `DELETE /stickers/:id`.

- [ ] **Step 1: Escrever os testes que falham**

`server/tests/integration/stickers.test.ts` — reutilize o bloco de config e o helper `criarELogar` do Task 7, acrescentando `storage: createMemoryStorage()` ao `buildApp`:

```ts
import FormData from 'form-data';
import { pngComAlfa, pngSemAlfa } from '../fixtures/make-fixtures.js';
import { stickers } from '../../src/db/schema.js';

async function subirFigurinha(cookie: string, packId: string, id: string, buffer: Buffer) {
  const form = new FormData();
  form.append('id', id);
  form.append('name', 'Seta reta');
  form.append('tags', JSON.stringify(['seta', 'apontar']));
  form.append('file', buffer, { filename: `${id}.png`, contentType: 'image/png' });
  return app.inject({
    method: 'POST', url: `/packs/${packId}/stickers`,
    headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
  });
}

describe('POST /packs/:id/stickers', () => {
  it('aceita PNG válido e grava os metadados', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, 'seta-reta', await pngComAlfa());
    expect(res.statusCode).toBe(201);

    const [s] = await t.db.select().from(stickers);
    expect(s!.id).toBe('seta-reta');
    expect(s!.width).toBe(1024);
    expect(s!.tags).toEqual(['seta', 'apontar']);
  });

  it('guarda no storage exatamente os bytes recebidos', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);
    const original = await pngComAlfa();
    await subirFigurinha(cookie, packId, 'circulo', original);

    const [s] = await t.db.select().from(stickers);
    expect(await storage.get(s!.fileKey)).toEqual(original);
  });

  it('recusa PNG sem alfa com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, 'sem-alfa', await pngSemAlfa());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/transparente/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  it('recusa id já usado em outro pacote', async () => {
    const cookie = await criarELogar('admin');
    const a = await criarPackComCategoria(cookie, 'pack-a');
    const b = await criarPackComCategoria(cookie, 'pack-b');
    await subirFigurinha(cookie, a.packId, 'repetido', await pngComAlfa());
    const res = await subirFigurinha(cookie, b.packId, 'repetido', await pngComAlfa());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/já existe/i);
  });

  it('recusa gerente sem sticker.import com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(admin);
    const gerente = await criarELogar('gerente', ['pack.edit']);
    const res = await subirFigurinha(gerente, packId, 'x', await pngComAlfa());
    expect(res.statusCode).toBe(403);
  });

  it('recusa id fora do formato slug', async () => {
    const cookie = await criarELogar('admin');
    const { packId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, 'Seta Reta!', await pngComAlfa());
    expect(res.statusCode).toBe(400);
  });
});
```

`server/tests/integration/packs.test.ts`:

```ts
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
      payload: { slug: 'x', name: 'X', authorName: 'A' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa slug duplicado', async () => {
    const cookie = await criarELogar('admin');
    const payload = { slug: 'igual', name: 'Igual', authorName: 'A' };
    await app.inject({ method: 'POST', url: '/packs', headers: { cookie }, payload });
    const res = await app.inject({ method: 'POST', url: '/packs', headers: { cookie }, payload });
    expect(res.statusCode).toBe(409);
  });
});

describe('PATCH /packs/:id', () => {
  it('recusa quem tem pack.create mas não pack.edit', async () => {
    const admin = await criarELogar('admin');
    const criado = await app.inject({
      method: 'POST', url: '/packs', headers: { cookie: admin },
      payload: { slug: 'p', name: 'P', authorName: 'A' },
    });
    const cookie = await criarELogar('gerente', ['pack.create']);
    const res = await app.inject({
      method: 'PATCH', url: `/packs/${criado.json().id}`, headers: { cookie },
      payload: { name: 'Outro nome' },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

Acrescente `form-data` a `devDependencies` (`npm i -D form-data`) e escreva o helper `criarPackComCategoria(cookie, slug?)`, que faz `POST /packs` seguido de `POST /packs/:id/categories` e devolve `{ packId, categoryId }`.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd server && npm test -- packs stickers`
Expected: FAIL — rotas inexistentes (404)

- [ ] **Step 3: Implementar pacotes**

`server/src/routes/packs.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { recordAudit } from '../audit.js';

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const createSchema = z.object({
  slug: z.string().regex(slugRegex, 'O identificador aceita apenas letras minúsculas, números e hífen.'),
  name: z.string().min(2),
  description: z.string().default(''),
  authorName: z.string().min(2),
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function packRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  app.get('/packs', { preHandler: requireAuth }, async () =>
    db.select().from(packs).orderBy(asc(packs.sortOrder), asc(packs.name)));

  app.get('/packs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });
    const cats = await db.select().from(categories)
      .where(eq(categories.packId, id)).orderBy(asc(categories.sortOrder));
    const figs = await db.select().from(stickers)
      .where(eq(stickers.packId, id)).orderBy(asc(stickers.sortOrder));
    return { ...pack, categories: cats, stickers: figs };
  });

  app.post('/packs', {
    preHandler: [requireAuth, requirePermission('pack.create')],
  }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]!.message });
    }
    const [existe] = await db.select().from(packs)
      .where(eq(packs.slug, parsed.data.slug)).limit(1);
    if (existe) return reply.code(409).send({ error: 'Já existe um pacote com esse identificador.' });

    const [pack] = await db.insert(packs).values({
      ...parsed.data, createdBy: request.currentUser!.id,
    }).returning();

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.create',
      entityType: 'pack', entityId: pack!.id, payload: { slug: pack!.slug },
    });
    return reply.code(201).send(pack);
  });

  app.patch('/packs/:id', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    await db.update(packs).set(parsed.data).where(eq(packs.id, id));
    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.update',
      entityType: 'pack', entityId: id, payload: { ...parsed.data },
    });
    return { ok: true };
  });

  app.post('/packs/:id/categories', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({
      name: z.string().min(2), sortOrder: z.number().int().default(0),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nome da categoria inválido.' });

    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const [cat] = await db.insert(categories).values({ packId: id, ...parsed.data }).returning();
    return reply.code(201).send(cat);
  });
}
```

- [ ] **Step 4: Implementar upload de figurinhas**

`server/src/routes/stickers.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { validatePng } from '../content/validatePng.js';
import { recordAudit } from '../audit.js';

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function stickerRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;

  app.post('/packs/:id/stickers', {
    preHandler: [requireAuth, requirePermission('sticker.import')],
  }, async (request, reply) => {
    const { id: packId } = request.params as { id: string };

    const [pack] = await db.select().from(packs).where(eq(packs.id, packId)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const parts = await request.saveRequestFiles({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
    const file = parts[0];
    if (!file) return reply.code(400).send({ error: 'Envie o arquivo PNG da figurinha.' });

    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const meta = z.object({
      id: z.string().regex(slugRegex, 'O id aceita apenas letras minúsculas, números e hífen.'),
      name: z.string().min(1),
      categoryId: z.string().uuid(),
      tags: z.string().default('[]'),
    }).safeParse({
      id: fields.id?.value, name: fields.name?.value,
      categoryId: fields.categoryId?.value, tags: fields.tags?.value,
    });
    if (!meta.success) return reply.code(400).send({ error: meta.error.issues[0]!.message });

    const [cat] = await db.select().from(categories)
      .where(eq(categories.id, meta.data.categoryId)).limit(1);
    if (!cat || cat.packId !== packId) {
      return reply.code(400).send({ error: 'Categoria não pertence a este pacote.' });
    }

    // Checagem antes de gravar no storage: id duplicado corromperia os favoritos
    // de quem já usa o app, porque lá o id é gravado puro.
    const [jaExiste] = await db.select().from(stickers)
      .where(eq(stickers.id, meta.data.id)).limit(1);
    if (jaExiste) {
      return reply.code(409).send({ error: `Já existe uma figurinha com o id "${meta.data.id}".` });
    }

    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(file.filepath));
    const validation = await validatePng(buffer);
    if (!validation.ok) return reply.code(400).send({ error: validation.error });

    const fileKey = `packs/${pack.slug}/${meta.data.id}.png`;
    // Os bytes originais vão inalterados: reencodar poderia perder o alfa.
    await storage.put(fileKey, buffer, 'image/png');

    const [sticker] = await db.insert(stickers).values({
      id: meta.data.id, packId, categoryId: meta.data.categoryId, name: meta.data.name,
      tags: JSON.parse(meta.data.tags) as string[], fileKey,
      width: validation.width, height: validation.height,
      bytes: validation.bytes, checksum: validation.checksum,
    }).returning();

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'sticker.import',
      entityType: 'sticker', entityId: sticker!.id, payload: { packId, fileKey },
    });
    return reply.code(201).send(sticker);
  });

  app.delete('/stickers/:id', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [s] = await db.select().from(stickers).where(eq(stickers.id, id)).limit(1);
    if (!s) return reply.code(404).send({ error: 'Figurinha não encontrada.' });

    await db.delete(stickers).where(eq(stickers.id, id));
    // O objeto no R2 permanece: manifestos já publicados ainda o referenciam.
    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'sticker.delete',
      entityType: 'sticker', entityId: id, payload: { fileKey: s.fileKey },
    });
    return { ok: true };
  });
}
```

- [ ] **Step 5: Registrar multipart e as rotas**

Em `server/src/app.ts`, antes das rotas:

```ts
import multipart from '@fastify/multipart';
// ...
app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
app.register(packRoutes);
app.register(stickerRoutes);
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd server && npm test`
Expected: PASS — todos os testes

- [ ] **Step 7: Commit**

```bash
git add server/src/routes server/src/app.ts server/tests
git commit -m "feat(packs): CRUD de pacotes e upload de figurinhas com bytes preservados"
```

---

### Task 12: Publicação do catálogo

**Files:**
- Create: `server/src/content/manifest.ts`, `server/src/routes/publish.ts`
- Test: `server/tests/unit/manifest.test.ts`, `server/tests/integration/publish.test.ts`

**Interfaces:**
- Consumes: `Storage` (Task 10), guardas (Task 4), `recordAudit` (Task 5).
- Produces:
  - `buildManifest(input: ManifestInput, version: number): Manifest` — puro, sem I/O
  - `POST /publish`, `POST /publish/rollback`, `GET /publish/versions`

**Formato:** o manifesto tem que casar com `Content/manifest.json` do MVP, para que o P2 apenas troque a fonte sem reescrever os modelos do módulo Catalog.

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/unit/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/content/manifest.js';

const input = {
  packs: [{
    slug: 'harmonizacao', name: 'Harmonização', coverKey: 'packs/harmonizacao/cover.png',
    categories: [
      { id: 'c1', name: 'Setas', sortOrder: 0 },
      { id: 'c2', name: 'Frases', sortOrder: 1 },
    ],
    stickers: [
      { id: 'seta-reta', name: 'Seta reta', tags: ['seta'], fileKey: 'packs/harmonizacao/seta-reta.png', categoryId: 'c1', sortOrder: 0 },
      { id: 'resultado', name: 'Resultado', tags: ['frase'], fileKey: 'packs/harmonizacao/resultado.png', categoryId: 'c2', sortOrder: 0 },
    ],
  }],
};

describe('buildManifest', () => {
  it('produz o formato consumido pelo app', () => {
    const m = buildManifest(input, 3);
    expect(m.version).toBe(3);
    expect(m.packs[0]!.id).toBe('harmonizacao');
    expect(m.packs[0]!.cover).toBe('packs/harmonizacao/cover.png');
    expect(m.packs[0]!.free).toBe(true);
  });

  it('agrupa cada figurinha na categoria certa', () => {
    const m = buildManifest(input, 1);
    const [setas, frases] = m.packs[0]!.categories;
    expect(setas!.stickers.map((s) => s.id)).toEqual(['seta-reta']);
    expect(frases!.stickers.map((s) => s.id)).toEqual(['resultado']);
  });

  it('omite categoria sem figurinha', () => {
    const m = buildManifest({
      packs: [{ ...input.packs[0]!, stickers: [input.packs[0]!.stickers[0]!] }],
    }, 1);
    expect(m.packs[0]!.categories).toHaveLength(1);
  });

  it('omite pacote que ficou sem figurinha nenhuma', () => {
    const m = buildManifest({ packs: [{ ...input.packs[0]!, stickers: [] }] }, 1);
    expect(m.packs).toHaveLength(0);
  });
});
```

Omitir categoria e pacote vazios espelha o que `CatalogStore` já faz no app (poda categorias vazias). Fazer isso na origem evita que o app receba lixo.

`server/tests/integration/publish.test.ts`:

```ts
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
});
```

Escreva `criarPackPublicavel(cookie)`: cria pacote, categoria, sobe uma figurinha válida e faz `PATCH` marcando `status: 'published'`.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd server && npm test -- manifest publish`
Expected: FAIL — módulos e rotas inexistentes

- [ ] **Step 3: Implementar o manifesto**

`server/src/content/manifest.ts`:

```ts
export type ManifestInput = {
  packs: Array<{
    slug: string;
    name: string;
    coverKey: string | null;
    categories: Array<{ id: string; name: string; sortOrder: number }>;
    stickers: Array<{
      id: string; name: string; tags: string[];
      fileKey: string; categoryId: string; sortOrder: number;
    }>;
  }>;
};

export type Manifest = {
  version: number;
  packs: Array<{
    id: string; name: string; cover: string | null; free: boolean;
    categories: Array<{
      id: string; name: string;
      stickers: Array<{ id: string; name: string; tags: string[]; file: string }>;
    }>;
  }>;
};

// Mantém o formato de Content/manifest.json do MVP: o P2 troca a fonte sem
// reescrever os modelos do módulo Catalog no app.
export function buildManifest(input: ManifestInput, version: number): Manifest {
  const packs = input.packs.map((pack) => {
    const categories = [...pack.categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        stickers: pack.stickers
          .filter((s) => s.categoryId === cat.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ id: s.id, name: s.name, tags: s.tags, file: s.fileKey })),
      }))
      // Categoria vazia no app vira um chip que não filtra nada.
      .filter((cat) => cat.stickers.length > 0);

    return {
      id: pack.slug, name: pack.name, cover: pack.coverKey,
      // free continua true no P1: preço entra no P3.
      free: true,
      categories,
    };
  }).filter((pack) => pack.categories.length > 0);

  return { version, packs };
}
```

- [ ] **Step 4: Implementar a rota de publicação**

`server/src/routes/publish.ts`:

```ts
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers, catalogVersions } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { buildManifest, type ManifestInput } from '../content/manifest.js';
import { recordAudit } from '../audit.js';

export async function publishRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;

  app.get('/publish/versions', { preHandler: requireAuth }, async () =>
    db.select().from(catalogVersions).orderBy(desc(catalogVersions.version)));

  app.post('/publish', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const publicados = await db.select().from(packs).where(eq(packs.status, 'published'));
    const input: ManifestInput = { packs: [] };

    for (const pack of publicados) {
      input.packs.push({
        slug: pack.slug, name: pack.name, coverKey: pack.coverKey,
        categories: await db.select().from(categories).where(eq(categories.packId, pack.id)),
        stickers: await db.select().from(stickers).where(eq(stickers.packId, pack.id)),
      });
    }

    const [ultima] = await db.select().from(catalogVersions)
      .orderBy(desc(catalogVersions.version)).limit(1);
    const version = (ultima?.version ?? 0) + 1;

    const manifest = buildManifest(input, version);
    const body = Buffer.from(JSON.stringify(manifest, null, 2));
    const manifestKey = `catalog/v${version}.json`;
    const checksum = createHash('sha256').update(body).digest('hex');

    // O manifesto versionado é imutável; só o ponteiro muda.
    await storage.put(manifestKey, body, 'application/json');

    await db.transaction(async (tx) => {
      await tx.update(catalogVersions).set({ isCurrent: false })
        .where(eq(catalogVersions.isCurrent, true));
      await tx.insert(catalogVersions).values({
        version, manifestKey, checksum,
        publishedBy: request.currentUser!.id, isCurrent: true,
      });
    });

    await storage.put(
      'catalog/current.json',
      Buffer.from(JSON.stringify({ version, manifest: storage.publicUrl(manifestKey), checksum })),
      'application/json',
    );

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'catalog.publish',
      entityType: 'catalog', entityId: String(version),
      payload: { version, packs: manifest.packs.length },
    });

    return reply.code(201).send({ version, url: storage.publicUrl(manifestKey), checksum });
  });

  app.post('/publish/rollback', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Versão inválida.' });

    const [alvo] = await db.select().from(catalogVersions)
      .where(eq(catalogVersions.version, parsed.data.version)).limit(1);
    if (!alvo) return reply.code(404).send({ error: 'Essa versão do catálogo não existe.' });

    // Rollback é trocar o ponteiro. Nenhum manifesto é apagado ou reescrito.
    await db.transaction(async (tx) => {
      await tx.update(catalogVersions).set({ isCurrent: false })
        .where(eq(catalogVersions.isCurrent, true));
      await tx.update(catalogVersions).set({ isCurrent: true })
        .where(eq(catalogVersions.version, alvo.version));
    });

    await storage.put(
      'catalog/current.json',
      Buffer.from(JSON.stringify({
        version: alvo.version,
        manifest: storage.publicUrl(alvo.manifestKey),
        checksum: alvo.checksum,
      })),
      'application/json',
    );

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'catalog.rollback',
      entityType: 'catalog', entityId: String(alvo.version),
    });
    return { version: alvo.version };
  });
}
```

Registre `publishRoutes` em `server/src/app.ts`.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd server && npm test`
Expected: PASS — todos os testes

- [ ] **Step 6: Commit**

```bash
git add server/src server/tests
git commit -m "feat(publish): manifesto versionado imutável com rollback por ponteiro"
```

---

### Task 13: Painel — login e navegação

**Files:**
- Create: `admin/package.json`, `admin/vite.config.ts`, `admin/index.html`, `admin/tsconfig.json`
- Create: `admin/src/main.tsx`, `admin/src/api.ts`, `admin/src/auth.tsx`, `admin/src/App.tsx`
- Create: `admin/src/pages/Login.tsx`, `admin/src/pages/AceitarConvite.tsx`, `admin/src/pages/TrocarSenha.tsx`
- Create: `admin/src/styles.css`

**Interfaces:**
- Consumes: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`, `POST /invites/accept`.
- Produces: `apiFetch<T>(path, init?): Promise<T>` de `src/api.ts`; `useAuth()` de `src/auth.tsx` devolvendo `{ user, login, logout, refresh }`; `can(permission)` para esconder controles na interface.

**Lembrete:** `can()` serve só para não mostrar botão inútil. **A autorização de verdade é a do servidor** — a interface não protege nada.

- [ ] **Step 1: Criar o projeto**

```bash
cd /Users/felipedaige/Desktop/Programming/Swift/bodycreator
npm create vite@latest admin -- --template react-ts
cd admin && npm install && npm install react-router-dom
```

- [ ] **Step 2: Cliente HTTP**

`admin/src/api.ts`:

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Sem isto o cookie de sessão não viaja e tudo responde 401.
    credentials: 'include',
    headers: init.body instanceof FormData
      ? (init.headers ?? {})
      : { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'Algo deu errado. Tente de novo.');
  }
  return body as T;
}
```

- [ ] **Step 3: Contexto de sessão**

`admin/src/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';

export type User = {
  id: string; email: string; name: string;
  role: 'admin' | 'gerente'; permissions: string[]; mustChangePassword: boolean;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  can(permission: string): boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try { setUser(await apiFetch<User>('/auth/me')); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const value: Ctx = {
    user, loading,
    async login(email, password) {
      setUser(await apiFetch<User>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }));
    },
    async logout() {
      await apiFetch('/auth/logout', { method: 'POST' });
      setUser(null);
    },
    refresh,
    // Espelha canDo() do servidor, mas serve apenas para esconder controle.
    can(permission) {
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (permission === 'user.manage') return false;
      return user.permissions.includes(permission);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Telas de login, convite e troca de senha**

`admin/src/pages/Login.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try { await login(email, password); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível entrar.'); }
    finally { setEnviando(false); }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Body Creator</h1>
      <p className="sub">Painel de administração</p>
      <label>E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label>Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
```

`admin/src/pages/AceitarConvite.tsx` — lê `?token=` da URL e envia `POST /invites/accept` com nome e senha, mostrando a regra de 10 caracteres antes do envio e a mensagem do servidor em caso de convite expirado.

`admin/src/pages/TrocarSenha.tsx` — formulário de `POST /auth/change-password`. É a tela obrigatória de quem entra com `mustChangePassword: true`.

- [ ] **Step 5: Rotas e bloqueio de troca de senha**

`admin/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Login } from './pages/Login';
import { AceitarConvite } from './pages/AceitarConvite';
import { TrocarSenha } from './pages/TrocarSenha';
import { Packs } from './pages/Packs';
import { PackEditor } from './pages/PackEditor';
import { Users } from './pages/Users';

function Protegido() {
  const { user, loading } = useAuth();
  if (loading) return <p>Carregando…</p>;
  if (!user) return <Login />;
  // Senha inicial do seeder não pode sobreviver ao primeiro acesso.
  if (user.mustChangePassword) return <TrocarSenha />;
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/pacotes" replace />} />
      <Route path="/pacotes" element={<Packs />} />
      <Route path="/pacotes/:id" element={<PackEditor />} />
      <Route path="/usuarios" element={<Users />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/convite" element={<AceitarConvite />} />
          <Route path="*" element={<Protegido />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Verificar manualmente**

```bash
cd server && npm run dev          # terminal 1
cd admin  && npm run dev          # terminal 2
```

Com o servidor no ar e o admin semeado, abra `http://localhost:5173`, entre com a conta do seeder e confirme que a tela de troca de senha aparece antes de qualquer outra.

Expected: login funciona, troca de senha obrigatória bloqueia o resto, `/pacotes` abre depois

- [ ] **Step 7: Commit**

```bash
git add admin
git commit -m "feat(admin): painel React com login, convite e troca de senha obrigatória"
```

---

### Task 14: Painel — pacotes, upload e usuários

**Files:**
- Create: `admin/src/pages/Packs.tsx`, `admin/src/pages/PackEditor.tsx`, `admin/src/pages/Users.tsx`
- Create: `admin/src/components/Layout.tsx`, `admin/src/components/PermissionPicker.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `useAuth().can` (Task 13); rotas dos Tasks 7, 11 e 12.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Layout com navegação condicional**

`admin/src/components/Layout.tsx` — barra lateral com "Pacotes" e, apenas quando `can('user.manage')`, "Usuários"; cabeçalho com nome do usuário e botão Sair.

- [ ] **Step 2: Lista de pacotes**

`admin/src/pages/Packs.tsx` — `GET /packs`, tabela com nome, identificador, status e contagem de figurinhas. Botão "Novo pacote" só quando `can('pack.create')`. Botão "Publicar catálogo" só quando `can('pack.publish')`, chamando `POST /publish` e mostrando a versão gerada.

- [ ] **Step 3: Editor do pacote com upload**

`admin/src/pages/PackEditor.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../api';

export function UploadFigurinha({ packId, categoryId, onPronto }: {
  packId: string; categoryId: string; onPronto: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) { setErro('Escolha o arquivo PNG da figurinha.'); return; }
    setErro(''); setEnviando(true);

    const form = new FormData();
    form.append('id', id);
    form.append('name', name);
    form.append('categoryId', categoryId);
    form.append('tags', JSON.stringify(
      tags.split(',').map((t) => t.trim()).filter(Boolean),
    ));
    form.append('file', arquivo);

    try {
      await apiFetch(`/packs/${packId}/stickers`, { method: 'POST', body: form });
      setId(''); setName(''); setTags(''); setArquivo(null);
      onPronto();
    } catch (e) {
      // O servidor devolve exatamente qual regra falhou, em pt-BR. Mostrar essa
      // mensagem crua é melhor do que um "erro no upload" genérico.
      setErro(e instanceof ApiError ? e.message : 'Não foi possível enviar a figurinha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="upload">
      {/* As regras aparecem antes do envio para ninguém descobrir o limite errando. */}
      <p className="sub">
        PNG com fundo transparente, até 2 MB, maior lado entre 512 e 2048 px.
      </p>
      <label>Identificador
        <input value={id} onChange={(e) => setId(e.target.value)} required
               placeholder="seta-reta" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <small>Letras minúsculas, números e hífen.</small>
      </label>
      <label>Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)}
               placeholder="seta, apontar, marcação" />
        <small>Separadas por vírgula.</small>
      </label>
      <label>Arquivo
        <input type="file" accept="image/png"
               onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} required />
      </label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar figurinha'}</button>
    </form>
  );
}
```

- [ ] **Step 4: Usuários e permissões**

`admin/src/pages/Users.tsx` — `GET /users` em tabela com nome, e-mail, papel, status e último acesso. Botão "Convidar" abre formulário com e-mail, papel e `PermissionPicker`.

`admin/src/components/PermissionPicker.tsx` — caixas de seleção com rótulos em pt-BR:

```tsx
export const PERMISSOES = [
  { id: 'sticker.import', label: 'Importar figurinhas' },
  { id: 'pack.create', label: 'Criar pacotes' },
  { id: 'pack.edit', label: 'Editar pacotes' },
  { id: 'pack.publish', label: 'Publicar o catálogo' },
  { id: 'pack.price', label: 'Definir preços' },
  { id: 'report.view', label: 'Ver faturamento' },
  { id: 'user.manage', label: 'Gerenciar usuários', somenteAdmin: true },
] as const;
```

Quando o papel escolhido for `gerente`, a opção "Gerenciar usuários" aparece desabilitada com a explicação "Exclusiva de administradores" — em vez de sumir. Some sem explicação vira dúvida; desabilitada com motivo ensina a regra.

- [ ] **Step 5: Verificar manualmente os dois papéis**

Entre como admin, convide um gerente com apenas "Importar figurinhas", aceite o convite em uma janela anônima e confirme que:

- o gerente não vê "Usuários" no menu;
- o gerente não vê o botão "Publicar catálogo";
- chamar `POST /publish` direto pelo console devolve **403** — a interface esconde, o servidor recusa.

Expected: os três comportamentos confirmados

- [ ] **Step 6: Commit**

```bash
git add admin
git commit -m "feat(admin): telas de pacotes, upload de figurinhas e gestão de permissões"
```

---

### Task 15: Produção — Docker, Caddy e deploy

**Files:**
- Create: `infra/Dockerfile.api`, `infra/Dockerfile.admin`, `infra/docker-compose.yml`, `infra/Caddyfile`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Create: `docs/OPERACAO.md`

**Interfaces:**
- Consumes: `npm run build`, `npm start`, `npm run db:migrate` do server (Task 1).
- Produces: ambiente de produção acessível por HTTPS.

- [ ] **Step 1: Imagens**

`infra/Dockerfile.api`:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
USER node
CMD ["node", "dist/server.js"]
```

`infra/Dockerfile.admin`:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
ARG VITE_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
```

- [ ] **Step 2: Compose e Caddy**

`infra/docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      retries: 5

  api:
    image: ghcr.io/${GH_REPO}/api:${TAG:-latest}
    restart: unless-stopped
    env_file: [.env]
    depends_on:
      db: { condition: service_healthy }

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - admin_dist:/srv:ro
    depends_on: [api]

  admin:
    image: ghcr.io/${GH_REPO}/admin:${TAG:-latest}
    volumes: ["admin_dist:/srv"]
    command: ["sh", "-c", "cp -r /srv/. /out/ && sleep infinity"]

volumes:
  pgdata:
  caddy_data:
  admin_dist:
```

`infra/Caddyfile`:

```
{$PANEL_DOMAIN} {
    encode gzip
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy api:3000
    }
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
}
```

O painel e a API compartilham o mesmo domínio, com a API sob `/api`. Isso mantém o cookie de sessão **same-site** e evita toda a categoria de problema de cookie entre domínios.

- [ ] **Step 3: CI**

`.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: bodycreator
          POSTGRES_PASSWORD: bodycreator
          POSTGRES_DB: bodycreator_test
        ports: ["55432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: server/package-lock.json }
      - run: npm ci
        working-directory: server
      - run: npm test
        working-directory: server
        env:
          TEST_DATABASE_URL: postgres://bodycreator:bodycreator@localhost:55432/bodycreator_test
```

- [ ] **Step 4: Deploy**

`.github/workflows/deploy.yml` — dispara em push na `main`, constrói e publica as duas imagens no GHCR, conecta por SSH usando `secrets.VPS_HOST`, `secrets.VPS_USER` e `secrets.VPS_SSH_KEY`, e no servidor roda:

```bash
cd /opt/bodycreator
docker compose pull
docker compose run --rm api node dist/db/migrate.js
docker compose up -d
docker image prune -f
```

Migração antes de subir a nova API é o que evita a janela em que o código novo fala com o esquema velho.

- [ ] **Step 5: Endurecer o VPS e documentar**

`docs/OPERACAO.md` com os passos exatos, para que o servidor seja reconstruível do zero:

```bash
# SSH somente por chave
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Firewall
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable

# Atualizações de segurança automáticas
sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

Documente também: onde fica o `.env`, como rodar o seeder pela primeira vez (`docker compose run --rm -e ADMIN_SEED_EMAIL=... -e ADMIN_SEED_PASSWORD=... api node dist/seed-admin.js`) e como restaurar um backup.

- [ ] **Step 6: Monitor de uptime**

Cadastre `https://<domínio>/api/health` em um monitor externo gratuito (UptimeRobot), com alerta por e-mail. Monitor rodando no próprio VPS não avisa quando o VPS cai.

Expected: alerta de teste recebido

- [ ] **Step 7: Commit**

```bash
git add infra .github docs/OPERACAO.md
git commit -m "feat(infra): produção em Docker Compose com Caddy, CI e deploy automatizado"
```

---

### Task 16: Backup com restauração verificada

**Files:**
- Create: `infra/backup.sh`, `infra/restore-check.sh`
- Modify: `docs/OPERACAO.md` (seção de recuperação)

**Interfaces:**
- Consumes: o serviço `db` do compose (Task 15) e as credenciais do R2 (Task 10).
- Produces: dumps diários em `backups/` no R2 e um relatório mensal de restauração.

Este task é o que separa "tenho backup" de "consigo voltar". É também o que mais falta em projeto de VPS.

- [ ] **Step 1: Script de backup**

`infra/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/bodycreator
source .env

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="bodycreator-${STAMP}.sql.gz"
TMP="/tmp/${FILE}"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -9 > "$TMP"

# Dump vazio ou minúsculo indica falha silenciosa: melhor falhar alto agora do
# que descobrir na hora de restaurar.
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERRO: dump com apenas ${SIZE} bytes — abortando." >&2
  rm -f "$TMP"
  exit 1
fi

aws s3 cp "$TMP" "s3://${R2_BUCKET}/backups/${FILE}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

rm -f "$TMP"

# Retenção de 30 dias
CUTOFF=$(date -u -d '30 days ago' +%Y%m%d)
aws s3 ls "s3://${R2_BUCKET}/backups/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  | awk '{print $4}' | while read -r name; do
      d=$(echo "$name" | sed -n 's/bodycreator-\([0-9]\{8\}\)T.*/\1/p')
      [ -n "$d" ] && [ "$d" -lt "$CUTOFF" ] && \
        aws s3 rm "s3://${R2_BUCKET}/backups/${name}" \
          --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    done

echo "Backup concluído: ${FILE} (${SIZE} bytes)"
```

- [ ] **Step 2: Script de restauração verificada**

`infra/restore-check.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/bodycreator
source .env

LATEST=$(aws s3 ls "s3://${R2_BUCKET}/backups/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  | sort | tail -1 | awk '{print $4}')

echo "Verificando restauração de ${LATEST}"
aws s3 cp "s3://${R2_BUCKET}/backups/${LATEST}" /tmp/check.sql.gz \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Container descartável, isolado do banco de produção.
docker run -d --name restore-check -e POSTGRES_PASSWORD=check postgres:16-alpine
trap 'docker rm -f restore-check >/dev/null 2>&1 || true' EXIT

until docker exec restore-check pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

gunzip -c /tmp/check.sql.gz | docker exec -i restore-check psql -U postgres -d postgres >/dev/null

TABELAS=$(docker exec restore-check psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")

# 7 tabelas: users, invites, packs, categories, stickers, catalog_versions, audit_log
if [ "$TABELAS" -lt 7 ]; then
  echo "FALHA: restauração trouxe apenas ${TABELAS} tabelas." >&2
  exit 1
fi

USUARIOS=$(docker exec restore-check psql -U postgres -d postgres -tAc "SELECT count(*) FROM users")
if [ "$USUARIOS" -lt 1 ]; then
  echo "FALHA: banco restaurado sem nenhum usuário." >&2
  exit 1
fi

rm -f /tmp/check.sql.gz
echo "OK: restauração verificada — ${TABELAS} tabelas, ${USUARIOS} usuários."
```

Verificar a contagem de tabelas **e** a de usuários é deliberado: um dump que restaura o esquema mas perdeu os dados passaria numa checagem que só olha tabelas.

- [ ] **Step 3: Agendar**

```bash
sudo chmod +x /opt/bodycreator/infra/backup.sh /opt/bodycreator/infra/restore-check.sh
sudo crontab -e
```

```cron
15 4 * * *  /opt/bodycreator/infra/backup.sh        >> /var/log/bodycreator-backup.log 2>&1
30 5 1 * *  /opt/bodycreator/infra/restore-check.sh >> /var/log/bodycreator-restore.log 2>&1
```

- [ ] **Step 4: Executar os dois uma vez, à mão**

```bash
/opt/bodycreator/infra/backup.sh
/opt/bodycreator/infra/restore-check.sh
```

Expected: `Backup concluído: bodycreator-…` e `OK: restauração verificada — 7 tabelas, N usuários.`

Um plano que só agenda o backup e nunca o roda entrega uma promessa não verificada. Rodar os dois agora é o aceite deste task.

- [ ] **Step 5: Commit**

```bash
git add infra/backup.sh infra/restore-check.sh docs/OPERACAO.md
git commit -m "feat(infra): backup diário com verificação mensal de restauração"
```

---

## Aceite do P1

O sub-projeto está pronto quando:

1. Um gerente convidado por e-mail entra, sobe figurinhas e monta um pacote.
2. Esse gerente, **sem** `pack.publish`, recebe 403 ao chamar `POST /publish` direto — não apenas deixa de ver o botão.
3. Publicar gera `catalog/vN.json` no R2, acessível pela URL pública do CDN, no formato que o app do P2 vai consumir.
4. Rollback devolve o ponteiro sem apagar nenhum manifesto.
5. `restore-check.sh` roda e passa.
6. A suíte inteira passa em CI, com saída limpa.

## Notas de autorrevisão

Verificado contra o spec, item a item:

- **Cobertura:** todas as seções do spec têm task correspondente. A única exceção deliberada é a seção 1 (contexto e decisões de negócio), que não gera código.
- **Consistência de tipos:** `AppDeps` cresce em quatro momentos (Tasks 1, 4, 6, 10) e cada task diz explicitamente qual é a forma nova e que os `buildApp` dos testes anteriores precisam ser atualizados.
- **`pack.price` e `report.view`** existem desde o Task 3 sem efeito prático, exatamente como o spec pede, para que o P3 não precise migrar permissões de contas já criadas.
- **Formato do manifesto** (Task 12) mantém compatibilidade com `Content/manifest.json` do MVP, incluindo o campo `free`, que continua `true` no P1.
- **Lacuna conhecida, aceita:** nenhum teste automatizado exercita o R2 real nem o envio real de e-mail. Ambos ficam atrás de interfaces finas (`Storage`, `Mailer`) com implementação em memória nos testes, e são verificados uma vez à mão em staging. Cobrir isso automaticamente exigiria credenciais de serviço no CI, o que troca um risco pequeno por um maior.


