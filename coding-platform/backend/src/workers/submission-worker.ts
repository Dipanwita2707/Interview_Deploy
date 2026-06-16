import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import { evaluateSubmission } from '../services/submission-service';
import { getRedis } from '../database/redis';

let submissionWorker: Worker | null = null;

export function startWorkers() {
  if (!getRedis()) {
    console.warn('[WORKER] Redis not available — submission worker disabled');
    return;
  }

  const connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  connection.on('error', () => { /* suppress */ });

  // ─── Submission Evaluation Worker ──────────────────────────────
  submissionWorker = new Worker(
    'submission',
    async (job) => {
      const { submissionId, sourceCode, language, versionId } = job.data;
      console.log(`[WORKER] Processing submission ${submissionId}`);

      try {
        await evaluateSubmission(submissionId, sourceCode, language, versionId);
        console.log(`[WORKER] Submission ${submissionId} evaluated`);
      } catch (err: any) {
        console.error(`[WORKER] Submission ${submissionId} failed:`, err.message);
        throw err; // BullMQ will retry
      }
    },
    {
      connection,
      concurrency: config.bullmq.concurrency,
      limiter: {
        max: (config.bullmq as any).maxJobsPerSecond ?? 30,
        duration: 1000,
      },
    }
  );

  submissionWorker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed`);
  });

  submissionWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job?.id} failed:`, err.message);
  });

  console.log('[WORKER] Submission worker started');
}

export async function stopWorkers() {
  if (submissionWorker) {
    await submissionWorker.close();
    console.log('[WORKER] Workers stopped');
  }
}
