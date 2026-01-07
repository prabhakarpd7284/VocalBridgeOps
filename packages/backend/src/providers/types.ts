/**
 * Provider adapter types
 * Defines the interface for AI vendor adapters
 */

import { ProviderType } from '@prisma/client';

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

/**
 * Tool call made by the assistant
 */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  id: string;
  result: unknown;
  error?: string;
}

/**
 * Tool definition for the provider
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Request to send to a provider
 */
export interface ProviderRequest {
  systemPrompt: string;
  messages: ConversationMessage[];
  temperature: number;
  maxTokens: number;
  tools?: ToolDefinition[];
}

/**
 * Normalized response from a provider
 */
export interface ProviderResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  toolCalls?: ToolCall[];
}

/**
 * Provider adapter interface
 * Each vendor implements this interface
 */
export interface ProviderAdapter {
  readonly name: ProviderType;

  /**
   * Send a message to the provider
   */
  sendMessage(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Check if the provider is healthy
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Result of a provider call (includes metadata)
 */
export interface ProviderCallResult {
  success: boolean;
  response?: ProviderResponse;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
  provider: ProviderType;
  isFallback: boolean;
  attemptNumber: number;
  latencyMs: number;
}
