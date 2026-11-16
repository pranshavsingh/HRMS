import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { db, closePool } from "../../src/db/index.js";
import outboxRepository from "../../src/repositories/outbox.repository.js";
import consumerIdempotencyRepository from "../../src/repositories/consumer-idempotency.repository.js";
import reconciliationService from "../../src/services/reconciliation.service.js";

describe("P3.8 — Published-But-Unprocessed Job Reconciliation Test Suite", () => {
  const createdOutboxIds = [];
  const createdJobIds = [];

  after(async () => {
    if (createdOutboxIds.length > 0) {
      const placeholders = createdOutboxIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdOutboxIds);
    }
    if (createdJobIds.length > 0) {
      const placeholders = createdJobIds.map(() => "?").join(",");
      await db.run(`DELETE FROM consumer_processed_jobs WHERE job_id IN (${placeholders})`, createdJobIds);
    }
    await closePool();
  });

  it("should detect stalled published event lacking consumer receipt and reset to PENDING", async () => {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const key = `reconcile_stall_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // 1. Create an outbox event
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9090",
      payload: { dummy: "reconciliation_test" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    // 2. Mark it as PUBLISHED in the past (e.g. 20 minutes ago) to simulate a lost BullMQ job
    if (isMysql) {
      await db.run(
        `UPDATE outbox_events 
         SET status = 'PUBLISHED', 
             published_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE), 
             claimed_by = NULL, 
             claimed_until = NULL 
         WHERE id = ?`,
        [id]
      );
    } else {
      await db.run(
        `UPDATE outbox_events 
         SET status = 'PUBLISHED', 
             published_at = datetime('now', '-20 minutes'), 
             claimed_by = NULL, 
             claimed_until = NULL 
         WHERE id = ?`,
        [id]
      );
    }

    // 3. Run reconciliation with a 15-minute threshold
    const result = await reconciliationService.reconcileUnprocessedJobs(15);
    assert.ok(result.recovered >= 1, "At least 1 stalled event must be recovered");
    assert.ok(result.stalledIds.includes(id), "Recovered IDs must include our test event ID");

    // 4. Verify that outbox event status is reset to PENDING with cleared claims
    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PENDING", "Stalled event must be reset to PENDING");
    assert.equal(record.published_at, null);
    assert.equal(record.claimed_by, null);
    assert.ok(record.last_error.includes("Reconciled"), "Must note reconciliation in last_error");

    // 5. Verify audit log entry
    const auditRow = await db.get(
      "SELECT * FROM audit_logs WHERE action = 'OUTBOX_STALLED_JOB_RECONCILED' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(auditRow, "Audit log entry must be recorded for reconciliation");
    assert.ok(auditRow.details.includes(String(id)));
  });

  it("should NOT touch published events that have COMPLETED consumer receipts", async () => {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    const key = `reconcile_healthy_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9091",
      payload: { dummy: "healthy_job" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    // Mark as published 30 minutes ago
    if (isMysql) {
      await db.run(
        `UPDATE outbox_events 
         SET status = 'PUBLISHED', 
             published_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE) 
         WHERE id = ?`,
        [id]
      );
    } else {
      await db.run(
        `UPDATE outbox_events 
         SET status = 'PUBLISHED', 
             published_at = datetime('now', '-30 minutes') 
         WHERE id = ?`,
        [id]
      );
    }

    // Insert COMPLETED receipt in consumer_processed_jobs
    const jobId = `outbox_${id}`;
    createdJobIds.push(jobId);
    await consumerIdempotencyRepository.claimExecution(jobId, "Send Password Reset OTP Email", "worker_test", 60);
    await consumerIdempotencyRepository.completeExecution(jobId, "Send Password Reset OTP Email", "worker_test", 1, { success: true });

    // Run reconciliation
    const result = await reconciliationService.reconcileUnprocessedJobs(15);
    assert.ok(!result.stalledIds.includes(id), "Completed event must NOT be recovered");

    // Verify status remains PUBLISHED
    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PUBLISHED");
  });
});
