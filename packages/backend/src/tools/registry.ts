/**
 * Tool Registry
 * Manages available tools and their execution
 */

import { prisma } from '../utils/db.js';
import { ForbiddenError, NotFoundError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult, ToolDefinition } from './types.js';
import { InvoiceLookupTool } from './invoice-lookup.js';

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // Register built-in tools
    this.register(InvoiceLookupTool);
  }

  /**
   * Register a new tool
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.info({ toolName: tool.name }, 'Tool registered');
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool definitions for enabled tools
   */
  getDefinitions(enabledTools: string[]): ToolDefinition[] {
    return enabledTools
      .map((name) => {
        const tool = this.tools.get(name);
        if (!tool) return null;
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        };
      })
      .filter((t): t is ToolDefinition => t !== null);
  }

  /**
   * Execute a tool with safety checks
   */
  async execute(
    toolName: string,
    args: unknown,
    context: ToolContext,
    agentEnabledTools: string[]
  ): Promise<ToolResult> {
    const log = logger.child({
      correlationId: context.correlationId,
      sessionId: context.sessionId,
      toolName,
    });

    const startTime = Date.now();

    // Check if tool exists
    const tool = this.tools.get(toolName);
    if (!tool) {
      log.warn('Tool not found');
      throw new NotFoundError(`Tool '${toolName}'`);
    }

    // Check if tool is enabled for this agent
    if (!agentEnabledTools.includes(toolName)) {
      log.warn('Tool not enabled for agent');
      throw new ForbiddenError(`Tool '${toolName}' is not enabled for this agent`);
    }

    log.info({ args }, 'Executing tool');

    let result: ToolResult;
    let status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' = 'FAILED';

    try {
      // Execute with timeout
      result = await Promise.race([
        tool.execute(args, context),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new TimeoutError(`Tool '${toolName}' timed out`)),
            tool.limits.timeoutMs
          )
        ),
      ]);

      status = result.success ? 'SUCCESS' : 'FAILED';
    } catch (error) {
      if (error instanceof TimeoutError) {
        status = 'TIMEOUT';
        result = {
          success: false,
          error: error.message,
        };
      } else {
        result = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    const latencyMs = Date.now() - startTime;

    // Store execution record
    try {
      await prisma.toolExecution.create({
        data: {
          sessionId: context.sessionId,
          messageId: '', // Will be updated by caller if needed
          correlationId: context.correlationId,
          toolName,
          toolInput: args as object,
          toolOutput: result.data as object ?? null,
          status,
          errorMessage: result.error,
          latencyMs,
          costCents: tool.permissions.estimatedCostCents,
        },
      });
    } catch (error) {
      // Log but don't fail the tool execution
      log.error({ error }, 'Failed to store tool execution record');
    }

    log.info(
      {
        success: result.success,
        latencyMs,
        status,
      },
      'Tool execution complete'
    );

    return result;
  }

  /**
   * Check if all tools are available
   */
  validateTools(toolNames: string[]): { valid: boolean; missing: string[] } {
    const missing = toolNames.filter((name) => !this.tools.has(name));
    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
