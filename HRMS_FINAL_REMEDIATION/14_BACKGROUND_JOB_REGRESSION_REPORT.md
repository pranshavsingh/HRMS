# 14. Background Job Regression Report

- **Queue Framework:** BullMQ 5 + Redis 8.10.3
- **Worker Script:** `node_backend/src/worker.js` (`IS_WORKER=true`)
- **Suite:** [tests/run_phase3.js](file:///f:/hrms/node_backend/tests/run_phase3.js) (67/67 PASS)

## Background Processing Highlights

1. **Transactional Outbox Pattern (6/6 PASS):**
   - Events are written to the database `outbox_events` table inside the business transaction.
   - Dispatcher atomically claims pending events with expiring leases.
2. **Queue Processing & Idempotency (5/5 PASS):**
   - Dedicated BullMQ Redis connection configured with `maxRetriesPerRequest=null`.
   - Deterministic job IDs prevent duplicate processing on retries.
   - Exponential backoff verified on failed jobs.
3. **Failure Injection & Edge Resilience (25/25 PASS):**
   - Outbox records preserved in MySQL if queue publication fails (Zero Data Loss).
   - Strict claim fencing prevents zombie workers from committing stale leases.
   - Poison payloads quarantined to `DEAD_LETTER` queue for operator inspection and replay.
4. **SMTP Capture Delivery:**
   - Outbox OTP jobs processed by live worker and delivered via `nodemailer` to local SMTP capture (`127.0.0.1:1025`). Zero external employee emails dispatched.
