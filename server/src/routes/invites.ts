import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
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

const acceptQuerySchema = z.object({ token: z.string().min(32) });

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

    // Sem esta checagem, dois convites pendentes para o mesmo e-mail são
    // criáveis; o segundo aceite estouraria a constraint unique(email) de
    // users com 500. Convite expirado não bloqueia — nesse caso o caminho
    // certo é convidar de novo, não reenviar um token morto.
    const [convitePendente] = await db.select().from(invites)
      .where(and(eq(invites.email, lower), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
      .limit(1);
    if (convitePendente) {
      return reply.code(409).send({ error: 'Já existe um convite pendente para esse e-mail. Use o reenvio.' });
    }

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

  app.get('/invites/accept', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    // Sem validar o tipo, ?token[]=x (ou token repetido na query) chega como
    // array e hashToken() estoura 500 ao tentar hashear algo que não é
    // string. zod recusa antes disso, com 400.
    const parsedQuery = acceptQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Convite inválido.' });
    }
    const { token } = parsedQuery.data;
    const [invite] = await db.select().from(invites)
      .where(eq(invites.tokenHash, hashToken(token))).limit(1);
    if (!invite || invite.acceptedAt) {
      return reply.code(400).send({ error: 'Este convite não é mais válido. Peça um novo.' });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: 'Este convite expirou. Peça um novo.' });
    }
    return { email: invite.email, role: invite.role };
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
