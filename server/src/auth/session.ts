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
