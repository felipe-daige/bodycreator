import type { FastifyInstance } from 'fastify';
import { Type } from '@apple/app-store-server-library';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { packs, storeTransactions } from '../db/schema.js';
import { createEntitlementToken } from '../store/entitlementToken.js';

const transactionSchema = z.object({
  signedTransaction: z.string().min(20).max(30_000),
});

export async function storeRoutes(app: FastifyInstance) {
  app.post('/store/transactions', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = transactionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A transação enviada está inválida.' });
    }
    const verifier = app.deps.storeTransactionVerifier;
    if (!verifier) {
      return reply.code(503).send({
        error: 'A validação de compras ainda não está configurada no servidor.',
      });
    }

    let transaction;
    try {
      transaction = await verifier.verify(parsed.data.signedTransaction);
    } catch (error) {
      request.log.info({ err: error }, 'Transação da App Store recusada');
      return reply.code(400).send({ error: 'A App Store não confirmou essa compra.' });
    }

    const {
      transactionId, originalTransactionId, productId, environment,
      purchaseDate, bundleId, type, revocationDate,
    } = transaction;
    if (
      !transactionId || !originalTransactionId || !productId || !environment ||
      !purchaseDate || bundleId !== app.deps.config.APP_BUNDLE_ID ||
      type !== Type.NON_CONSUMABLE || revocationDate !== undefined
    ) {
      return reply.code(400).send({ error: 'Essa compra não libera um pacote do Body Creator.' });
    }

    const [pack] = await app.deps.db.select({
      id: packs.id,
      isFree: packs.isFree,
    }).from(packs).where(eq(packs.storeProductId, productId)).limit(1);
    const isLocalXcodeProduct = !pack &&
      app.deps.config.NODE_ENV === 'development' &&
      String(environment) === 'Xcode' &&
      productId.startsWith(`${app.deps.config.APP_BUNDLE_ID}.pack.`);
    if ((!pack && !isLocalXcodeProduct) || pack?.isFree) {
      return reply.code(404).send({ error: 'O pacote dessa compra não está disponível.' });
    }

    await app.deps.db.insert(storeTransactions).values({
      transactionId,
      originalTransactionId,
      productId,
      environment: String(environment),
      purchaseDate: new Date(purchaseDate),
      lastValidatedAt: new Date(),
    }).onConflictDoUpdate({
      target: storeTransactions.transactionId,
      set: { lastValidatedAt: new Date() },
    });

    const entitlement = createEntitlementToken(
      productId,
      app.deps.config.SESSION_SECRET,
    );
    return {
      ok: true,
      packId: pack?.id ?? 'local-storekit',
      productId,
      accessToken: entitlement.token,
      expiresAt: entitlement.expiresAt,
    };
  });
}
