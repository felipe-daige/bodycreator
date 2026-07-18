import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import type { Permission } from './permissions.js';
import { isOwnerEmail } from './ownerAccess.js';
import { SESSION_COOKIE } from './session.js';

export type AuthedUser = {
  id: string; email: string; name: string; mustChangePassword: boolean;
};

// Rotas em que uma conta com senha semeada (mustChangePassword) ainda pode
// operar. Precisa bastar para trocar a senha e sair — nada além disso.
const ALLOWED_WITH_MUST_CHANGE_PASSWORD = ['/auth/me', '/auth/change-password', '/auth/logout'];

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
    id: user.id, email: user.email, name: user.name,
    mustChangePassword: user.mustChangePassword,
  };

  // A senha semeada é tratada como comprometida (spec) — o React já bloqueia
  // a navegação nativa, mas isso é só UX. Sem esta checagem aqui, a conta continua
  // plenamente utilizável para sempre via chamada direta à API.
  if (user.mustChangePassword) {
    const routeUrl = request.routeOptions.url ?? request.url.split('?')[0] ?? request.url;
    if (!ALLOWED_WITH_MUST_CHANGE_PASSWORD.includes(routeUrl)) {
      return reply.code(403).send({ error: 'Troque sua senha inicial antes de continuar.' });
    }
  }
}

export function requirePermission(permission: Permission) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser;
    if (!user) return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });
    // A autorização administrativa é uma política de proprietário único.
    // `permission` permanece na assinatura para as rotas continuarem
    // documentando a intenção de cada operação, mas não concede acesso.
    void permission;
    if (!isOwnerEmail(user.email, request.server.deps.config.OWNER_ADMIN_EMAIL)) {
      return reply.code(403).send({ error: 'Você não tem permissão para esta ação.' });
    }
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthedUser;
  }
}
