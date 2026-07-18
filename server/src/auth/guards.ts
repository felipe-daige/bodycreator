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
