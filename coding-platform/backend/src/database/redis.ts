import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

export async function initRedis(): Promise<Redis | null> {
  return new Promise((resolve) => {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // never retry — fail fast
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    // Suppress unhandled error events
    client.on('error', () => {
      /* silently ignore — Redis is optional */
    });

    client.connect()
      .then(() => {
        redis = client;
        console.log('[REDIS] Connected');
        resolve(client);
      })
      .catch((err: Error) => {
        console.warn('[REDIS] Not available, running without cache/queues:', err.message);
        client.disconnect();
        redis = null;
        resolve(null);
      });
  });
}

export function getRedis(): Redis | null {
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    console.log('[REDIS] Closed');
  }
}

// Cache helpers
export async function cacheGet(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttl: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.setex(key, ttl, value);
  } catch {
    // silently fail — cache is optional
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // silently fail
  }
}
