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
   * Enforces that only the worker holding the active claim (or a recovery worker) can finalize it.
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
      WHERE id = ? AND (claimed_by = ? OR claimed_by IS NULL)
    `;

    const result = await db.run(sql, [id, workerId], tx);
    return result.changes > 0;
  },

  /**
   * Mark an outbox event as failed during publication.
   * If `willRetry` is true, resets status to 'PENDING' so it can be reclaimed later.
   * If `willRetry` is false, marks as 'FAILED' (dead-letter).
   */
  async markFailed(id, workerId, errorMessage, willRetry = true, tx = null) {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const nowExpr = isMysql ? "NOW()" : "datetime('now')";
    const nextStatus = willRetry ? "PENDING" : "FAILED";

    const sql = `
      UPDATE outbox_events 
      SET status = ?, 
          last_error = ?, 
          retry_count = retry_count + 1,
          claimed_by = NULL, 
          claimed_until = NULL,
          updated_at = ${nowExpr}
      WHERE id = ? AND (claimed_by = ? OR claimed_by IS NULL)
    `;

    const sanitizedError = errorMessage ? String(errorMessage).slice(0, 1000) : "Unknown dispatch error";
    const result = await db.run(sql, [nextStatus, sanitizedError, id, workerId], tx);
    return result.changes > 0;
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
        metrics.total += cnt;
      }
    }

    return metrics;
  }
};

export default outboxRepository;
