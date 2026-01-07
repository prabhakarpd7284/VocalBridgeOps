/**
 * Request/Response validation schemas using Zod
 */

import { z } from 'zod';

// ============================================================================
// Common
// ============================================================================

export const UUIDSchema = z.string().uuid();

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============================================================================
// Tenant
// ============================================================================

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

// ============================================================================
// API Keys
// ============================================================================

export const CreateApiKeySchema = z.object({
  name: z.string().max(100).optional(),
  role: z.enum(['ADMIN', 'ANALYST']).default('ADMIN'),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

// ============================================================================
// Agent
// ============================================================================

export const ProviderTypeSchema = z.enum(['VENDOR_A', 'VENDOR_B']);

export const VoiceConfigSchema = z.object({
  sttProvider: z.string().default('mock'),
  ttsProvider: z.string().default('mock'),
  voice: z.string().default('alloy'),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  primaryProvider: ProviderTypeSchema,
  fallbackProvider: ProviderTypeSchema.nullable().optional(),
  systemPrompt: z.string().min(1).max(10000),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(4096).default(1024),
  enabledTools: z.array(z.string()).default([]),
  voiceEnabled: z.boolean().default(false),
  voiceConfig: VoiceConfigSchema.optional(),
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

// ============================================================================
// Session
// ============================================================================

export const ChannelTypeSchema = z.enum(['CHAT', 'VOICE']);

export const CreateSessionSchema = z.object({
  agentId: z.string().uuid(),
  customerId: z.string().min(1).max(100),
  channel: ChannelTypeSchema.default('CHAT'),
  demoMode: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

// ============================================================================
// Message
// ============================================================================

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const SendAsyncMessageSchema = SendMessageSchema.extend({
  callbackUrl: z.string().url().optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type SendAsyncMessageInput = z.infer<typeof SendAsyncMessageSchema>;

// ============================================================================
// Usage
// ============================================================================

export const UsageQuerySchema = DateRangeSchema.extend({
  groupBy: z.enum(['provider', 'agent', 'day']).optional(),
});

export const TopAgentsQuerySchema = DateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type UsageQueryInput = z.infer<typeof UsageQuerySchema>;
export type TopAgentsQueryInput = z.infer<typeof TopAgentsQuerySchema>;

// ============================================================================
// Voice
// ============================================================================

export const VoiceUploadSchema = z.object({
  format: z.string().optional(),
});

export type VoiceUploadInput = z.infer<typeof VoiceUploadSchema>;
