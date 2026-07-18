import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Mailer } from './email/send.js';
import type { Storage } from './storage/index.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import { userRoutes } from './routes/users.js';

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

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(inviteRoutes);
  app.register(userRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
