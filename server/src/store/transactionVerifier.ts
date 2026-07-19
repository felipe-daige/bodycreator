import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import type { Config } from '../config.js';
import { APPLE_ROOT_CA_G2, APPLE_ROOT_CA_G3 } from './appleRootCertificates.js';

export type StoreTransactionVerifier = {
  verify(signedTransaction: string): Promise<JWSTransactionDecodedPayload>;
};

function decodeUnverifiedPayload(signedTransaction: string): JWSTransactionDecodedPayload {
  const parts = signedTransaction.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('JWS inválido');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JWSTransactionDecodedPayload;
}

export function createAppleStoreTransactionVerifier(config: Config): StoreTransactionVerifier {
  const roots = [Buffer.from(APPLE_ROOT_CA_G2), Buffer.from(APPLE_ROOT_CA_G3)];
  const sandbox = new SignedDataVerifier(
    roots,
    true,
    Environment.SANDBOX,
    config.APP_BUNDLE_ID,
  );
  const production = config.APP_APPLE_ID
    ? new SignedDataVerifier(
        roots,
        true,
        Environment.PRODUCTION,
        config.APP_BUNDLE_ID,
        config.APP_APPLE_ID,
      )
    : null;

  return {
    async verify(signedTransaction) {
      const routingPayload = decodeUnverifiedPayload(signedTransaction);
      switch (routingPayload.environment) {
      case Environment.SANDBOX:
        return sandbox.verifyAndDecodeTransaction(signedTransaction);
      case Environment.PRODUCTION:
        if (!production) throw new Error('APP_APPLE_ID não configurado');
        return production.verifyAndDecodeTransaction(signedTransaction);
      case Environment.XCODE:
      case Environment.LOCAL_TESTING:
        // Transações do arquivo .storekit são assinadas por um certificado
        // local do Xcode, não pela Apple. Só o servidor de desenvolvimento
        // aceita o payload para permitir o teste ponta a ponta no simulador.
        if (config.NODE_ENV !== 'development') throw new Error('Ambiente de compra inválido');
        return routingPayload;
      default:
        throw new Error('Ambiente de compra desconhecido');
      }
    },
  };
}
