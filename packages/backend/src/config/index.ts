/**
 * Application configuration
 * Loaded from environment variables with sensible defaults
 */

export const config = {
  // Server
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  // Environment
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  // Logging
  log: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  // API Keys
  apiKey: {
    prefix: process.env.API_KEY_PREFIX || 'vb_live_',
  },

  // Provider timeouts (ms)
  providers: {
    VENDOR_A: {
      connectTimeoutMs: 3000,
      requestTimeoutMs: 30000,
    },
    VENDOR_B: {
      connectTimeoutMs: 3000,
      requestTimeoutMs: 15000,
    },
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  },

  // Session
  session: {
    maxHistoryMessages: 50,
    lockTimeoutMs: 30000,
  },

  // Jobs
  jobs: {
    pollIntervalMs: 1000,
    lockDurationMs: 5 * 60 * 1000, // 5 minutes
    maxAttempts: 3,
  },

  // Database
  database: {
    poolSize: parseInt(process.env.DB_POOL_SIZE || '25', 10),
    poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '10', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5', 10),
    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
  },
} as const;

export type Config = typeof config;
