/**
 * Agent routes
 */

import { FastifyPluginAsync } from 'fastify';
import { CreateAgentSchema, UpdateAgentSchema } from '../schemas/index.js';
import * as agentService from '../services/agent.service.js';
import * as sessionService from '../services/session.service.js';
import { authenticate, requireRole } from '../plugins/auth.js';
import { ValidationError } from '../utils/errors.js';
import { toolRegistry } from '../tools/index.js';

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Create a new agent
   */
  fastify.post('/agents', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const parseResult = CreateAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    // Validate tools exist
    const toolValidation = toolRegistry.validateTools(parseResult.data.enabledTools);
    if (!toolValidation.valid) {
      throw new ValidationError('Unknown tools specified', [
        { field: 'enabledTools', message: `Unknown tools: ${toolValidation.missing.join(', ')}` }
      ]);
    }

    const agent = await agentService.createAgent(
      request.tenant!.id,
      parseResult.data
    );

    return reply.status(201).send(formatAgentResponse(agent));
  });

  /**
   * List agents
   */
  fastify.get('/agents', {
    preHandler: [authenticate],
  }, async (request) => {
    const { limit, offset, active } = request.query as { limit?: string; offset?: string; active?: string };

    const agents = await agentService.listAgents(request.tenant!.id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      isActive: active !== undefined ? active === 'true' : undefined,
    });

    return {
      agents: agents.map(formatAgentResponse),
    };
  });

  /**
   * Get agent by ID
   */
  fastify.get('/agents/:agentId', {
    preHandler: [authenticate],
  }, async (request) => {
    const { agentId } = request.params as { agentId: string };

    const agent = await agentService.getAgentById(request.tenant!.id, agentId);

    return formatAgentResponse(agent);
  });

  /**
   * Update agent
   */
  fastify.put('/agents/:agentId', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request) => {
    const { agentId } = request.params as { agentId: string };

    const parseResult = UpdateAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    // Validate tools if provided
    if (parseResult.data.enabledTools) {
      const toolValidation = toolRegistry.validateTools(parseResult.data.enabledTools);
      if (!toolValidation.valid) {
        throw new ValidationError('Unknown tools specified', [
          { field: 'enabledTools', message: `Unknown tools: ${toolValidation.missing.join(', ')}` }
        ]);
      }
    }

    const agent = await agentService.updateAgent(
      request.tenant!.id,
      agentId,
      parseResult.data
    );

    return formatAgentResponse(agent);
  });

  /**
   * Delete agent
   */
  fastify.delete('/agents/:agentId', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    await agentService.deleteAgent(request.tenant!.id, agentId);

    return reply.status(204).send();
  });

  /**
   * Create a demo session for trying out an agent (no billing)
   */
  fastify.post('/agents/:agentId/demo', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    // Verify agent exists
    await agentService.getAgentById(request.tenant!.id, agentId);

    // Create or reuse demo session
    // Use consistent customer ID so sessions are reused
    const demoSession = await sessionService.createSession(
      request.tenant!.id,
      {
        agentId,
        customerId: `demo-${request.tenant!.id}`,
        channel: 'CHAT',
        demoMode: true,
        metadata: { demo: true },
      },
      request.correlationId
    );

    return reply.status(201).send({
      id: demoSession.id,
      agentId: demoSession.agentId,
      customerId: demoSession.customerId,
      channel: demoSession.channel,
      status: demoSession.status,
      demoMode: demoSession.demoMode,
      createdAt: demoSession.createdAt,
    });
  });

  /**
   * Get available tools
   */
  fastify.get('/tools', {
    preHandler: [authenticate],
  }, async () => {
    const toolNames = toolRegistry.getNames();
    const definitions = toolRegistry.getDefinitions(toolNames);

    return {
      tools: definitions.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    };
  });
};

function formatAgentResponse(agent: Awaited<ReturnType<typeof agentService.getAgentById>>) {
  return {
    id: agent.id,
    tenantId: agent.tenantId,
    name: agent.name,
    description: agent.description,
    primaryProvider: agent.primaryProvider,
    fallbackProvider: agent.fallbackProvider,
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    enabledTools: agent.enabledTools,
    voiceEnabled: agent.voiceEnabled,
    voiceConfig: agent.voiceConfig,
    isActive: agent.isActive,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export default agentRoutes;
