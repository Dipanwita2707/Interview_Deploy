import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/coding_platform',
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '5'),
      max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DATABASE_CONN_TIMEOUT || '10000'),
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6380',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'coding-platform-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  smart: {
    ssoSecret: process.env.SMART_SSO_SECRET || 'shared-sso-secret',
    apiUrl: process.env.SMART_API_URL || 'http://localhost:4000',
  },

  judge0: {
    url: process.env.JUDGE0_URL || 'http://localhost:2358',
    apiKey: process.env.JUDGE0_API_KEY || '', // only needed if you put Judge0 behind an API gateway
  },

  bullmq: {
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '10'),
    maxJobsPerSecond: parseInt(process.env.BULLMQ_MAX_JOBS_PER_SECOND || '30'),
  },

  cache: {
    permissionTTL: parseInt(process.env.PERMISSION_CACHE_TTL || '300'),
    studentContextTTL: parseInt(process.env.STUDENT_CONTEXT_CACHE_TTL || '600'),
  },

  // ── aural-oss exam bridge ─────────────────────────────────────
  // AURAL_OSS_BRIDGE_URL  : full URL of the exam-bridge endpoint
  //                         e.g. https://aural.example.com/api/exam-bridge
  // AURAL_OSS_SERVICE_KEY : raw service API key (SHA-256 hash stored in aural-oss)
  auralOss: {
    bridgeUrl:     process.env.AURAL_OSS_BRIDGE_URL     || '',
    serviceApiKey: process.env.AURAL_OSS_SERVICE_KEY    || '',
  },
};
