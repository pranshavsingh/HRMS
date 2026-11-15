process.env.IS_WORKER = "true";

import { dbInfo, healthCheck, closePool } from "./db/index.js";
import { initCron } from "./utils/cron.js";
import redisService from "./services/redis.service.js";
import queueWorkerManager from "./jobs/index.js";
import outboxDispatcherService from "./services/outbox-dispatcher.service.js";
import queueProducerService from "./services/queue-producer.service.js";
import logger from "./utils/logger.js";

async function startWorker() {
  logger.info("[Worker] Starting dedicated HRMS background worker process...");

  try {
    const info = dbInfo();
    await healthCheck();
    logger.info(`[Worker] Connected to database: mysql://${info.user}@${info.host}:${info.port}/${info.database}`);

    // Wait 1 second for Redis connection status
    await new Promise((r) => setTimeout(r, 1000));
    logger.info(`[Worker] Redis connection status: ${redisService.isReady() ? "Ready" : "Offline (Fallback mode)"}`);

    // 1. Initialize BullMQ Queue Workers
    queueWorkerManager.startWorkers();
    logger.info("[Worker] BullMQ queue workers started.");

    // 2. Start Transactional Outbox Polling Dispatcher
    outboxDispatcherService.start();
    logger.info("[Worker] Transactional Outbox dispatcher started.");

    // 3. Initialize scheduled cron jobs in this single worker instance
    initCron();
    logger.info("[Worker] Background scheduler is active and running.");
  } catch (error) {
    logger.error(`[Worker] Startup failed: ${error.message}`);
    process.exit(1);
  }

  // Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`[Worker] Received ${signal}. Shutting down worker gracefully...`);

    try {
      // 1. Stop outbox dispatcher first (prevent new job dispatches)
      await outboxDispatcherService.stop();
      logger.info("[Worker] Outbox dispatcher stopped.");

      // 2. Close BullMQ workers (allow in-flight jobs to complete)
      await queueWorkerManager.close();
      logger.info("[Worker] BullMQ workers closed.");

      // 3. Close queue producers
      await queueProducerService.close();
      logger.info("[Worker] BullMQ queue producers closed.");

      // 4. Drain database pool
      await closePool();
      logger.info("[Worker] Database connection pool closed.");
    } catch (err) {
      logger.error("[Worker] Error during graceful shutdown: %s", err.message);
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startWorker();
