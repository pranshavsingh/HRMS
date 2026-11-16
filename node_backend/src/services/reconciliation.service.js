import { db } from "../db/index.js";
import logger from "../utils/logger.js";

/**
 * Reconciles outbox events that were marked PUBLISHED but never finalized
 * by background consumers (e.g., due to Redis restart, evicted job, or worker drop).
 */
export class ReconciliationService {
  /**
   * Scan for published outbox events older than thresholdMinutes that lack a COMPLETED consumer receipt.
   * Resets eligible stalled events back to PENDING so the Outbox Dispatcher can re-dispatch them.
   * 
   * @param {number} [thresholdMinutes=15] - Age threshold in minutes
   * @param {number} [limit=50] - Max events to reconcile in one pass
   * @returns {Promise<{checked: number, recovered: number, stalledIds: number[]}>}
   */
  async reconcileUnprocessedJobs(thresholdMinutes = 15, limit = 50) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const cutoffExpr = isMysql
      ? `DATE_SUB(NOW(), INTERVAL ${Number(thresholdMinutes)} MINUTE)`
      : `datetime('now', '-${Number(thresholdMinutes)} minutes')`;
    const retentionExpr = isMysql
      ? "DATE_SUB(NOW(), INTERVAL 7 DAY)"
      : "datetime('now', '-7 days')";

    // 1. Fetch published candidates older than threshold
    const candidatesSql = `
      SELECT id, event_type, aggregate_type, aggregate_id, created_at, published_at
      FROM outbox_events
      WHERE status = 'PUBLISHED'
        AND published_at < ${cutoffExpr}
        AND published_at > ${retentionExpr}
      ORDER BY id ASC
      LIMIT ?
    `;

    const candidates = await db.all(candidatesSql, [Number(limit)]);
    if (!candidates || candidates.length === 0) {
      return { checked: 0, recovered: 0, stalledIds: [] };
    }

    const stalledIds = [];

    for (const event of candidates) {
      const deterministicJobId = `outbox_${event.id}`;

      // 2. Check if a consumer recorded completion for this job
      const receipt = await db.get(
        `SELECT status FROM consumer_processed_jobs 
         WHERE job_id IN (?, ?) AND status = 'COMPLETED' 
         LIMIT 1`,
        [deterministicJobId, String(event.id)]
      );

      if (!receipt) {
        // Missing consumer completion receipt: stalled or dropped event detected!
        stalledIds.push(event.id);
        logger.warn(
          "[Reconciliation] Stalled job detected! OutboxID [%d] (Type: %s) was published at [%s] but has no consumer completion receipt. Resetting to PENDING for recovery.",
          event.id,
          event.event_type,
          event.published_at
        );

        // 3. Atomically reset to PENDING so outbox dispatcher reclaims it safely
        await db.transaction(async (tx) => {
          const resetSql = `
            UPDATE outbox_events
            SET status = 'PENDING',
                retry_count = 0,
                last_error = 'Reconciled: Stalled without consumer receipt',
                claimed_by = NULL,
                claimed_until = NULL,
                published_at = NULL,
                updated_at = ${nowExpr}
            WHERE id = ? AND status = 'PUBLISHED'
          `;
          await db.run(resetSql, [event.id], tx);

          // Audit trail for forensic accountability
          const auditSql = `
            INSERT INTO audit_logs (
              user_id, username, action, target_id, ip_address, details, severity, created_at
            ) VALUES (
              NULL, 'system:reconciliation', 'OUTBOX_STALLED_JOB_RECONCILED', ?,
              '127.0.0.1', ?, 'WARNING', ${nowExpr}
            )
          `;
          const detailsJson = JSON.stringify({
            outboxEventId: event.id,
            eventType: event.event_type,
            publishedAt: event.published_at,
            thresholdMinutes
          });
          await db.run(auditSql, [String(event.id), detailsJson], tx);
        });
      }
    }

    return {
      checked: candidates.length,
      recovered: stalledIds.length,
      stalledIds
    };
  }
}

export const reconciliationService = new ReconciliationService();
export default reconciliationService;
