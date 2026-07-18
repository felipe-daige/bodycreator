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
