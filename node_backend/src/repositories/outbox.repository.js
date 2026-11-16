import { db } from "../db/index.js";
import logger from "../utils/logger.js";

export const outboxRepository = {
  /**
   * Insert a new event into the transactional outbox.
   * Can be executed within an active database transaction (`tx`).
   * 
   * @param {object} eventData
   * @param {string} eventData.eventType - Logical event name (e.g. "AUTH_PASSWORD_RESET_OTP_REQUESTED")
   * @param {string} eventData.aggregateType - Entity type (e.g. "User", "Attendance")
   * @param {string|number} eventData.aggregateId - Entity primary key or identifier
   * @param {object|string} eventData.payload - JSON-serializable event payload (or pre-encrypted payload)
   * @param {string} eventData.idempotencyKey - Unique deterministic idempotency key
   * @param {object} [tx=null] - Optional active database transaction connection
   * @returns {Promise<number>} Inserted outbox event ID
   */
  async createEvent(eventData, tx = null) {
    const {
      eventType,
      aggregateType,
      aggregateId,
      payload,
      idempotencyKey
    } = eventData;

    const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);

    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const sql = `
      INSERT INTO outbox_events (
        event_type, aggregate_type, aggregate_id, payload, idempotency_key, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ${nowExpr}, ${nowExpr})
    `;

    const result = await db.run(sql, [
      eventType,
      aggregateType,
      String(aggregateId),
      payloadJson,
      idempotencyKey
    ], tx);

    return result.lastID;
  },

  /**
   * Find an outbox event by its unique idempotency key.
   */
  async findByIdempotencyKey(idempotencyKey, tx = null) {
    return db.get(
      "SELECT * FROM outbox_events WHERE idempotency_key = ? LIMIT 1",
      [idempotencyKey],
      tx
    );
  },

  /**
   * Find an outbox event by ID.
   */
  async findById(id, tx = null) {
    return db.get("SELECT * FROM outbox_events WHERE id = ?", [id], tx);
  },

  /**
   * Atomically claim a batch of pending or expired-lease outbox events.
   * Uses `FOR UPDATE SKIP LOCKED` on MySQL to support multiple concurrent dispatchers
   * without contention, deadlocks, or lock wait timeouts.
   * 
   * @param {string} workerId - Unique identifier of the claiming dispatcher process
   * @param {number} [batchSize=50] - Maximum records to claim per batch
   * @param {number} [leaseSeconds=60] - Claim lease duration
   * @returns {Promise<Array<object>>} List of claimed event records
   */
  async claimPendingEvents(workerId, batchSize = 50, leaseSeconds = 60) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";

    if (isMysql) {
      return db.transaction(async (tx) => {
        // 1. Select eligible rows with SKIP LOCKED so competing workers do not block
        const selectSql = `
          SELECT * FROM outbox_events 
          WHERE status = 'PENDING' 
             OR (status = 'CLAIMED' AND claimed_until < NOW())
          ORDER BY id ASC 
          LIMIT ? 
          FOR UPDATE SKIP LOCKED
        `;
        const candidates = await db.all(selectSql, [batchSize], tx);

        if (!candidates || candidates.length === 0) {
          return [];
        }

        const ids = candidates.map((c) => c.id);
        const placeholders = ids.map(() => "?").join(",");

        // 2. Mark claimed under the transaction lease
        const updateSql = `
          UPDATE outbox_events 
          SET status = 'CLAIMED', 
              claimed_by = ?, 
              claimed_until = DATE_ADD(NOW(), INTERVAL ? SECOND),
              updated_at = NOW()
          WHERE id IN (${placeholders})
        `;
        await db.run(updateSql, [workerId, leaseSeconds, ...ids], tx);

        // Return the candidates updated with the claim metadata
        return candidates.map((row) => ({
          ...row,
          status: "CLAIMED",
          claimed_by: workerId,
          payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
        }));
      });
    }

    // SQLite compatibility fallback
    return db.transaction(async (tx) => {
      const candidates = await db.all(
        `SELECT * FROM outbox_events 
         WHERE status = 'PENDING' 
            OR (status = 'CLAIMED' AND claimed_until < datetime('now'))
         ORDER BY id ASC LIMIT ?`,
        [batchSize],
        tx
      );

      if (!candidates || candidates.length === 0) {
        return [];
      }

      const ids = candidates.map((c) => c.id);
      const placeholders = ids.map(() => "?").join(",");

      await db.run(
        `UPDATE outbox_events 
         SET status = 'CLAIMED', 
             claimed_by = ?, 
             claimed_until = datetime('now', '+${Number(leaseSeconds)} seconds'),
             updated_at = datetime('now')
         WHERE id IN (${placeholders})`,
        [workerId, ...ids],
        tx
      );

      return candidates.map((row) => ({
        ...row,
        status: "CLAIMED",
        claimed_by: workerId,
        payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
      }));
    });
  },

  /**
   * Mark an outbox event as successfully published to BullMQ.
   * Strictly enforces claim fencing: only the worker that holds the active, unexpired claim
   * can finalize the record. If the lease expired or claim was lost, returns false.
   */
  async markPublished(id, workerId, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const sql = `
      UPDATE outbox_events 
      SET status = 'PUBLISHED', 
          published_at = ${nowExpr}, 
          claimed_by = NULL, 
          claimed_until = NULL,
          updated_at = ${nowExpr}
      WHERE id = ? 
        AND status = 'CLAIMED' 
        AND claimed_by = ? 
        AND claimed_until >= ${nowExpr}
    `;

    const result = await db.run(sql, [id, workerId], tx);
    return result.changes > 0;
  },

  /**
   * Mark an outbox event as failed during publication.
   * Strictly enforces claim fencing: only the worker with active, unexpired claim can record failure.
   * If retries are exhausted (>= maxRetries) or willRetry is false, transitions to DEAD_LETTER.
   */
  async markFailed(id, workerId, errorMessage, willRetry = true, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const current = await this.findById(id, tx);
    let nextStatus = "PENDING";
    if (!willRetry || (current && current.retry_count + 1 >= 5)) {
      nextStatus = "DEAD_LETTER";
    }

    const sql = `
      UPDATE outbox_events 
      SET status = ?, 
          last_error = ?, 
          retry_count = retry_count + 1,
          claimed_by = NULL, 
          claimed_until = NULL,
          updated_at = ${nowExpr}
      WHERE id = ? 
        AND status = 'CLAIMED' 
        AND claimed_by = ? 
        AND claimed_until >= ${nowExpr}
    `;

    const sanitizedError = errorMessage ? String(errorMessage).slice(0, 1000) : "Unknown dispatch error";
    const result = await db.run(sql, [nextStatus, sanitizedError, id, workerId], tx);
    return result.changes > 0;
  },

  /**
   * Persistently quarantine an event to DEAD_LETTER status (e.g. unparseable poison payload).
   * Enforces strict claim ownership and fencing:
   * - Consumer Context: If consumer claim context is provided ({ workerId, fencingToken, jobId, handlerName }),
   *   verifies that the outbox record is PUBLISHED/PENDING and that consumer_processed_jobs contains an active,
   *   unexpired claim in PROCESSING status for that exact worker and fencing token.
   * - Dispatcher Context: If workerId is provided (string or { workerId }), verifies that the outbox
   *   record is currently CLAIMED by that exact dispatcher and the claim lease has not expired.
   * - Administrative Context: If no ownership context is provided, only unassigned, unclaimed PENDING
   *   records may be transitioned.
   * 
   * @param {number|string} id - Outbox event ID
   * @param {string} errorMessage - Error description
   * @param {string|object} [ownership=null] - Dispatcher workerId OR consumer claim context
   * @param {object} [tx=null] - Optional transaction
   * @returns {Promise<boolean>} - True if transitioned to DEAD_LETTER, false if fenced out
   */
  async markDeadLetter(id, errorMessage, ownership = null, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const sanitizedError = errorMessage ? String(errorMessage).slice(0, 1000) : "Poison payload quarantined";

    let sql;
    let params;

    const isConsumerContext = Boolean(
      ownership && typeof ownership === "object" && ownership.jobId && ownership.handlerName
    );

    if (isConsumerContext) {
      const { workerId, fencingToken, jobId, handlerName } = ownership;
      if (!workerId || fencingToken === null || fencingToken === undefined || !jobId || !handlerName) {
        return false;
      }
      sql = `
        UPDATE outbox_events 
        SET status = 'DEAD_LETTER', 
            last_error = ?, 
            claimed_by = NULL, 
            claimed_until = NULL,
            updated_at = ${nowExpr}
        WHERE id = ? 
          AND status IN ('PUBLISHED', 'PENDING')
          AND EXISTS (
            SELECT 1 FROM consumer_processed_jobs 
            WHERE job_id = ? 
              AND handler_name = ? 
              AND claimed_by = ? 
              AND fencing_token = ? 
              AND status = 'PROCESSING' 
              AND lease_expires_at >= ${nowExpr}
          )
      `;
      params = [sanitizedError, id, String(jobId), String(handlerName), String(workerId), Number(fencingToken)];
    } else {
      const workerId = typeof ownership === "string" ? ownership : (ownership && ownership.workerId);
      if (workerId) {
        sql = `
          UPDATE outbox_events 
          SET status = 'DEAD_LETTER', 
              last_error = ?, 
              claimed_by = NULL, 
              claimed_until = NULL,
              updated_at = ${nowExpr}
          WHERE id = ? 
            AND status = 'CLAIMED' 
            AND claimed_by = ? 
            AND claimed_until >= ${nowExpr}
        `;
        params = [sanitizedError, id, String(workerId)];
      } else {
        sql = `
          UPDATE outbox_events 
          SET status = 'DEAD_LETTER', 
              last_error = ?, 
              claimed_by = NULL, 
              claimed_until = NULL,
              updated_at = ${nowExpr}
          WHERE id = ? 
            AND status = 'PENDING'
            AND (claimed_by IS NULL OR claimed_until < ${nowExpr})
        `;
        params = [sanitizedError, id];
      }
    }

    const runner = tx || db;
    const result = await runner.run(sql, params, tx);
    return result.changes > 0;
  },

  /**
   * Fetch dead-lettered events for operator inspection.
   * Never exposes raw or encrypted payloads to avoid credential leakage.
   */
  async getDeadLetterEvents(limit = 50, offset = 0) {
    return db.all(
      `SELECT id, event_type, aggregate_type, aggregate_id, retry_count, last_error, created_at, updated_at 
       FROM outbox_events 
       WHERE status = 'DEAD_LETTER' 
       ORDER BY updated_at DESC 
       LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    );
  },

  /**
   * Allow authorized operators to replay/retry a dead-lettered event by moving it back to PENDING.
   * Generates a permanent audit log entry in audit_logs to preserve full forensic accountability.
   * Strictly prevents replaying already-PUBLISHED events to eliminate duplicate business operations.
   * 
   * @param {number|string} id - Outbox event identifier
   * @param {string} [operatorUsername="system"] - Username of the operator initiating replay
   * @param {string} [reason="Manual operator replay"] - Reason for replay
   * @returns {Promise<{success: boolean, reason?: string, replayedAt?: Date, eventId?: number}>}
   */
  async retryDeadLetterEvent(id, operatorUsername = "system", reason = "Manual operator replay") {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const event = await this.findById(id);
    if (!event) {
      return { success: false, reason: "EVENT_NOT_FOUND" };
    }

    if (event.status === "PUBLISHED") {
      logger.warn(
        "[Outbox:Replay] Rejected replay attempt for OutboxID [%s]: Event is already PUBLISHED (Idempotency Protection).",
        id
      );
      return { success: false, reason: "ALREADY_PUBLISHED" };
    }

    if (event.status !== "DEAD_LETTER") {
      logger.warn(
        "[Outbox:Replay] Rejected replay attempt for OutboxID [%s]: Status is '%s' (Only DEAD_LETTER events are eligible).",
        id,
        event.status
      );
      return { success: false, reason: `INELIGIBLE_STATUS_${event.status}` };
    }

    return db.transaction(async (tx) => {
      const sql = `
        UPDATE outbox_events 
        SET status = 'PENDING', 
            retry_count = 0, 
            last_error = NULL, 
            claimed_by = NULL, 
            claimed_until = NULL,
            updated_at = ${nowExpr}
        WHERE id = ? AND status = 'DEAD_LETTER'
      `;

      const result = await db.run(sql, [id], tx);
      if (result.changes === 0) {
        return { success: false, reason: "CONCURRENT_STATUS_CHANGE" };
      }

      // Record operator replay action in audit_logs
      const auditSql = `
        INSERT INTO audit_logs (
          username, action, target_id, details, severity, created_at
        ) VALUES (?, 'OUTBOX_DEAD_LETTER_REPLAY', ?, ?, 'WARNING', ${nowExpr})
      `;

      const auditDetails = JSON.stringify({
        operatorReason: reason,
        previousError: event.last_error,
        previousRetryCount: event.retry_count,
        eventType: event.event_type,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id
      });

      await db.run(auditSql, [operatorUsername, String(id), auditDetails], tx);

      logger.info(
        "[Outbox:Replay] Operator [%s] replayed Dead-Letter OutboxID [%s] back to PENDING. Reason: %s",
        operatorUsername,
        id,
        reason
      );

      return { success: true, replayedAt: new Date(), eventId: Number(id) };
    });
  },

  /**
   * Purge old published events according to enterprise retention policy.
   * Only deletes events with status 'PUBLISHED' older than the retention threshold.
   * 
   * @param {number} [retentionDays=7] - Number of days to retain published events
   * @returns {Promise<number>} Number of purged events
   */
  async purgeOldPublishedEvents(retentionDays = 7) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const cutoffExpr = isMysql
      ? `DATE_SUB(NOW(), INTERVAL ${Number(retentionDays)} DAY)`
      : `datetime('now', '-${Number(retentionDays)} days')`;

    const sql = `
      DELETE FROM outbox_events
      WHERE status = 'PUBLISHED' AND updated_at < ${cutoffExpr}
    `;

    const res = await db.run(sql);
    if (res.changes > 0) {
      logger.info("[Outbox] Purged %d published events older than %d days.", res.changes, retentionDays);
    }
    return res.changes;
  },

  /**
   * Release expired claims for crash recovery.
   */
  async releaseExpiredClaims() {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";

    const sql = `
      UPDATE outbox_events 
      SET status = 'PENDING', 
          claimed_by = NULL, 
          claimed_until = NULL,
          updated_at = ${nowExpr}
      WHERE status = 'CLAIMED' AND claimed_until < ${nowExpr}
    `;

    const result = await db.run(sql);
    if (result.changes > 0) {
      logger.info("[Outbox] Released %d expired claims back to PENDING state.", result.changes);
    }
    return result.changes;
  },

  /**
   * Aggregate counts for outbox metrics & observability.
   */
  async getMetrics() {
    const rows = await db.all(`
      SELECT status, COUNT(*) as count 
      FROM outbox_events 
      GROUP BY status
    `);

    const metrics = {
      pending: 0,
      claimed: 0,
      published: 0,
      failed: 0,
      dead_letter: 0,
      total: 0
    };

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const s = (row.status || "").toLowerCase();
        const cnt = Number(row.count || 0);
        if (s === "pending") metrics.pending = cnt;
        if (s === "claimed") metrics.claimed = cnt;
        if (s === "published") metrics.published = cnt;
        if (s === "failed") metrics.failed = cnt;
        if (s === "dead_letter") metrics.dead_letter = cnt;
        metrics.total += cnt;
      }
    }

    return metrics;
  }
};

export default outboxRepository;
