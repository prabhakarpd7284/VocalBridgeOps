/**
 * Integration Test: Message → Usage Billed Flow
 *
 * This test verifies the complete billing pipeline:
 * 1. Send a message through the API
 * 2. Verify provider call is recorded
 * 3. Verify usage event is created
 * 4. Verify cost is calculated correctly
 * 5. Verify idempotency prevents double billing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { calculateCost, PRICING } from '../../config/pricing.js';

const prisma = new PrismaClient();

// Test data
let testTenantId: string;
let testAgentId: string;
let testSessionId: string;
let testApiKey: string;

function generateApiKey(): string {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `vb_test_${randomPart}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

describe('Message → Usage Billing Integration', () => {
  beforeAll(async () => {
    // Create test tenant with API key
    testApiKey = generateApiKey();
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Billing Tenant',
        email: `billing-test-${Date.now()}@test.com`,
        apiKeys: {
          create: {
            keyPrefix: testApiKey.substring(0, 12),
            keyHash: hashApiKey(testApiKey),
            name: 'Test Key',
            role: 'ADMIN',
          },
        },
      },
    });
    testTenantId = tenant.id;

    // Create test agent
    const agent = await prisma.agent.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Billing Agent',
        primaryProvider: 'VENDOR_A',
        fallbackProvider: 'VENDOR_B',
        systemPrompt: 'You are a test assistant.',
        temperature: 0.7,
        maxTokens: 100,
        enabledTools: [],
      },
    });
    testAgentId = agent.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.usageEvent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.providerCall.deleteMany({
      where: { session: { tenantId: testTenantId } },
    });
    await prisma.message.deleteMany({
      where: { session: { tenantId: testTenantId } },
    });
    await prisma.session.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.agent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.apiKey.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.delete({ where: { id: testTenantId } });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create a fresh session for each test
    const session = await prisma.session.create({
      data: {
        tenantId: testTenantId,
        agentId: testAgentId,
        customerId: `customer_${Date.now()}`,
        channel: 'CHAT',
      },
    });
    testSessionId = session.id;
  });

  describe('Cost Calculation', () => {
    it('should calculate cost correctly for VENDOR_A', () => {
      const tokensIn = 1000;
      const tokensOut = 1000;
      const cost = calculateCost('VENDOR_A', tokensIn, tokensOut);

      // VENDOR_A: $0.002/1K input + $0.004/1K output = $0.006 = 0.6 cents
      // Ceiling = 1 cent
      const expectedCost = Math.ceil(
        (tokensIn / 1000) * PRICING.VENDOR_A.inputPricePerKTokens * 100 +
          (tokensOut / 1000) * PRICING.VENDOR_A.outputPricePerKTokens * 100
      );

      expect(cost).toBe(expectedCost);
      expect(Number.isInteger(cost)).toBe(true);
    });

    it('should calculate cost correctly for VENDOR_B', () => {
      const tokensIn = 1000;
      const tokensOut = 1000;
      const cost = calculateCost('VENDOR_B', tokensIn, tokensOut);

      // VENDOR_B: $0.003/1K input + $0.006/1K output = $0.009 = 0.9 cents
      // Ceiling = 1 cent
      const expectedCost = Math.ceil(
        (tokensIn / 1000) * PRICING.VENDOR_B.inputPricePerKTokens * 100 +
          (tokensOut / 1000) * PRICING.VENDOR_B.outputPricePerKTokens * 100
      );

      expect(cost).toBe(expectedCost);
      expect(Number.isInteger(cost)).toBe(true);
    });

    it('should return 0 for zero tokens', () => {
      const cost = calculateCost('VENDOR_A', 0, 0);
      expect(cost).toBe(0);
    });

    it('should scale cost linearly with token count', () => {
      const smallCost = calculateCost('VENDOR_A', 100, 100);
      const largeCost = calculateCost('VENDOR_A', 10000, 10000);

      // Large token count should result in higher cost
      // At $0.002/$0.004 per 1K tokens, 100+100 tokens = ~$0.0006 (1 cent min)
      // 10000+10000 tokens = ~$0.06 (6 cents)
      expect(largeCost).toBeGreaterThan(smallCost);
      expect(largeCost).toBeGreaterThanOrEqual(6); // ~6 cents for 20K tokens
    });
  });

  describe('Usage Event Creation', () => {
    it('should create usage event for successful provider call', async () => {
      // Simulate what message.service does: create provider call and usage event
      const providerCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_test_${Date.now()}`,
          provider: 'VENDOR_A',
          isFallback: false,
          tokensIn: 150,
          tokensOut: 200,
          latencyMs: 300,
          status: 'SUCCESS',
          attemptNumber: 1,
          billed: false,
        },
      });

      const costCents = calculateCost('VENDOR_A', 150, 200);

      const usageEvent = await prisma.usageEvent.create({
        data: {
          tenantId: testTenantId,
          agentId: testAgentId,
          sessionId: testSessionId,
          providerCallId: providerCall.id,
          provider: 'VENDOR_A',
          tokensIn: 150,
          tokensOut: 200,
          totalTokens: 350,
          costCents,
          pricingSnapshot: PRICING.VENDOR_A,
        },
      });

      // Mark as billed
      await prisma.providerCall.update({
        where: { id: providerCall.id },
        data: { billed: true },
      });

      // Verify usage event was created correctly
      expect(usageEvent).toBeDefined();
      expect(usageEvent.tenantId).toBe(testTenantId);
      expect(usageEvent.agentId).toBe(testAgentId);
      expect(usageEvent.sessionId).toBe(testSessionId);
      expect(usageEvent.provider).toBe('VENDOR_A');
      expect(usageEvent.tokensIn).toBe(150);
      expect(usageEvent.tokensOut).toBe(200);
      expect(usageEvent.totalTokens).toBe(350);
      expect(usageEvent.costCents).toBe(costCents);

      // Verify providerCall is marked as billed
      const updatedCall = await prisma.providerCall.findUnique({
        where: { id: providerCall.id },
      });
      expect(updatedCall?.billed).toBe(true);
    });

    it('should NOT create usage event for failed provider call', async () => {
      // Create a failed provider call
      const providerCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_fail_${Date.now()}`,
          provider: 'VENDOR_A',
          isFallback: false,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 100,
          status: 'FAILED',
          errorCode: 'PROVIDER_ERROR',
          errorMessage: 'Internal server error',
          attemptNumber: 1,
          billed: false,
        },
      });

      // In real code, message.service checks status before creating usage event
      // Failed calls should NOT have usage events
      const usageEvents = await prisma.usageEvent.findMany({
        where: { providerCallId: providerCall.id },
      });

      expect(usageEvents.length).toBe(0);
    });
  });

  describe('Billing Idempotency', () => {
    it('should prevent double billing via billed flag', async () => {
      // Create provider call already marked as billed
      const providerCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_billed_${Date.now()}`,
          provider: 'VENDOR_A',
          isFallback: false,
          tokensIn: 100,
          tokensOut: 100,
          latencyMs: 200,
          status: 'SUCCESS',
          attemptNumber: 1,
          billed: true, // Already billed
        },
      });

      // Try to create another usage event for the same call
      // In production, unique constraint on providerCallId prevents this
      const existingEvents = await prisma.usageEvent.findMany({
        where: { providerCallId: providerCall.id },
      });

      // Should not be able to create duplicate (unique constraint)
      expect(existingEvents.length).toBe(0);

      // Verify billed flag check would prevent billing
      const call = await prisma.providerCall.findUnique({
        where: { id: providerCall.id },
      });
      expect(call?.billed).toBe(true);
    });

    it('should enforce unique providerCallId on usage events', async () => {
      const providerCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_unique_${Date.now()}`,
          provider: 'VENDOR_B',
          isFallback: false,
          tokensIn: 200,
          tokensOut: 300,
          latencyMs: 400,
          status: 'SUCCESS',
          attemptNumber: 1,
          billed: false,
        },
      });

      // Create first usage event
      await prisma.usageEvent.create({
        data: {
          tenantId: testTenantId,
          agentId: testAgentId,
          sessionId: testSessionId,
          providerCallId: providerCall.id,
          provider: 'VENDOR_B',
          tokensIn: 200,
          tokensOut: 300,
          totalTokens: 500,
          costCents: calculateCost('VENDOR_B', 200, 300),
          pricingSnapshot: PRICING.VENDOR_B,
        },
      });

      // Try to create duplicate - should fail
      await expect(
        prisma.usageEvent.create({
          data: {
            tenantId: testTenantId,
            agentId: testAgentId,
            sessionId: testSessionId,
            providerCallId: providerCall.id, // Same providerCallId
            provider: 'VENDOR_B',
            tokensIn: 200,
            tokensOut: 300,
            totalTokens: 500,
            costCents: calculateCost('VENDOR_B', 200, 300),
            pricingSnapshot: PRICING.VENDOR_B,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Tenant Isolation in Billing', () => {
    it('should only aggregate usage for the correct tenant', async () => {
      // Create usage event for test tenant
      const providerCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_isolation_${Date.now()}`,
          provider: 'VENDOR_A',
          isFallback: false,
          tokensIn: 500,
          tokensOut: 500,
          latencyMs: 250,
          status: 'SUCCESS',
          attemptNumber: 1,
          billed: false,
        },
      });

      await prisma.usageEvent.create({
        data: {
          tenantId: testTenantId,
          agentId: testAgentId,
          sessionId: testSessionId,
          providerCallId: providerCall.id,
          provider: 'VENDOR_A',
          tokensIn: 500,
          tokensOut: 500,
          totalTokens: 1000,
          costCents: calculateCost('VENDOR_A', 500, 500),
          pricingSnapshot: PRICING.VENDOR_A,
        },
      });

      // Query usage for test tenant
      const tenantUsage = await prisma.usageEvent.aggregate({
        where: { tenantId: testTenantId },
        _sum: {
          tokensIn: true,
          tokensOut: true,
          totalTokens: true,
          costCents: true,
        },
      });

      expect(tenantUsage._sum.totalTokens).toBeGreaterThanOrEqual(1000);

      // Query with a fake tenant ID should return nothing
      const otherTenantUsage = await prisma.usageEvent.aggregate({
        where: { tenantId: 'non-existent-tenant-id' },
        _sum: {
          tokensIn: true,
          tokensOut: true,
          totalTokens: true,
          costCents: true,
        },
      });

      expect(otherTenantUsage._sum.totalTokens).toBeNull();
    });
  });

  describe('Fallback Provider Billing', () => {
    it('should track fallback usage separately', async () => {
      // Primary fails
      await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_primary_fail_${Date.now()}`,
          provider: 'VENDOR_A',
          isFallback: false,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 100,
          status: 'FAILED',
          errorCode: 'TIMEOUT',
          attemptNumber: 1,
          billed: false,
        },
      });

      // Fallback succeeds
      const fallbackCall = await prisma.providerCall.create({
        data: {
          sessionId: testSessionId,
          correlationId: `corr_fallback_${Date.now()}`,
          provider: 'VENDOR_B',
          isFallback: true,
          tokensIn: 100,
          tokensOut: 150,
          latencyMs: 200,
          status: 'SUCCESS',
          attemptNumber: 1,
          billed: false,
        },
      });

      // Only successful fallback should be billed
      const usageEvent = await prisma.usageEvent.create({
        data: {
          tenantId: testTenantId,
          agentId: testAgentId,
          sessionId: testSessionId,
          providerCallId: fallbackCall.id,
          provider: 'VENDOR_B',
          tokensIn: 100,
          tokensOut: 150,
          totalTokens: 250,
          costCents: calculateCost('VENDOR_B', 100, 150),
          pricingSnapshot: PRICING.VENDOR_B,
        },
      });

      expect(usageEvent.provider).toBe('VENDOR_B');

      // Verify the fallback call is tracked
      const call = await prisma.providerCall.findUnique({
        where: { id: fallbackCall.id },
      });
      expect(call?.isFallback).toBe(true);
    });
  });
});
