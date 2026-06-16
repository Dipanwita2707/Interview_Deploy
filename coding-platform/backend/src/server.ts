import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config';
import { testConnection, closePool } from './database/connection';
import { initRedis, closeRedis } from './database/redis';
import { initQueues, closeQueues } from './database/queue';
import { notFoundHandler, globalErrorHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limiter';
import { startWorkers, stopWorkers } from './workers/submission-worker';

// Route imports
import authRoutes from './routes/auth';
import questionRoutes from './routes/questions';
import practiceRoutes from './routes/practice';
import examRoutes from './routes/exam';
import proctorRoutes from './routes/proctor';
import ruleRoutes from './routes/rules';
import studentRoutes from './routes/students';
import adminUserRoutes from './routes/admin-users';
import analyticsRoutes from './routes/analytics';
import catalogRoutes from './routes/catalog';
import adminExamSessionsRoutes from './routes/admin-exam-sessions';

const app = express();

// ─── Global Middleware ─────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
app.use(cors({
  origin: config.isProduction
    ? process.env.FRONTEND_URL
    : ['http://localhost:3001', 'http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(apiLimiter);

// ─── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'coding-platform-api', timestamp: new Date().toISOString() });
});

// ─── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/rule-templates', ruleRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin/exam-sessions', adminExamSessionsRoutes);

// ─── Error Handling ────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ─── Startup ───────────────────────────────────────────────────
async function start() {
  console.log(`\n🚀 Coding Platform API starting...`);
  console.log(`   Environment: ${config.nodeEnv}`);

  // 1. Test database connection
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌ Cannot connect to database. Exiting.');
    process.exit(1);
  }

  // 2. Initialize Redis
  await initRedis();

  // 3. Initialize BullMQ queues
  initQueues();

  // 4. Start workers
  startWorkers();

  // 5. Start HTTP server — kill any occupant on EADDRINUSE then retry once
  function startListening(attempt = 1) {
    const srv = app.listen(config.port, () => {
      console.log(`\n✅ Coding Platform API ready on port ${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/health`);
      console.log(`   API:    http://localhost:${config.port}/api\n`);
      server = srv; // capture the live server for graceful shutdown
    });
    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt <= 3) {
        console.error(`[ERROR] Port ${config.port} in use — killing occupant and retrying in 1s… (attempt ${attempt})`);
        const { execSync } = require('child_process');
        try { execSync(`lsof -ti:${config.port} | xargs kill -9 2>/dev/null || true`); } catch {}
        setTimeout(() => startListening(attempt + 1), 1200);
      } else {
        console.error(`[FATAL] Could not bind to port ${config.port}:`, err.message);
        process.exit(1);
      }
    });
  }

  let server: ReturnType<typeof app.listen>;
  startListening();

  // ─── Graceful Shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      try {
        await stopWorkers();
        await closeQueues();
        await closeRedis();
        await closePool();
        console.log('✅ Shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after 10s timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
