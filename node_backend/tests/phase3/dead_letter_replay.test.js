import { describe, it, before, after } from "node:test";
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
import deadLetterService from "../../src/services/dead-letter.service.js";

describe("P3.6 — Dead-Letter Management, Operator Replay & Retention Suite", () => {
  const createdOutboxIds = [];
  const testJobIds = [];

  after(async () => {
    if (createdOutboxIds.length > 0) {
      const placeholders = createdOutboxIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdOutboxIds);
      await db.run(`DELETE FROM audit_logs WHERE action = 'OUTBOX_DEAD_LETTER_REPLAY' AND target_id IN (${placeholders})`, createdOutboxIds);
    }
    if (testJobIds.length > 0) {
      const placeholders = testJobIds.map(() => "?").join(",");
      await db.run(`DELETE FROM consumer_processed_jobs WHERE job_id IN (${placeholders})`, testJobIds);
    }
    await closePool();
  });

  it("should list dead-letter events with sanitized metadata and ZERO sensitive payload exposure", async () => {
    const key = `dlq_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "8001",
      payload: { sensitiveOtp: "999888", confidentialToken: "secret_123" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    // Quarantine event to DEAD_LETTER
    await outboxRepository.markDeadLetter(id, "Simulated poison message quarantine");

    const deadLetters = await deadLetterService.listDeadLetters(10, 0);
    const target = deadLetters.find((e) => e.id === id);

    assert.ok(target, "Dead letter event must appear in operator listing");
    assert.equal(target.status, "DEAD_LETTER");
    assert.equal(target.retryCount, 0);
    assert.ok(target.lastError.includes("Simulated poison message"));

    // Verify ZERO sensitive payload fields in returned object
    assert.equal(target.payload, undefined, "Raw payload must not be exposed in operator list");
    assert.equal(target.sensitiveOtp, undefined, "Sensitive OTP must never leak");
    assert.equal(target.confidentialToken, undefined, "Tokens must never leak");
  });

  it("should provide safe event detail with payload presence flag without leaking contents", async () => {
    const key = `dlq_detail_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "8002",
      payload: { token: "super_secret_payload" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    await outboxRepository.markDeadLetter(id, "Poison payload verification");

    const detail = await deadLetterService.getDeadLetterDetail(id);
    assert.ok(detail);
    assert.equal(detail.id, id);
    assert.equal(detail.hasPayload, true);
    assert.equal(detail.payload, undefined, "Payload object must not be serialized to operator");
  });

  it("should record forensic audit log when operator replays a dead-letter event", async () => {
    const key = `dlq_audit_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "8003",
      payload: { test: "data" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    await outboxRepository.markDeadLetter(id, "Simulated transient network exhaustion");

    const operatorName = "senior_ops_engineer_alice";
    const replayReason = "Upstream network link restored. Re-queueing event for dispatch.";

    const replayResult = await deadLetterService.replayEvent(id, operatorName, replayReason);
    assert.equal(replayResult.success, true);
    assert.equal(replayResult.eventId, id);

    // Verify outbox state returned to PENDING
    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PENDING");
    assert.equal(record.retry_count, 0);
    assert.equal(record.last_error, null);

    // Verify permanent forensic audit trail was written to audit_logs
    const auditRow = await db.get(
      "SELECT * FROM audit_logs WHERE action = 'OUTBOX_DEAD_LETTER_REPLAY' AND target_id = ? ORDER BY id DESC LIMIT 1",
      [String(id)]
    );
    assert.ok(auditRow, "Audit trail entry must exist for operator replay");
    assert.equal(auditRow.username, operatorName);
    assert.equal(auditRow.severity, "WARNING");

    const details = JSON.parse(auditRow.details);
    assert.equal(details.operatorReason, replayReason);
    assert.ok(details.previousError.includes("network exhaustion"));
  });

  it("should reject replay attempts for already-PUBLISHED events (Protection Against Duplicate Business Operations)", async () => {
    const key = `dlq_reject_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "8004",
      payload: { dummy: "val" },
      idempotencyKey: key
    });
    createdOutboxIds.push(id);

    // Directly mark event as PUBLISHED in database
    await db.run("UPDATE outbox_events SET status = 'PUBLISHED' WHERE id = ?", [id]);

    // Operator attempts to replay published event
    const res = await deadLetterService.replayEvent(id, "operator_bob", "Accidental replay attempt");
    assert.equal(res.success, false);
    assert.equal(res.reason, "ALREADY_PUBLISHED", "Must reject replaying already completed events");
  });

  it("should enforce retention policy by purging published events and completed consumer receipts older than threshold", async () => {
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";

    // 1. Create outbox event marked as published 10 days ago
    const oldOutboxKey = `retention_outbox_${Date.now()}`;
    const oldOutboxId = await outboxRepository.createEvent({
      eventType: "OLD_EVENT",
      aggregateType: "Test",
      aggregateId: "1",
      payload: { old: true },
      idempotencyKey: oldOutboxKey
    });
    createdOutboxIds.push(oldOutboxId);

    const oldDateExpr = isMysql ? "DATE_SUB(NOW(), INTERVAL 10 DAY)" : "datetime('now', '-10 days')";
    await db.run(
      `UPDATE outbox_events SET status = 'PUBLISHED', updated_at = ${oldDateExpr} WHERE id = ?`,
      [oldOutboxId]
    );

    // 2. Create consumer processed job completed 10 days ago
    const oldJobId = `job_retention_${Date.now()}`;
    testJobIds.push(oldJobId);
    await consumerIdempotencyRepository.claimExecution(oldJobId, "OldHandler", "worker1", 60);
    await consumerIdempotencyRepository.completeExecution(oldJobId, "OldHandler", "worker1", 1, { old: true });
    await db.run(
      `UPDATE consumer_processed_jobs SET updated_at = ${oldDateExpr} WHERE job_id = ?`,
      [oldJobId]
    );

    // 3. Execute retention purge (7 days threshold)
    const purgedOutbox = await outboxRepository.purgeOldPublishedEvents(7);
    const purgedConsumer = await consumerIdempotencyRepository.purgeOldCompletedJobs(7);

    assert.ok(purgedOutbox >= 1, "Must purge outbox events older than 7 days");
    assert.ok(purgedConsumer >= 1, "Must purge consumer jobs older than 7 days");

    // Verify records were removed
    const checkOutbox = await outboxRepository.findById(oldOutboxId);
    assert.equal(checkOutbox, undefined, "Old published outbox record must be purged");

    const checkConsumer = await consumerIdempotencyRepository.findRecord(oldJobId, "OldHandler");
    assert.equal(checkConsumer, undefined, "Old completed consumer record must be purged");
  });
});
