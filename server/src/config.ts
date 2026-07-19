import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de ao menos 32 caracteres'),
  OWNER_ADMIN_EMAIL: z.string().email().default('felipedaige@gmail.com'),
  APP_BUNDLE_ID: z.string().min(3).default('com.daige.bodycreator'),
  APP_APPLE_ID: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
  // Link que o e-mail de convite abre diretamente no app iOS.
  PUBLIC_APP_INVITE_URL: z.string().url().default('bodycreator://convite'),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  MAIL_FROM: z.string().email(),
  RESEND_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
