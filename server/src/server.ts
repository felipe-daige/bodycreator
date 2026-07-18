import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createResendMailer } from './email/send.js';

const config = loadConfig(process.env);
const app = buildApp({ config, db: createDb(config.DATABASE_URL), mailer: createResendMailer(config) });

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
