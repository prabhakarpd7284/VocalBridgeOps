/**
 * Usage/Billing routes
 */

import { FastifyPluginAsync } from 'fastify';
import { UsageQuerySchema, TopAgentsQuerySchema } from '../schemas/index.js';
import * as billingService from '../services/billing.service.js';
import { authenticate } from '../plugins/auth.js';
import { ValidationError } from '../utils/errors.js';
import { ProviderType } from '@prisma/client';

const usageRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get usage summary
   */
  fastify.get('/usage', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      agentId?: string;
      provider?: string;
    };

    const summary = await billingService.getUsageSummary(request.tenant!.id, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      agentId: query.agentId,
      provider: query.provider as ProviderType | undefined,
    });

    return {
      period: {
        start: summary.period.start.toISOString(),
        end: summary.period.end.toISOString(),
      },
      totals: {
        sessions: summary.totals.sessions,
        messages: summary.totals.messages,
        tokensIn: summary.totals.tokensIn,
        tokensOut: summary.totals.tokensOut,
        totalTokens: summary.totals.totalTokens,
        costCents: summary.totals.costCents,
        costFormatted: billingService.formatCost(summary.totals.costCents),
      },
    };
  });

  /**
   * Get usage breakdown
   */
  fastify.get('/usage/breakdown', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      groupBy?: string;
      agentId?: string;
      provider?: string;
    };

    const parseResult = UsageQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const groupBy = (parseResult.data.groupBy || 'provider') as 'provider' | 'agent' | 'day';

    const breakdown = await billingService.getUsageBreakdown(
      request.tenant!.id,
      groupBy,
      {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        agentId: query.agentId,
        provider: query.provider as ProviderType | undefined,
      }
    );

    return {
      period: {
        start: breakdown.period.start.toISOString(),
        end: breakdown.period.end.toISOString(),
      },
      groupBy,
      breakdown: breakdown.breakdown.map(b => ({
        ...b,
        costFormatted: billingService.formatCost(b.costCents),
      })),
    };
  });

  /**
   * Get top agents by cost
   */
  fastify.get('/usage/top-agents', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      limit?: string;
    };

    const parseResult = TopAgentsQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const result = await billingService.getTopAgentsByCost(request.tenant!.id, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: parseResult.data.limit,
    });

    return {
      period: {
        start: result.period.start.toISOString(),
        end: result.period.end.toISOString(),
      },
      topAgents: result.topAgents.map(a => ({
        ...a,
        costFormatted: billingService.formatCost(a.costCents),
      })),
    };
  });
};

export default usageRoutes;
