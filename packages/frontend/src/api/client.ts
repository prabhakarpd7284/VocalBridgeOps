/**
 * API Client
 */

const API_BASE = '/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = localStorage.getItem('apiKey');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (apiKey) {
    (headers as Record<string, string>)['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code || 'UNKNOWN_ERROR',
      data?.error?.message || 'An error occurred',
      data?.error?.details
    );
  }

  return data as T;
}

// Auth
export function setApiKey(key: string): void {
  localStorage.setItem('apiKey', key);
}

export function getApiKey(): string | null {
  return localStorage.getItem('apiKey');
}

export function clearApiKey(): void {
  localStorage.removeItem('apiKey');
}

// Types
export interface Tenant {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ANALYST';
  createdAt: string;
}

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  primaryProvider: 'VENDOR_A' | 'VENDOR_B';
  fallbackProvider?: 'VENDOR_A' | 'VENDOR_B';
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabledTools: string[];
  voiceEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  agentId: string;
  agentName?: string;
  customerId: string;
  channel: 'CHAT' | 'VOICE';
  status: 'ACTIVE' | 'ENDED' | 'ERROR';
  demoMode?: boolean;
  createdAt: string;
  endedAt?: string;
}

export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface UsageSummary {
  period: { start: string; end: string };
  totals: {
    sessions: number;
    messages: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    costCents: number;
    costFormatted: string;
  };
}

// API Functions

// Tenants
export async function getCurrentTenant(): Promise<Tenant> {
  return request<Tenant>('/tenants/me');
}

export async function createTenant(data: { name: string; email: string }): Promise<{
  id: string;
  apiKey: string;
}> {
  return request('/tenants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Agents
export async function listAgents(): Promise<{ agents: Agent[] }> {
  return request('/agents?active=true');
}

export async function getAgent(id: string): Promise<Agent> {
  return request(`/agents/${id}`);
}

export async function createAgent(data: Partial<Agent>): Promise<Agent> {
  return request('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
  return request(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return request(`/agents/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function createDemoSession(agentId: string): Promise<Session> {
  return request(`/agents/${agentId}/demo`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Sessions
export async function listSessions(params?: {
  agentId?: string;
  status?: string;
}): Promise<{ sessions: Session[] }> {
  const searchParams = new URLSearchParams();
  if (params?.agentId) searchParams.set('agentId', params.agentId);
  if (params?.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return request(`/sessions${query ? `?${query}` : ''}`);
}

export async function getSession(id: string): Promise<{
  id: string;
  agentId: string;
  agentName: string;
  customerId: string;
  channel: string;
  status: string;
  demoMode?: boolean;
  messages: Message[];
  summary: {
    messageCount: number;
    totalTokens: number;
    totalCostCents: number;
  };
}> {
  return request(`/sessions/${id}`);
}

export async function createSession(data: {
  agentId: string;
  customerId: string;
  channel?: 'CHAT' | 'VOICE';
}): Promise<Session> {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function endSession(id: string): Promise<void> {
  return request(`/sessions/${id}/end`, {
    method: 'POST',
    body: JSON.stringify({}), // ✅ REQUIRED
  });
}


// Messages
export async function sendMessage(
  sessionId: string,
  content: string,
  idempotencyKey?: string
): Promise<Message & { metadata: unknown }> {
  const headers: HeadersInit = {};
  if (idempotencyKey) {
    (headers as Record<string, string>)['X-Idempotency-Key'] = idempotencyKey;
  }

  return request(`/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });
}

// Usage
export async function getUsageSummary(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<UsageSummary> {
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  const query = searchParams.toString();
  return request(`/usage${query ? `?${query}` : ''}`);
}

export async function getUsageBreakdown(params?: {
  groupBy?: 'provider' | 'agent' | 'day';
  startDate?: string;
  endDate?: string;
}): Promise<{
  period: { start: string; end: string };
  groupBy: string;
  breakdown: Array<{
    provider?: string;
    agentId?: string;
    agentName?: string;
    date?: string;
    sessions: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    costCents: number;
    costFormatted: string;
  }>;
}> {
  const searchParams = new URLSearchParams();
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  const query = searchParams.toString();
  return request(`/usage/breakdown${query ? `?${query}` : ''}`);
}

export async function getTopAgents(): Promise<{
  period: { start: string; end: string };
  topAgents: Array<{
    agentId: string;
    agentName: string;
    sessions: number;
    totalTokens: number;
    costCents: number;
    costFormatted: string;
  }>;
}> {
  return request('/usage/top-agents');
}

// Tools
export async function listTools(): Promise<{
  tools: Array<{
    name: string;
    description: string;
  }>;
}> {
  return request('/tools');
}
