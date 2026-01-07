/**
 * Crypto utility tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  generateCorrelationId,
  uuidToLockKey,
} from '../../utils/crypto.js';

describe('Crypto Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate keys with correct prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^vb_live_[A-Za-z0-9_-]+$/);
    });

    it('should generate unique keys', () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
      expect(keys.size).toBe(100);
    });

    it('should generate keys with sufficient length', () => {
      const key = generateApiKey();
      // vb_live_ (8 chars) + 32 chars of base64url
      expect(key.length).toBeGreaterThan(30);
    });
  });

  describe('hashApiKey', () => {
    it('should produce consistent hashes for the same input', () => {
      const key = 'vb_live_test123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashApiKey('vb_live_test123');
      const hash2 = hashApiKey('vb_live_test456');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex strings', () => {
      const hash = hashApiKey('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate IDs with correct prefix', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^corr_[A-Za-z0-9_-]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('uuidToLockKey', () => {
    it('should convert UUID to bigint', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const lockKey = uuidToLockKey(uuid);
      expect(typeof lockKey).toBe('bigint');
    });

    it('should produce consistent lock keys for the same UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const key1 = uuidToLockKey(uuid);
      const key2 = uuidToLockKey(uuid);
      expect(key1).toBe(key2);
    });

    it('should produce different lock keys for different UUIDs', () => {
      const key1 = uuidToLockKey('550e8400-e29b-41d4-a716-446655440000');
      const key2 = uuidToLockKey('550e8400-e29b-41d4-a716-446655440001');
      expect(key1).not.toBe(key2);
    });
  });
});
