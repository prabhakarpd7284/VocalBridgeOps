/**
 * VendorB Provider Adapter
 * Mocked AI vendor with:
 * - Response format: { choices[].message.content, usage.input_tokens, usage.output_tokens }
 * - Failure modes: HTTP 429 with retryAfterMs
 */

import { z } from 'zod';
import { ProviderType } from '@prisma/client';
import { config } from '../config/index.js';
import { ProviderError, ProviderSchemaError, RateLimitError, TimeoutError } from '../utils/errors.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  ToolCall,
} from './types.js';

// VendorB response schema for validation
const VendorBResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({
                  name: z.string(),
                  arguments: z.string(), // JSON string
                }),
              })
            )
            .optional(),
        }),
        finish_reason: z.string(),
      })
    )
    .min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

type VendorBResponse = z.infer<typeof VendorBResponseSchema>;

// VendorB request format (OpenAI-like)
interface VendorBRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  temperature: number;
  max_tokens: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export class VendorBAdapter implements ProviderAdapter {
  readonly name: ProviderType = 'VENDOR_B';
  private readonly timeoutMs: number;

  // Track rate limit state for mock
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor() {
    this.timeoutMs = config.providers.VENDOR_B.requestTimeoutMs;
  }

  async sendMessage(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Transform to VendorB format
    const vendorRequest = this.transformRequest(request);

    try {
      // Call mocked vendor
      const rawResponse = await this.callVendor(vendorRequest);

      // Validate response schema
      const parsed = VendorBResponseSchema.safeParse(rawResponse);
      if (!parsed.success) {
        throw new ProviderSchemaError(
          'VendorB returned unexpected response format',
          { raw: rawResponse, errors: parsed.error.issues }
        );
      }

      // Normalize to common format
      return this.transformResponse(parsed.data, Date.now() - startTime);
    } catch (error) {
      if (
        error instanceof ProviderSchemaError ||
        error instanceof TimeoutError ||
        error instanceof RateLimitError
      ) {
        throw error;
      }

      if (error instanceof ProviderError) {
        throw error;
      }

      throw new ProviderError(
        `VendorB request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VENDOR_B',
        error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  private transformRequest(request: ProviderRequest): VendorBRequest {
    const messages: VendorBRequest['messages'] = [];

    // Add system message first
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Transform conversation history
    for (const msg of request.messages) {
      if (msg.role === 'tool' && msg.toolResults?.length) {
        // Tool results become separate messages
        for (const result of msg.toolResults) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(result.result),
            tool_call_id: result.id,
          });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
        // Assistant with tool calls
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        });
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      }
    }

    return {
      model: 'vendorb-large',
      messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools?.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    };
  }

  private transformResponse(
    response: VendorBResponse,
    actualLatencyMs: number
  ): ProviderResponse {
    const choice = response.choices[0];
    const message = choice.message;

    let toolCalls: ToolCall[] | undefined;
    if (message.tool_calls?.length) {
      toolCalls = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: this.safeParseJson(tc.function.arguments),
      }));
    }

    return {
      content: message.content || '',
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      latencyMs: actualLatencyMs,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
    };
  }

  private safeParseJson(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  /**
   * Mock vendor call - simulates VendorB behavior
   */
  private async callVendor(request: VendorBRequest): Promise<VendorBResponse> {
    // Track requests for rate limiting simulation
    const now = Date.now();
    if (now - this.lastRequestTime > 60000) {
      this.requestCount = 0;
    }
    this.requestCount++;
    this.lastRequestTime = now;

    // Simulate network latency (30-100ms base - VendorB is faster)
    const baseLatency = 30 + Math.random() * 70;
    await this.sleep(baseLatency);

    // Check timeout
    if (baseLatency > this.timeoutMs) {
      throw new TimeoutError(`VendorB request timed out after ${this.timeoutMs}ms`);
    }

    // ~5% chance of 429 rate limit
    if (Math.random() < 0.05) {
      const retryAfterMs = 1000 + Math.random() * 2000;
      const error = new RateLimitError(
        'VendorB rate limit exceeded',
        Math.round(retryAfterMs)
      );
      (error as any).retryable = true;
      (error as any).statusCode = 429;
      throw error;
    }

    // Get last user message
    const lastUserMessage = request.messages
      .filter((m) => m.role === 'user')
      .pop();

    const inputTokens = request.messages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content || ''),
      0
    );

    // Check if we should trigger a tool call
    let toolCalls: VendorBResponse['choices'][0]['message']['tool_calls'];
    let content: string | null;
    let finishReason: string;

    const hasTools = request.tools?.length;
    const hasExistingToolResults = request.messages.some((m) => m.role === 'tool');
    const mentionsOrder = lastUserMessage?.content?.toLowerCase().includes('order');

    if (hasTools && mentionsOrder && !hasExistingToolResults) {
      // Trigger tool call
      toolCalls = [
        {
          id: `call_${Date.now()}`,
          function: {
            name: 'InvoiceLookup',
            arguments: JSON.stringify({
              orderId: this.extractOrderId(lastUserMessage?.content || '') || '12345',
            }),
          },
        },
      ];
      content = null;
      finishReason = 'tool_calls';
    } else {
      content = this.generateMockResponse(lastUserMessage?.content || '');
      finishReason = 'stop';
    }

    const outputTokens = this.estimateTokens(content || '') + (toolCalls ? 50 : 0);

    return {
      choices: [
        {
          message: {
            content,
            tool_calls: toolCalls,
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private extractOrderId(text: string): string | null {
    const match = text.match(/#?(\d{4,})/);
    return match ? match[1] : null;
  }

  private generateMockResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hi there! I'm your VendorB-powered assistant. How may I assist you today?";
    }

    if (lowerMessage.includes('order') || lowerMessage.includes('invoice')) {
      return "I've looked up your order information. Your order status shows it's currently in processing and will be shipped soon. Would you like me to provide tracking details once available?";
    }

    if (lowerMessage.includes('help')) {
      return "I'm here to help! I can assist you with:\n\n1. Order inquiries\n2. Invoice lookups\n3. General support\n\nPlease let me know what you need.";
    }

    if (lowerMessage.includes('thank')) {
      return "You're very welcome! Feel free to reach out if you need anything else.";
    }

    return `I understand you're asking about: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}". I'd be happy to help you with this. Could you provide more details?`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
