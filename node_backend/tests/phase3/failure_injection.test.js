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
import { sendOtpEmailHandler } from "../../src/jobs/handlers/send-otp-email.handler.js";
import { encryptPayload } from "../../src/utils/crypto.js";

describe("P3.4 — Failure Injection & Edge Case Resilience Test Suite", () => {
  const createdIds = [];
  const testJobIds = [];

  after(async () => {
    if (createdIds.length > 0) {
      const placeholders = createdIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdIds);
    }
    if (testJobIds.length > 0) {
      const placeholders = testJobIds.map(() => "?").join(",");
      await db.run(`DELETE FROM consumer_processed_jobs WHERE job_id IN (${placeholders})`, testJobIds);
    }
    await closePool();
  });

  it("should preserve outbox records in database when queue publication fails (Zero Data Loss)", async () => {
    const key = `resilience_fail_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9001",
      payload: { dummy: "data" },
      idempotencyKey: key
    });
    createdIds.push(id);

    const workerId = "worker_simulated_disconnect";
    await outboxRepository.claimPendingEvents(workerId, 10, 60);

    // Simulate network error during queue publish
    const networkError = new Error("ECONNREFUSED 127.0.0.1:6379");
    await outboxRepository.markFailed(id, workerId, networkError.message, true);

    const record = await outboxRepository.findById(id);
    assert.equal(record.status, "PENDING", "Must remain PENDING for subsequent retry");
    assert.equal(record.retry_count, 1);
    assert.ok(record.last_error.includes("ECONNREFUSED"), "Last error must be captured");
    assert.equal(record.claimed_by, null, "Claim must be released");
  });

  it("should enforce strict claim fencing when worker lease has expired (Zombie worker fenced out)", async () => {
    const key = `fencing_lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9002",
      payload: { dummy: "fencing_data" },
      idempotencyKey: key
    });
    createdIds.push(id);

    // Worker 1 claims with a lease
    const zombieWorkerId = "dispatcher_zombie_pid_9999";
    await outboxRepository.claimPendingEvents(zombieWorkerId, 10, 60);

    // Simulate elapsed lease time: set claimed_until in the past
    const isMysql = Boolean(process.env.MYSQL_HOST) || process.env.DB_CLIENT === "mysql";
    if (isMysql) {
      await db.run(
        "UPDATE outbox_events SET claimed_until = DATE_SUB(NOW(), INTERVAL 10 SECOND) WHERE id = ?",
        [id]
      );
    } else {
      await db.run(
        "UPDATE outbox_events SET claimed_until = datetime('now', '-10 seconds') WHERE id = ?",
        [id]
      );
    }

    // Zombie worker tries to mark published AFTER lease expired: MUST BE FENCED OUT (return false)
    const zombiePublishSuccess = await outboxRepository.markPublished(id, zombieWorkerId);
    assert.equal(zombiePublishSuccess, false, "Zombie worker with expired lease must be fenced out");

    // Zombie worker tries to mark failed AFTER lease expired: MUST BE FENCED OUT (return false)
    const zombieFailSuccess = await outboxRepository.markFailed(id, zombieWorkerId, "Zombie error", true);
    assert.equal(zombieFailSuccess, false, "Zombie worker with expired lease must not update failure state");

    // Survivor worker releases expired claims and claims the event
    const survivorWorkerId = "dispatcher_survivor_pid_10001";
    await outboxRepository.releaseExpiredClaims();

    const reClaimed = await outboxRepository.claimPendingEvents(survivorWorkerId, 10, 60);
    assert.ok(reClaimed.some((r) => r.id === id), "Survivor must claim the recovered event");

    // Survivor worker completes publication: MUST SUCCEED
    const survivorPublishSuccess = await outboxRepository.markPublished(id, survivorWorkerId);
    assert.equal(survivorPublishSuccess, true, "Survivor with active lease must successfully mark published");

    const finalRecord = await outboxRepository.findById(id);
    assert.equal(finalRecord.status, "PUBLISHED");
  });

  it("should enforce durable consumer idempotency across duplicate job deliveries", async () => {
    const testJobId = `job_dup_test_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    testJobIds.push(testJobId);

    const testEmail = `dup_consumer_${Date.now()}@example.com`;
    const encryptedPayload = encryptPayload({
      email: testEmail,
      otp: "123456",
      otpHash: "hash123",
      userId: 9003
    });

    // Create a mock OTP record in DB that is already consumed or non-existent
    // so handler returns cleanly without sending real email
    const jobData = {
      id: testJobId,
      data: {
        outboxEventId: 99991,
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        payload: encryptedPayload
      },
      attemptsMade: 0,
      opts: { attempts: 5 }
    };

    // First delivery execution
    const firstResult = await sendOtpEmailHandler(jobData);
    assert.ok(firstResult, "First execution must conclude");
    assert.notEqual(firstResult.duplicate, true, "First execution must not be flagged as duplicate");

    // Verify durable record was created in consumer_processed_jobs
    const record = await consumerIdempotencyRepository.findRecord(testJobId, "Send Password Reset OTP Email");
    assert.ok(record, "Durable consumer record must be persisted in database");
    assert.equal(record.status, "COMPLETED");

    // Second delivery of the EXACT SAME job (simulating queue redelivery / network replay)
    const secondResult = await sendOtpEmailHandler(jobData);
    assert.equal(secondResult.duplicate, true, "Second execution must be detected as duplicate");
    assert.equal(secondResult.skipped, true, "Duplicate delivery must be safely skipped without side effects");
    assert.equal(secondResult.reason, "ALREADY_PROCESSED");
  });

  it("should quarantine poison payloads to DEAD_LETTER and provide operator inspection & replay", async () => {
    const poisonKey = `poison_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9004",
      payload: {
        version: 1,
        iv: "corrupt_iv",
        authTag: "corrupt_tag",
        ciphertext: "corrupt_ciphertext"
      },
      idempotencyKey: poisonKey
    });
    createdIds.push(id);

    const poisonJobId = `job_poison_${Date.now()}`;
    testJobIds.push(poisonJobId);

    const poisonJob = {
      id: poisonJobId,
      data: {
        outboxEventId: id,
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        payload: {
          version: 1,
          iv: "corrupt_iv",
          authTag: "corrupt_tag",
          ciphertext: "corrupt_ciphertext"
        }
      },
      attemptsMade: 0,
      opts: { attempts: 5 }
    };

    // Worker processes poison job: must NOT throw unhandled error / must NOT crash worker process
    const res = await sendOtpEmailHandler(poisonJob);
    assert.equal(res.status, "DEAD_LETTER");
    assert.equal(res.reason, "PAYLOAD_DECRYPTION_FAILED");

    // Verify outbox record was persistently updated to DEAD_LETTER in database
    const dbRecord = await outboxRepository.findById(id);
    assert.equal(dbRecord.status, "DEAD_LETTER", "Outbox record must be persistently set to DEAD_LETTER");
    assert.ok(dbRecord.last_error.includes("Poison payload"), "Error details must be preserved for operator");

    // Operator visibility: getDeadLetterEvents must list this quarantined record
    const deadLetters = await outboxRepository.getDeadLetterEvents(10, 0);
    assert.ok(deadLetters.some((e) => e.id === id), "Operator must see the dead-lettered event in inspection query");

    // Operator replay: retryDeadLetterEvent moves it back to PENDING for re-processing
    const replayed = await outboxRepository.retryDeadLetterEvent(id);
    assert.equal(replayed, true, "Operator retry must successfully update record");

    const replayedRecord = await outboxRepository.findById(id);
    assert.equal(replayedRecord.status, "PENDING", "Replayed event must return to PENDING");
    assert.equal(replayedRecord.retry_count, 0, "Retry count must be reset to 0");
    assert.equal(replayedRecord.last_error, null, "Last error must be cleared");
  });

  it("should guarantee zero duplicate claims across multiple concurrent dispatchers", async () => {
    const keys = Array.from({ length: 10 }).map(
      (_, i) => `concurrent_key_${Date.now()}_${i}_${crypto.randomBytes(3).toString("hex")}`
    );

    const ids = [];
    for (let i = 0; i < 10; i++) {
      const id = await outboxRepository.createEvent({
        eventType: "CONCURRENT_DISPATCH_TEST",
        aggregateType: "Test",
        aggregateId: String(i),
        payload: { idx: i },
        idempotencyKey: keys[i]
      });
      ids.push(id);
      createdIds.push(id);
    }

    // 4 concurrent dispatchers attempting to claim events simultaneously
    const dispatchers = ["disp_1", "disp_2", "disp_3", "disp_4"];
    const results = await Promise.all(
      dispatchers.map((workerId) => outboxRepository.claimPendingEvents(workerId, 10, 30))
    );

    const allClaimedIds = results.flatMap((batch) => batch.map((item) => item.id));
    const uniqueClaimedIds = new Set(allClaimedIds);

    // Every claimed ID must be distinct: zero overlap across concurrent dispatchers!
    assert.equal(
      allClaimedIds.length,
      uniqueClaimedIds.size,
      "Every claimed outbox ID must be uniquely assigned to exactly 1 dispatcher with zero duplicates"
    );

    // Mark all published to clean up
    for (let i = 0; i < dispatchers.length; i++) {
      const workerId = dispatchers[i];
      for (const event of results[i]) {
        await outboxRepository.markPublished(event.id, workerId);
      }
    }
  });
});
