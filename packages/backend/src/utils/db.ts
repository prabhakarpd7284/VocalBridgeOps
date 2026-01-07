/**
 * Database client singleton
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { config } from '../config/index.js';

/**
 * Build database URL with connection pool parameters
 */
function buildDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Parse URL to add query parameters
  const url = new URL(baseUrl);

  // Add connection pool parameters
  url.searchParams.set('connection_limit', config.database.poolSize.toString());
  url.searchParams.set('pool_timeout', config.database.poolTimeout.toString());
  url.searchParams.set('connect_timeout', config.database.connectionTimeout.toString());

  return url.toString();
}

// Create singleton instance with connection pool configuration
export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
  datasources: {
    db: {
      url: buildDatabaseUrl(),
    },
  },
});

// Log connection pool configuration on startup
logger.info(
  {
    poolSize: config.database.poolSize,
    poolTimeout: config.database.poolTimeout,
    connectionTimeout: config.database.connectionTimeout,
  },
  'Database connection pool configured'
);

// Log slow queries in development
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    logger.warn({ duration: e.duration, query: e.query }, 'Slow query detected');
  }
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, 'Database connection failed');
    return false;
  }
}

/**
 * Disconnect from database
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
