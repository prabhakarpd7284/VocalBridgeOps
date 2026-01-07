/**
 * Fastify application setup
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import correlationIdPlugin from './plugins/correlation-id.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';

// Routes
import healthRoutes from './routes/health.js';
import tenantRoutes from './routes/tenants.js';
import agentRoutes from './routes/agents.js';
import sessionRoutes from './routes/sessions.js';
import jobRoutes from './routes/jobs.js';
import usageRoutes from './routes/usage.js';
import voiceRoutes from './routes/voice.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our own logger
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
  });

  // Register plugins in order
  await app.register(cors, {
    origin: config.isDev ? true : ['http://localhost:5173'],
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'VocalBridge Ops API',
        description: 'Multi-tenant AI Agent Gateway',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Core plugins
  await app.register(correlationIdPlugin);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);

  // API routes
  await app.register(healthRoutes);
  await app.register(tenantRoutes, { prefix: '/api/v1' });
  await app.register(agentRoutes, { prefix: '/api/v1' });
  await app.register(sessionRoutes, { prefix: '/api/v1' });
  await app.register(jobRoutes, { prefix: '/api/v1' });
  await app.register(usageRoutes, { prefix: '/api/v1' });
  await app.register(voiceRoutes, { prefix: '/api/v1' });

  // Log registered routes in development
  if (config.isDev) {
    app.ready(() => {
      logger.info('Registered routes:');
      const routes = app.printRoutes();
      console.log(routes);
    });
  }

  return app;
}
