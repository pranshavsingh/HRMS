# HRMS SaaS — Milestone M3.2 Failure Injection & Resilience Report
## Distributed Failure Modes, Edge Case Verification & Recovery Semantics

**Target System:** Transactional Outbox & BullMQ Distributed Processing Engine  
**Test Suite:** `tests/phase3/failure_injection.test.js`  
**Evaluation Standard:** Zero Data Loss, At-Least-Once Delivery, Idempotent Processing, Crash Resilience

---

## 1. Failure Scenarios Tested & Verified

### Scenario 1: Redis Disconnection / Outage During Queue Dispatch (Zero Data Loss)
- **Failure Injected:** Outbox dispatcher successfully claims pending records from MySQL, but when attempting to publish jobs to Redis via `queueProducerService.addJob()`, an `ECONNREFUSED` network partition is encountered.
- **Expected Behavior:** Outbox events must never be marked `PUBLISHED`. Claims must be un-assigned (`claimed_by = NULL`, `lease_expires_at = NULL`), `retry_count` incremented, `last_error` recorded, and status maintained as `PENDING` for retry once Redis restores.
- **Verification Evidence:**
  ```javascript
  const record = await outboxRepository.findById(id);
  assert.equal(record.status, "PENDING");
  assert.equal(record.retry_count, 1);
  assert.ok(record.last_error.includes("ECONNREFUSED"));
  assert.equal(record.claimed_by, null);
  ```
- **Result:** **PASSED**. Zero data loss observed.

---

### Scenario 2: Strict Lease Expiry & Zombie Worker Fencing
- **Failure Injected:** A worker instance claims an event with a 60-second lease, assigning `claimed_by = 'dispatcher_zombie_pid_9999'` and `claimed_until = NOW() + 60s`. The worker experiences an unexpected freeze or GC pause, during which its lease expires.
- **Expected Behavior:** When the zombie worker awakens and attempts to call `markPublished(id, zombieWorkerId)` or `markFailed(id, zombieWorkerId)`, it must be strictly fenced out (`result.changes === 0`). Survivor workers can reclaim the event, and only the active lease holder can mark the event published.
- **Verification Evidence:**
  ```javascript
  // Zombie worker tries to mark published after lease expired
  const zombieSuccess = await outboxRepository.markPublished(id, zombieWorkerId);
  assert.equal(zombieSuccess, false, "Zombie worker with expired lease must be fenced out");

  // Survivor worker claims event and finalizes publication
  await outboxRepository.releaseExpiredClaims();
  await outboxRepository.claimPendingEvents(survivorWorkerId, 10, 60);
  const survivorSuccess = await outboxRepository.markPublished(id, survivorWorkerId);
  assert.equal(survivorSuccess, true);
  ```
- **Result:** **PASSED**. Zombie worker fenced out; survivor cleanly completes.

---

### Scenario 3: At-Least-Once Delivery & Durable Consumer Idempotency
- **Failure Injected:** A BullMQ queue job is redelivered or published twice with the same `jobId`, simulating network acknowledgment loss or queue duplicate redelivery.
- **Expected Behavior:** `sendOtpEmailHandler` claims the job execution token in `consumer_processed_jobs`. The first delivery executes and records `status = 'COMPLETED'`. The second delivery detects the existing claim, immediately skips execution without sending a duplicate email, and returns `{ duplicate: true, skipped: true, reason: 'ALREADY_PROCESSED' }`.
- **Verification Evidence:**
  ```javascript
  const firstResult = await sendOtpEmailHandler(jobData);
  assert.notEqual(firstResult.duplicate, true);

  const secondResult = await sendOtpEmailHandler(jobData);
  assert.equal(secondResult.duplicate, true);
  assert.equal(secondResult.skipped, true);
  assert.equal(secondResult.reason, "ALREADY_PROCESSED");
  ```
- **Result:** **PASSED**. Zero duplicate side-effects observed.

---

### Scenario 4: Corrupted / Malformed Payload Injection (Poison Pill Quarantine & Replay)
- **Failure Injected:** An unparseable or corrupted payload (tampered ciphertext / invalid authTag) is processed by the worker.
- **Expected Behavior:** The background worker does NOT crash. The outbox record in `outbox_events` is persistently transitioned to `DEAD_LETTER` with `last_error` capturing the failure reason. Operators can inspect the event via `outboxRepository.getDeadLetterEvents()` and replay it using `outboxRepository.retryDeadLetterEvent()`.
- **Verification Evidence:**
  ```javascript
  const res = await sendOtpEmailHandler(poisonJob);
  assert.equal(res.status, "DEAD_LETTER");

  const dbRecord = await outboxRepository.findById(id);
  assert.equal(dbRecord.status, "DEAD_LETTER");

  const deadLetters = await outboxRepository.getDeadLetterEvents(10, 0);
  assert.ok(deadLetters.some((e) => e.id === id));

  const replayed = await outboxRepository.retryDeadLetterEvent(id);
  assert.equal(replayed, true);
  ```
- **Result:** **PASSED**. Poison message persistently quarantined and operator replay verified.

---

### Scenario 4: Competing Concurrent Dispatcher Instances (Zero Duplicate Claims)
- **Failure Injected:** Four independent dispatcher instances (`dispatcher_alpha`, `dispatcher_beta`, `dispatcher_gamma`, `dispatcher_delta`) poll MySQL simultaneously to claim from a pool of 20 pending events.
- **Expected Behavior:** MySQL's `FOR UPDATE SKIP LOCKED` guarantees that each record is claimed by exactly one dispatcher. No record appears in more than one claim set, ensuring zero double-processing.
- **Verification Evidence:**
  ```javascript
  const results = await Promise.all([
    outboxRepository.claimPendingEvents("dispatcher_alpha", 10, 60),
    outboxRepository.claimPendingEvents("dispatcher_beta", 10, 60),
    outboxRepository.claimPendingEvents("dispatcher_gamma", 10, 60),
    outboxRepository.claimPendingEvents("dispatcher_delta", 10, 60)
  ]);
  const allClaimedIds = results.flatMap((r) => r.map((e) => e.id));
  const uniqueClaimedIds = new Set(allClaimedIds);
  assert.equal(allClaimedIds.length, uniqueClaimedIds.size);
  ```
- **Result:** **PASSED**. Exactly zero duplicate claims across all 4 competing workers.

---

### Scenario 5: Superseded / Already-Consumed OTP Notification Race
- **Failure Injected:** A user requests an OTP, then immediately enters it or requests a new one before the asynchronous email worker processes the initial event.
- **Expected Behavior:** When the worker job runs, it validates the current database state (`password_reset_otp.is_consumed = 1` or `created_at < latest_otp_created_at`). If stale or consumed, the handler safely skips sending the email.
- **Verification Evidence:**
  ```javascript
  const res = await sendOtpEmailHandler({
    id: "job_superseded",
    data: {
      outboxId: testId,
      encryptedPayload: encryptPayload({ email: testEmail, otp: "123456", userId: testUserId })
    }
  });
  assert.equal(res.status, "SKIPPED");
  assert.equal(res.reason, "OTP_SUPERSEDED_OR_ALREADY_CONSUMED");
  ```
- **Result:** **PASSED**. Obsolete emails are never delivered to the user.

---

## 2. Summary of Resilience Guarantees

| Invariant | Guarantee Level | Implementation Mechanism |
| :--- | :---: | :--- |
| **At-Least-Once Delivery** | Guaranteed | Outbox table persists until Redis acknowledges receipt. |
| **Deduplicated Enqueue** | Guaranteed | Deterministic BullMQ `jobId: outbox_<id>`. |
| **Single-Owner Row Claiming** | Guaranteed | MySQL 8.0 `FOR UPDATE SKIP LOCKED`. |
| **Crash Recovery** | Guaranteed | Automatic lease expiry sweeper (`lease_expires_at`). |
| **Poison Pill Isolation** | Guaranteed | Worker try/catch quarantine to `DEAD_LETTER`. |
| **Stale Dispatch Prevention** | Guaranteed | Worker state validation against `password_reset_otp`. |
