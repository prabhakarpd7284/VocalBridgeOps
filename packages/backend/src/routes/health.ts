/**
 * Health check routes
 */

import { FastifyPluginAsync } from 'fastify';
import { testConnection } from '../utils/db.js';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Basic health check
   */
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  /**
   * Readiness check (includes DB connection)
   */
  fastify.get('/ready', async (request, reply) => {
    const dbConnected = await testConnection();

    if (!dbConnected) {
      return reply.status(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
        },
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
      },
    };
  });
};

export default healthRoutes;
