/**
 * Tenant service
 * Handles tenant and API key management
 */

import { Tenant, ApiKey, TenantRole } from '@prisma/client';
import { prisma } from '../utils/db.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../utils/crypto.js';
import { NotFoundError } from '../utils/errors.js';
import type { CreateTenantInput, CreateApiKeyInput } from '../schemas/index.js';

export interface TenantCreateResult {
  tenant: Tenant;
  apiKey: ApiKey;
  plainApiKey: string; // Only returned on creation
}

/**
 * Create a new tenant with initial API key
 */
export async function createTenant(input: CreateTenantInput): Promise<TenantCreateResult> {
  const plainApiKey = generateApiKey();

  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      email: input.email,
      apiKeys: {
        create: {
          keyPrefix: getKeyPrefix(plainApiKey),
          keyHash: hashApiKey(plainApiKey),
          name: 'Default API Key',
          role: 'ADMIN',
        },
      },
    },
    include: {
      apiKeys: true,
    },
  });

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    },
    apiKey: tenant.apiKeys[0],
    plainApiKey,
  };
}

/**
 * Get tenant by ID
 */
export async function getTenantById(id: string): Promise<Tenant> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  return tenant;
}

/**
 * Create a new API key for a tenant
 */
export async function createApiKey(
  tenantId: string,
  input: CreateApiKeyInput
): Promise<{ apiKey: ApiKey; plainKey: string }> {
  const plainKey = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId,
      keyPrefix: getKeyPrefix(plainKey),
      keyHash: hashApiKey(plainKey),
      name: input.name,
      role: input.role as TenantRole,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    },
  });

  return { apiKey, plainKey };
}

/**
 * List API keys for a tenant (without exposing keys)
 */
export async function listApiKeys(tenantId: string): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: {
      tenantId,
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(tenantId: string, keyId: string): Promise<ApiKey> {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, tenantId },
  });

  if (!apiKey) {
    throw new NotFoundError('API key');
  }

  return prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotate an API key (create new, schedule old for expiry)
 */
export async function rotateApiKey(
  tenantId: string,
  keyId: string
): Promise<{ newKey: ApiKey; plainKey: string; oldKeyValidUntil: Date }> {
  const oldKey = await prisma.apiKey.findFirst({
    where: { id: keyId, tenantId },
  });

  if (!oldKey) {
    throw new NotFoundError('API key');
  }

  const plainKey = generateApiKey();
  const gracePeriodMs = 24 * 60 * 60 * 1000; // 24 hours
  const oldKeyValidUntil = new Date(Date.now() + gracePeriodMs);

  const [newKey] = await prisma.$transaction([
    prisma.apiKey.create({
      data: {
        tenantId,
        keyPrefix: getKeyPrefix(plainKey),
        keyHash: hashApiKey(plainKey),
        name: oldKey.name ? `${oldKey.name} (rotated)` : 'Rotated key',
        role: oldKey.role,
      },
    }),
    prisma.apiKey.update({
      where: { id: keyId },
      data: { expiresAt: oldKeyValidUntil },
    }),
  ]);

  return { newKey, plainKey, oldKeyValidUntil };
}
