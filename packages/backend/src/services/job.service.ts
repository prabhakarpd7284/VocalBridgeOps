/**
 * Job service
 * Handles async job processing with database-backed queue
 */

import { Job, JobStatus } from '@prisma/client';
import { prisma } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { sendMessage } from './message.service.js';
import { hostname } from 'os';

const workerId = `worker_${hostname()}_${process.pid}`;

interface JobInput {
  sessionId: string;
  content: string;
}

/**
 * Job Worker
 * Polls for pending jobs and processes them
 */
export class JobWorker {
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Job worker already running');
      return;
    }

    logger.info({ workerId }, 'Starting job worker');
    this.running = true;

    // Recover stale jobs on startup
    await this.recoverStaleJobs();

    // Start polling
    this.poll();
  }

  async stop(): Promise<void> {
    logger.info({ workerId }, 'Stopping job worker');
    this.running = false;

    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private poll(): void {
    if (!this.running) return;

    this.processNextJob()
      .catch((error) => {
        logger.error({ error }, 'Error processing job');
      })
      .finally(() => {
        if (this.running) {
          this.pollInterval = setTimeout(
            () => this.poll(),
            config.jobs.pollIntervalMs
          );
        }
      });
  }

  private async processNextJob(): Promise<void> {
    const now = new Date();
    const lockDurationMs = config.jobs.lockDurationMs;
    const lockExpiresAt = new Date(now.getTime() + lockDurationMs);

    // Atomic claim: find unlocked job and lock it
    const job = await prisma.$transaction(async (tx) => {
      const available = await tx.job.findFirst({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          OR: [
            { lockedAt: null },
            { lockExpiresAt: { lt: now } }, // Expired lock
          ],
          attempts: { lt: tx.job.fields?.maxAttempts || config.jobs.maxAttempts },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!available) return null;

      return tx.job.update({
        where: { id: available.id },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          lockedBy: workerId,
          lockExpiresAt,
          attempts: { increment: 1 },
          startedAt: available.startedAt ?? now,
        },
      });
    });

    if (!job) return;

    const log = logger.child({
      jobId: job.id,
      jobType: job.type,
      tenantId: job.tenantId,
    });

    log.info('Processing job');

    try {
      const result = await this.executeJob(job);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          output: result as any,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
        },
      });

      log.info('Job completed successfully');

      // Send callback if configured
      if (job.callbackUrl) {
        await this.sendCallback(job, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const shouldRetry = job.attempts < (job.maxAttempts || config.jobs.maxAttempts);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? 'PENDING' : 'FAILED',
          lastError: errorMessage,
          errorMessage: shouldRetry ? null : errorMessage,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          completedAt: shouldRetry ? null : new Date(),
        },
      });

      if (shouldRetry) {
        log.warn({ error: errorMessage, attempts: job.attempts }, 'Job failed, will retry');
      } else {
        log.error({ error: errorMessage }, 'Job failed permanently');

        // Send failure callback if configured
        if (job.callbackUrl) {
          await this.sendCallback(job, null, errorMessage);
        }
      }
    }
  }

  private async executeJob(job: Job): Promise<unknown> {
    switch (job.type) {
      case 'SEND_MESSAGE':
        return this.executeSendMessage(job);
      case 'VOICE_PROCESS':
        // TODO: Implement voice processing
        throw new Error('Voice processing not implemented');
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private async executeSendMessage(job: Job): Promise<unknown> {
    const input = job.input as unknown as JobInput;

    // Update progress
    await prisma.job.update({
      where: { id: job.id },
      data: { progress: 50 },
    });

    const result = await sendMessage(job.tenantId, input.sessionId, {
      content: input.content,
      idempotencyKey: job.idempotencyKey ?? undefined,
    });

    return {
      messageId: result.id,
      content: result.content,
      metadata: result.metadata,
    };
  }

  private async sendCallback(
    job: Job,
    result: unknown,
    error?: string
  ): Promise<void> {
    if (!job.callbackUrl) return;

    const log = logger.child({ jobId: job.id, callbackUrl: job.callbackUrl });

    try {
      const payload = {
        jobId: job.id,
        type: job.type,
        status: error ? 'FAILED' : 'COMPLETED',
        result: error ? undefined : result,
        error: error,
        completedAt: new Date().toISOString(),
      };

      const response = await fetch(job.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Job-ID': job.id,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        log.warn(
          { status: response.status },
          'Callback returned non-2xx status'
        );
      }

      await prisma.job.update({
        where: { id: job.id },
        data: { callbackSent: true },
      });

      log.info('Callback sent successfully');
    } catch (error) {
      log.error({ error }, 'Failed to send callback');
    }
  }

  private async recoverStaleJobs(): Promise<void> {
    const result = await prisma.job.updateMany({
      where: {
        status: 'PROCESSING',
        lockExpiresAt: { lt: new Date() },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });

    if (result.count > 0) {
      logger.info({ count: result.count }, 'Recovered stale jobs');
    }
  }
}

// Singleton instance
let workerInstance: JobWorker | null = null;

export function getJobWorker(): JobWorker {
  if (!workerInstance) {
    workerInstance = new JobWorker();
  }
  return workerInstance;
}

export async function startJobWorker(): Promise<void> {
  const worker = getJobWorker();
  await worker.start();
}

export async function stopJobWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
  }
}
