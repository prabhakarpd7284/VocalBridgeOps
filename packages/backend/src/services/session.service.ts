/**
 * Session service
 * Handles session lifecycle and transcript retrieval
 */

import { Session, Message, ChannelType, SessionStatus } from '@prisma/client';
import { prisma } from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';
import { getAgentById } from './agent.service.js';
import { logger } from '../utils/logger.js';
import type { CreateSessionInput } from '../schemas/index.js';

export interface SessionWithMessages extends Session {
  messages: Message[];
  agent: { name: string };
  summary: {
    messageCount: number;
    totalTokens: number;
    totalCostCents: number;
  };
}


/**
 * Create a new session
 * Reuses existing ACTIVE session for same tenant + agent + customer
 */
export async function createSession(
  tenantId: string,
  input: CreateSessionInput,
  correlationId?: string
): Promise<Session> {
  const log = correlationId ? logger.child({ correlationId }) : logger;

  log.info(
    { tenantId, agentId: input.agentId, customerId: input.customerId, channel: input.channel, demoMode: input.demoMode },
    'Creating session'
  );

  // Verify agent exists and belongs to tenant
  await getAgentById(tenantId, input.agentId);

  // 1. Reuse existing ACTIVE session if present
  // For demo sessions: reuse by agent only (customer ID is always demo-{tenantId})
  // For normal sessions: reuse by agent + customer ID
  const existingSession = await prisma.session.findFirst({
    where: {
      tenantId,
      agentId: input.agentId,
      customerId: input.customerId,
      status: 'ACTIVE',
      demoMode: input.demoMode || false,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (existingSession) {
    log.info(
      { sessionId: existingSession.id, demoMode: existingSession.demoMode },
      'Reusing existing active session'
    );
    return existingSession;
  }

  // 2. Create new session
  try {
    const session = await prisma.session.create({
      data: {
        tenantId,
        agentId: input.agentId,
        customerId: input.customerId,
        channel: input.channel as ChannelType,
        demoMode: input.demoMode || false,
        metadata: input.metadata as object | undefined,
        status: 'ACTIVE',
      },
    });

    log.info({ sessionId: session.id, demoMode: session.demoMode }, 'New session created');
    return session;
  } catch (err: any) {
    // Handle race condition (partial unique index)
    if (err.code === 'P2002') {
      log.debug('Race condition detected, fetching existing session');
      const session = await prisma.session.findFirst({
        where: {
          tenantId,
          agentId: input.agentId,
          customerId: input.customerId,
          status: 'ACTIVE',
        },
      });
      if (session) {
        log.info({ sessionId: session.id }, 'Found session after race condition');
        return session;
      }
    }
    throw err;
  }
}



/**
 * List sessions for a tenant
 */
export async function listSessions(
  tenantId: string,
  options?: {
    agentId?: string;
    customerId?: string;
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<Session[]> {
  return prisma.session.findMany({
    where: {
      tenantId,
      ...(options?.agentId && { agentId: options.agentId }),
      ...(options?.customerId && { customerId: options.customerId }),
      ...(options?.status && { status: options.status }),
    },
    include: {
      agent: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 20,
    skip: options?.offset || 0,
  });
}

/**
 * Get session by ID (tenant-scoped)
 */
export async function getSessionById(
  tenantId: string,
  sessionId: string
): Promise<Session> {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
  });

  if (!session) {
    throw new NotFoundError('Session');
  }

  return session;
}

/**
 * Get session with transcript and summary
 */
export async function getSessionWithTranscript(
  tenantId: string,
  sessionId: string
): Promise<SessionWithMessages> {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
    include: {
      agent: {
        select: { name: true },
      },
      messages: {
        orderBy: { sequenceNumber: 'asc' },
      },
      usageEvents: {
        select: {
          totalTokens: true,
          costCents: true,
        },
      },
    },
  });

  if (!session) {
    throw new NotFoundError('Session');
  }

  // Calculate summary
  const summary = {
    messageCount: session.messages.length,
    totalTokens: session.usageEvents.reduce((sum, e) => sum + e.totalTokens, 0),
    totalCostCents: session.usageEvents.reduce((sum, e) => sum + e.costCents, 0),
  };

  // Remove usageEvents from response (used only for summary)
  const { usageEvents: _, ...sessionData } = session;

  return {
    ...sessionData,
    summary,
  };
}

/**
 * End a session
 */
export async function endSession(
  tenantId: string,
  sessionId: string
): Promise<Session> {
  // Verify session exists and belongs to tenant
  await getSessionById(tenantId, sessionId);

  return prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'ENDED',
      endedAt: new Date(),
    },
  });
}

/**
 * Get session with agent config for message processing
 */
export async function getSessionWithAgent(
  tenantId: string,
  sessionId: string
): Promise<Session & { agent: NonNullable<Awaited<ReturnType<typeof getAgentById>>> }> {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
    include: {
      agent: true,
    },
  });

  if (!session) {
    throw new NotFoundError('Session');
  }

  if (!session.agent) {
    throw new NotFoundError('Agent');
  }

  return session as Session & { agent: NonNullable<typeof session.agent> };
}

/**
 * Get next sequence number for a session
 * Uses PostgreSQL function for atomic sequence generation to prevent race conditions
 */
export async function getNextSequenceNumber(sessionId: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<[{ get_next_message_sequence: number }]>(
    'SELECT get_next_message_sequence($1)',
    sessionId
  );

  return result[0].get_next_message_sequence;
}
