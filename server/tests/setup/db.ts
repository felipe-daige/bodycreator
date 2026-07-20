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
    // onnotice silenciado: reaplicar a migração numa base já migrada gera
    // NOTICE ("já existe, ignorando") que por padrão o driver imprime no
    // console, sujando a saída de todo run subsequente da suíte.
    const migrationClient = postgres(TEST_URL, { max: 1, onnotice: () => {} });
    await migrate(drizzle(migrationClient), { migrationsFolder: './drizzle' });
    await migrationClient.end();
  });

  // Truncar entre casos, em vez de recriar o schema: mais rápido e garante que
  // um teste nunca enxerga o que o anterior escreveu.
  afterEach(async () => {
    await db.execute(sql`
      TRUNCATE audit_log, catalog_versions, stickers, categories, packs, storefront, invites, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => { await client.end(); });

  return holder;
}
