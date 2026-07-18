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
