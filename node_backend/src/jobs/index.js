import { Worker } from "bullmq";
import { QUEUE_NAMES, createQueueConnection, queueConfig } from "../config/queue.js";
import { sendOtpEmailHandler } from "./handlers/send-otp-email.handler.js";
import logger from "../utils/logger.js";

class QueueWorkerManager {
  constructor() {
    this.workers = new Map();
    this.connection = null;
  }

  getConnection() {
    if (!this.connection) {
      this.connection = createQueueConnection("worker");
    }
    return this.connection;
  }

  /**
   * Start BullMQ workers for background queues.
   */
  startWorkers() {
    if (this.workers.size > 0) {
      logger.info("[QueueWorker] Workers are already running.");
      return;
    }

    const conn = this.getConnection();
    const concurrency = Number(process.env.QUEUE_CONCURRENCY || 5);

    // 1. Email Notifications Worker
    const emailWorker = new Worker(
      QUEUE_NAMES.EMAIL_NOTIFICATIONS,
      async (job) => {
        if (job.name === "Send Password Reset OTP Email") {
          return sendOtpEmailHandler(job);
        }
        logger.warn("[QueueWorker:Email] Unknown job name received: %s", job.name);
        return { unhandled: true };
      },
      {
        connection: conn,
        prefix: queueConfig.prefix,
        concurrency
      }
    );

    emailWorker.on("completed", (job) => {
      logger.info(
        "[QueueWorker:Email] Completed job [%s] (ID: %s, duration: %dms)",
        job.name,
        job.id,
        Date.now() - job.timestamp
      );
    });

    emailWorker.on("failed", (job, err) => {
      logger.error(
        "[QueueWorker:Email] Job failed [%s] (ID: %s, attempt: %d/%d): %s",
        job.name,
        job.id,
        job.attemptsMade,
        job.opts.attempts || 5,
        err.message
      );
    });

    emailWorker.on("error", (err) => {
      logger.warn("[QueueWorker:Email] Worker error: %s", err.message);
    });

    this.workers.set(QUEUE_NAMES.EMAIL_NOTIFICATIONS, emailWorker);
    logger.info("[QueueWorker] Started BullMQ email worker (concurrency: %d)", concurrency);
  }

  /**
   * Graceful shutdown of all workers.
   */
  async close() {
    logger.info("[QueueWorker] Shutting down all BullMQ workers gracefully...");
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
        logger.info("[QueueWorker] Closed worker: %s", name);
      } catch (err) {
        logger.warn("[QueueWorker] Error closing worker %s: %s", name, err.message);
      }
    }
    this.workers.clear();

    if (this.connection) {
      try {
        await this.connection.quit();
      } catch {
        this.connection.disconnect();
      }
      this.connection = null;
    }
  }
}

export const queueWorkerManager = new QueueWorkerManager();
export default queueWorkerManager;

