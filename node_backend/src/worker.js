import { dbInfo, healthCheck } from "./db/index.js";
import { initCron } from "./utils/cron.js";
import redisService from "./services/redis.service.js";
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

    // Initialize scheduled cron jobs in this single worker instance
    initCron();
    logger.info("[Worker] Background scheduler is active and running.");
  } catch (error) {
    logger.error(`[Worker] Startup failed: ${error.message}`);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    logger.info(`[Worker] Received ${signal}. Shutting down worker gracefully...`);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startWorker();
