/**
 * Fastify type augmentations
 */

import type { Tenant, ApiKey, TenantRole } from '@prisma/client';
import type { Logger } from 'pino';

declare module 'fastify' {
  interface FastifyRequest {
    // Authentication context
    tenant?: Tenant & { keyRole: TenantRole };
    apiKey?: ApiKey;

    // Request tracing
    correlationId: string;

    // Request-scoped logger
    log: Logger;
  }
}
