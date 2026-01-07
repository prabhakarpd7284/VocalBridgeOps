/**
 * Error classes tests
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  PaymentRequiredError,
  ProviderError,
  ProviderSchemaError,
  TimeoutError,
  InternalError,
  isAppError,
} from '../../utils/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should have correct properties', () => {
      const error = new ValidationError('Test error');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
    });

    it('should generate correct response', () => {
      const error = new ValidationError('Test', [
        { field: 'email', message: 'Invalid email' },
      ]);
      const response = error.toResponse('corr_123');

      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Test');
      expect(response.error.correlationId).toBe('corr_123');
      expect(response.error.details).toHaveLength(1);
    });
  });

  describe('Status Code Mapping', () => {
    it('should have correct status codes', () => {
      expect(new ValidationError('test').statusCode).toBe(400);
      expect(new UnauthorizedError().statusCode).toBe(401);
      expect(new PaymentRequiredError().statusCode).toBe(402);
      expect(new ForbiddenError().statusCode).toBe(403);
      expect(new NotFoundError().statusCode).toBe(404);
      expect(new ConflictError('test').statusCode).toBe(409);
      expect(new RateLimitError().statusCode).toBe(429);
      expect(new InternalError().statusCode).toBe(500);
      expect(new ProviderError('test', 'VENDOR_A').statusCode).toBe(502);
      expect(new ProviderSchemaError('test').statusCode).toBe(502);
      expect(new TimeoutError().statusCode).toBe(504);
    });
  });

  describe('Error Codes', () => {
    it('should have correct error codes', () => {
      expect(new ValidationError('test').code).toBe('VALIDATION_ERROR');
      expect(new UnauthorizedError().code).toBe('UNAUTHORIZED');
      expect(new ForbiddenError().code).toBe('FORBIDDEN');
      expect(new NotFoundError().code).toBe('NOT_FOUND');
      expect(new ConflictError('test').code).toBe('CONFLICT');
      expect(new RateLimitError().code).toBe('RATE_LIMITED');
      expect(new PaymentRequiredError().code).toBe('PAYMENT_REQUIRED');
      expect(new ProviderError('test', 'VENDOR_A').code).toBe('PROVIDER_ERROR');
      expect(new ProviderSchemaError('test').code).toBe('PROVIDER_SCHEMA_ERROR');
      expect(new TimeoutError().code).toBe('TIMEOUT_ERROR');
      expect(new InternalError().code).toBe('INTERNAL_ERROR');
    });
  });

  describe('RateLimitError', () => {
    it('should store retryAfterMs', () => {
      const error = new RateLimitError('Rate limited', 5000);
      expect(error.retryAfterMs).toBe(5000);
    });
  });

  describe('ProviderError', () => {
    it('should store provider name', () => {
      const error = new ProviderError('Failed', 'VENDOR_A');
      expect(error.provider).toBe('VENDOR_A');
    });
  });

  describe('NotFoundError', () => {
    it('should format message correctly', () => {
      const error = new NotFoundError('Session');
      expect(error.message).toBe('Session not found');
    });
  });

  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      expect(isAppError(new ValidationError('test'))).toBe(true);
      expect(isAppError(new NotFoundError())).toBe(true);
      expect(isAppError(new InternalError())).toBe(true);
    });

    it('should return false for non-AppError instances', () => {
      expect(isAppError(new Error('test'))).toBe(false);
      expect(isAppError('error')).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
    });
  });
});
