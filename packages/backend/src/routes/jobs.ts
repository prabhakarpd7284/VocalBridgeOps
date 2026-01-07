/**
 * Job routes
 */

import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../plugins/auth.js';
import { NotFoundError } from '../utils/errors.js';
import { prisma } from '../utils/db.js';

const jobRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get job status
   */
  fastify.get('/jobs/:jobId', {
    preHandler: [authenticate],
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        tenantId: request.tenant!.id,
      },
    });

    if (!job) {
      throw new NotFoundError('Job');
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      input: job.input,
      output: job.output,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  });

  /**
   * List jobs
   */
  fastify.get('/jobs', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      status?: string;
      type?: string;
      limit?: string;
      offset?: string;
    };

    const jobs = await prisma.job.findMany({
      where: {
        tenantId: request.tenant!.id,
        ...(query.status && { status: query.status as any }),
        ...(query.type && { type: query.type as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? parseInt(query.limit, 10) : 20,
      skip: query.offset ? parseInt(query.offset, 10) : 0,
    });

    return {
      jobs: jobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
    };
  });
};

export default jobRoutes;
