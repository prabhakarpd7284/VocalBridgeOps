/**
 * Structured logger with correlation ID support
 * Uses pino for high-performance JSON logging
 */

import pino from 'pino';
import { config } from '../config/index.js';

// Base logger configuration
export const logger = pino({
  level: config.log.level,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'vocalbridge-api',
    env: config.env,
  },
  // Redact sensitive fields
  redact: ['apiKey', 'password', 'token', 'authorization'],
});

/**
 * Create a child logger with correlation ID and tenant context
 */
export function createRequestLogger(context: {
  correlationId: string;
  tenantId?: string;
  sessionId?: string;
  agentId?: string;
}): pino.Logger {
  return logger.child(context);
}

export type Logger = pino.Logger;
