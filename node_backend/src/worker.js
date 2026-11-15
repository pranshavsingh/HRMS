process.env.IS_WORKER = "true";

import { dbInfo, healthCheck, closePool } from "./db/index.js";
import { initCron } from "./utils/cron.js";
import redisService from "./services/redis.service.js";
import queueWorkerManager from "./jobs/index.js";
import outboxDispatcherService from "./services/outbox-dispatcher.service.js";
import queueProducerService from "./services/queue-producer.service.js";
import workerHealthService from "./services/worker-health.service.js";
import logger from "./utils/logger.js";

let isShuttingDown = false;
let shutdownTimer = null;

export async function shutdownWorker(signal = "SIGTERM", exitProcess = true) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[Worker] Received ${signal}. Initiating enterprise graceful shutdown...`);

  // Signal degraded readiness probe immediately
  workerHealthService.setShuttingDown(true);

  // Hard shutdown timeout: force exit after 15 seconds if in-flight tasks hang
  if (exitProcess) {
    shutdownTimer = setTimeout(() => {
      logger.error("[Worker] Graceful shutdown timeout (15s) exceeded. Forcing exit.");
      process.exit(1);
    }, 15000);
    shutdownTimer.unref();
  }

  try {
    // 1. Stop outbox dispatcher polling first (prevents claiming new events)
    await outboxDispatcherService.stop();
    logger.info("[Worker] Outbox dispatcher stopped.");

    // 2. Close BullMQ workers (allows current in-flight job handlers to complete)
    await queueWorkerManager.close();
    logger.info("[Worker] BullMQ workers closed.");

    // 3. Close queue producers
    await queueProducerService.close();
    logger.info("[Worker] BullMQ queue producers closed.");

    // 4. Close worker HTTP health server
    await workerHealthService.stop();
    logger.info("[Worker] Worker health service closed.");

    // 5. Drain and close database connection pool
    await closePool();
    logger.info("[Worker] Database connection pool closed.");

    logger.info("[Worker] Graceful shutdown completed cleanly.");
  } catch (err) {
    logger.error("[Worker] Error during graceful shutdown: %s", err.message);
  } finally {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    if (exitProcess) {
      process.exit(0);
    }
  }
}

export async function startWorker() {
  logger.info("[Worker] Starting dedicated HRMS background worker process...");

  try {
    // 1. Startup Database Verification
    const info = dbInfo();
    await healthCheck();
    logger.info(`[Worker] Connected to database: mysql://${info.user}@${info.host}:${info.port}/${info.database}`);

    // 2. Redis Connection Check
    await new Promise((r) => setTimeout(r, 800));
    const redisOnline = redisService.isReady();
    logger.info(`[Worker] Redis connection status: ${redisOnline ? "Ready" : "Offline (Fallback mode)"}`);

    if (process.env.NODE_ENV === "production" && !redisOnline) {
      logger.warn("[Worker Warning] Dedicated worker booted with Redis offline in production mode. Queue tasks will queue locally or retry.");
    }

    // 3. Initialize BullMQ Queue Workers
    queueWorkerManager.startWorkers();
    logger.info("[Worker] BullMQ queue workers started.");

    // 4. Start Transactional Outbox Polling Dispatcher
    outboxDispatcherService.start();
    logger.info("[Worker] Transactional Outbox dispatcher started.");

    // 5. Initialize scheduled cron jobs exclusively in this worker instance
    initCron();
    logger.info("[Worker] Background scheduler is active and running.");

    // 6. Start Worker HTTP Health & Readiness Server
    const healthPort = await workerHealthService.start();
    logger.info("[Worker] Health & readiness probe listening on port %d", healthPort);

    // 7. Signal PM2 readiness (zero-downtime rolling restart confirmation)
    if (typeof process.send === "function") {
      process.send("ready");
      logger.info("[Worker] Sent 'ready' signal to PM2 process supervisor.");
    }

    return { healthPort, status: "running" };
  } catch (error) {
    logger.error(`[Worker] Startup failed: ${error.message}`);
    process.exit(1);
  }
}

// Bind process termination signals
process.on("SIGTERM", () => shutdownWorker("SIGTERM", true));
process.on("SIGINT", () => shutdownWorker("SIGINT", true));

// Self-execute when run as main entrypoint
const isMain = process.argv[1] && process.argv[1].endsWith("worker.js");
if (isMain) {
  startWorker();
}
