import { promises as fs, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { Storage } from './index.js';

function contentTypeFor(key: string): string {
  if (key.endsWith('.json')) return 'application/json';
  if (key.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

/**
 * Storage em memória para desenvolvimento e testes.
 *
 * Sem `persistDir`, vive só na memória (usado pelos testes). Com `persistDir`,
 * o modo dev também grava cada objeto em disco e recarrega tudo ao iniciar —
 * assim um catálogo publicado não some quando o servidor reinicia. Nunca é
 * usado em produção, onde o storage real é o R2.
 */
export function createMemoryStorage(persistDir?: string) {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  if (persistDir && existsSync(persistDir)) {
    const root = resolve(persistDir);
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const key = prefix ? `${prefix}/${entry.name}` : entry.name;
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, key);
        else objects.set(key, { body: readFileSync(abs), contentType: contentTypeFor(key) });
      }
    };
    walk(root, '');
  }

  const storage: Storage & { objects: typeof objects } = {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
      if (persistDir) {
        const root = resolve(persistDir);
        const target = resolve(join(root, key));
        // Defesa contra chaves com "..": nunca escreve fora do diretório de dev.
        if (target !== root && !target.startsWith(root + sep)) {
          throw new Error(`Chave de storage inválida: ${key}`);
        }
        await fs.mkdir(dirname(target), { recursive: true });
        await fs.writeFile(target, body);
      }
    },
    async get(key) {
      return objects.get(key)?.body ?? null;
    },
  };
  return storage;
}
