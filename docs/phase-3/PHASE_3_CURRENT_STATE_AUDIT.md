# HRMS SaaS — Phase 3 Current-State Architecture Audit
## Distributed Backend, Durable Processing, Worker Isolation & Production Reliability

**Audit Date:** November 16, 2026  
**Auditor:** Principal Backend Architect & Distributed Systems Engineer  
**Repository:** `pranshavsingh/HRMS`  
**Active Implementation Branch:** `feat/phase-3-distributed-backend`  
**Base Commit (Phase 2 Baseline):** `f0613f3d52abb90ef27c3b039bed967c7ab9776c`  
**Verified Current HEAD Commit:** `ecf1a8c8869b2ff8fe0e3f053258c70f80e0ee4a`  
**Target Operating Environment:** Node.js v22+, MySQL 8.0 / MariaDB, Redis 7+, PM2 Cluster, Linux/Windows  

---

## 1. Executive Summary & Audit Baseline

Phase 3 transitions the HRMS SaaS backend from a single-node in-memory architecture to an enterprise-grade distributed system. The previous architectural baseline suffered from:
1. Fire-and-forget in-memory asynchronous job handling (`queue.service.js`) that permanently dropped critical jobs on process restart or failure.
2. In-memory cron execution running across all clustered API instances, risking duplicate automated actions.
3. Lack of message-level at-rest encryption for sensitive credentials (OTPs, tokens).
4. Absence of consumer idempotency fencing against at-least-once queue redelivery.

Over commits `81a8190` through `ecf1a8c`, the foundation of Milestone M3.2 (Transactional Outbox, BullMQ integration, AES-256-GCM encryption, and baseline dead-letter tracking) was implemented and passed GitHub Actions CI (Run [43752557123](https://github.com/pranshavsingh/HRMS/actions/runs/43752557123)).

However, a strict distributed systems inspection of the current code reveals specific correctness gaps, particularly around **consumer claim lease recovery in crashed worker scenarios**, **process isolation and readiness monitoring for dedicated workers**, **Redis Pub/Sub cross-instance event distribution**, and **system-wide metrics observability**.

---

## 2. Commit History Audit (Phase 2 to Current HEAD)

```
* ecf1a8c - docs(phase3): update M3.2 test results with passing CI run 43752557123 (HEAD -> feat/phase-3-distributed-backend)
* 5b3a28b - fix(phase3): export getRedisConnectionOptions and randomize test job IDs in otp_outbox
* 1de7ed1 - fix(test): use getRedisConnectionOptions in queue.test.js for automatic connection lifecycle
* bba3a55 - fix(phase-3): add strict claim fencing, durable consumer idempotency, dead-letter visibility, and tighten crypto validation
* 19591fb - docs(phase-3): link verified GitHub Actions run 43750068203 in M3.2 reports
* db0e26f - fix(queue): use connection options for automatic lifecycle management and add granular CI steps
* 5ba9199 - feat(phase-3): implement M3.2 durable background queue and transactional outbox foundation
* 81a8190 - docs(phase-3): complete M3.1 distributed backend architecture audit
* f0613f3 - (Phase 2 Accepted Baseline)
```

**Git Safety Check:**
- Active branch is strictly `feat/phase-3-distributed-backend`.
- `main` branch (`00cd3cd`) is completely untouched and unaffected.
- No history rewrite or force-push has taken place.
- Working tree is clean.

---

## 3. Detailed Component-by-Component Current State Audit

Every requirement is audited against concrete source inspection and classified into one of five definitive states:
- **COMPLETE** — Implementation exists, is architecturally sound, and verified with tests and CI evidence.
- **PARTIAL** — Implementation exists but has an identifiable correctness, recovery, or operational gap.
- **MISSING** — Capability is required by Phase 3 specifications but has not been implemented.
- **FAILED** — Implementation exists but is failing verification or violates safety invariants.
- **NOT APPLICABLE** — Justified as non-applicable based on verified constraints.

---

### M3.1 — Architecture Audit & Distributed Topology
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Initial Architecture Audit | **COMPLETE** | Documented in `docs/phase-3/PHASE_3_INITIAL_DISTRIBUTED_SYSTEM_AUDIT.md` (Commit `81a8190`). Connection budgets, failure modes, and migration plans verified. |
| Topology Specification | **COMPLETE** | Clustered API (4 instances) + Dedicated Background Worker (1 instance) defined in `ecosystem.config.cjs`. |
| Zero Direct Mutation Rule | **COMPLETE** | Verified: M3.1 made zero functional code changes and respected strict audit boundaries. |

---

### M3.2 — Durable Queue & Transactional Outbox Foundation
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Migration 003: `outbox_events` | **COMPLETE** | `scripts/migrations/003_phase3_outbox_events.sql` created with composite indexes and UTF8MB4 charset. Applied cleanly to MySQL & SQLite. |
| Outbox Insertion in Transactions | **COMPLETE** | `outbox.repository.js:createEvent()` allows inserting inside active `db.transaction()` connection. Used in `accounts.service.js:requestPasswordResetOtp()`. |
| SKIP LOCKED Row-Level Claiming | **COMPLETE** | `outbox.repository.js:claimPendingEvents()` uses `SELECT ... FOR UPDATE SKIP LOCKED` on MySQL 8.0, preventing worker lock contention. |
| Dispatcher Lease Fencing | **COMPLETE** | `outbox.repository.js:markPublished()` and `markFailed()` enforce `WHERE id = ? AND status = 'CLAIMED' AND claimed_by = ? AND claimed_until >= NOW()`. |
| Outbox Expired Claim Recovery | **COMPLETE** | `outboxRepository.releaseExpiredClaims()` recovers stalled claims where `claimed_until < NOW()`. Sweep runs periodically in `outbox-dispatcher.service.js`. |
| AES-256-GCM Payload Encryption | **COMPLETE** | `utils/crypto.js` encrypts sensitive payloads with 12-byte IV and 16-byte GCM tag. Rejects insecure keys; test fallback removed. |
| Neutralization of Legacy Queue | **COMPLETE** | `services/queue.service.js` in-memory arrays and async memory leak paths removed. Deprecated cleanly. |
| BullMQ Integration & Producers | **COMPLETE** | `services/queue-producer.service.js` initializes BullMQ queues with `getRedisConnectionOptions()`, deterministic job IDs (`outbox_<id>`), and exponential backoff. |
| Consumer Idempotency Table | **PARTIAL** | Table `consumer_processed_jobs` created via Migration 004 with `PRIMARY KEY (job_id, handler_name)`. However, schema lacks `claimed_by`, `lease_expires_at`, and `fencing_token`. |
| Consumer Claim Crash Recovery | **PARTIAL** | `consumer-idempotency.repository.js:claimExecution()` uses `INSERT ... 'PROCESSING'`. If a worker process crashes mid-execution, the row remains in `PROCESSING` forever, blocking future retries because duplicate key error prevents re-claiming. |
| Stale Worker Fencing on Completion | **PARTIAL** | `completeExecution()` updates status to `COMPLETED` by `(job_id, handler_name)` without checking `claimed_by` or generation token. A slow/zombie worker could complete a claim after another worker took over. |

---

### M3.3 — Dedicated Worker Isolation and Lifecycle
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Worker Process Isolation | **COMPLETE** | `src/worker.js` exists as a standalone entrypoint setting `process.env.IS_WORKER = "true"`. |
| BullMQ Worker Registration | **COMPLETE** | `src/jobs/index.js` manages BullMQ worker instances for `email-notifications`. |
| Outbox Dispatcher Management | **COMPLETE** | `src/services/outbox-dispatcher.service.js` started and stopped within `src/worker.js`. |
| Dedicated Database Connection Limits | **COMPLETE** | `src/config/env.js` allocates 5 connections for worker process vs 15 for API instances. |
| Cron Job Separation from API | **PARTIAL** | In `src/server.js`, `initCron()` is called if `NODE_ENV !== "production"`. While production disables it via `RUN_CRON_IN_API=false`, non-production environments risk running duplicate cron instances. |
| Worker Readiness & PM2 Integration | **PARTIAL** | `src/worker.js` does not signal `process.send('ready')` to PM2, unlike `src/server.js`. `ecosystem.config.cjs` lacks `wait_ready: true` and `kill_timeout` for the worker app. |
| Worker Health & Readiness Endpoint | **MISSING** | `src/worker.js` does not expose an HTTP liveness/readiness probe or health status file, preventing external container or load-balancer orchestration from probing worker health. |
| Graceful Shutdown Draining | **PARTIAL** | `src/worker.js` catches `SIGTERM`/`SIGINT` and calls `outboxDispatcher.stop()`, `queueWorkerManager.close()`, `queueProducerService.close()`, and `closePool()`. However, timeout enforcement is not implemented if in-flight handlers hang. |

---

### M3.4 — Distributed Idempotency, Retries and Dead-Letter Recovery
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Outbox Dead-Letter Quarantine | **COMPLETE** | `outbox.repository.js:markDeadLetter()` transitions unrecoverable poison messages to `DEAD_LETTER`. |
| Outbox Dead-Letter Inspection | **COMPLETE** | `outbox.repository.js:getDeadLetterEvents(limit, offset)` returns paginated dead-letter records. |
| Outbox Manual Replay | **COMPLETE** | `outbox.repository.js:retryDeadLetterEvent(id)` moves dead letters back to `PENDING` with reset retry counts. |
| Replay Audit Trail & Authorization | **MISSING** | No dedicated administrative routes or audit records exist to track who triggered a replay, when it occurred, or its subsequent outcome. |
| Error Classification (Transient vs Permanent) | **PARTIAL** | `send-otp-email.handler.js` distinguishes between decryption/bad payload (poison -> dead-letter) and SMTP failures (transient -> release claim for retry). Needs general abstraction across future queue handlers. |
| Exponential Backoff with Jitter | **PARTIAL** | BullMQ retry backoff is configured as exponential (`1000ms * 2^attempt`), but lacks randomized jitter to avoid thundering herd on external dependencies (SMTP/database). |
| Retention & Cleanup Policy | **PARTIAL** | `defaultJobOptions` specifies `removeOnComplete: 100` and `removeOnFail: 500`. However, database retention cleanup for `outbox_events` (status `PUBLISHED`) and `consumer_processed_jobs` (status `COMPLETED`) is not scheduled. |

---

### M3.5 — Redis Pub/Sub and Distributed Realtime Events
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Socket.IO Integration | **MISSING** | `socket.io` is not installed in `node_backend/package.json`. No websocket server is mounted in `src/server.js`. |
| Redis Adapter for Socket.IO | **MISSING** | `@socket.io/redis-adapter` is not installed or configured. Clustered API instances cannot broadcast realtime events across instances. |
| Multi-Instance Event Distribution | **MISSING** | Cross-instance event bus does not exist. Events emitted on API instance 1 do not reach clients connected to API instance 2, 3, or 4. |
| Realtime Room Authorization | **MISSING** | Room joining logic and tenant/user authorization checks are not implemented. |
| Redis Pub/Sub Connection Separation | **MISSING** | Redis Pub/Sub requires dedicated Redis connections (blocking subscriber connection cannot execute standard Redis commands). Not configured. |
| Outbox-Driven Realtime Events | **MISSING** | Business events (attendance punches, leave approvals) are not yet dispatched through the transactional outbox to the realtime pub/sub layer. |

---

### M3.6 — Production Observability and Operational Resilience
| Requirement | Status | Evidence & Inspection Details |
| :--- | :---: | :--- |
| Structured Logging (Winston) | **COMPLETE** | `src/utils/logger.js` configured with JSON formatting, log levels, and automatic deep redaction of sensitive credentials. |
| API Liveness Probe (`/health`) | **COMPLETE** | `app.js` exposes `/health` returning status `alive` and uptime. |
| API Readiness Probe (`/health/ready`) | **COMPLETE** | `app.js` exposes `/health/ready` verifying live database connectivity, Redis connection, and memory metrics. Returns 503 when degraded. |
| Prometheus / Metrics Endpoint | **MISSING** | No `/metrics` endpoint exists in API or Worker. No collection of HTTP request duration percentiles, database query latencies, or BullMQ queue depth. |
| Queue & Outbox Health Metrics | **PARTIAL** | `outboxRepository.getMetrics()` provides pending/claimed/published/dead-letter counts in memory, but this is not exposed over a monitoring endpoint. |
| Worker Health Endpoint | **MISSING** | Dedicated background worker has no HTTP listener or health report mechanism. |
| Operational Runbooks & Alerts | **PARTIAL** | `M3_2_OPERATIONS_GUIDE.md` exists with preliminary alert thresholds, but lacks comprehensive runbooks for worker failover, Redis failover, and dead-letter mass replay. |

---

## 4. Current Test Suite & Regression Baseline

| Suite Category | Test File | Test Count | Pass | Fail | Skip | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 1 Security** | `tests/security/auth.test.js` | 7 | 7 | 0 | 0 | PASS |
| **Phase 1 Security** | `tests/security/jwt.test.js` | 6 | 6 | 0 | 0 | PASS |
| **Phase 1 Security** | `tests/security/rbac.test.js` | 6 | 6 | 0 | 0 | PASS |
| **Phase 1 Security** | `tests/security/otp.test.js` | 7 | 7 | 0 | 0 | PASS |
| **Phase 1 Security** | `tests/security/api_security.test.js` | 11 | 11 | 0 | 0 | PASS |
| **Phase 2 Concurrency** | `tests/concurrency/attendance_concurrency.test.js` | 5 | 5 | 0 | 0 | PASS |
| **Phase 2 Pagination** | `tests/pagination/pagination.test.js` | 8 | 8 | 0 | 0 | PASS |
| **Phase 2 Performance** | `tests/performance/load_simulation.test.js` | 4 | 4 | 0 | 0 | PASS |
| **Phase 3 Outbox** | `tests/phase3/outbox.test.js` | 6 | 6 | 0 | 0 | PASS |
| **Phase 3 Queue** | `tests/phase3/queue.test.js` | 5 | 5 | 0 | 0 | PASS (in CI) |
| **Phase 3 OTP Outbox** | `tests/phase3/otp_outbox.test.js` | 5 | 5 | 0 | 0 | PASS |
| **Phase 3 Resilience** | `tests/phase3/failure_injection.test.js` | 5 | 5 | 0 | 0 | PASS |
| **TOTALS** | **12 Suites** | **75** | **75** | **0** | **0** | **100% PASS** |

*CI Reference: Run [43752557123](https://github.com/pranshavsingh/HRMS/actions/runs/43752557123) (Commit `5b3a28b`).*

---

## 5. Prioritized Implementation Roadmap & Acceptance Dependencies

Following the prompt's mandatory sequence:

```
[Step 1: Audit] (Current)
       │
       ▼
[Step 2: Finalize M3.2] ──► Recoverable Consumer Claims, Fencing Tokens, Lease Expiry, Crash Tests
       │                    Must achieve verified PASS before proceeding to M3.3
       ▼
[Step 3: M3.3 Isolation] ──► Dedicated Worker Lifecycle, PM2 wait_ready, Health Probes, Cron Isolation
       │
       ▼
[Step 4: M3.4 Reliability] ──► Jitter Backoff, Error Classification, Operator Replay Audit Trail
       │
       ▼
[Step 5: M3.5 Realtime] ──► Socket.IO + Redis Adapter, Multi-Instance Fan-Out, Room Authorization
       │
       ▼
[Step 6: M3.6 Observability] ──► Prometheus Metrics, Queue Telemetry, Health Runbooks, Alert Thresholds
       │
       ▼
[Step 7 & 8: Full Verification & Acceptance] ──► Load Tests, Full CI Evidence, Final Acceptance Report
```

**Immediate Gate:** M3.2 cannot receive final unconditional acceptance until the consumer-idempotency recovery mechanism is hardened with lease expiry, worker identity, and fencing tokens.
