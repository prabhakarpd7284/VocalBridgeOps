/**
 * Tenant routes
 */

import { FastifyPluginAsync } from 'fastify';
import { CreateTenantSchema, CreateApiKeySchema } from '../schemas/index.js';
import * as tenantService from '../services/tenant.service.js';
import { authenticate, requireRole } from '../plugins/auth.js';
import { ValidationError } from '../utils/errors.js';

const tenantRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Create a new tenant (public endpoint - no auth required)
   * Returns the API key only once
   */
  fastify.post('/tenants', async (request, reply) => {
    const parseResult = CreateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const result = await tenantService.createTenant(parseResult.data);

    return reply.status(201).send({
      id: result.tenant.id,
      name: result.tenant.name,
      email: result.tenant.email,
      apiKey: result.plainApiKey, // Only returned once!
      apiKeyPrefix: result.apiKey.keyPrefix,
      role: result.apiKey.role,
      createdAt: result.tenant.createdAt,
    });
  });

  /**
   * Get current tenant info
   */
  fastify.get('/tenants/me', {
    preHandler: [authenticate],
  }, async (request) => {
    const tenant = request.tenant!;
    const apiKey = request.apiKey!;

    return {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      role: apiKey.role,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  });

  /**
   * List API keys for tenant
   */
  fastify.get('/api-keys', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request) => {
    const keys = await tenantService.listApiKeys(request.tenant!.id);

    return {
      keys: keys.map(k => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        role: k.role,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        isRevoked: !!k.revokedAt,
      })),
    };
  });

  /**
   * Create a new API key
   */
  fastify.post('/api-keys', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const parseResult = CreateApiKeySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body',
        parseResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const result = await tenantService.createApiKey(
      request.tenant!.id,
      parseResult.data
    );

    return reply.status(201).send({
      id: result.apiKey.id,
      apiKey: result.plainKey, // Only returned once!
      keyPrefix: result.apiKey.keyPrefix,
      name: result.apiKey.name,
      role: result.apiKey.role,
      createdAt: result.apiKey.createdAt,
      expiresAt: result.apiKey.expiresAt,
    });
  });

  /**
   * Revoke an API key
   */
  fastify.delete('/api-keys/:keyId', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { keyId } = request.params as { keyId: string };

    await tenantService.revokeApiKey(request.tenant!.id, keyId);

    return reply.status(204).send();
  });

  /**
   * Rotate an API key (creates new, schedules old for expiry)
   */
  fastify.post('/api-keys/:keyId/rotate', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request) => {
    const { keyId } = request.params as { keyId: string };

    const result = await tenantService.rotateApiKey(request.tenant!.id, keyId);

    return {
      newKey: result.plainKey, // Only returned once!
      newKeyId: result.newKey.id,
      oldKeyValidUntil: result.oldKeyValidUntil,
    };
  });
};

export default tenantRoutes;
