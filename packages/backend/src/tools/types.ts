/**
 * Tool framework types
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolContext {
  tenantId: string;
  sessionId: string;
  correlationId: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolPermissions {
  dataAccess: 'none' | 'session_only' | 'tenant_readonly' | 'tenant_write';
  networkAccess: boolean;
  estimatedCostCents: number;
}

export interface ToolLimits {
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permissions: ToolPermissions;
  limits: ToolLimits;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}
