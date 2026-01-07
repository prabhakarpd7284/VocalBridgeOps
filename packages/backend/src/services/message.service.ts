/**
 * Message service
 * Core message processing with:
 * - Idempotency
 * - Session locking
 * - Provider orchestration
 * - Usage event creation
 */

import { Message, ProviderCall, ProviderCallStatus, MessageRole, Agent } from '@prisma/client';
import type pino from 'pino';
import { prisma } from '../utils/db.js';
import { generateCorrelationId, uuidToLockKey } from '../utils/crypto.js';
import { ConflictError, ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { calculateCost, getPricingSnapshot } from '../config/pricing.js';
import { getSessionWithAgent, getNextSequenceNumber } from './session.service.js';
import { executeWithResilience } from '../providers/orchestrator.js';
import type { ConversationMessage, ProviderRequest, ToolDefinition, ToolCall } from '../providers/types.js';
import { toolRegistry } from '../tools/registry.js';

export interface SendMessageInput {
  content: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface MessageResponse {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls: unknown;
  createdAt: Date;
  metadata: {
    provider: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    correlationId: string;
    usedFallback: boolean;
  };
}

/**
 * Send a message in a session (synchronous)
 * Implements the full message processing flow:
 * 1. Validate idempotency key
 * 2. Acquire session lock
 * 3. Load context
 * 4. Build provider request
 * 5. Store user message
 * 6. Call provider with retry/fallback
 * 7. Store assistant message
 * 8. Create usage event
 * 9. Release lock
 */
export async function sendMessage(
  tenantId: string,
  sessionId: string,
  input: SendMessageInput
): Promise<MessageResponse> {
  const correlationId = input.correlationId || generateCorrelationId();
  const log = logger.child({ correlationId, tenantId, sessionId });

  log.info({ hasIdempotencyKey: !!input.idempotencyKey }, 'Processing message');

  // Step 1: Check idempotency if key provided
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(sessionId, input.idempotencyKey);
    if (existing) {
      log.info('Returning cached response for idempotency key');
      return formatMessageResponse(existing);
    }
  }

  // Step 2: Acquire session lock
  const lockKey = uuidToLockKey(sessionId);

  return await withSessionLock(lockKey, async () => {
    // Step 3: Load session and agent context
    const session = await getSessionWithAgent(tenantId, sessionId);
    const agent = session.agent;

    log.info(
      {
        agentId: agent.id,
        agentName: agent.name,
        primaryProvider: agent.primaryProvider,
        fallbackProvider: agent.fallbackProvider,
        sessionStatus: session.status,
      },
      'Session and agent loaded'
    );

    if (session.status !== 'ACTIVE') {
      throw new ValidationError('Cannot send message to ended session');
    }

    // Step 4: Load conversation history and build provider request
    const history = await loadConversationHistory(sessionId);
    log.debug({ historyLength: history.length }, 'Conversation history loaded');

    const providerRequest = buildProviderRequest(agent, history, input.content);
    log.debug(
      {
        systemPromptLength: providerRequest.systemPrompt.length,
        messageCount: providerRequest.messages.length,
        hasTools: !!providerRequest.tools?.length,
      },
      'Provider request built'
    );

    // Step 5: Store user message first
    const userSequence = await getNextSequenceNumber(sessionId);
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        sequenceNumber: userSequence,
        idempotencyKey: input.idempotencyKey,
        role: 'USER',
        content: input.content,
      },
    });

    log.info({ userMessageId: userMessage.id }, 'User message stored');

    // Step 6: Call provider with retry/fallback
    log.info('Calling AI provider');
    let result = await executeWithResilience(providerRequest, {
      primaryProvider: agent.primaryProvider,
      fallbackProvider: agent.fallbackProvider,
      correlationId,
    });

    // Step 7: Store provider call record
    let providerCall = await prisma.providerCall.create({
      data: {
        sessionId,
        correlationId,
        provider: result.provider,
        isFallback: result.isFallback,
        tokensIn: result.response?.tokensIn ?? 0,
        tokensOut: result.response?.tokensOut ?? 0,
        latencyMs: result.latencyMs,
        status: result.success ? 'SUCCESS' : getProviderCallStatus(result.error?.code),
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
        attemptNumber: result.attemptNumber,
      },
    });

    log.info(
      {
        providerCallId: providerCall.id,
        provider: providerCall.provider,
        status: providerCall.status,
        tokensIn: providerCall.tokensIn,
        tokensOut: providerCall.tokensOut,
        latencyMs: providerCall.latencyMs,
      },
      'Provider call record stored'
    );

    if (!result.success || !result.response) {
      log.error({ error: result.error }, 'Provider call failed');
      throw new ValidationError(
        result.error?.message || 'Failed to get response from AI provider'
      );
    }

    // Step 8: Handle tool calls if present
    let finalResponse = result.response;
    let finalProviderCall = providerCall;
    let initialProviderCall: typeof providerCall | null = null;

    if (result.response.toolCalls && result.response.toolCalls.length > 0) {
      log.info(
        { toolCallCount: result.response.toolCalls.length },
        'Processing tool calls'
      );

      // Save initial provider call for billing
      initialProviderCall = providerCall;

      // Store initial assistant message with tool calls
      const assistantSequence = await getNextSequenceNumber(sessionId);
      await prisma.message.create({
        data: {
          sessionId,
          sequenceNumber: assistantSequence,
          role: 'ASSISTANT',
          content: result.response.content || '',
          toolCalls: JSON.stringify(result.response.toolCalls),
          providerCallId: providerCall.id,
        },
      });

      // Execute all tool calls
      const toolResults = await executeToolCalls(
        result.response.toolCalls,
        agent,
        {
          tenantId,
          sessionId,
          correlationId,
        },
        log
      );

      // Store tool result messages
      for (const toolResult of toolResults) {
        const toolSequence = await getNextSequenceNumber(sessionId);
        await prisma.message.create({
          data: {
            sessionId,
            sequenceNumber: toolSequence,
            role: 'TOOL',
            content: JSON.stringify({
              id: toolResult.id,
              result: toolResult.result,
              error: toolResult.error,
            }),
          },
        });
      }

      // Load updated conversation history including tool results
      const updatedHistory = await loadConversationHistory(sessionId);

      // Build new provider request with tool results
      const toolResultRequest = buildProviderRequest(agent, updatedHistory, '');

      log.info('Calling provider with tool results');

      // Call provider again with tool results
      const finalResult = await executeWithResilience(toolResultRequest, {
        primaryProvider: agent.primaryProvider,
        fallbackProvider: agent.fallbackProvider,
        correlationId,
      });

      // Store final provider call
      finalProviderCall = await prisma.providerCall.create({
        data: {
          sessionId,
          correlationId,
          provider: finalResult.provider,
          isFallback: finalResult.isFallback,
          tokensIn: finalResult.response?.tokensIn ?? 0,
          tokensOut: finalResult.response?.tokensOut ?? 0,
          latencyMs: finalResult.latencyMs,
          status: finalResult.success ? 'SUCCESS' : getProviderCallStatus(finalResult.error?.code),
          errorCode: finalResult.error?.code,
          errorMessage: finalResult.error?.message,
          attemptNumber: finalResult.attemptNumber,
        },
      });

      log.info(
        {
          providerCallId: finalProviderCall.id,
          provider: finalProviderCall.provider,
          status: finalProviderCall.status,
        },
        'Final provider call record stored'
      );

      if (!finalResult.success || !finalResult.response) {
        log.error({ error: finalResult.error }, 'Final provider call failed');
        throw new ValidationError(
          finalResult.error?.message || 'Failed to get final response from AI provider'
        );
      }

      finalResponse = finalResult.response;
    }

    // Step 9: Store final assistant message
    const assistantSequence = await getNextSequenceNumber(sessionId);
    const assistantMessage = await prisma.message.create({
      data: {
        sessionId,
        sequenceNumber: assistantSequence,
        role: 'ASSISTANT',
        content: finalResponse.content,
        toolCalls: finalResponse.toolCalls ? JSON.stringify(finalResponse.toolCalls) : undefined,
        providerCallId: finalProviderCall.id,
      },
      include: {
        providerCall: true,
      },
    });

    log.info({ assistantMessageId: assistantMessage.id }, 'Assistant message stored');

    // Step 10: Create usage events (only for successful calls, skip demo sessions)
    // If tools were used, we need to bill for BOTH provider calls:
    // 1. Initial call that returned tool calls
    // 2. Final call with tool results
    if (initialProviderCall) {
      log.info('Creating usage event for initial provider call (with tool calls)');
      await createUsageEvent(
        tenantId,
        agent.id,
        sessionId,
        session.demoMode,
        initialProviderCall
      );
    }

    // Always bill for the final provider call
    log.info('Creating usage event for final provider call');
    await createUsageEvent(
      tenantId,
      agent.id,
      sessionId,
      session.demoMode,
      finalProviderCall
    );

    log.info('Message processing completed successfully');

    return formatMessageResponse(assistantMessage);
  }, log);
}

/**
 * Acquire session lock to prevent concurrent message processing
 *
 * Current: In-memory locks (works for single server)
 * Future: PostgreSQL advisory locks (works for multiple servers)
 *
 * To enable multi-server support:
 * 1. Uncomment the PostgreSQL implementation below
 * 2. Comment out the in-memory implementation
 * 3. Test with concurrent requests across multiple servers
 */

// ============================================================================
// OPTION A: In-memory locks (CURRENT - Single Server)
// ============================================================================

const sessionLocks = new Map<string, { locked: boolean; timestamp: number }>();
const LOCK_CLEANUP_INTERVAL = 30000;

setInterval(() => {
  const now = Date.now();
  for (const [key, lock] of sessionLocks.entries()) {
    if (lock.locked && now - lock.timestamp > config.session.lockTimeoutMs) {
      logger.warn({ sessionLockKey: key }, 'Cleaning up stale session lock');
      sessionLocks.delete(key);
    }
  }
}, LOCK_CLEANUP_INTERVAL);

async function withSessionLock<T>(
  lockKey: bigint,
  fn: () => Promise<T>,
  log: pino.Logger
): Promise<T> {
  const lockKeyStr = lockKey.toString();

  const existing = sessionLocks.get(lockKeyStr);
  if (existing?.locked) {
    log.warn('Failed to acquire session lock');
    throw new ConflictError('Session is currently processing another message. Please retry.');
  }

  sessionLocks.set(lockKeyStr, { locked: true, timestamp: Date.now() });
  log.debug('Session lock acquired (in-memory)');

  try {
    return await fn();
  } finally {
    sessionLocks.delete(lockKeyStr);
    log.debug('Session lock released');
  }
}

// ============================================================================
// OPTION B: PostgreSQL Advisory Locks (MULTI-SERVER - Uncomment to use)
// ============================================================================

/*
import crypto from 'crypto';

function hashSessionIdToBigInt(sessionId: string): bigint {
  const hash = crypto.createHash('sha256').update(sessionId).digest();
  return hash.readBigInt64BE(0);
}

async function withSessionLock<T>(
  lockKey: bigint,
  fn: () => Promise<T>,
  log: pino.Logger
): Promise<T> {
  // Use transaction-scoped advisory lock (auto-releases on commit)
  return await prisma.$transaction(async (tx) => {
    // Try to acquire lock (non-blocking, transaction-scoped)
    const acquired = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${lockKey})
    `;

    if (!acquired[0].pg_try_advisory_xact_lock) {
      log.warn('Failed to acquire session lock');
      throw new ConflictError('Session is currently processing another message. Please retry.');
    }

    log.debug('Session lock acquired (PostgreSQL transaction-scoped)');

    // Execute function - lock auto-releases when transaction commits
    return await fn();
  }, {
    timeout: config.session.lockTimeoutMs,
    maxWait: 5000, // Wait up to 5s to get a connection from pool
  });
}
*/

/**
 * Load conversation history for context
 */
async function loadConversationHistory(sessionId: string): Promise<ConversationMessage[]> {
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { sequenceNumber: 'asc' },
    take: config.session.maxHistoryMessages,
  });

  return messages.map((msg) => {
    const baseMsg: ConversationMessage = {
      role: msg.role.toLowerCase() as ConversationMessage['role'],
      content: msg.content,
    };

    // Parse tool calls for assistant messages
    if (msg.role === 'ASSISTANT' && msg.toolCalls) {
      baseMsg.toolCalls = JSON.parse(msg.toolCalls as string) as ToolCall[];
    }

    // Parse tool results for tool messages
    if (msg.role === 'TOOL') {
      const toolData = JSON.parse(msg.content) as { id: string; result: unknown; error?: string };
      baseMsg.toolResults = [
        {
          id: toolData.id,
          result: toolData.result,
          error: toolData.error,
        },
      ];
    }

    return baseMsg;
  });
}

/**
 * Build provider request from agent config and history
 */
function buildProviderRequest(
  agent: Agent,
  history: ConversationMessage[],
  newMessage: string
): ProviderRequest {
  // Get tool definitions if any tools are enabled
  const enabledTools = agent.enabledTools as string[];
  let tools: ToolDefinition[] | undefined;

  if (enabledTools.length > 0) {
    // For now, just InvoiceLookup - tool registry will be implemented later
    tools = enabledTools.includes('InvoiceLookup')
      ? [
          {
            name: 'InvoiceLookup',
            description: 'Look up invoice or order details by order ID',
            parameters: {
              type: 'object',
              properties: {
                orderId: {
                  type: 'string',
                  description: 'The order ID to look up',
                },
              },
              required: ['orderId'],
            },
          },
        ]
      : undefined;
  }

  return {
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    messages: [
      ...history,
      { role: 'user', content: newMessage },
    ],
    tools,
  };
}

/**
 * Find message by idempotency key
 */
async function findByIdempotencyKey(
  sessionId: string,
  idempotencyKey: string
): Promise<(Message & { providerCall: ProviderCall | null }) | null> {
  // First find the user message with idempotency key
  const userMessage = await prisma.message.findFirst({
    where: {
      sessionId,
      idempotencyKey,
      role: 'USER',
    },
  });

  if (!userMessage) {
    return null;
  }

  // Find the corresponding assistant response (next message in sequence)
  const assistantMessage = await prisma.message.findFirst({
    where: {
      sessionId,
      sequenceNumber: userMessage.sequenceNumber + 1,
      role: 'ASSISTANT',
    },
    include: {
      providerCall: true,
    },
  });

  return assistantMessage;
}

/**
 * Create usage event for billing
 * Only called for successful provider calls
 *
 * Uses optimistic locking to prevent double-billing race conditions
 */
async function createUsageEvent(
  tenantId: string,
  agentId: string,
  sessionId: string,
  demoMode: boolean,
  providerCall: ProviderCall
): Promise<void> {
  // Skip billing for demo sessions
  if (demoMode) {
    logger.debug({ sessionId }, 'Skipping usage event for demo session');
    return;
  }

  // Only bill successful calls
  if (providerCall.status !== 'SUCCESS') {
    logger.debug({ providerCallId: providerCall.id }, 'Skipping usage event for non-successful call');
    return;
  }

  const costCents = calculateCost(
    providerCall.provider,
    providerCall.tokensIn,
    providerCall.tokensOut
  );

  logger.info(
    {
      providerCallId: providerCall.id,
      tenantId,
      agentId,
      provider: providerCall.provider,
      tokensIn: providerCall.tokensIn,
      tokensOut: providerCall.tokensOut,
      totalTokens: providerCall.tokensIn + providerCall.tokensOut,
      costCents,
    },
    'Creating usage event'
  );

  try {
    // Use atomic check-and-set to prevent double billing
    await prisma.$transaction(async (tx) => {
      // Try to mark as billed ONLY if not already billed (atomic operation)
      const updated = await tx.providerCall.updateMany({
        where: {
          id: providerCall.id,
          billed: false, // ⭐ Critical: Only update if not already billed
        },
        data: { billed: true },
      });

      // If updateMany affected 0 rows, already billed by another thread
      if (updated.count === 0) {
        logger.debug(
          { providerCallId: providerCall.id },
          'Skipping usage event - already billed by another thread'
        );
        return;
      }

      logger.debug(
        { providerCallId: providerCall.id },
        'Marked provider call as billed, creating usage event'
      );

      // Create usage event
      await tx.usageEvent.create({
        data: {
          tenantId,
          agentId,
          sessionId,
          providerCallId: providerCall.id,
          provider: providerCall.provider,
          tokensIn: providerCall.tokensIn,
          tokensOut: providerCall.tokensOut,
          totalTokens: providerCall.tokensIn + providerCall.tokensOut,
          costCents,
          pricingSnapshot: getPricingSnapshot(providerCall.provider) as object,
        },
      });

      logger.info(
        { providerCallId: providerCall.id, costCents },
        'Usage event created successfully'
      );
    });
  } catch (error) {
    // Handle unique constraint violation on providerCallId (backup safety)
    if ((error as any).code === 'P2002') {
      logger.warn(
        { providerCallId: providerCall.id },
        'Usage event already exists (caught by unique constraint)'
      );
      return;
    }
    throw error;
  }
}

/**
 * Get provider call status from error code
 */
function getProviderCallStatus(errorCode?: string): ProviderCallStatus {
  switch (errorCode) {
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'RATE_LIMITED':
      return 'RATE_LIMITED';
    default:
      return 'FAILED';
  }
}

/**
 * Format message for API response
 */
function formatMessageResponse(
  message: Message & { providerCall: ProviderCall | null }
): MessageResponse {
  const pc = message.providerCall;

  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ? JSON.parse(message.toolCalls as string) : null,
    createdAt: message.createdAt,
    metadata: {
      provider: pc?.provider ?? 'UNKNOWN',
      tokensIn: pc?.tokensIn ?? 0,
      tokensOut: pc?.tokensOut ?? 0,
      latencyMs: pc?.latencyMs ?? 0,
      correlationId: pc?.correlationId ?? '',
      usedFallback: pc?.isFallback ?? false,
    },
  };
}

/**
 * Execute tool calls
 */
async function executeToolCalls(
  toolCalls: ToolCall[],
  agent: Agent,
  context: { tenantId: string; sessionId: string; correlationId: string },
  log: pino.Logger
): Promise<Array<{ id: string; result: unknown; error?: string }>> {
  const enabledTools = agent.enabledTools as string[];
  const results: Array<{ id: string; result: unknown; error?: string }> = [];

  for (const toolCall of toolCalls) {
    log.info(
      { toolCallId: toolCall.id, toolName: toolCall.name },
      'Executing tool call'
    );

    try {
      const toolResult = await toolRegistry.execute(
        toolCall.name,
        toolCall.args,
        context,
        enabledTools
      );

      results.push({
        id: toolCall.id,
        result: toolResult.success ? toolResult.data : null,
        error: toolResult.error,
      });

      log.info(
        {
          toolCallId: toolCall.id,
          success: toolResult.success,
        },
        'Tool call executed'
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { toolCallId: toolCall.id, error: errorMsg },
        'Tool call failed'
      );

      results.push({
        id: toolCall.id,
        result: null,
        error: errorMsg,
      });
    }
  }

  return results;
}

/**
 * Get messages for a session
 */
export async function getSessionMessages(
  tenantId: string,
  sessionId: string
): Promise<Message[]> {
  // Verify session belongs to tenant
  const session = await prisma.session.findFirst({
    where: { id: sessionId, tenantId },
  });

  if (!session) {
    throw new NotFoundError('Session');
  }

  return prisma.message.findMany({
    where: { sessionId },
    orderBy: { sequenceNumber: 'asc' },
  });
}
