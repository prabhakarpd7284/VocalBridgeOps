/**
 * Global error handler plugin
 * Ensures consistent error responses without leaking internal details
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError, ValidationError, InternalError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const correlationId = request.correlationId;

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const validationError = new ValidationError('Invalid request body',
        error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      );

      logger.warn(
        {
          error: 'VALIDATION_ERROR',
          validationErrors: validationError.details,
          correlationId,
          method: request.method,
          url: request.url,
        },
        'Request validation failed'
      );

      return reply
        .status(validationError.statusCode)
        .send(validationError.toResponse(correlationId));
    }

    // Handle application errors
    if (error instanceof AppError) {
      // Log non-client errors
      if (error.statusCode >= 500) {
        logger.error(
          {
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details,
            statusCode: error.statusCode,
            correlationId,
            tenantId: request.tenant?.id,
            method: request.method,
            url: request.url,
            requestBody: request.body,
            requestQuery: request.query,
            requestParams: request.params,
          },
          `${error.code}: ${error.message}`
        );
        // Log stack trace separately for better readability
        logger.error({ stack: error.stack, correlationId }, 'Stack trace');
      } else {
        logger.warn(
          {
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details,
            statusCode: error.statusCode,
            correlationId,
            tenantId: request.tenant?.id,
            method: request.method,
            url: request.url,
          },
          `${error.code}: ${error.message}`
        );
      }

      return reply.status(error.statusCode).send(error.toResponse(correlationId));
    }

    // Handle Fastify validation errors
    if (error.validation) {
      const validationError = new ValidationError('Invalid request',
        error.validation.map((v: { instancePath: string; message?: string }) => ({
          field: v.instancePath.replace(/^\//, ''),
          message: v.message || 'Invalid value',
        }))
      );
      return reply
        .status(validationError.statusCode)
        .send(validationError.toResponse(correlationId));
    }

    // Handle unknown errors - don't leak details
    logger.error(
      {
        errorName: error.name,
        errorCode: (error as any).code,
        errorMessage: error.message,
        statusCode: (error as any).statusCode || 500,
        correlationId,
        tenantId: request.tenant?.id,
        method: request.method,
        url: request.url,
        requestBody: request.body,
        requestQuery: request.query,
        requestParams: request.params,
        headers: request.headers,
      },
      `Unhandled error: ${error.name} - ${error.message}`
    );
    // Log stack trace separately for better readability
    logger.error(
      {
        stack: error.stack,
        correlationId,
        errorDetails: {
          name: error.name,
          message: error.message,
          ...(error as any),
        }
      },
      'Error stack trace'
    );

    const internalError = new InternalError();
    return reply
      .status(internalError.statusCode)
      .send(internalError.toResponse(correlationId));
  });

  // Handle 404
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        correlationId: request.correlationId,
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
