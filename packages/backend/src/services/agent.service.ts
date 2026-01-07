/**
 * Agent service
 * Handles agent CRUD operations with tenant isolation
 */

import { Agent, ProviderType } from '@prisma/client';
import { prisma } from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';
import type { CreateAgentInput, UpdateAgentInput } from '../schemas/index.js';

/**
 * Create a new agent for a tenant
 */
export async function createAgent(
  tenantId: string,
  input: CreateAgentInput
): Promise<Agent> {
  return prisma.agent.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description,
      primaryProvider: input.primaryProvider as ProviderType,
      fallbackProvider: input.fallbackProvider as ProviderType | undefined,
      systemPrompt: input.systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      enabledTools: input.enabledTools,
      voiceEnabled: input.voiceEnabled,
      voiceConfig: input.voiceConfig,
    },
  });
}

/**
 * List agents for a tenant
 */
export async function listAgents(
  tenantId: string,
  options?: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<Agent[]> {
  return prisma.agent.findMany({
    where: {
      tenantId,
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

/**
 * Get agent by ID (tenant-scoped)
 */
export async function getAgentById(tenantId: string, agentId: string): Promise<Agent> {
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      tenantId,
    },
  });

  if (!agent) {
    throw new NotFoundError('Agent');
  }

  return agent;
}

/**
 * Update an agent
 */
export async function updateAgent(
  tenantId: string,
  agentId: string,
  input: UpdateAgentInput
): Promise<Agent> {
  // Verify agent exists and belongs to tenant
  await getAgentById(tenantId, agentId);

  return prisma.agent.update({
    where: { id: agentId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.primaryProvider !== undefined && {
        primaryProvider: input.primaryProvider as ProviderType,
      }),
      ...(input.fallbackProvider !== undefined && {
        fallbackProvider: input.fallbackProvider as ProviderType | undefined,
      }),
      ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
      ...(input.temperature !== undefined && { temperature: input.temperature }),
      ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
      ...(input.enabledTools !== undefined && { enabledTools: input.enabledTools }),
      ...(input.voiceEnabled !== undefined && { voiceEnabled: input.voiceEnabled }),
      ...(input.voiceConfig !== undefined && { voiceConfig: input.voiceConfig }),
    },
  });
}

/**
 * Delete an agent (soft delete by setting isActive = false)
 */
export async function deleteAgent(tenantId: string, agentId: string): Promise<Agent> {
  // Verify agent exists and belongs to tenant
  await getAgentById(tenantId, agentId);

  return prisma.agent.update({
    where: { id: agentId },
    data: { isActive: false },
  });
}

/**
 * Get agent with enabled tools parsed
 */
export async function getAgentWithTools(
  tenantId: string,
  agentId: string
): Promise<Agent & { parsedTools: string[] }> {
  const agent = await getAgentById(tenantId, agentId);
  return {
    ...agent,
    parsedTools: Array.isArray(agent.enabledTools) ? agent.enabledTools as string[] : [],
  };
}
