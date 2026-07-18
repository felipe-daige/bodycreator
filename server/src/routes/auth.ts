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
