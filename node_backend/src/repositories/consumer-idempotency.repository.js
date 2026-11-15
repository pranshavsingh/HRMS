import { db } from "../db/index.js";
import logger from "../utils/logger.js";

export const consumerIdempotencyRepository = {
  /**
   * Atomically claim execution of a job for a specific handler.
   * Uses UNIQUE constraint (PRIMARY KEY) on (job_id, handler_name) to guarantee
   * that competing workers or re-delivered queue jobs cannot run concurrently.
   * 
   * @param {string} jobId - BullMQ job identifier
   * @param {string} handlerName - Name of the executing job handler
   * @param {object} [tx=null] - Optional database transaction
   * @returns {Promise<boolean>} True if claim was successfully acquired, False if already claimed/completed
   */
  async claimExecution(jobId, handlerName, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const sql = `
      INSERT INTO consumer_processed_jobs (job_id, handler_name, status, created_at)
      VALUES (?, ?, 'PROCESSING', ${nowExpr})
    `;

    try {
      await db.run(sql, [String(jobId), handlerName], tx);
      return true;
    } catch (err) {
      const msg = err.message || "";
      if (
        msg.includes("Duplicate entry") ||
        msg.includes("ER_DUP_ENTRY") ||
        msg.includes("UNIQUE constraint failed") ||
        err.code === "ER_DUP_ENTRY" ||
        err.code === "SQLITE_CONSTRAINT"
      ) {
        logger.info(
          "[ConsumerIdempotency] Job [%s] handler [%s] already claimed or completed. Fencing duplicate execution.",
          jobId,
          handlerName
        );
        return false;
      }
      throw err;
    }
  },

  /**
   * Finalize execution as COMPLETED with optional result metadata.
   */
  async completeExecution(jobId, handlerName, result = null, tx = null) {
    const resultJson = result ? JSON.stringify(result) : null;
    const sql = `
      UPDATE consumer_processed_jobs
      SET status = 'COMPLETED', result = ?
      WHERE job_id = ? AND handler_name = ?
    `;
    const res = await db.run(sql, [resultJson, String(jobId), handlerName], tx);
    return res.changes > 0;
  },

  /**
   * Release a PROCESSING claim on transient failure so BullMQ backoff retry can re-attempt.
   */
  async releaseFailedClaim(jobId, handlerName, tx = null) {
    const sql = `
      DELETE FROM consumer_processed_jobs
      WHERE job_id = ? AND handler_name = ? AND status = 'PROCESSING'
    `;
    const res = await db.run(sql, [String(jobId), handlerName], tx);
    return res.changes > 0;
  },

  /**
   * Query the processed job record by job_id and handler_name.
   */
  async findRecord(jobId, handlerName, tx = null) {
    return db.get(
      "SELECT * FROM consumer_processed_jobs WHERE job_id = ? AND handler_name = ? LIMIT 1",
      [String(jobId), handlerName],
      tx
    );
  }
};

export default consumerIdempotencyRepository;
