/**
 * VocalBridge Ops - Main Entry Point
 */

import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { prisma, testConnection, disconnect } from './utils/db.js';
import { startJobWorker, stopJobWorker } from './services/job.service.js';

async function main(): Promise<void> {
  logger.info({ env: config.env }, 'Starting VocalBridge Ops');

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.fatal('Failed to connect to database');
    process.exit(1);
  }

  // Build and start the app
  const app = await buildApp();

  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(
      { port: config.server.port, host: config.server.host },
      'Server started'
    );

    // Start job worker
    await startJobWorker();
    logger.info('Job worker started');

    // Handle shutdown gracefully
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      // Stop accepting new requests
      await app.close();
      logger.info('Server closed');

      // Stop job worker
      await stopJobWorker();
      logger.info('Job worker stopped');

      // Close database connection
      await disconnect();
      logger.info('Database disconnected');

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    await disconnect();
    process.exit(1);
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Unhandled error during startup');
  process.exit(1);
});
