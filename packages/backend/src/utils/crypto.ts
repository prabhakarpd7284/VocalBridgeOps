/**
 * Cryptographic utilities for API key generation and hashing
 */

import { randomBytes, createHash } from 'crypto';
import { config } from '../config/index.js';

/**
 * Generate a new API key with prefix
 * Format: vb_live_<32 random chars>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString('base64url');
  return `${config.apiKey.prefix}${randomPart}`;
}

/**
 * Hash an API key using SHA-256
 * Never store plaintext API keys
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extract the prefix from an API key for identification
 */
export function getKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `corr_${randomBytes(12).toString('base64url')}`;
}

/**
 * Generate a unique ID with prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/**
 * Convert a UUID to an integer for PostgreSQL advisory locks
 * Uses first 8 bytes of hash
 */
export function uuidToLockKey(uuid: string): bigint {
  const hash = createHash('sha256').update(uuid).digest();
  // Read first 8 bytes as a BigInt
  return hash.readBigInt64BE(0);
}
