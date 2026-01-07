/**
 * Billing/Usage service
 * Handles usage analytics and billing queries
 */

import { ProviderType, Prisma } from '@prisma/client';
import { prisma } from '../utils/db.js';

export interface UsageSummary {
  period: {
    start: Date;
    end: Date;
  };
  totals: {
    sessions: number;
    messages: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    costCents: number;
  };
}

export interface UsageBreakdown {
  period: {
    start: Date;
    end: Date;
  };
  breakdown: Array<{
    provider?: ProviderType;
    agentId?: string;
    agentName?: string;
    date?: string;
    sessions: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    costCents: number;
  }>;
}

export interface TopAgentUsage {
  agentId: string;
  agentName: string;
  sessions: number;
  messages: number;
  totalTokens: number;
  costCents: number;
}

export interface UsageQueryOptions {
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  provider?: ProviderType;
}

/**
 * Get usage summary for a tenant
 */
export async function getUsageSummary(
  tenantId: string,
  options: UsageQueryOptions = {}
): Promise<UsageSummary> {
  const { startDate, endDate } = getDateRange(options);

  // Get usage aggregates
  const usageAgg = await prisma.usageEvent.aggregate({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      ...(options.agentId && { agentId: options.agentId }),
      ...(options.provider && { provider: options.provider }),
    },
    _sum: {
      tokensIn: true,
      tokensOut: true,
      totalTokens: true,
      costCents: true,
    },
    _count: true,
  });

  // Get session count
  const sessionCount = await prisma.session.count({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      ...(options.agentId && { agentId: options.agentId }),
    },
  });

  // Get message count
  const messageCount = await prisma.message.count({
    where: {
      session: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(options.agentId && { agentId: options.agentId }),
      },
    },
  });

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    totals: {
      sessions: sessionCount,
      messages: messageCount,
      tokensIn: usageAgg._sum.tokensIn ?? 0,
      tokensOut: usageAgg._sum.tokensOut ?? 0,
      totalTokens: usageAgg._sum.totalTokens ?? 0,
      costCents: usageAgg._sum.costCents ?? 0,
    },
  };
}

/**
 * Get usage breakdown by grouping dimension
 */
export async function getUsageBreakdown(
  tenantId: string,
  groupBy: 'provider' | 'agent' | 'day',
  options: UsageQueryOptions = {}
): Promise<UsageBreakdown> {
  const { startDate, endDate } = getDateRange(options);

  const whereClause = {
    tenantId,
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
    ...(options.agentId && { agentId: options.agentId }),
    ...(options.provider && { provider: options.provider }),
  };

  let breakdown: UsageBreakdown['breakdown'] = [];

  if (groupBy === 'provider') {
    const results = await prisma.usageEvent.groupBy({
      by: ['provider'],
      where: whereClause,
      _sum: {
        tokensIn: true,
        tokensOut: true,
        totalTokens: true,
        costCents: true,
      },
      _count: {
        sessionId: true,
      },
    });

    breakdown = results.map((r) => ({
      provider: r.provider,
      sessions: r._count.sessionId,
      tokensIn: r._sum.tokensIn ?? 0,
      tokensOut: r._sum.tokensOut ?? 0,
      totalTokens: r._sum.totalTokens ?? 0,
      costCents: r._sum.costCents ?? 0,
    }));
  } else if (groupBy === 'agent') {
    const results = await prisma.usageEvent.groupBy({
      by: ['agentId'],
      where: whereClause,
      _sum: {
        tokensIn: true,
        tokensOut: true,
        totalTokens: true,
        costCents: true,
      },
      _count: {
        sessionId: true,
      },
    });

    // Fetch agent names
    const agentIds = results.map((r) => r.agentId);
    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    breakdown = results.map((r) => ({
      agentId: r.agentId,
      agentName: agentMap.get(r.agentId) ?? 'Unknown',
      sessions: r._count.sessionId,
      tokensIn: r._sum.tokensIn ?? 0,
      tokensOut: r._sum.tokensOut ?? 0,
      totalTokens: r._sum.totalTokens ?? 0,
      costCents: r._sum.costCents ?? 0,
    }));
  } else if (groupBy === 'day') {
    // For day grouping, we need raw SQL or process results
    // Cast DATE to text to avoid PostgreSQL date type conversion issues
    // Use quoted column names since Prisma preserves camelCase in PostgreSQL
    const results = await prisma.$queryRaw<
      Array<{
        date: string;
        sessions: bigint;
        tokens_in: bigint;
        tokens_out: bigint;
        total_tokens: bigint;
        cost_cents: bigint;
      }>
    >`
      SELECT
        TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') as date,
        COUNT(DISTINCT "sessionId") as sessions,
        COALESCE(SUM("tokensIn"), 0) as tokens_in,
        COALESCE(SUM("tokensOut"), 0) as tokens_out,
        COALESCE(SUM("totalTokens"), 0) as total_tokens,
        COALESCE(SUM("costCents"), 0) as cost_cents
      FROM usage_events
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        ${options.agentId ? Prisma.sql`AND "agentId" = ${options.agentId}` : Prisma.empty}
        ${options.provider ? Prisma.sql`AND provider = ${options.provider}` : Prisma.empty}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    breakdown = results.map((r) => ({
      date: r.date,
      sessions: Number(r.sessions),
      tokensIn: Number(r.tokens_in),
      tokensOut: Number(r.tokens_out),
      totalTokens: Number(r.total_tokens),
      costCents: Number(r.cost_cents),
    }));
  }

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    breakdown,
  };
}

/**
 * Get top agents by cost
 */
export async function getTopAgentsByCost(
  tenantId: string,
  options: UsageQueryOptions & { limit?: number } = {}
): Promise<{
  period: { start: Date; end: Date };
  topAgents: TopAgentUsage[];
}> {
  const { startDate, endDate } = getDateRange(options);
  const limit = options.limit ?? 10;

  const results = await prisma.usageEvent.groupBy({
    by: ['agentId'],
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: {
      totalTokens: true,
      costCents: true,
    },
    _count: {
      sessionId: true,
    },
    orderBy: {
      _sum: {
        costCents: 'desc',
      },
    },
    take: limit,
  });

  // Fetch agent names and message counts
  const agentIds = results.map((r) => r.agentId);
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  // Get message counts per agent
  const messageCounts = await prisma.message.groupBy({
    by: ['sessionId'],
    where: {
      session: {
        tenantId,
        agentId: { in: agentIds },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    _count: true,
  });

  // Get session to agent mapping
  const sessions = await prisma.session.findMany({
    where: {
      tenantId,
      agentId: { in: agentIds },
    },
    select: { id: true, agentId: true },
  });
  const sessionToAgent = new Map(sessions.map((s) => [s.id, s.agentId]));

  // Aggregate message counts by agent
  const messagesByAgent = new Map<string, number>();
  for (const mc of messageCounts) {
    const agentId = sessionToAgent.get(mc.sessionId);
    if (agentId) {
      messagesByAgent.set(agentId, (messagesByAgent.get(agentId) ?? 0) + mc._count);
    }
  }

  const topAgents: TopAgentUsage[] = results.map((r) => ({
    agentId: r.agentId,
    agentName: agentMap.get(r.agentId) ?? 'Unknown',
    sessions: r._count.sessionId,
    messages: messagesByAgent.get(r.agentId) ?? 0,
    totalTokens: r._sum.totalTokens ?? 0,
    costCents: r._sum.costCents ?? 0,
  }));

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    topAgents,
  };
}

/**
 * Check if tenant has exceeded daily cost limit
 */
export async function checkDailyCostLimit(
  tenantId: string,
  limitCents: number
): Promise<{ allowed: boolean; currentCostCents: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.usageEvent.aggregate({
    where: {
      tenantId,
      createdAt: { gte: today },
    },
    _sum: {
      costCents: true,
    },
  });

  const currentCostCents = result._sum.costCents ?? 0;

  return {
    allowed: currentCostCents < limitCents,
    currentCostCents,
  };
}

/**
 * Get date range from options with defaults
 */
function getDateRange(options: UsageQueryOptions): {
  startDate: Date;
  endDate: Date;
} {
  const endDate = options.endDate ?? new Date();
  const startDate =
    options.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days default

  return { startDate, endDate };
}

/**
 * Format cost in cents to dollars string
 */
export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
