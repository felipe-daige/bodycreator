import type { FastifyInstance } from 'fastify';

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/current', async (_request, reply) => {
    const pointer = await app.deps.storage.get('catalog/current.json');
    if (!pointer) {
      return reply.code(404).send({ error: 'O catálogo ainda não foi publicado.' });
    }
    // O ponteiro muda a cada publicação; o app pode verificar novamente sem
    // baixar um manifesto versionado que já possui.
    return reply
      .header('Cache-Control', 'public, max-age=60, must-revalidate')
      .type('application/json')
      .send(pointer);
  });
}
