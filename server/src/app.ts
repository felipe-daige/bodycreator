import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
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

export type AppDeps = { config: Config; db: Db; mailer: Mailer; storage: Storage };

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== 'test',
    bodyLimit: 5 * 1024 * 1024,
  });
  app.decorate('deps', deps);

  app.register(cookie, { secret: deps.config.SESSION_SECRET });
  app.register(cors, { origin: deps.config.PUBLIC_PANEL_ORIGIN, credentials: true });
  app.register(rateLimit, { global: false });
  app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(inviteRoutes);
  app.register(userRoutes);
  app.register(packRoutes);
  app.register(stickerRoutes);
  app.register(publishRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
