/**
 * Provider Orchestrator
 * Handles retry logic, fallback, and provider call tracking
 */

import { ProviderType } from '@prisma/client';
import { config } from '../config/index.js';
import { generateCorrelationId } from '../utils/crypto.js';
import {
  ProviderError,
  ProviderSchemaError,
  RateLimitError,
  TimeoutError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  ProviderCallResult,
} from './types.js';
import { VendorAAdapter } from './vendor-a.adapter.js';
import { VendorBAdapter } from './vendor-b.adapter.js';

interface OrchestratorConfig {
  primaryProvider: ProviderType;
  fallbackProvider?: ProviderType | null;
  correlationId?: string;
}

interface RetryState {
  attemptNumber: number;
  errors: Array<{ provider: ProviderType; error: Error; attemptNumber: number }>;
}

// Singleton adapters
const adapters: Record<ProviderType, ProviderAdapter> = {
  VENDOR_A: new VendorAAdapter(),
  VENDOR_B: new VendorBAdapter(),
};

export function getAdapter(provider: ProviderType): ProviderAdapter {
  return adapters[provider];
}

/**
 * Execute a provider call with retry and fallback logic
 */
export async function executeWithResilience(
  request: ProviderRequest,
  config: OrchestratorConfig
): Promise<ProviderCallResult> {
  const correlationId = config.correlationId || generateCorrelationId();
  const log = logger.child({ correlationId });

  const retryState: RetryState = {
    attemptNumber: 0,
    errors: [],
  };

  // Try primary provider with retries
  log.info(
    { provider: config.primaryProvider },
    'Starting provider call with primary provider'
  );

  const primaryResult = await executeWithRetry(
    request,
    config.primaryProvider,
    correlationId,
    retryState,
    false
  );

  if (primaryResult.success) {
    return primaryResult;
  }

  // If fallback is configured and different from primary, try fallback
  if (
    config.fallbackProvider &&
    config.fallbackProvider !== config.primaryProvider
  ) {
    log.info(
      {
        primaryProvider: config.primaryProvider,
        fallbackProvider: config.fallbackProvider,
        primaryErrors: retryState.errors.length,
      },
      'Primary provider exhausted, trying fallback'
    );

    // Reset attempt number for fallback
    const fallbackAttemptStart = retryState.attemptNumber;

    const fallbackResult = await executeWithRetry(
      request,
      config.fallbackProvider,
      correlationId,
      retryState,
      true
    );

    if (fallbackResult.success) {
      return fallbackResult;
    }
  }

  // All attempts failed
  const lastError = retryState.errors[retryState.errors.length - 1];
  log.error(
    {
      totalAttempts: retryState.attemptNumber,
      errors: retryState.errors.map((e) => ({
        provider: e.provider,
        message: e.error.message,
        attempt: e.attemptNumber,
      })),
    },
    'All provider attempts failed'
  );

  return {
    success: false,
    error: {
      code: lastError.error instanceof RateLimitError ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
      message: lastError.error.message,
      retryable: false,
    },
    provider: lastError.provider,
    isFallback: config.fallbackProvider ? lastError.provider === config.fallbackProvider : false,
    attemptNumber: retryState.attemptNumber,
    latencyMs: 0,
  };
}

/**
 * Execute provider call with exponential backoff retry
 */
async function executeWithRetry(
  request: ProviderRequest,
  provider: ProviderType,
  correlationId: string,
  retryState: RetryState,
  isFallback: boolean
): Promise<ProviderCallResult> {
  const adapter = adapters[provider];
  const maxAttempts = config.retry.maxAttempts;
  const log = logger.child({ correlationId, provider });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    retryState.attemptNumber++;
    const attemptStartTime = Date.now();

    log.info({ attempt, maxAttempts, isFallback }, 'Provider call attempt');

    try {
      const response = await adapter.sendMessage(request);

      log.info(
        {
          attempt,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          latencyMs: response.latencyMs,
          hasToolCalls: !!response.toolCalls?.length,
        },
        'Provider call succeeded'
      );

      return {
        success: true,
        response,
        provider,
        isFallback,
        attemptNumber: retryState.attemptNumber,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - attemptStartTime;
      const errorObj = error instanceof Error ? error : new Error(String(error));

      retryState.errors.push({
        provider,
        error: errorObj,
        attemptNumber: retryState.attemptNumber,
      });

      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt >= maxAttempts;

      log.warn(
        {
          attempt,
          error: errorObj.message,
          isRetryable,
          isLastAttempt,
          latencyMs,
        },
        'Provider call failed'
      );

      if (!isRetryable || isLastAttempt) {
        // Don't retry non-retryable errors or last attempt
        return {
          success: false,
          error: {
            code: getErrorCode(error),
            message: errorObj.message,
            retryable: isRetryable && !isLastAttempt,
            retryAfterMs: getRetryAfterMs(error),
          },
          provider,
          isFallback,
          attemptNumber: retryState.attemptNumber,
          latencyMs,
        };
      }

      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt);
      log.debug({ delayMs: delay }, 'Waiting before retry');
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  return {
    success: false,
    error: {
      code: 'PROVIDER_ERROR',
      message: 'Max retries exceeded',
      retryable: false,
    },
    provider,
    isFallback,
    attemptNumber: retryState.attemptNumber,
    latencyMs: 0,
  };
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  // Schema errors are not retryable - the provider returned bad data
  if (error instanceof ProviderSchemaError) {
    return false;
  }

  // Rate limit errors are retryable
  if (error instanceof RateLimitError) {
    return true;
  }

  // Timeout errors are retryable
  if (error instanceof TimeoutError) {
    return true;
  }

  // Provider errors with 5xx status codes are retryable
  if (error instanceof ProviderError) {
    const statusCode = (error as any).statusCode;
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return true;
    }
    // Explicit retryable flag
    if ((error as any).retryable === true) {
      return true;
    }
  }

  // Default to not retryable
  return false;
}

/**
 * Get error code for response
 */
function getErrorCode(error: unknown): string {
  if (error instanceof RateLimitError) {
    return 'RATE_LIMITED';
  }
  if (error instanceof TimeoutError) {
    return 'TIMEOUT';
  }
  if (error instanceof ProviderSchemaError) {
    return 'PROVIDER_SCHEMA_ERROR';
  }
  return 'PROVIDER_ERROR';
}

/**
 * Get retry-after from error if available
 */
function getRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof RateLimitError) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const { initialDelayMs, maxDelayMs, backoffMultiplier } = config.retry;

  // Exponential backoff
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (0-30% of delay)
  const jitter = Math.random() * 0.3 * cappedDelay;

  return Math.round(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check health of all providers
 */
export async function checkProvidersHealth(): Promise<
  Record<ProviderType, boolean>
> {
  const results: Record<ProviderType, boolean> = {
    VENDOR_A: false,
    VENDOR_B: false,
  };

  await Promise.all(
    Object.entries(adapters).map(async ([provider, adapter]) => {
      try {
        results[provider as ProviderType] = await adapter.healthCheck();
      } catch {
        results[provider as ProviderType] = false;
      }
    })
  );

  return results;
}
