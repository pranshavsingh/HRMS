import crypto from "crypto";
import outboxRepository from "../repositories/outbox.repository.js";
import queueProducerService from "./queue-producer.service.js";
import { QUEUE_NAMES } from "../config/queue.js";
import logger from "../utils/logger.js";

class OutboxDispatcherService {
  constructor() {
    this.workerId = `dispatcher_${process.pid}_${crypto.randomBytes(3).toString("hex")}`;
    this.isRunning = false;
    this.pollTimer = null;
    this.cleanupTimer = null;
    this.isProcessing = false;
    this.batchSize = Number(process.env.OUTBOX_BATCH_SIZE || 50);
    this.pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1000);
    this.leaseSeconds = Number(process.env.OUTBOX_LEASE_SECONDS || 60);
  }

  /**
   * Start the outbox polling dispatcher loop.
   */
  start() {
    if (this.isRunning) {
      logger.info("[OutboxDispatcher] Dispatcher is already running.");
      return;
    }

    this.isRunning = true;
    logger.info(
      "[OutboxDispatcher] Starting dispatcher: WorkerID [%s], Batch [%d], Poll [%dms], Lease [%ds]",
      this.workerId,
      this.batchSize,
      this.pollIntervalMs,
      this.leaseSeconds
    );

    // Initial claim release on startup to unstrand any previously crashed dispatcher claims
    outboxRepository.releaseExpiredClaims().catch((err) => {
      logger.warn("[OutboxDispatcher] Startup claim release warning: %s", err.message);
    });

    this.scheduleNextPoll(100);

    // Periodic sweep for expired claims every 60s
    this.cleanupTimer = setInterval(() => {
      if (this.isRunning) {
        outboxRepository.releaseExpiredClaims().catch((err) => {
          logger.warn("[OutboxDispatcher] Periodic claim release warning: %s", err.message);
        });
      }
    }, 60000);
  }

  /**
   * Schedule next polling cycle.
   */
  scheduleNextPoll(delayMs = this.pollIntervalMs) {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(async () => {
      await this.processBatch();
    }, delayMs);
  }

  /**
   * Claim and process a single batch of outbox events.
   * Can be called directly by tests or triggered by the polling timer.
   * 
   * @returns {Promise<number>} Number of events successfully processed
   */
  async processBatch() {
    if (this.isProcessing) return 0;
    this.isProcessing = true;
    let processedCount = 0;

    try {
      const events = await outboxRepository.claimPendingEvents(
        this.workerId,
        this.batchSize,
        this.leaseSeconds
      );

      if (events && events.length > 0) {
        for (const event of events) {
          try {
            await this.dispatchEvent(event);
            await outboxRepository.markPublished(event.id, this.workerId);
            processedCount++;
          } catch (dispatchErr) {
            logger.error(
              "[OutboxDispatcher] Failed to publish outbox event ID [%d]: %s",
              event.id,
              dispatchErr.message
            );
            await outboxRepository.markFailed(event.id, this.workerId, dispatchErr.message, true);
          }
        }
      }

      // If we processed a full batch, check immediately for more without waiting full interval
      const nextDelay = events && events.length >= this.batchSize ? 50 : this.pollIntervalMs;
      if (this.isRunning) {
        this.scheduleNextPoll(nextDelay);
      }
    } catch (err) {
      logger.error("[OutboxDispatcher] Error during processBatch: %s", err.message);
      if (this.isRunning) {
        this.scheduleNextPoll(this.pollIntervalMs * 2); // Backoff on error
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Route an outbox event to the appropriate BullMQ queue.
   * Uses deterministic Job ID derived from outbox event ID to ensure duplicate-safe enqueueing.
   * 
   * @param {object} event 
   */
  async dispatchEvent(event) {
    const deterministicJobId = `outbox_${event.id}`;

    switch (event.event_type) {
      case "AUTH_PASSWORD_RESET_OTP_REQUESTED": {
        await queueProducerService.addJob(
          QUEUE_NAMES.EMAIL_NOTIFICATIONS,
          "Send Password Reset OTP Email",
          {
            outboxEventId: event.id,
            eventType: event.event_type,
            payload: event.payload
          },
          {
            jobId: deterministicJobId
          }
        );
        break;
      }

      default: {
        logger.warn(
          "[OutboxDispatcher] Unmapped event type [%s] for Outbox ID [%d]. Forwarding to maintenance queue.",
          event.event_type,
          event.id
        );
        await queueProducerService.addJob(
          QUEUE_NAMES.MAINTENANCE,
          `unmapped:${event.event_type}`,
          {
            outboxEventId: event.id,
            eventType: event.event_type,
            payload: event.payload
          },
          {
            jobId: deterministicJobId
          }
        );
        break;
      }
    }
  }

  /**
   * Stop the dispatcher safely during graceful shutdown.
   */
  async stop() {
    logger.info("[OutboxDispatcher] Stopping dispatcher service...");
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Wait for in-flight batch to conclude if running
    let waitCount = 0;
    while (this.isProcessing && waitCount < 30) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    logger.info("[OutboxDispatcher] Dispatcher stopped successfully.");
  }
}

export const outboxDispatcherService = new OutboxDispatcherService();
export default outboxDispatcherService;
