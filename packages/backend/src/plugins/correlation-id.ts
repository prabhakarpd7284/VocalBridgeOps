/**
 * Correlation ID plugin for request tracing
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { generateCorrelationId } from '../utils/crypto.js';
import { createRequestLogger } from '../utils/logger.js';

const correlationIdPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    // Use existing correlation ID from header or generate new one
    const correlationId =
      (request.headers['x-correlation-id'] as string) || generateCorrelationId();

    request.correlationId = correlationId;

    // Create request-scoped logger with correlation ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request.log = createRequestLogger({ correlationId }) as any;

    // Log incoming request
    request.log.info(
      {
        method: request.method,
        url: request.url,
        // headers: request.headers,
      },
      'Incoming request'
    );
  });

  fastify.addHook('onResponse', async (request, reply) => {
    // Log request completion
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'Request completed'
    );
  });

  fastify.addHook('onSend', async (request, reply) => {
    // Include correlation ID in response headers
    reply.header('x-correlation-id', request.correlationId);
  });
};

export default fp(correlationIdPlugin, {
  name: 'correlation-id',
});
