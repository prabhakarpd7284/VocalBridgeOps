/**
 * Pricing configuration for AI providers
 * Costs are in dollars per 1K tokens
 */

import type { ProviderType } from '@prisma/client';

export interface ProviderPricing {
  inputPricePerKTokens: number;
  outputPricePerKTokens: number;
}

export const PRICING: Record<ProviderType, ProviderPricing> = {
  VENDOR_A: {
    inputPricePerKTokens: 0.002,
    outputPricePerKTokens: 0.004,
  },
  VENDOR_B: {
    inputPricePerKTokens: 0.003,
    outputPricePerKTokens: 0.006,
  },
};

/**
 * Calculate cost in cents for a provider call
 * Returns integer cents to avoid floating point precision issues
 */
export function calculateCost(
  provider: ProviderType,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing = PRICING[provider];
  const inputCost = (tokensIn / 1000) * pricing.inputPricePerKTokens;
  const outputCost = (tokensOut / 1000) * pricing.outputPricePerKTokens;
  // Convert to cents and round up
  return Math.ceil((inputCost + outputCost) * 100);
}

/**
 * Get current pricing snapshot for audit trail
 */
export function getPricingSnapshot(provider: ProviderType): ProviderPricing {
  return { ...PRICING[provider] };
}
