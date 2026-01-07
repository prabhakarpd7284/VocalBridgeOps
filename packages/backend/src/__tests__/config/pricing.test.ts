/**
 * Pricing configuration tests
 */

import { describe, it, expect } from 'vitest';
import { calculateCost, getPricingSnapshot, PRICING } from '../../config/pricing.js';

describe('Pricing', () => {
  describe('PRICING constants', () => {
    it('should have pricing for all providers', () => {
      expect(PRICING.VENDOR_A).toBeDefined();
      expect(PRICING.VENDOR_B).toBeDefined();
    });

    it('should have input and output prices', () => {
      expect(PRICING.VENDOR_A.inputPricePerKTokens).toBeDefined();
      expect(PRICING.VENDOR_A.outputPricePerKTokens).toBeDefined();
      expect(PRICING.VENDOR_B.inputPricePerKTokens).toBeDefined();
      expect(PRICING.VENDOR_B.outputPricePerKTokens).toBeDefined();
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for VENDOR_A', () => {
      // 1000 input + 1000 output tokens at $0.002/1K each = $0.004 = 0.4 cents, ceil to 1
      const cost = calculateCost('VENDOR_A', 1000, 1000);
      expect(cost).toBe(1); // Ceiling of 0.4 is 1 cent
    });

    it('should calculate cost for VENDOR_B', () => {
      // 1000 input + 1000 output tokens at $0.003/1K each = $0.006 = 0.6 cents, ceil to 1
      const cost = calculateCost('VENDOR_B', 1000, 1000);
      expect(cost).toBe(1); // Ceiling of 0.6 is 1 cent
    });

    it('should return higher cost for larger token counts', () => {
      const smallCost = calculateCost('VENDOR_A', 100, 100);
      const largeCost = calculateCost('VENDOR_A', 10000, 10000);
      expect(largeCost).toBeGreaterThan(smallCost);
    });

    it('should handle zero tokens', () => {
      const cost = calculateCost('VENDOR_A', 0, 0);
      expect(cost).toBe(0);
    });

    it('should return integer cents (no decimals)', () => {
      const cost = calculateCost('VENDOR_A', 123, 456);
      expect(Number.isInteger(cost)).toBe(true);
    });

    it('should ceil fractional cents', () => {
      // Very small token count that would result in fractional cents
      const cost = calculateCost('VENDOR_A', 1, 1);
      expect(cost).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getPricingSnapshot', () => {
    it('should return a copy of pricing', () => {
      const snapshot = getPricingSnapshot('VENDOR_A');
      expect(snapshot).toEqual(PRICING.VENDOR_A);

      // Verify it's a copy, not the same object
      expect(snapshot).not.toBe(PRICING.VENDOR_A);
    });

    it('should return snapshot for all providers', () => {
      const vendorA = getPricingSnapshot('VENDOR_A');
      const vendorB = getPricingSnapshot('VENDOR_B');

      expect(vendorA.inputPricePerKTokens).toBe(0.002);
      expect(vendorB.inputPricePerKTokens).toBe(0.003);
    });
  });
});
