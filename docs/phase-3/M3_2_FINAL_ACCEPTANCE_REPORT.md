# HRMS SaaS — Milestone M3.2 Final Acceptance Report
## Durable Background Queue, Transactional Outbox & Recoverable Consumer Idempotency

**Document Date:** November 16, 2026  
**Auditor / Architect:** Principal Backend Architect & Distributed Systems Engineer  
**Repository:** `pranshavsingh/HRMS`  
**Active Implementation Branch:** `feat/phase-3-distributed-backend`  
**Phase 2 Baseline:** `f0613f3d52abb90ef27c3b039bed967c7ab9776c`  
**Milestone Scope:** M3.2 — Durable Queue & Transactional Outbox Foundation  
**Milestone Verdict:** **FULL ACCEPTANCE (PASS)**  

---

## 1. Executive Summary & Acceptance Verdict

Milestone M3.2 has achieved **unconditional PASS acceptance**.

All foundational requirements for durable background execution have been designed, implemented, migrated, and verified:
1. **Zero Data Loss Guarantee:** In-memory, fire-and-forget execution (`queue.service.js`) has been completely removed. Background tasks are durably recorded in the database within the originating ACID transaction.
2. **At-Rest Payload Protection:** Sensitive payloads (including OTPs and passwords) are encrypted using authenticated **AES-256-GCM** with unique 12-byte initialization vectors and 16-byte authentication tags.
3. **Atomic Outbox Row Claiming:** Outbox dispatchers use `SELECT ... FOR UPDATE SKIP LOCKED` on MySQL 8.0, preventing lock contention and deadlocks across concurrent worker processes.
4. **Strict Claim Lease Fencing:** Dispatchers and consumer handlers are fenced by active, unexpired leases (`claimed_until >= NOW()` and `claimed_by`). Stale or zombie workers with expired leases are rejected from updating database state.
5. **Recoverable Consumer Idempotency:** The `consumer_processed_jobs` table (via Migration 005) records execution state with `claimed_by`, `lease_expires_at`, and monotonically incrementing `fencing_token`. Expired claims from crashed worker processes are automatically recovered by survivor workers, while stale workers attempting late completion are strictly fenced out.

---

## 2. Correctness Guarantees & Distributed Realities

### Guarantee 1: Transactional Atomicity (Database Tier)
The creation of business records (such as password reset OTP records) and their corresponding outbox events occur inside a single ACID `db.transaction()` block. If the database connection fails or any constraint is violated, both the business record and the outbox event roll back together.

### Guarantee 2: At-Least-Once Delivery with Durable Idempotency
- **Queue Publication:** The outbox dispatcher retries failed BullMQ job additions up to 5 times with exponential backoff before transitioning exhausted events to `DEAD_LETTER`.
- **Consumer Execution:** When BullMQ delivers a job, the worker atomically acquires a lease on `consumer_processed_jobs`. If the job was already completed, it is skipped immediately with `reason: ALREADY_PROCESSED`.

### Guarantee 3: External Effect Boundary (The SMTP Reality)
External SMTP delivery does not participate in two-phase commit (2PC) or local database transactions:
- If a worker process crashes **after** the SMTP server accepts an email but **before** `consumerIdempotencyRepository.completeExecution()` writes to the database, a survivor worker will recover the expired lease after the timeout and re-deliver the email.
- **Explicit Engineering Statement:** The system guarantees **at-least-once execution** for external communications. In extreme crash scenarios occurring during the post-SMTP acknowledgment window, duplicate external email delivery is theoretically possible, but duplicate internal database state mutation is mathematically prevented by the composite primary key and fencing token.

---

## 3. Schema Migrations Delivered

| Migration File | Target Engine | Purpose & DDL Highlights |
| :--- | :--- | :--- |
| `003_phase3_outbox_events.sql` | MySQL 8.0 / SQLite | Creates `outbox_events` with `idempotency_key UNIQUE`, `status`, `claimed_by`, `claimed_until`, and composite indexes on `(status, id)` and `(status, claimed_until, id)`. |
| `004_phase3_consumer_idempotency.sql` | MySQL 8.0 / SQLite | Creates `consumer_processed_jobs` with `PRIMARY KEY (job_id, handler_name)`. |
| `005_phase3_recoverable_consumer_claims.sql` | MySQL 8.0 / SQLite | Adds `claimed_by`, `lease_expires_at`, `fencing_token`, and `updated_at` to `consumer_processed_jobs` to enable crash recovery and fencing. |

All migrations execute idempotently in `scripts/run-migrations.js` under MySQL distributed advisory locks (`GET_LOCK('hrms_db_migration_lock', 15)`).

---

## 4. Failure-Injection Verification Evidence

Automated tests in `tests/phase3/failure_injection.test.js` verify edge case recovery:

```
TAP version 13
# Subtest: P3.4 — Failure Injection & Edge Case Resilience Test Suite
    # Subtest: should preserve outbox records in database when queue publication fails (Zero Data Loss)
    ok 1 - should preserve outbox records in database when queue publication fails (Zero Data Loss)
    # Subtest: should enforce strict claim fencing when worker lease has expired (Zombie worker fenced out)
    ok 2 - should enforce strict claim fencing when worker lease has expired (Zombie worker fenced out)
    # Subtest: should enforce durable consumer idempotency across duplicate job deliveries
    ok 3 - should enforce durable consumer idempotency across duplicate job deliveries
    # Subtest: should quarantine poison payloads to DEAD_LETTER and provide operator inspection & replay
    ok 4 - should quarantine poison payloads to DEAD_LETTER and provide operator inspection & replay
    # Subtest: should guarantee zero duplicate claims across multiple concurrent dispatchers
    ok 5 - should guarantee zero duplicate claims across multiple concurrent dispatchers
    # Subtest: should recover expired consumer claim with incremented fencing token and fence out stale worker
    ok 6 - should recover expired consumer claim with incremented fencing token and fence out stale worker
    # Subtest: should prevent competing worker from acquiring an active unexpired consumer claim
    ok 7 - should prevent competing worker from acquiring an active unexpired consumer claim
    # Subtest: should support retry after consumer transient failure release
    ok 8 - should support retry after consumer transient failure release
    1..8
ok 1 - P3.4 — Failure Injection & Edge Case Resilience Test Suite
```

---

## 5. Acceptance Checklist Audit

- [x] **Requirement 1: Unclaimed or expired claim atomic acquisition:** Implemented with `SELECT ... FOR UPDATE` and monotonic fencing tokens.
- [x] **Requirement 2: Mutual exclusion:** Two workers can never hold the same active claim simultaneously.
- [x] **Requirement 3: Expired claim recoverability:** Tested and verified; survivor takes over with incremented fencing token.
- [x] **Requirement 4: Stale worker fencing:** Stale workers attempting late completion affect 0 rows and return false.
- [x] **Requirement 5: Fencing token verification:** Monotonically checked on `completeExecution`.
- [x] **Requirement 6: Failure isolation:** Transient failures release only the current worker's claim.
- [x] **Requirement 7: Retryability:** Transient failures transition to `FAILED` and are immediately reclaimable.
- [x] **Requirement 8: Terminal error dead-lettering:** Poison payloads persistently transition to `DEAD_LETTER`.
- [x] **Requirement 9: Deduplication:** Completed jobs return `{ duplicate: true, skipped: true }` on subsequent deliveries.
- [x] **Requirement 10: Multi-process recovery:** Relies entirely on database transactions and timestamps without in-memory coordination.

**Formal Milestone Decision:** **PASS**
