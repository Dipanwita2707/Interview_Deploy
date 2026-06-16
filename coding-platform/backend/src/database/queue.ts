import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedis } from './redis';
import { config } from '../config';
import Redis from 'ioredis';

// ─── Queue Definitions ─────────────────────────────────────────
let submissionQueue: Queue | null = null;
let resultQueue: Queue | null = null;
let examTimeoutQueue: Queue | null = null;
let proctorEventQueue: Queue | null = null;

// BullMQ needs its own Redis connection
function createBullConnection(): Redis {
  const conn = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  conn.on('error', () => { /* suppress — optional */ });
  return conn;
}

export function initQueues() {
  // Skip if Redis is unavailable
  if (!getRedis()) {
    console.warn('[QUEUE] Redis not available — queues disabled (submissions will be evaluated synchronously)');
    return;
  }

  const connection = createBullConnection();

  submissionQueue = new Queue('submission', { connection });
  resultQueue = new Queue('result_processing', { connection });
  examTimeoutQueue = new Queue('exam_timeout', { connection });
  proctorEventQueue = new Queue('proctor_event', { connection });

  console.log('[QUEUE] All queues initialized');
}

export function getSubmissionQueue(): Queue | null {
  return submissionQueue;
}

export function getResultQueue(): Queue | null {
  return resultQueue;
}

export function getExamTimeoutQueue(): Queue | null {
  return examTimeoutQueue;
}

export function getProctorEventQueue(): Queue | null {
  return proctorEventQueue;
}

// ─── Close all queues gracefully ─────────────────────────────
export async function closeQueues(): Promise<void> {
  const queues = [submissionQueue, resultQueue, examTimeoutQueue, proctorEventQueue];
  await Promise.all(queues.filter(Boolean).map((q) => q!.close()));
  console.log('[QUEUE] All queues closed');
}
