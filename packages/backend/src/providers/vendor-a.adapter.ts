/**
 * VendorA Provider Adapter
 * Mocked AI vendor with:
 * - Response format: { outputText, tokensIn, tokensOut, latencyMs }
 * - Failure modes: ~10% HTTP 500, random latency spikes
 */

import { z } from 'zod';
import { ProviderType } from '@prisma/client';
import { config } from '../config/index.js';
import { ProviderError, ProviderSchemaError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  ToolCall,
} from './types.js';

// VendorA response schema for validation
const VendorAResponseSchema = z.object({
  outputText: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        args: z.unknown(),
      })
    )
    .optional(),
});

type VendorAResponse = z.infer<typeof VendorAResponseSchema>;

// VendorA request format (for documentation/mock purposes)
interface VendorARequest {
  system_prompt: string;
  conversation: Array<{
    speaker: 'user' | 'assistant' | 'system' | 'tool';
    text: string;
    tool_invocations?: Array<{ id: string; name: string; arguments: unknown }>;
    tool_responses?: Array<{ id: string; output: unknown }>;
  }>;
  settings: {
    temperature: number;
    max_output_tokens: number;
  };
  available_tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

export class VendorAAdapter implements ProviderAdapter {
  readonly name: ProviderType = 'VENDOR_A';
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = config.providers.VENDOR_A.requestTimeoutMs;
  }

  async sendMessage(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Transform to VendorA format
    const vendorRequest = this.transformRequest(request);

    try {
      // Call mocked vendor
      const rawResponse = await this.callVendor(vendorRequest);

      // Validate response schema
      const parsed = VendorAResponseSchema.safeParse(rawResponse);
      if (!parsed.success) {
        throw new ProviderSchemaError(
          'VendorA returned unexpected response format',
          { raw: rawResponse, errors: parsed.error.issues }
        );
      }

      // Normalize to common format
      return this.transformResponse(parsed.data, Date.now() - startTime);
    } catch (error) {
      if (error instanceof ProviderSchemaError || error instanceof TimeoutError) {
        throw error;
      }

      if (error instanceof ProviderError) {
        throw error;
      }

      throw new ProviderError(
        `VendorA request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VENDOR_A',
        error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple mock health check
      return true;
    } catch {
      return false;
    }
  }

  private transformRequest(request: ProviderRequest): VendorARequest {
    return {
      system_prompt: request.systemPrompt,
      conversation: request.messages.map((msg) => ({
        speaker: msg.role,
        text: msg.content,
        tool_invocations: msg.toolCalls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.args,
        })),
        tool_responses: msg.toolResults?.map((tr) => ({
          id: tr.id,
          output: tr.result,
        })),
      })),
      settings: {
        temperature: request.temperature,
        max_output_tokens: request.maxTokens,
      },
      available_tools: request.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
    };
  }

  private transformResponse(
    response: VendorAResponse,
    actualLatencyMs: number
  ): ProviderResponse {
    const toolCalls: ToolCall[] | undefined = response.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
    }));

    return {
      content: response.outputText,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      latencyMs: actualLatencyMs,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
    };
  }

  /**
   * Mock vendor call - simulates VendorA behavior
   * In production, this would be an HTTP call
   */
  private async callVendor(request: VendorARequest): Promise<VendorAResponse> {
    // Simulate network latency (50-200ms base)
    const baseLatency = 50 + Math.random() * 150;

    // ~5% chance of latency spike (1-3 seconds)
    const hasLatencySpike = Math.random() < 0.05;
    const latencySpike = hasLatencySpike ? 1000 + Math.random() * 2000 : 0;

    const totalLatency = baseLatency + latencySpike;

    // Check timeout
    if (totalLatency > this.timeoutMs) {
      await this.sleep(this.timeoutMs);
      throw new TimeoutError(`VendorA request timed out after ${this.timeoutMs}ms`);
    }

    await this.sleep(totalLatency);

    // ~10% chance of 500 error
    if (Math.random() < 0.1) {
      const error = new ProviderError(
        'VendorA internal server error',
        'VENDOR_A'
      );
      (error as any).statusCode = 500;
      (error as any).retryable = true;
      throw error;
    }

    // Generate mock response
    const lastUserMessage = request.conversation
      .filter((m) => m.speaker === 'user')
      .pop();

    const inputTokens = this.estimateTokens(request.system_prompt) +
      request.conversation.reduce((sum, m) => sum + this.estimateTokens(m.text), 0);

    // Check if we should trigger a tool call or respond with tool results
    let toolCalls: VendorAResponse['toolCalls'];
    let outputText: string;

    // Simple detection logic:
    // 1. If last user message is empty → we're in second call with tool results, use them
    // 2. If last user message mentions "order" and tools available → trigger tool call
    // 3. Otherwise → generate mock response

    const isToolResultCall = !lastUserMessage?.text || lastUserMessage.text.trim() === '';

    if (isToolResultCall) {
      // This is the second provider call with tool results
      // Find the most recent tool response
      const toolResponse = request.conversation
        .slice()
        .reverse()
        .find((m) => m.tool_responses?.length);

      if (toolResponse?.tool_responses?.[0]) {
        outputText = this.generateResponseFromToolResult(toolResponse.tool_responses[0].output);
      } else {
        // Fallback if no tool response found
        outputText = "I've processed your request. Is there anything else I can help you with?";
      }
    } else if (
      request.available_tools?.length &&
      lastUserMessage.text.toLowerCase().includes('order')
    ) {
      // Trigger tool call for order-related queries
      toolCalls = [
        {
          id: `call_${Date.now()}`,
          name: 'InvoiceLookup',
          args: { orderId: this.extractOrderId(lastUserMessage.text) || '12345' },
        },
      ];
      outputText = '';
    } else {
      // Regular response with no tool handling
      outputText = this.generateMockResponse(lastUserMessage.text);
    }

    const outputTokens = this.estimateTokens(outputText) + (toolCalls ? 50 : 0);

    return {
      outputText,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
      latencyMs: Math.round(totalLatency),
      toolCalls,
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  private extractOrderId(text: string): string | null {
    // Extract order ID - match 3 or more digits
    const match = text.match(/#?(\d{3,})/);
    return match ? match[1] : null;
  }

  private generateResponseFromToolResult(toolOutput: unknown): string {
    try {
      const data = toolOutput as any;

      // Check if tool returned an error
      if (data === null) {
        return "I couldn't find that order in our system. Please double-check the order number and try again, or contact support if you need assistance.";
      }

      if (data?.orderId) {
        // Handle successful InvoiceLookup result
        const order = data;
        let response = `I found your order #${order.orderId}!\n\n`;
        response += `**Status**: ${order.statusDescription || order.status}\n`;
        response += `**Invoice**: ${order.invoiceNumber}\n`;
        response += `**Amount**: ${order.currency} ${order.amount}\n`;

        if (order.trackingNumber) {
          response += `**Tracking Number**: ${order.trackingNumber}\n`;
        }

        if (order.estimatedDelivery) {
          response += `**Estimated Delivery**: ${order.estimatedDelivery}\n`;
        }

        if (order.items?.length) {
          response += `\n**Items** (${order.itemCount}):\n`;
          order.items.forEach((item: any) => {
            response += `- ${item.name} (Qty: ${item.quantity}) - ${order.currency} ${item.price}\n`;
          });
        }

        response += `\nIs there anything else you'd like to know about your order?`;
        return response;
      }

      return "I found the information you requested. Is there anything specific you'd like to know?";
    } catch {
      return "I found some information, but I'm having trouble formatting it. Let me know if you need clarification!";
    }
  }

  private generateMockResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! I'm your AI assistant. How can I help you today?";
    }

    if (lowerMessage.includes('order') || lowerMessage.includes('invoice')) {
      return "I'd be happy to help you with your order. Based on the information I found, your order is being processed and should ship within 2-3 business days. Is there anything else you'd like to know?";
    }

    if (lowerMessage.includes('help')) {
      return 'Of course! I can help you with:\n- Order status inquiries\n- Invoice lookups\n- General questions\n\nWhat would you like assistance with?';
    }

    if (lowerMessage.includes('thank')) {
      return "You're welcome! If you have any other questions, feel free to ask.";
    }

    return `Thank you for your message. I understand you're asking about "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}". Let me help you with that. Is there anything specific you'd like to know?`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
