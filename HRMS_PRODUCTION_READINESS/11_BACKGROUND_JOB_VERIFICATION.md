# 11. Background Job Verification (BullMQ & Outbox)

**Worker Process:** `node_backend/src/worker.js` (`IS_WORKER=true`) connected to `127.0.0.1:6379` (Redis) and `127.0.0.1:3306` (`hrms_staging`).  
**Overall Status:** **PASS**

## Verification Evidence (`npm run test:phase3` — 9/9 Suites PASS)
- `phase3/outbox.test.js`: **6/6 PASS** (PENDING insertion, unique idempotency key enforcement, atomic worker claim, expired claim recovery, bounded retries).
- `phase3/queue.test.js`: **5/5 PASS** (live BullMQ Redis connection, job enqueue & worker execution, deterministic Job ID deduplication, exponential backoff retry).
- `phase3/otp_outbox.test.js`: **5/5 PASS** (transactional OTP + AES-256-GCM encrypted outbox payload, rollback on failure, tamper rejection).
- `phase3/failure_injection.test.js`: **25/25 PASS** (after `BUG-PROD-002` UTC fix — zero data loss on queue outage, zombie worker fencing tokens, DLQ ownership & replay).
- `phase3/worker_lifecycle.test.js`: **6/6 PASS** (worker `/health`, `/health/status`, `/health/ready`, graceful `503` on shutdown, API route isolation).
- `phase3/dead_letter_replay.test.js`: **5/5 PASS** (sanitized DLQ listing, forensic audit on replay, retention purge).
- `phase3/reconciliation.test.js`: **2/2 PASS** (stalled published event recovery).
- **Live E2E Outbox -> BullMQ -> SMTP:** Verified in `WF-02` (`POST /api/auth/forgot-password/request-otp/` -> Outbox -> BullMQ worker -> `nodemailer` -> `127.0.0.1:1025` SMTP capture).
