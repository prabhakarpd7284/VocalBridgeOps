/**
 * Session routes
 */

import { FastifyPluginAsync } from 'fastify';
import { CreateSessionSchema, SendMessageSchema, SendAsyncMessageSchema } from '../schemas/index.js';
import * as sessionService from '../services/session.service.js';
import * as messageService from '../services/message.service.js';
import { authenticate, requireRole } from '../plugins/auth.js';
import { ValidationError } from '../utils/errors.js';
import { prisma } from '../utils/db.js';

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Create a new session
   */
  fastify.post('/sessions', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const parseResult = CreateSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const session = await sessionService.createSession(
      request.tenant!.id,
      parseResult.data,
      request.correlationId
    );

    return reply.status(201).send({
      id: session.id,
      tenantId: session.tenantId,
      agentId: session.agentId,
      customerId: session.customerId,
      channel: session.channel,
      status: session.status,
      demoMode: session.demoMode,
      metadata: session.metadata,
      createdAt: session.createdAt,
    });
  });

  /**
   * List sessions
   */
  fastify.get('/sessions', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      agentId?: string;
      customerId?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const sessions = await sessionService.listSessions(request.tenant!.id, {
      agentId: query.agentId,
      customerId: query.customerId,
      status: query.status as any,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        agentId: s.agentId,
        agentName: (s as any).agent?.name,
        customerId: s.customerId,
        channel: s.channel,
        status: s.status,
        demoMode: s.demoMode,
        createdAt: s.createdAt,
        endedAt: s.endedAt,
      })),
    };
  });

  /**
   * Get session with transcript
   */
  fastify.get('/sessions/:sessionId', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };

    const session = await sessionService.getSessionWithTranscript(
      request.tenant!.id,
      sessionId
    );

    return {
      id: session.id,
      agentId: session.agentId,
      agentName: session.agent.name,
      customerId: session.customerId,
      channel: session.channel,
      status: session.status,
      demoMode: session.demoMode,
      metadata: session.metadata,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      messages: session.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls as string) : null,
        createdAt: m.createdAt,
      })),
      summary: session.summary,
    };
  });

  /**
   * End a session
   */
  fastify.post('/sessions/:sessionId/end', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };

    const session = await sessionService.endSession(request.tenant!.id, sessionId);

    return {
      id: session.id,
      status: session.status,
      endedAt: session.endedAt,
    };
  });

  /**
   * Send a message (synchronous)
   */
  fastify.post('/sessions/:sessionId/messages', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const idempotencyKey = request.headers['x-idempotency-key'] as string | undefined;

    const parseResult = SendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const response = await messageService.sendMessage(
      request.tenant!.id,
      sessionId,
      {
        content: parseResult.data.content,
        idempotencyKey,
        correlationId: request.correlationId,
      }
    );

    return response;
  });

  /**
   * Send a message (asynchronous - returns job ID)
   */
  fastify.post('/sessions/:sessionId/messages/async', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const idempotencyKey = request.headers['x-idempotency-key'] as string | undefined;

    const parseResult = SendAsyncMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    // Verify session exists
    await sessionService.getSessionById(request.tenant!.id, sessionId);

    // Check for existing job with same idempotency key
    if (idempotencyKey) {
      const existingJob = await prisma.job.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: request.tenant!.id,
            idempotencyKey,
          },
        },
      });

      if (existingJob) {
        return reply.status(200).send({
          jobId: existingJob.id,
          status: existingJob.status,
          pollUrl: `/api/v1/jobs/${existingJob.id}`,
        });
      }
    }

    // Create async job
    const job = await prisma.job.create({
      data: {
        tenantId: request.tenant!.id,
        type: 'SEND_MESSAGE',
        idempotencyKey,
        input: {
          sessionId,
          content: parseResult.data.content,
        },
        callbackUrl: parseResult.data.callbackUrl,
      },
    });

    return reply.status(202).send({
      jobId: job.id,
      status: job.status,
      pollUrl: `/api/v1/jobs/${job.id}`,
    });
  });

  /**
   * Get messages for a session
   */
  fastify.get('/sessions/:sessionId/messages', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };

    const messages = await messageService.getSessionMessages(
      request.tenant!.id,
      sessionId
    );

    return {
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls as string) : null,
        createdAt: m.createdAt,
      })),
    };
  });
};

export default sessionRoutes;
