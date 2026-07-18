import { sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';

export function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isOwnerEmail(email: string, ownerEmail: string): boolean {
  return normalizedEmail(email) === normalizedEmail(ownerEmail);
}

/**
 * Reaplica a política de proprietário único antes de a API começar a ouvir.
 * O enum legado `gerente` continua no banco para compatibilidade, mas fora da
 * conta proprietária ele representa uma conta comum, sem qualquer permissão.
 */
export async function enforceSingleAdministrator(db: Db, ownerEmail: string): Promise<boolean> {
  const owner = normalizedEmail(ownerEmail);
  return db.transaction(async (tx) => {
    await tx.update(users)
      .set({ role: 'gerente', permissions: [] })
      .where(sql`lower(${users.email}) <> ${owner}`);

    const promoted = await tx.update(users)
      .set({ role: 'admin', permissions: [] })
      .where(sql`lower(${users.email}) = ${owner}`)
      .returning({ id: users.id });
    if (promoted.length > 1) {
      throw new Error('Há mais de uma conta correspondente ao e-mail proprietário.');
    }
    return promoted.length === 1;
  });
}
