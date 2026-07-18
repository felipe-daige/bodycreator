import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createResendMailer, type Mailer } from './email/send.js';
import { createR2Storage } from './storage/r2.js';
import { createMemoryStorage } from './storage/memory.js';
import type { Storage } from './storage/index.js';

const config = loadConfig(process.env);

// Modo dev: sem RESEND_API_KEY o convite é impresso no terminal em vez de
// enviado; sem R2 real, storage em memória (some ao reiniciar). Restrito a
// NODE_ENV=development — em produção a ausência de credencial derruba o boot,
// que é o comportamento correto.
const isDev = config.NODE_ENV === 'development';

const mailer: Mailer = !config.RESEND_API_KEY && isDev
  ? {
      async send(msg) {
        console.log(`\n[dev] E-mail para ${msg.to} — "${msg.subject}"\n${msg.text}\n`);
      },
    }
  : createResendMailer(config);

const storage: Storage = config.R2_ACCOUNT_ID === 'dev' && isDev
  ? createMemoryStorage(`http://localhost:${config.PORT}/dev-storage`)
  : createR2Storage(config);

const app = buildApp({ config, db: createDb(config.DATABASE_URL), mailer, storage });

// Servir os objetos do storage em memória no modo dev, para a capa e as
// figurinhas aparecerem no painel.
if (isDev && 'objects' in storage) {
  const objects = (storage as ReturnType<typeof createMemoryStorage>).objects;
  app.get('/dev-storage/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const obj = objects.get(key);
    if (!obj) return reply.code(404).send({ error: 'Objeto não encontrado.' });
    return reply.type(obj.contentType).send(obj.body);
  });
}

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
