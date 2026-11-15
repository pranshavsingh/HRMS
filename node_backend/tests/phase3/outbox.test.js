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
import outboxDispatcherService from "../../src/services/outbox-dispatcher.service.js";

describe("P3.1 — Transactional Outbox Repository & Dispatcher Test Suite", () => {
  const createdIds = [];

  after(async () => {
    if (createdIds.length > 0) {
      const placeholders = createdIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdIds);
    }
    await closePool();
  });

  it("should insert outbox event with status PENDING and valid JSON payload", async () => {
    const key = `test_key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "TEST_EVENT_CREATED",
      aggregateType: "TestAggregate",
      aggregateId: "1001",
      payload: { hello: "world", count: 42 },
      idempotencyKey: key
    });

    assert.ok(id > 0, "Event ID must be positive integer");
    createdIds.push(id);

    const event = await outboxRepository.findById(id);
    assert.equal(event.event_type, "TEST_EVENT_CREATED");
    assert.equal(event.aggregate_type, "TestAggregate");
    assert.equal(event.aggregate_id, "1001");
    assert.equal(event.status, "PENDING");
    assert.equal(event.retry_count, 0);

    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    assert.equal(payload.hello, "world");
    assert.equal(payload.count, 42);
  });

  it("should enforce unique idempotency constraint and reject duplicate keys", async () => {
    const key = `duplicate_key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id1 = await outboxRepository.createEvent({
      eventType: "TEST_DUP",
      aggregateType: "User",
      aggregateId: "1",
      payload: { attempt: 1 },
      idempotencyKey: key
    });
    createdIds.push(id1);

    await assert.rejects(
      async () => {
        await outboxRepository.createEvent({
          eventType: "TEST_DUP",
          aggregateType: "User",
          aggregateId: "1",
          payload: { attempt: 2 },
          idempotencyKey: key
        });
      },
      /Duplicate entry|ER_DUP_ENTRY|UNIQUE constraint failed/i
    );
  });

  it("should atomically claim pending events and prevent competing worker claims", async () => {
    const key1 = `claim_key1_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const key2 = `claim_key2_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const id1 = await outboxRepository.createEvent({
      eventType: "TEST_CLAIM_1",
      aggregateType: "Test",
      aggregateId: "1",
      payload: { data: 1 },
      idempotencyKey: key1
    });
    const id2 = await outboxRepository.createEvent({
      eventType: "TEST_CLAIM_2",
      aggregateType: "Test",
      aggregateId: "2",
      payload: { data: 2 },
      idempotencyKey: key2
    });
    createdIds.push(id1, id2);

    const workerA = "worker_alpha";
    const workerB = "worker_beta";

    // Worker A claims batch of 50
    const claimedByA = await outboxRepository.claimPendingEvents(workerA, 50, 30);
    const claimedIdsA = claimedByA.map((e) => e.id);

    assert.ok(claimedIdsA.includes(id1), "Worker A should claim id1");
    assert.ok(claimedIdsA.includes(id2), "Worker A should claim id2");

    // Worker B attempts to claim immediately: should get 0 of the items claimed by Worker A
    const claimedByB = await outboxRepository.claimPendingEvents(workerB, 50, 30);
    const claimedIdsB = claimedByB.map((e) => e.id);

    assert.ok(!claimedIdsB.includes(id1), "Worker B must not claim id1 (already held by Worker A)");
    assert.ok(!claimedIdsB.includes(id2), "Worker B must not claim id2 (already held by Worker A)");
  });

  it("should successfully mark event published only by the claiming worker", async () => {
    const key = `publish_key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "TEST_PUBLISH",
      aggregateType: "Test",
      aggregateId: "1",
      payload: { test: true },
      idempotencyKey: key
    });
    createdIds.push(id);

    const workerA = "worker_alpha";
    const workerB = "worker_imposter";

    await outboxRepository.claimPendingEvents(workerA, 10, 60);

    // Imposter worker B attempts to mark published -> should fail (0 changes)
    const imposterSuccess = await outboxRepository.markPublished(id, workerB);
    assert.equal(imposterSuccess, false, "Imposter worker must not be able to mark published");

    // Claiming worker A marks published -> should succeed
    const legitSuccess = await outboxRepository.markPublished(id, workerA);
    assert.equal(legitSuccess, true, "Claiming worker must successfully mark published");

    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PUBLISHED");
    assert.ok(record.published_at, "published_at must be populated");
    assert.equal(record.claimed_by, null, "claimed_by must be cleared");
  });

  it("should automatically recover expired claims", async () => {
    const key = `expired_key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "TEST_EXPIRED",
      aggregateType: "Test",
      aggregateId: "1",
      payload: { test: true },
      idempotencyKey: key
    });
    createdIds.push(id);

    // Claim with lease of -5 seconds (already expired)
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    if (isMysql) {
      await db.run(
        "UPDATE outbox_events SET status = 'CLAIMED', claimed_by = 'crashed_worker', claimed_until = DATE_SUB(NOW(), INTERVAL 5 SECOND) WHERE id = ?",
        [id]
      );
    } else {
      await db.run(
        "UPDATE outbox_events SET status = 'CLAIMED', claimed_by = 'crashed_worker', claimed_until = datetime('now', '-5 seconds') WHERE id = ?",
        [id]
      );
    }

    // Release expired claims
    const released = await outboxRepository.releaseExpiredClaims();
    assert.ok(released >= 1, "Should have released at least 1 expired claim");

    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PENDING", "Expired claim must be reset to PENDING");
    assert.equal(record.claimed_by, null, "claimed_by must be cleared");
  });

  it("should record failed attempts and allow bounded retries", async () => {
    const key = `fail_key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "TEST_FAIL_RETRY",
      aggregateType: "Test",
      aggregateId: "1",
      payload: { test: true },
      idempotencyKey: key
    });
    createdIds.push(id);

    const workerId = "worker_error_test";
    await outboxRepository.claimPendingEvents(workerId, 10, 60);

    // Mark failed with willRetry = true
    await outboxRepository.markFailed(id, workerId, "Temporary network timeout", true);

    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PENDING", "Should reset to PENDING when willRetry is true");
    assert.equal(record.retry_count, 1, "retry_count should be 1");
    assert.ok(record.last_error.includes("Temporary network timeout"));

    // Next failure marked with willRetry = false (dead letter)
    await outboxRepository.claimPendingEvents(workerId, 10, 60);
    await outboxRepository.markFailed(id, workerId, "Fatal corrupt payload", false);

    const finalRecord = await outboxRepository.findById(id);
    assert.equal(finalRecord.status, "DEAD_LETTER", "Should be DEAD_LETTER when willRetry is false");
    assert.equal(finalRecord.retry_count, 2);
  });
});
