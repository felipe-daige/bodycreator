import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { invites, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { setSession, clearSession } from '../auth/session.js';
import { requireAuth } from '../auth/guards.js';
import { recordAudit } from '../audit.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const changeSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) });
const deleteAccountSchema = z.object({ currentPassword: z.string().min(1) });

const LOGIN_LOCKOUT_MAX_FAILURES = 10;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function authRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;
  const isProd = config.NODE_ENV === 'production';

  // Balde por e-mail, em memória: o rate limit de IP (config.rateLimit
  // abaixo) não basta atrás de proxy, onde vários clientes podem chegar sob
  // o mesmo IP e um atacante pode rotacionar IP à vontade — mas a conta-alvo
  // é sempre a mesma. Vive apenas na memória do processo: reinício zera o
  // contador, o que é aceitável (o pior caso é permitir mais 10 tentativas).
  const failedLoginsByEmail = new Map<string, { count: number; windowStart: number }>();

  function isLoginLocked(email: string): boolean {
    const entry = failedLoginsByEmail.get(email);
    if (!entry) return false;
    if (Date.now() - entry.windowStart > LOGIN_LOCKOUT_WINDOW_MS) {
      failedLoginsByEmail.delete(email);
      return false;
    }
    return entry.count >= LOGIN_LOCKOUT_MAX_FAILURES;
  }

  function registerLoginFailure(email: string): void {
    const now = Date.now();
    const entry = failedLoginsByEmail.get(email);
    if (!entry || now - entry.windowStart > LOGIN_LOCKOUT_WINDOW_MS) {
      failedLoginsByEmail.set(email, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
  }

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send({ error: 'E-mail ou senha inválidos.' });

    const email = parsed.data.email.toLowerCase();
    const locked = { error: 'Muitas tentativas para este e-mail. Aguarde alguns minutos e tente novamente.' };
    if (isLoginLocked(email)) return reply.code(429).send(locked);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Mensagem única para senha errada, e-mail inexistente e conta desativada:
    // respostas diferentes permitiriam enumerar quem tem conta.
    const invalid = { error: 'E-mail ou senha inválidos.' };
    if (!user || user.status !== 'active') {
      registerLoginFailure(email);
      return reply.code(401).send(invalid);
    }
    if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
      registerLoginFailure(email);
      return reply.code(401).send(invalid);
    }

    failedLoginsByEmail.delete(email);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    setSession(reply, user.id, isProd);
    return {
      id: user.id, email: user.email, name: user.name,
      mustChangePassword: user.mustChangePassword,
    };
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSession(reply, isProd);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => request.currentUser);

  app.post('/auth/change-password', {
    preHandler: requireAuth,
    // Sem isto, /auth/change-password contorna o limite de tentativas do
    // login: um atacante autenticado poderia forçar a senha atual por aqui
    // sem nenhum freio.
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
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

  app.delete('/auth/account', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Informe sua senha atual para excluir a conta.' });
    }

    const me = request.currentUser!;
    const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      return reply.code(400).send({ error: 'Senha atual incorreta.' });
    }

    // Mantemos apenas o id técnico porque packs, versões e auditoria o
    // referenciam por FK. Nome, e-mail, senha e permissões são apagados; isto
    // preserva a trilha operacional sem preservar a identidade da pessoa.
    const anonymousEmail = `deleted-${user.id}@bodycreator.invalid`;
    const replacementHash = await hashPassword(randomBytes(32).toString('hex'));
    await recordAudit(db, {
      actorId: user.id, action: 'account.delete', entityType: 'user', entityId: user.id,
    });
    await db.transaction(async (tx) => {
      await tx.update(invites).set({ email: anonymousEmail }).where(eq(invites.email, user.email));
      await tx.update(users).set({
        email: anonymousEmail,
        name: 'Conta excluída',
        passwordHash: replacementHash,
        role: 'gerente',
        permissions: [],
        status: 'disabled',
        mustChangePassword: false,
        lastLoginAt: null,
      }).where(eq(users.id, user.id));
    });

    clearSession(reply, isProd);
    return { ok: true };
  });
}
