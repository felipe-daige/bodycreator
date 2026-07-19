import { STATUS_CODES } from 'node:http';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Mailer } from './email/send.js';
import type { Storage } from './storage/index.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import { userRoutes } from './routes/users.js';
import { packRoutes } from './routes/packs.js';
import { stickerRoutes } from './routes/stickers.js';
import { publishRoutes } from './routes/publish.js';
import { catalogRoutes } from './routes/catalog.js';
import { storeRoutes } from './routes/store.js';
import type { StoreTransactionVerifier } from './store/transactionVerifier.js';

export type AppDeps = {
  config: Config;
  db: Db;
  mailer: Mailer;
  storage: Storage;
  storeTransactionVerifier?: StoreTransactionVerifier;
};

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== 'test',
    bodyLimit: 5 * 1024 * 1024,
    // O container da API só é alcançável via Caddy, dentro da rede do
    // compose — confiar no proxy é seguro aqui. Sem isto, request.ip é
    // sempre o IP do Caddy, e o rate limit (que usa o IP como chave por
    // padrão) vira um balde global compartilhado por todo mundo atrás dele.
    trustProxy: true,
  });
  app.decorate('deps', deps);

  app.register(cookie, { secret: deps.config.SESSION_SECRET });
  app.register(rateLimit, { global: false });
  app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  // Traduz para pt-BR as respostas de erro que o próprio framework gera (não
  // passam pelos handlers das rotas, que já respondem em pt-BR por conta
  // própria). Qualquer outro erro mantém o comportamento padrão do Fastify,
  // inclusive o log completo em nível error para status >= 500 — nunca
  // engolir stack de erro de servidor.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 413) {
      return reply.code(413).send({ error: 'O arquivo passa do tamanho máximo permitido (2 MB).' });
    }
    if (statusCode === 429) {
      return reply.code(429).send({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    }
    if (statusCode >= 500) {
      request.log.error({ err: error }, error.message);
    } else {
      request.log.info({ err: error }, error.message);
    }
    return reply.code(statusCode).send({
      statusCode, error: STATUS_CODES[statusCode] ?? 'Error', message: error.message,
    });
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(inviteRoutes);
  app.register(userRoutes);
  app.register(packRoutes);
  app.register(stickerRoutes);
  app.register(publishRoutes);
  app.register(catalogRoutes);
  app.register(storeRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
