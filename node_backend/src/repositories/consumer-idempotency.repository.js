import { db } from "../db/index.js";
import logger from "../utils/logger.js";

export const consumerIdempotencyRepository = {
  /**
   * Atomically claim execution of a job for a specific handler.
   * Supports distributed crash recovery, lease expiration, and fencing tokens.
   * 
   * Guarantees:
   * 1. A worker atomically acquires an unclaimed or expired claim.
   * 2. Two workers never hold the same active claim simultaneously.
   * 3. Expired claims are recoverable with an incremented fencing token.
   * 4. Stale workers are fenced out on completion.
   * 
   * @param {string} jobId - BullMQ job identifier
   * @param {string} handlerName - Name of the executing job handler
   * @param {string} [workerId="worker_default"] - Unique identifier of the claiming worker process
   * @param {number} [leaseSeconds=60] - Lease duration in seconds
   * @param {object} [tx=null] - Optional database transaction
   * @returns {Promise<{acquired: boolean, fencingToken?: number, isRecovery?: boolean, status?: string, reason?: string, record?: object}>}
   */
  async claimExecution(jobId, handlerName, workerId = "worker_default", leaseSeconds = 60, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const leaseExpr = isMysql
      ? `DATE_ADD(NOW(), INTERVAL ${Number(leaseSeconds)} SECOND)`
      : `datetime('now', '+${Number(leaseSeconds)} seconds')`;

    const runner = tx || db;

    // Execute atomic claim check and update within a transaction
    const executeClaim = async (activeTx) => {
      // 1. Lock existing row if present
      const selectSql = isMysql
        ? "SELECT * FROM consumer_processed_jobs WHERE job_id = ? AND handler_name = ? FOR UPDATE"
        : "SELECT * FROM consumer_processed_jobs WHERE job_id = ? AND handler_name = ?";

      const existing = await runner.get(selectSql, [String(jobId), handlerName], activeTx);

      if (!existing) {
        // Fresh claim insert
        try {
          const insertSql = `
            INSERT INTO consumer_processed_jobs (
              job_id, handler_name, status, claimed_by, lease_expires_at, fencing_token, created_at, updated_at
            ) VALUES (?, ?, 'PROCESSING', ?, ${leaseExpr}, 1, ${nowExpr}, ${nowExpr})
          `;
          await runner.run(insertSql, [String(jobId), handlerName, workerId], activeTx);
          return { acquired: true, fencingToken: 1, isRecovery: false };
        } catch (insertErr) {
          const msg = insertErr.message || "";
          if (
            msg.includes("Duplicate entry") ||
            msg.includes("ER_DUP_ENTRY") ||
            msg.includes("UNIQUE constraint failed") ||
            insertErr.code === "ER_DUP_ENTRY" ||
            insertErr.code === "SQLITE_CONSTRAINT"
          ) {
            // Concurrent insert race: re-read to determine state
            const raced = await runner.get(selectSql, [String(jobId), handlerName], activeTx);
            if (raced && raced.status === "COMPLETED") {
              return { acquired: false, status: "COMPLETED", reason: "ALREADY_COMPLETED", record: raced };
            }
            return { acquired: false, status: "PROCESSING", reason: "CONCURRENT_CLAIM_RACE" };
          }
          throw insertErr;
        }
      }

      // Case 2: Already completed -> Deduplicate permanently
      if (existing.status === "COMPLETED") {
        return {
          acquired: false,
          status: "COMPLETED",
          reason: "ALREADY_COMPLETED",
          record: existing
        };
      }

      // Case 3: Permanent terminal failure (Dead Letter)
      if (existing.status === "DEAD_LETTER") {
        return {
          acquired: false,
          status: "DEAD_LETTER",
          reason: "DEAD_LETTER",
          record: existing
        };
      }

      // Case 4: Active unexpired claim held by a worker
      const nowMs = Date.now();
      const leaseMs = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
      if (existing.status === "PROCESSING" && leaseMs >= nowMs) {
        return {
          acquired: false,
          status: "PROCESSING",
          reason: "ACTIVE_CLAIM",
          claimedBy: existing.claimed_by,
          leaseExpiresAt: existing.lease_expires_at,
          record: existing
        };
      }

      // Case 5: Expired claim or retryable FAILED state -> Recover claim with incremented fencing token
      const currentToken = Number(existing.fencing_token || 1);
      const nextFencingToken = currentToken + 1;

      const updateSql = `
        UPDATE consumer_processed_jobs 
        SET status = 'PROCESSING', 
            claimed_by = ?, 
            lease_expires_at = ${leaseExpr}, 
            fencing_token = ?, 
            updated_at = ${nowExpr}
        WHERE job_id = ? AND handler_name = ? AND fencing_token = ?
      `;

      const updateRes = await runner.run(
        updateSql,
        [workerId, nextFencingToken, String(jobId), handlerName, currentToken],
        activeTx
      );

      if (updateRes.changes > 0) {
        logger.info(
          "[ConsumerIdempotency] Recovered expired claim: Job [%s], Handler [%s], Prev Worker [%s], New Worker [%s], Fencing Token [%d -> %d]",
          jobId,
          handlerName,
          existing.claimed_by,
          workerId,
          currentToken,
          nextFencingToken
        );
        return { acquired: true, fencingToken: nextFencingToken, isRecovery: true };
      }

      // Another worker reclaimed concurrently
      return { acquired: false, status: "PROCESSING", reason: "CONCURRENT_RECOVERY_CONTENTION" };
    };

    if (tx) {
      return executeClaim(tx);
    }
    return db.transaction(executeClaim);
  },

  /**
   * Finalize execution as COMPLETED with optional result metadata.
   * Strictly verifies that the completing worker owns the claim and that the
   * fencing token matches. If a stale worker's lease expired and another worker
   * took over, this update will affect 0 rows and return false (fenced out).
   * 
   * @param {string} jobId - BullMQ job identifier
   * @param {string} handlerName - Name of the executing job handler
   * @param {string} workerId - Claiming worker identifier
   * @param {number} fencingToken - Fencing token issued during claim acquisition
   * @param {object} [result=null] - Optional result payload
   * @param {object} [tx=null] - Optional transaction
   * @returns {Promise<boolean>} True if successfully marked completed, False if fenced out
   */
  async completeExecution(jobId, handlerName, workerId, fencingToken, result = null, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const resultJson = result ? JSON.stringify(result) : null;

    const sql = `
      UPDATE consumer_processed_jobs
      SET status = 'COMPLETED',
          result = ?,
          lease_expires_at = NULL,
          updated_at = ${nowExpr}
      WHERE job_id = ? 
        AND handler_name = ? 
        AND claimed_by = ? 
        AND fencing_token = ? 
        AND status = 'PROCESSING'
        AND lease_expires_at >= ${nowExpr}
    `;

    const runner = tx || db;
    const res = await runner.run(sql, [resultJson, String(jobId), handlerName, workerId, fencingToken], tx);
    return res.changes > 0;
  },

  /**
   * Release a PROCESSING claim on transient failure so BullMQ backoff retry can re-attempt.
   * Strictly verifies worker ownership and fencing token.
   * 
   * @param {string} jobId - BullMQ job identifier
   * @param {string} handlerName - Name of the executing job handler
   * @param {string} workerId - Claiming worker identifier
   * @param {number} fencingToken - Fencing token
   * @param {string} [errorMsg=null] - Optional error details
   * @param {object} [tx=null] - Optional transaction
   * @returns {Promise<boolean>} True if claim was released, False if fenced out
   */
  async releaseFailedClaim(jobId, handlerName, workerId, fencingToken, errorMsg = null, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const resultJson = errorMsg ? JSON.stringify({ error: String(errorMsg).slice(0, 500) }) : null;

    const sql = `
      UPDATE consumer_processed_jobs
      SET status = 'FAILED',
          result = ?,
          claimed_by = NULL,
          lease_expires_at = NULL,
          updated_at = ${nowExpr}
      WHERE job_id = ? 
        AND handler_name = ? 
        AND claimed_by = ? 
        AND fencing_token = ? 
        AND status = 'PROCESSING'
        AND lease_expires_at >= ${nowExpr}
    `;

    const runner = tx || db;
    const res = await runner.run(sql, [resultJson, String(jobId), handlerName, workerId, fencingToken], tx);
    return res.changes > 0;
  },

  /**
   * Persistently quarantine an unrecoverable poison payload to DEAD_LETTER status.
   */
  async markDeadLetter(jobId, handlerName, workerId = null, fencingToken = null, errorMsg = null, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const resultJson = errorMsg ? JSON.stringify({ error: String(errorMsg).slice(0, 500) }) : null;

    let sql;
    let params;

    if (workerId && fencingToken) {
      sql = `
        UPDATE consumer_processed_jobs
        SET status = 'DEAD_LETTER',
            result = ?,
            claimed_by = NULL,
            lease_expires_at = NULL,
            updated_at = ${nowExpr}
        WHERE job_id = ? AND handler_name = ? AND claimed_by = ? AND fencing_token = ?
      `;
      params = [resultJson, String(jobId), handlerName, workerId, fencingToken];
    } else {
      sql = `
        UPDATE consumer_processed_jobs
        SET status = 'DEAD_LETTER',
            result = ?,
            claimed_by = NULL,
            lease_expires_at = NULL,
            updated_at = ${nowExpr}
        WHERE job_id = ? AND handler_name = ?
      `;
      params = [resultJson, String(jobId), handlerName];
    }

    const runner = tx || db;
    const res = await runner.run(sql, params, tx);
    return res.changes > 0;
  },

  /**
   * Query the processed job record by job_id and handler_name.
   */
  async findRecord(jobId, handlerName, tx = null) {
    const runner = tx || db;
    return runner.get(
      "SELECT * FROM consumer_processed_jobs WHERE job_id = ? AND handler_name = ? LIMIT 1",
      [String(jobId), handlerName],
      tx
    );
  },

  /**
   * Proactively release expired claims back to FAILED state so retries can claim.
   */
  async releaseExpiredClaims() {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const sql = `
      UPDATE consumer_processed_jobs 
      SET status = 'FAILED', 
          claimed_by = NULL, 
          lease_expires_at = NULL,
          updated_at = ${nowExpr}
      WHERE status = 'PROCESSING' AND lease_expires_at < ${nowExpr}
    `;

    const res = await db.run(sql);
    if (res.changes > 0) {
      logger.info("[ConsumerIdempotency] Released %d expired consumer claims back to FAILED.", res.changes);
    }
    return res.changes;
  },

  /**
   * Purge old completed consumer records according to enterprise retention policy.
   * Only deletes records with status 'COMPLETED' older than retentionDays.
   * 
   * @param {number} [retentionDays=7] - Number of days to retain completed job receipts
   * @returns {Promise<number>} Number of purged records
   */
  async purgeOldCompletedJobs(retentionDays = 7) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const cutoffExpr = isMysql
      ? `DATE_SUB(NOW(), INTERVAL ${Number(retentionDays)} DAY)`
      : `datetime('now', '-${Number(retentionDays)} days')`;

    const sql = `
      DELETE FROM consumer_processed_jobs
      WHERE status = 'COMPLETED' AND updated_at < ${cutoffExpr}
    `;

    const res = await db.run(sql);
    if (res.changes > 0) {
      logger.info("[ConsumerIdempotency] Purged %d completed consumer jobs older than %d days.", res.changes, retentionDays);
    }
    return res.changes;
  }
};

export default consumerIdempotencyRepository;
