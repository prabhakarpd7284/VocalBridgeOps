/**
 * Application error classes
 * Structured errors that don't leak internal details
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYMENT_REQUIRED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_SCHEMA_ERROR'
  | 'TIMEOUT_ERROR'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    correlationId?: string;
  };
}

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: ErrorDetail[]
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(correlationId?: string): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        correlationId,
      },
    };
  }
}

/**
 * 400 Bad Request - Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict - Idempotency conflict or session locked
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * 429 Too Many Requests - Rate limited
 */
export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests',
    public readonly retryAfterMs?: number
  ) {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 402 Payment Required - Cost limit reached
 */
export class PaymentRequiredError extends AppError {
  constructor(message = 'Daily cost limit reached') {
    super('PAYMENT_REQUIRED', message, 402);
    this.name = 'PaymentRequiredError';
  }
}

/**
 * 502 Bad Gateway - Provider error
 */
export class ProviderError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: unknown
  ) {
    super('PROVIDER_ERROR', message, 502);
    this.name = 'ProviderError';
  }
}

/**
 * Provider returned unexpected schema
 */
export class ProviderSchemaError extends AppError {
  constructor(message: string, public readonly rawResponse?: unknown) {
    super('PROVIDER_SCHEMA_ERROR', message, 502);
    this.name = 'ProviderSchemaError';
  }
}

/**
 * Request timeout
 */
export class TimeoutError extends AppError {
  constructor(message = 'Request timed out') {
    super('TIMEOUT_ERROR', message, 504);
    this.name = 'TimeoutError';
  }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
  }
}

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
