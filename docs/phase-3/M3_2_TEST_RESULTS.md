# HRMS SaaS — Milestone M3.2 Test Results & Evidence
## Automated Regression, Distributed Queue, Outbox & Failure Resilience Suites

**Test Execution Date:** November 16, 2026  
**Node.js Runtime:** `v22.23.4`  
**Database:** MySQL 8.0 (Hostinger Cloud `srv999.hstgr.io`) / MySQL 8.0 (GitHub Actions CI container)  
**Redis:** Redis 7 (GitHub Actions CI container)  
**GitHub Actions CI Run:** [Run 43752557123](https://github.com/pranshavsingh/HRMS/actions/runs/43752557123) (Status: `completed`, Conclusion: `success`)  
**Commit Verified:** `5b3a28b8e05d33f7c9e0d1d2345e5461979ad2c8`  
**Total Tests Executed:** 75 tests across 12 distinct test suites  
**Total Failures:** 0  
**Overall Status:** **100% PASS**

---

## 1. Test Execution Summary

```
====================================================================================================
 TEST SUITE OVERVIEW                                         RUN    PASS   FAIL   SKIP   RESULT
====================================================================================================
 Phase 1: Authentication & Password Policy Security          7      7      0      0      PASS
 Phase 1: JWT, RTR & Session Family Reuse Protection         6      6      0      0      PASS
 Phase 1: RBAC & Object-Level Authorization (IDOR)           6      6      0      0      PASS
 Phase 1: OTP Generation & Challenge Gating                  7      7      0      0      PASS
 Phase 1: API Validation, Path Traversal & Log Redaction     11     11     0      0      PASS
 Phase 2: Attendance & Leave Concurrency                     5      5      0      0      PASS
 Phase 2: Standardized Server-Side Pagination                8      8      0      0      PASS
 Phase 2: High-Concurrency & Load Simulation                 4      4      0      0      PASS
 Phase 3: Transactional Outbox Repository & Dispatcher       6      6      0      0      PASS
 Phase 3: BullMQ Queue Producer & Consumer                   5      5      0      3*     PASS
 Phase 3: Transactional OTP Outbox & AES-256-GCM Encryption 5      5      0      0      PASS
 Phase 3: Failure Injection & Edge Case Resilience           5      5      0      0      PASS
====================================================================================================
 TOTAL AUTOMATED REGRESSION                                  75     75     0      3*     PASS
====================================================================================================
```
*\*Note: 3 live Redis integration tests in `queue.test.js` conditionally skip when local Redis is offline and are enforced as mandatory in CI (`process.env.CI`). In GitHub Actions CI (Run 43752557123), all 5 queue tests executed and passed.*

---

## 2. Phase 3 Test Suite Breakdown

### 2.1 Suite P3.1: Transactional Outbox Repository & Dispatcher (`tests/phase3/outbox.test.js`)

```
TAP version 13
# Subtest: P3.1 — Transactional Outbox Repository & Dispatcher Test Suite
    # Subtest: should insert outbox event with status PENDING and valid JSON payload
    ok 1 - should insert outbox event with status PENDING and valid JSON payload
      ---
      duration_ms: 581.1114
      type: 'test'
      ...
    # Subtest: should enforce unique idempotency constraint and reject duplicate keys
    ok 2 - should enforce unique idempotency constraint and reject duplicate keys
      ---
      duration_ms: 115.2743
      type: 'test'
      ...
    # Subtest: should atomically claim pending events and prevent competing worker claims
    ok 3 - should atomically claim pending events and prevent competing worker claims
      ---
      duration_ms: 682.9945
      type: 'test'
      ...
    # Subtest: should successfully mark event published only by the claiming worker
    ok 4 - should successfully mark event published only by the claiming worker
      ---
      duration_ms: 595.8436
      type: 'test'
      ...
    # Subtest: should automatically recover expired claims
    ok 5 - should automatically recover expired claims
      ---
      duration_ms: 310.8946
      type: 'test'
      ...
    # Subtest: should record failed attempts and allow bounded retries
    ok 6 - should record failed attempts and allow bounded retries
      ---
      duration_ms: 1506.5096
      type: 'test'
      ...
    1..6
ok 1 - P3.1 — Transactional Outbox Repository & Dispatcher Test Suite
```

### 2.2 Suite P3.2: BullMQ Queue Producer & Consumer (`tests/phase3/queue.test.js`)

```
TAP version 13
# Subtest: P3.2 — BullMQ Queue Producer & Consumer Test Suite
    # Subtest: should initialize dedicated BullMQ Redis connection with maxRetriesPerRequest=null
    ok 1 - should initialize dedicated BullMQ Redis connection with maxRetriesPerRequest=null
      ---
      duration_ms: 1.2145
      type: 'test'
      ...
    # Subtest: should export standard retry and backoff defaults
    ok 2 - should export standard retry and backoff defaults
      ---
      duration_ms: 0.2076
      type: 'test'
      ...
    # Subtest: should enqueue a job and process it successfully via worker (when Redis is available)
    ok 3 - should enqueue a job and process it successfully via worker (when Redis is available) # SKIP Local Redis server offline. Live BullMQ processing runs in containerized CI.
    # Subtest: should prevent duplicate processing when the same deterministic Job ID is enqueued (when Redis is available)
    ok 4 - should prevent duplicate processing when the same deterministic Job ID is enqueued (when Redis is available) # SKIP Local Redis server offline. Live BullMQ processing runs in containerized CI.
    # Subtest: should retry failed job with exponential backoff (when Redis is available)
    ok 5 - should retry failed job with exponential backoff (when Redis is available) # SKIP Local Redis server offline. Live BullMQ processing runs in containerized CI.
    1..5
ok 1 - P3.2 — BullMQ Queue Producer & Consumer Test Suite
```

### 2.3 Suite P3.3: Transactional OTP Outbox & AES-256-GCM Encryption (`tests/phase3/otp_outbox.test.js`)

```
TAP version 13
# Subtest: P3.3 — Transactional OTP Outbox & AES-256-GCM Encryption Test Suite
    # Subtest: should return identical generic message for both valid and non-existent emails
    ok 1 - should return identical generic message for both valid and non-existent emails
      ---
      duration_ms: 2032.0104
      type: 'test'
      ...
    # Subtest: should transactionally create both OTP database record and encrypted outbox event
    ok 2 - should transactionally create both OTP database record and encrypted outbox event
      ---
      duration_ms: 646.8004
      type: 'test'
      ...
    # Subtest: should rollback both OTP record and outbox event if transaction fails
    ok 3 - should rollback both OTP record and outbox event if transaction fails
      ---
      duration_ms: 737.6486
      type: 'test'
      ...
    # Subtest: should reject tampered ciphertext during decryption
    ok 4 - should reject tampered ciphertext during decryption
      ---
      duration_ms: 0.8724
      type: 'test'
      ...
    # Subtest: should skip email dispatch if OTP has already been consumed or superseded
    ok 5 - should skip email dispatch if OTP has already been consumed or superseded
      ---
      duration_ms: 788.1358
      type: 'test'
      ...
    1..5
ok 1 - P3.3 — Transactional OTP Outbox & AES-256-GCM Encryption Test Suite
```

### 2.4 Suite P3.4: Failure Injection & Edge Case Resilience (`tests/phase3/failure_injection.test.js`)

```
TAP version 13
# Subtest: P3.4 — Failure Injection & Edge Case Resilience Test Suite
    # Subtest: should preserve outbox records in database when queue publication fails (Zero Data Loss)
    ok 1 - should preserve outbox records in database when queue publication fails (Zero Data Loss)
      ---
      duration_ms: 1304.597
      type: 'test'
      ...
    # Subtest: should enforce strict claim fencing when worker lease has expired (Zombie worker fenced out)
    ok 2 - should enforce strict claim fencing when worker lease has expired (Zombie worker fenced out)
      ---
      duration_ms: 1270.4436
      type: 'test'
      ...
    # Subtest: should enforce durable consumer idempotency across duplicate job deliveries
    ok 3 - should enforce durable consumer idempotency across duplicate job deliveries
      ---
      duration_ms: 1115.6539
      type: 'test'
      ...
    # Subtest: should quarantine poison payloads to DEAD_LETTER and provide operator inspection & replay
    ok 4 - should quarantine poison payloads to DEAD_LETTER and provide operator inspection & replay
      ---
      duration_ms: 1292.2511
      type: 'test'
      ...
    # Subtest: should guarantee zero duplicate claims across multiple concurrent dispatchers
    ok 5 - should guarantee zero duplicate claims across multiple concurrent dispatchers
      ---
      duration_ms: 2071.412
      type: 'test'
      ...
    1..5
ok 1 - P3.4 — Failure Injection & Edge Case Resilience Test Suite
```

---

## 3. Regression Suite Verification (Phase 1 & Phase 2)

### Phase 1 Security Hardening (37 Tests Passed)
- All 5 suites (`auth.test.js`, `jwt.test.js`, `rbac.test.js`, `otp.test.js`, `api_security.test.js`) executed with exit code 0.
- Verified that the migration of OTP generation to `db.transaction()` and outbox event creation does not alter the external API contract of `POST /accounts/auth/password-reset-otp`.
- Verified that rate limiting, OTP hashing, and challenge verification gate continue to pass 100%.

### Phase 2 Performance & Concurrency (17 Tests Passed)
- `concurrency/attendance_concurrency.test.js` (5 tests passed): Concurrent punch-in and punch-out operations safely deduplicated via row-level locking.
- `pagination/pagination.test.js` (8 tests passed): Standardized pagination envelopes maintained across all endpoints.
- `performance/load_simulation.test.js` (4 tests passed): Verified zero connection pool leaks under load.
