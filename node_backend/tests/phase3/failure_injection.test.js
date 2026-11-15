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
import { sendOtpEmailHandler } from "../../src/jobs/handlers/send-otp-email.handler.js";

describe("P3.4 — Failure Injection & Edge Case Resilience Test Suite", () => {
  const createdIds = [];

  after(async () => {
    if (createdIds.length > 0) {
      const placeholders = createdIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdIds);
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

  it("should safely recover from simulated dispatcher crash after claim", async () => {
    const key = `resilience_crash_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const id = await outboxRepository.createEvent({
      eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
      aggregateType: "User",
      aggregateId: "9002",
      payload: { dummy: "crash_data" },
      idempotencyKey: key
    });
    createdIds.push(id);

    // Dispatcher 1 claims the record, then crashes (process killed)
    const crashedDispatcherId = "dispatcher_crashed_pid_9999";
    await outboxRepository.claimPendingEvents(crashedDispatcherId, 10, 60);

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

    // Dispatcher 2 starts up, runs claim recovery
    const survivorDispatcherId = "dispatcher_survivor_pid_10001";
    const released = await outboxRepository.releaseExpiredClaims();
    assert.ok(released >= 1, "Survivor must release the crashed dispatcher's claim");

    // Dispatcher 2 successfully re-claims the stranded record
    const reClaimed = await outboxRepository.claimPendingEvents(survivorDispatcherId, 10, 60);
    const reClaimedIds = reClaimed.map((r) => r.id);
    assert.ok(reClaimedIds.includes(id), "Survivor dispatcher must successfully claim the recovered record");

    // Finalize
    await outboxRepository.markPublished(id, survivorDispatcherId);
    const finalRecord = await outboxRepository.findById(id);
    assert.equal(finalRecord.status, "PUBLISHED");
  });

  it("should quarantine malformed or corrupted encrypted payloads without crashing worker", async () => {
    const poisonJob = {
      id: "poison_pill_job_1",
      data: {
        outboxEventId: 8888,
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        payload: {
          version: 1,
          iv: "bad_iv",
          authTag: "bad_tag",
          ciphertext: "bad_ciphertext"
        }
      },
      attemptsMade: 0,
      opts: { attempts: 5 }
    };

    await assert.rejects(
      async () => {
        await sendOtpEmailHandler(poisonJob);
      },
      /Non-retryable poison payload/i,
      "Worker must throw explicit non-retryable error on corrupted payload"
    );
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
