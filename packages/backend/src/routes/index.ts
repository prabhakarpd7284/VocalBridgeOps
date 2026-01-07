/**
 * Route index - registers all API routes
 */

import { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.js';
import tenantRoutes from './tenants.js';
import agentRoutes from './agents.js';
import sessionRoutes from './sessions.js';
import jobRoutes from './jobs.js';
import usageRoutes from './usage.js';
import voiceRoutes from './voice.js';

const routes: FastifyPluginAsync = async (fastify) => {
  // Health routes (no /api/v1 prefix)
  await fastify.register(healthRoutes);

  // API v1 routes
  await fastify.register(async (api) => {
    await api.register(tenantRoutes);
    await api.register(agentRoutes);
    await api.register(sessionRoutes);
    await api.register(jobRoutes);
    await api.register(usageRoutes);

    // Voice routes (paths already include /sessions/:sessionId)
    await api.register(voiceRoutes);
  }, { prefix: '/api/v1' });
};

export default routes;
