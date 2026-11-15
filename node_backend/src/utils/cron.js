import cron from "node-cron";
import logger from "./logger.js";
import { db } from "../db/index.js";
import storageService from "../services/storage.service.js";
import { runDatabaseBackup } from "./backup.js";

/**
 * Initialize all scheduled background tasks.
 */
export function initCron() {
  logger.info("Initializing scheduled background cron jobs...");

  // Job 1: Auto-close open attendance cards daily at 11:59 PM
  cron.schedule("59 23 * * *", async () => {
    logger.info("CRON: Executing unclosed attendance cleanup...");
    try {
      // Set punch_out_time to NOW() for any card that was left open
      const result = await db.run(
        "UPDATE attendance_attendance SET punch_out_time=NOW(), punch_out_status='approved', status='approved' WHERE punch_out_time IS NULL"
      );
      logger.info("CRON: Auto-closed %d attendance records", result.changes);
    } catch (err) {
      logger.error("CRON ERROR (attendance cleanup): %s", err.message);
    }
  });

  // Job 2: Expired OTP cleanup hourly
  cron.schedule("0 * * * *", async () => {
    logger.info("CRON: Cleaning up expired password reset OTPs...");
    try {
      const result = await db.run("DELETE FROM password_reset_otp WHERE expires_at < NOW()");
      logger.info("CRON: Purged %d expired OTP tokens", result.changes);
    } catch (err) {
      logger.error("CRON ERROR (OTP cleanup): %s", err.message);
    }
  });

  // Job 3: Daily cleanup of attendance photos older than 3 months
  cron.schedule("0 0 * * *", async () => {
    logger.info("CRON: Starting daily attendance photo cleanup...");
    try {
      let processedCount = 0;
      let deletedPhotosCount = 0;

      while (true) {
        // Fetch a batch of 100 records older than 3 months with photos
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

        logger.info(`CRON: Processing cleanup batch of ${batch.length} records...`);

        for (const row of batch) {
          const photosToDelete = [];
          if (row.punch_in_photo) photosToDelete.push(row.punch_in_photo);
          if (row.punch_out_photo) photosToDelete.push(row.punch_out_photo);

          // Update database row in a transaction to set photo fields to NULL first
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

            // Once DB is updated successfully, delete the actual files from storage
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

      logger.info("CRON: Finished cleanup. Processed %d records, deleted %d photos.", processedCount, deletedPhotosCount);
    } catch (err) {
      logger.error("CRON ERROR (daily cleanup): %s", err.message);
    }
  });

  // Job 4: Daily automated compressed database backup at 2:00 AM (30-day retention)
  cron.schedule("0 2 * * *", async () => {
    logger.info("CRON: Initiating scheduled daily database backup...");
    await runDatabaseBackup();
  });

  logger.info("Background cron jobs scheduled successfully.");
}

export default initCron;
