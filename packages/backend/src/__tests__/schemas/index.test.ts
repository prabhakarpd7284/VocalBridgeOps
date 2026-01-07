/**
 * Schema validation tests
 */

import { describe, it, expect } from 'vitest';
import {
  CreateTenantSchema,
  CreateAgentSchema,
  CreateSessionSchema,
  SendMessageSchema,
  UsageQuerySchema,
} from '../../schemas/index.js';

describe('Validation Schemas', () => {
  describe('CreateTenantSchema', () => {
    it('should accept valid input', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Acme Corp',
        email: 'admin@acme.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const result = CreateTenantSchema.safeParse({
        email: 'admin@acme.com',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Acme Corp',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const result = CreateTenantSchema.safeParse({
        name: '',
        email: 'admin@acme.com',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateAgentSchema', () => {
    it('should accept valid input', () => {
      const result = CreateAgentSchema.safeParse({
        name: 'Support Bot',
        primaryProvider: 'VENDOR_A',
        systemPrompt: 'You are a helpful assistant.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full input with all fields', () => {
      const result = CreateAgentSchema.safeParse({
        name: 'Support Bot',
        description: 'Customer support assistant',
        primaryProvider: 'VENDOR_A',
        fallbackProvider: 'VENDOR_B',
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.8,
        maxTokens: 2048,
        enabledTools: ['InvoiceLookup'],
        voiceEnabled: true,
        voiceConfig: {
          sttProvider: 'mock',
          ttsProvider: 'mock',
          voice: 'alloy',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid provider', () => {
      const result = CreateAgentSchema.safeParse({
        name: 'Support Bot',
        primaryProvider: 'INVALID_VENDOR',
        systemPrompt: 'You are a helpful assistant.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject temperature out of range', () => {
      const result = CreateAgentSchema.safeParse({
        name: 'Support Bot',
        primaryProvider: 'VENDOR_A',
        systemPrompt: 'You are a helpful assistant.',
        temperature: 3.0, // Max is 2
      });
      expect(result.success).toBe(false);
    });

    it('should apply default values', () => {
      const result = CreateAgentSchema.safeParse({
        name: 'Support Bot',
        primaryProvider: 'VENDOR_A',
        systemPrompt: 'You are a helpful assistant.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.temperature).toBe(0.7);
        expect(result.data.maxTokens).toBe(1024);
        expect(result.data.enabledTools).toEqual([]);
        expect(result.data.voiceEnabled).toBe(false);
      }
    });
  });

  describe('CreateSessionSchema', () => {
    it('should accept valid input', () => {
      const result = CreateSessionSchema.safeParse({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        customerId: 'customer_123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = CreateSessionSchema.safeParse({
        agentId: 'not-a-uuid',
        customerId: 'customer_123',
      });
      expect(result.success).toBe(false);
    });

    it('should apply default channel', () => {
      const result = CreateSessionSchema.safeParse({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        customerId: 'customer_123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channel).toBe('CHAT');
      }
    });
  });

  describe('SendMessageSchema', () => {
    it('should accept valid message', () => {
      const result = SendMessageSchema.safeParse({
        content: 'Hello, I need help with my order.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = SendMessageSchema.safeParse({
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject content over max length', () => {
      const result = SendMessageSchema.safeParse({
        content: 'a'.repeat(10001), // Max is 10000
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UsageQuerySchema', () => {
    it('should accept valid query', () => {
      const result = UsageQuerySchema.safeParse({
        groupBy: 'provider',
      });
      expect(result.success).toBe(true);
    });

    it('should accept date range', () => {
      const result = UsageQuerySchema.safeParse({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid groupBy', () => {
      const result = UsageQuerySchema.safeParse({
        groupBy: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});
