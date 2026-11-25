import cron from "node-cron";
import logger from "./logger.js";
import { db } from "../db/index.js";
import storageService from "../services/storage.service.js";
import { runDatabaseBackup } from "./backup.js";
import redisService from "../services/redis.service.js";

/**
 * Execute a scheduled task protected by a distributed Redis advisory lock.
 * Prevents multiple PM2 worker processes or clustered servers from executing
 * the same scheduled job simultaneously.
 */
async function runWithLock(jobName, ttlSeconds, fn) {
  const lockKey = `hrms:cron:lock:${jobName}`;
  let lockAcquired = false;

  if (redisService.isReady()) {
    try {
      const res = await redisService.client.set(lockKey, process.pid, "NX", "EX", ttlSeconds);
      if (res !== "OK") {
        logger.info(`[CRON] Job '${jobName}' is already executing in another worker process. Skipping.`);
        return;
      }
      lockAcquired = true;
    } catch (err) {
      logger.warn(`[CRON] Redis lock failed for '${jobName}': ${err.message}. Proceeding with cautious execution.`);
    }
  }

  try {
    await fn();
  } catch (err) {
    logger.error(`[CRON ERROR] '${jobName}' execution failed: %s`, err.message);
  } finally {
    if (lockAcquired && redisService.isReady()) {
      try {
        await redisService.client.del(lockKey);
      } catch (err) {
        logger.warn(`[CRON] Failed to release lock for '${jobName}': %s`, err.message);
      }
    }
  }
}

/**
 * Initialize all scheduled background tasks.
 */
export function initCron() {
  logger.info("Initializing scheduled background cron jobs with distributed locking...");

  // Job 1: Auto-flag open attendance cards older than 16 hours for review daily at 11:59 PM
  cron.schedule("59 23 * * *", async () => {
    await runWithLock("attendance_cleanup", 600, async () => {
      logger.info("CRON: Executing unclosed attendance cleanup (16-hour threshold)...");
      // Flag abandoned sessions open for > 16 hours as pending review without auto-approving or fabricating NOW() timestamps
      const result = await db.run(
        `UPDATE attendance_attendance 
         SET punch_out_status = 'pending', status = 'pending', is_outside_location = 1 
         WHERE punch_out_time IS NULL 
           AND punch_in_time < DATE_SUB(NOW(), INTERVAL 16 HOUR)
           AND punch_out_status != 'pending'`
      );
      logger.info("CRON: Flagged %d abandoned attendance records for manager review", result.changes);
    });
  });

  // Job 2: Expired OTP cleanup hourly
  cron.schedule("0 * * * *", async () => {
    await runWithLock("otp_cleanup", 300, async () => {
      logger.info("CRON: Cleaning up expired password reset OTPs and revoked tokens...");
      const result = await db.run("DELETE FROM password_reset_otp WHERE expires_at < NOW()");
      const revokedResult = await db.run("DELETE FROM accounts_revoked_token WHERE expires_at < NOW()");
      logger.info("CRON: Purged %d expired OTP tokens and %d revoked tokens", result.changes, revokedResult.changes);
    });
  });

  // Job 3: Daily cleanup of attendance photos older than 3 months
  cron.schedule("0 0 * * *", async () => {
    await runWithLock("photo_cleanup", 1800, async () => {
      logger.info("CRON: Starting daily attendance photo cleanup...");
      let processedCount = 0;
      let deletedPhotosCount = 0;

      while (true) {
        const batch = await db.all(
          `SELECT id, punch_in_photo, punch_out_photo 
           FROM attendance_attendance 
           WHERE date < DATE_SUB(CURDATE(), INTERVAL 3 MONTH) 
             AND (punch_in_photo IS NOT NULL OR punch_out_photo IS NOT NULL) 
           LIMIT 100`
        );

        if (!batch || batch.length === 0) {
          break;
        }

        logger.info(`CRON: Processing photo cleanup batch of ${batch.length} records...`);

        for (const row of batch) {
          const photosToDelete = [];
          if (row.punch_in_photo) photosToDelete.push(row.punch_in_photo);
          if (row.punch_out_photo) photosToDelete.push(row.punch_out_photo);

          try {
            await db.transaction(async (tx) => {
              await db.run(
                `UPDATE attendance_attendance 
                 SET punch_in_photo = NULL, punch_out_photo = NULL 
                 WHERE id = ?`,
                [row.id],
                tx
              );
            });

            for (const photoPath of photosToDelete) {
              try {
                await storageService.delete(photoPath);
                deletedPhotosCount++;
              } catch (err) {
                logger.error("CRON ERROR (deleting photo %s): %s", photoPath, err.message);
              }
            }
          } catch (err) {
            logger.error("CRON ERROR (updating record %d): %s", row.id, err.message);
          }
        }

        processedCount += batch.length;
      }

      logger.info(
        "CRON: Finished photo cleanup. Processed %d records, deleted %d photos.",
        processedCount,
        deletedPhotosCount
      );
    });
  });

  // Job 4: Daily automated compressed database backup at 2:00 AM (30-day retention)
  cron.schedule("0 2 * * *", async () => {
    await runWithLock("db_backup", 3600, async () => {
      logger.info("CRON: Initiating scheduled daily database backup...");
      await runDatabaseBackup();
    });
  });

  // Job 5: Daily automated cleanup of published outbox events and completed consumer jobs at 3:00 AM (7-day retention)
  cron.schedule("0 3 * * *", async () => {
    await runWithLock("outbox_retention_cleanup", 1800, async () => {
      logger.info("CRON: Initiating daily retention purge for published outbox & consumer events...");
      try {
        const { default: outboxRepository } = await import("../repositories/outbox.repository.js");
        const { default: consumerIdempotencyRepository } = await import("../repositories/consumer-idempotency.repository.js");
        const outboxPurged = await outboxRepository.purgeOldPublishedEvents(7);
        const consumerPurged = await consumerIdempotencyRepository.purgeOldCompletedJobs(7);
        logger.info("CRON: Retention cleanup complete. Purged %d outbox events, %d consumer receipts.", outboxPurged, consumerPurged);
      } catch (err) {
        logger.error("CRON: Retention cleanup failed: %s", err.message);
      }
    });
  });

  // Job 6: Periodic reconciliation of published-but-unprocessed outbox events every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    await runWithLock("stalled_jobs_reconciliation", 600, async () => {
      try {
        const { default: reconciliationService } = await import("../services/reconciliation.service.js");
        const res = await reconciliationService.reconcileUnprocessedJobs(15);
        if (res.recovered > 0) {
          logger.warn("CRON: Reconciled and reset %d stalled published outbox events back to PENDING.", res.recovered);
        }
      } catch (err) {
        logger.error("CRON: Stalled job reconciliation failed: %s", err.message);
      }
    });
  });

  // Annual leave entitlement initialization follows each tenant's configured FY timezone.
  cron.schedule("*/15 * * * *", async () => {
    await runWithLock("financial_year_leave_reset", 1800, async () => {
      const { default: financialLeaveService } = await import("../services/financial-leave.service.js");
      await financialLeaveService.processDueResets();
    });
  });

  logger.info("Background cron jobs scheduled successfully.");
}

export default initCron;
