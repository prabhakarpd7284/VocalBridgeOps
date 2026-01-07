/**
 * Authentication plugin
 * Validates API keys and sets tenant context
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TenantRole } from '@prisma/client';
import { prisma } from '../utils/db.js';
import { hashApiKey } from '../utils/crypto.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with authenticate method
  fastify.decorateRequest('tenant', null);
  fastify.decorateRequest('apiKey', null);
};

/**
 * Authenticate request using API key
 * Call this in route preHandler
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const apiKeyHeader = request.headers['x-api-key'];

  if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
    request.log.warn('Authentication failed: Missing API key');
    throw new UnauthorizedError('Missing API key');
  }

  const keyHash = hashApiKey(apiKeyHeader);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { tenant: true },
  });

  if (!apiKey) {
    request.log.warn('Authentication failed: Invalid API key');
    throw new UnauthorizedError('Invalid API key');
  }

  // Check revocation
  if (apiKey.revokedAt) {
    request.log.warn(
      { tenantId: apiKey.tenantId, apiKeyId: apiKey.id },
      'Authentication failed: Revoked API key'
    );
    throw new UnauthorizedError('API key has been revoked');
  }

  // Check expiry
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    request.log.warn(
      { tenantId: apiKey.tenantId, apiKeyId: apiKey.id, expiresAt: apiKey.expiresAt },
      'Authentication failed: Expired API key'
    );
    throw new UnauthorizedError('API key has expired');
  }

  // Set request context
  request.tenant = {
    ...apiKey.tenant,
    keyRole: apiKey.role,
  };
  request.apiKey = apiKey;

  request.log.info(
    {
      tenantId: apiKey.tenantId,
      tenantName: apiKey.tenant.name,
      role: apiKey.role,
      apiKeyName: apiKey.name,
    },
    'Authentication successful'
  );

  // Update last used (fire and forget)
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Ignore errors
    });

  // Update request logger with tenant context
  request.log = request.log.child({
    tenantId: apiKey.tenantId,
  });
}

/**
 * Require specific role(s) for access
 * Use after authenticate
 */
export function requireRole(...allowedRoles: TenantRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.tenant) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(request.tenant.keyRole)) {
      request.log.warn(
        {
          requiredRoles: allowedRoles,
          actualRole: request.tenant.keyRole,
        },
        'Authorization failed: Insufficient permissions'
      );
      throw new ForbiddenError('Insufficient permissions');
    }

    request.log.debug(
      { role: request.tenant.keyRole, allowedRoles },
      'Authorization check passed'
    );
  };
}

export default fp(authPlugin, {
  name: 'auth',
});
