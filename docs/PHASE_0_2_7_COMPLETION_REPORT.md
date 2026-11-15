# PHASE 0.2.7 — FINAL DEFECT CLOSURE AND ACCEPTANCE CONSISTENCY REVIEW REPORT
## Enterprise HRMS (5,000 Employees / 1,000 Peak Concurrent Users)

**Document Reference:** `docs/PHASE_0_2_7_COMPLETION_REPORT.md`  
**Review Version:** 1.0.0  
**Date:** November 14, 2026  
**Status:** COMPLETE — READY FOR PROJECT OWNER ACCEPTANCE REVIEW  
**Scope Mode:** STRICT READ-ONLY / AUDIT & DOCUMENTATION ONLY (ZERO CODE MODIFICATIONS)  

---

## 1. Executive Summary & Authorization Compliance

Phase 0.2.7 represents the final technical defect closure and cross-document reconciliation phase of the Enterprise HRMS codebase audit. Following the comprehensive technical validation conducted in Phase 0.2.6, five specific technical ambiguities and logic defects were identified during project-owner review. 

Under strict read-only governance, this phase resolved all five defects, eliminated conflicting architectural narratives, aligned mathematical and SQL models, and synchronized all governing documents:
- `docs/PHASE_0_FINAL_DECISION_REGISTER.md` (Version 2.6.0)
- `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (Version 2.6.0)
- `docs/PHASE_0_2_6_TECHNICAL_VALIDATION_REPORT.md` (Version 1.1.0)
- `docs/PHASE_0_2_7_COMPLETION_REPORT.md` (Version 1.0.0 — this document)

### Confirmation of Zero Modifications
Across Phase 0, 0.1, 0.2.1, 0.2.2, 0.2.3, 0.2.4, 0.2.5, 0.2.6, and 0.2.7:
- **Application Code:** ZERO files modified in `node_backend/`, `hrms_saas/`, or `hrms_mobile/`.
- **Database:** ZERO DDL/DML migrations executed against the live MariaDB 11.8.9 host.
- **Dependencies:** ZERO packages installed, upgraded, or removed in any `package.json`.
- **Runtime Environment:** ZERO changes to VPS configurations, PM2 processes, Nginx vhosts, Redis instances, or firewall rules.
- **Implementation Status:** Implementation remains **STRICTLY NOT AUTHORIZED**.

---

## 2. Closure of the Five Identified Technical Defects

### Defect 01: Redis Lock Expiry & MariaDB Parent-Row Locking Under Concurrency

#### Ambiguity Identified
Prior drafts contained contradictory narratives regarding edge-case behavior when two concurrent punch-in requests arrive for the same employee and the first request's Redis distributed lock expires mid-flight before database commit. One section described the first request rolling back, while another asserted that both requests could succeed or create unhandled database deadlocks.

#### Resolved Technical Architecture
Redis and MariaDB do not participate in a two-phase commit (2PC). In InnoDB under `REPEATABLE READ`, executing `SELECT ... FOR UPDATE` on a non-existent child record in `attendance_attendance` acquires gap locks, leading to concurrent deadlocks. To eliminate gap-lock deadlocks while maintaining absolute idempotency:
1. **Serialization Lock:** Both requests must serialize on the permanent parent user record:
   ```sql
   SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE;
   ```
2. **Pre-Commit Lock Validation:** Immediately prior to issuing `COMMIT`, the worker executes an atomic Lua script verifying that the distributed lock key (`attendance:lock:{org_id}:{user_id}`) still contains the worker's unique UUID token.

#### Three Distinct Scenarios Documented & Synchronized

```
SCENARIO A: Request A Commits Before Lock Expiry
Request A (t=0)   ──> [Acquires Redis Lock] ──> [Acquires DB Parent Lock] ──> [Pre-Commit Check OK] ──> [COMMIT (201)]
Request B (t=10ms)──> [Rejected at Redis Lock (409)] OR [Waits on DB Lock ──> Sees Session ──> ROLLBACK (409)]

SCENARIO B: Request A Lock Expires Mid-Flight (Timeout Rollback)
Request A (t=0)   ──> [Acquires Redis Lock (TTL=5s)] ──> [I/O Delay >5s]
                      Redis Key Expires (t=5.001s)
Request B (t=5.002s)─> [Acquires Redis Lock] ──> [Blocks on DB Parent Lock (Held by A)]
Request A (t=5.010s)─> [Pre-Commit Check FAILS (Lock Lost)] ──> [ROLLBACK (408/500)] ──> [Releases DB Parent Lock]
Request B (t=5.012s)─> [Acquires DB Parent Lock] ──> [Checks Attendance (None Exists)] ──> [COMMIT (201)]
Result: Exactly one attendance session created. Zero orphaned rows.

SCENARIO C: Request B Serialized on MariaDB Parent Row
Request A (t=0)   ──> [Acquires Redis Lock] ──> [Acquires DB Parent Lock] ──> [Pre-Commit Check OK] ──> [COMMIT (201)]
Request B (t=2s)  ──> [Redis Lock Acquired] ──> [Blocks on DB Parent Lock]
Request A (t=2.5s)──> [Releases DB Parent Lock]
Request B (t=2.501s)─> [Acquires DB Parent Lock] ──> [Sees Active Session Committed by A] ──> [ROLLBACK (409 Conflict)]
```

- **Redis Unavailability:** If Redis is down, fail-closed with `HTTP 503 Service Unavailable`.
- **Outcome:** DEFECT 01 FULLY RESOLVED AND SYNCHRONIZED.

---

### Defect 02: Shift-Assignment Overlap SQL Logic & NULL Handling

#### Ambiguity Identified
The proposed SQL validation query used `AND id != :currentAssignmentId`. When inserting a brand-new assignment, `:currentAssignmentId` is `NULL`. In SQL three-valued logic, `id != NULL` evaluates to `UNKNOWN`, which causes the entire `WHERE` clause to evaluate to `UNKNOWN`/`FALSE`, silently bypassing overlap validation and permitting conflicting overlapping shifts.

#### Resolved Technical Architecture
The validation logic has been corrected to handle both insertions and updates across inclusive date boundaries $[start_A, end_A]$ and $[start_B, end_B]$:
1. Two date intervals overlap if and only if:
   $$\max(start_A, start_B) \le \min(end_A, end_B)$$
   Where `NULL` effective end dates represent indefinitely active assignments ($+\infty$).
2. The production SQL query is formally defined as:
   ```sql
   SELECT id FROM shift_user_assignment
   WHERE user_id = :userId
     AND (:currentAssignmentId IS NULL OR id != :currentAssignmentId)
     AND effective_from <= COALESCE(:effectiveTo, '9999-12-31')
     AND COALESCE(effective_to, '9999-12-31') >= :effectiveFrom
   LIMIT 1 FOR UPDATE;
   ```
3. **Inclusive Date Boundary Rule:** An assignment ending on `2026-06-30` overlaps with an assignment starting on `2026-06-30`. The next assignment must start on `2026-07-01`.
4. **Outcome:** DEFECT 02 FULLY RESOLVED AND SYNCHRONIZED.

---

### Defect 03: Cloudinary Upload Intent Identifier Lifecycle & Orphan Cleanup

#### Ambiguity Identified
The interaction between Cloudinary storage, pre-generated `public_id`s, database crashes, and orphan file cleanup lacked an explicit lifecycle definition. There was a risk that failed database transactions might leak orphaned assets or, conversely, that a naive cleanup job might delete active attendance photos.

#### Resolved Technical Architecture
1. **Pre-Generated Intent & Deterministic ID:**
   - Prior to invoking Cloudinary, a cryptographically random UUID v4 (`uploadToken`) is generated.
   - The deterministic `public_id` is constructed:
     ```
     att_{userId}_{uploadToken}
     ```
   - An intent record is committed in a lightweight transaction:
     ```sql
     INSERT INTO attendance_upload_intent (public_id, user_id, upload_token, status, created_at)
     VALUES (:publicId, :userId, :uploadToken, 'pending', NOW());
     ```
2. **Out-of-DB Upload Execution:**
   - The signed HMAC upload is transmitted to Cloudinary *strictly outside* any database transaction.
3. **Attendance Session Commit:**
   - The main attendance transaction inserts the punch record and marks the intent `'committed'`.
4. **Failure & Orphan Reconciliation Rules:**
   - A background reconciliation worker runs hourly.
   - It selects intents where `status = 'pending'` and `created_at < NOW() - INTERVAL 2 HOUR`.
   - Before issuing `destroy(public_id)`:
     ```sql
     SELECT id FROM attendance_attendance WHERE photo_url LIKE CONCAT('%', :publicId, '%')
     UNION ALL
     SELECT id FROM accounts_employeedocument WHERE file_path LIKE CONCAT('%', :publicId, '%');
     ```
   - If referenced: Marks intent `'committed'`.
   - If unreferenced: Calls `cloudinary.uploader.destroy(publicId)` and marks intent `'cleaned'`.
   - **Absolute Safety Rule:** Committed records and verified active references are **NEVER** deleted.
5. **Outcome:** DEFECT 03 FULLY RESOLVED AND SYNCHRONIZED.

---

### Defect 04: Phase 10 Load-Testing Acceptance Criteria Expansion

#### Ambiguity Identified
Phase 10 load-testing criteria lacked concrete operational dimensions, failing to distinguish between virtual users (VUs), in-flight requests, and request-per-second (RPS) throughput, while omitting specific test profiles and conflict classification.

#### Resolved Technical Architecture
Phase 10 load testing is now fully specified across seven rigorous dimensions:
1. **Pre-Seeded Data Population (MariaDB 11.8.9):**
   - 5,000 active employees (1 Superadmin, 5 HR Admins, 50 Line Managers, 4,944 Staff).
   - 50 departments, 150 designations, 3 shift templates (Morning, Evening, Night).
   - 300,000 historical attendance records (60 days across 5,000 users).
   - 10,000 leave applications with associated audit logs.
2. **Concurrency Metrics Formally Disambiguated:**
   - **Target Virtual Users (VUs):** 1,000 simultaneous active client sessions.
   - **Concurrent In-Flight Requests:** 100 to 250 requests actively processing at any millisecond.
   - **Peak Throughput Target:** 150 to 300 requests per second (RPS) sustained.
3. **25-Minute 4-Stage Load Profile:**
   - Stage 1 (Warm-Up): 0 to 200 VUs over 2 minutes.
   - Stage 2 (Ramp-Up): 200 to 1,000 VUs over 5 minutes.
   - Stage 3 (Peak Sustained): 1,000 VUs held for 15 minutes.
   - Stage 4 (Ramp-Down): 1,000 to 0 VUs over 3 minutes.
4. **Realistic Endpoint Workload Distribution:**
   - 40% Attendance Operations (Punch In/Out, Today's Status).
   - 25% Real-Time & Dashboard Polling (WhosIn, Metrics, Notifications).
   - 15% Directory & Profile Lookups (Employee List, Pagination).
   - 10% Timesheet & Report Queries (Monthly Summaries).
   - 5% Leave Submissions & Approvals (Multi-step transitions).
   - 5% Profile & Document Downloads (Signed URL generation).
5. **Acceptance Thresholds & Latency SLA:**
   - 95th Percentile Response Time ($P95$): $< 500\text{ ms}$ across all read/write endpoints.
   - 99th Percentile Response Time ($P99$): $< 1,500\text{ ms}$.
   - Unhandled Error Rate ($5xx$): $< 0.1\%$ ($< 1$ failure per 1,000 requests).
6. **HTTP 409 Conflict Classification:**
   - Double-punch attempts and lock collisions returning HTTP 409 Conflict are classified as **Expected Business Logic Outcomes**, NOT system errors.
   - SLA for 409 rejections: $P95 < 50\text{ ms}$ (rapid edge-rejection without database stalls).
7. **Infrastructure Telemetry Baseline During Peak:**
   - Node.js Event Loop Lag: $P99 < 50\text{ ms}$.
   - PM2 Worker Memory: $< 800\text{ MB}$ RSS per worker (zero memory leaks or restarts).
   - Host CPU Utilization: $< 75\%$ average across all cores.
   - MariaDB Active Connections: $\le 60$ across all backend pool workers.
8. **Outcome:** DEFECT 04 FULLY RESOLVED AND SYNCHRONIZED.

---

### Defect 05: PM2 Worker Sizing Methodology & Pool Contention

#### Ambiguity Identified
Prior documentation mandated an arbitrary "4-worker PM2 cluster" without empirical justification based on host hardware, risking thread contention or connection exhaustion on constrained VPS environments.

#### Resolved Technical Architecture
The fixed 4-worker mandate has been replaced with an evidence-based sizing formula tied to live VPS inspection in Phase 0.3:
1. **Core Capacity Formula:**
   $$\text{PM2 Workers} = \max(1, N_{\text{vCPU}} - 1)$$
   - Reserve 1 vCPU for OS, MariaDB local threads, Nginx worker processes, and Redis daemon.
2. **Database Pool Quota Sizing:**
   - MariaDB host parameter `wait_timeout = 20` seconds demands rapid pool recycling.
   - Total backend pool allocations across all workers must satisfy:
     $$\text{Workers} \times \text{connectionLimit} \le \text{HRMS Max DB Quota}$$
   - Example (4 Workers, Quota = 60): `connectionLimit: 15` per worker.
3. **Phase 0.3 Discovery Gate:** The exact worker count will be finalized only after Phase 0.3 live SSH inspection executes `nproc` and `free -m`.
4. **Outcome:** DEFECT 05 FULLY RESOLVED AND SYNCHRONIZED.

---

## 3. Summary of Document Modifications

| File Path | Version | Primary Updates |
|---|---|---|
| `docs/PHASE_0_FINAL_DECISION_REGISTER.md` | **2.6.0** | Updated Defect 01 (Scenarios A/B/C), Defect 02 (SQL NULL logic), Defect 03 (Upload lifecycle), Defect 04 (Load testing criteria), Defect 05 (PM2 sizing formula). Preserved BR-01..BR-04, POD-01, POD-04. |
| `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | **2.6.0** | Updated Phase 1 (PM2 sizing), Phase 2 (Upload lifecycle), Phase 3 (Attendance locking), Phase 4 (Shift overlap SQL), Phase 10 (Load test criteria). |
| `docs/PHASE_0_2_6_TECHNICAL_VALIDATION_REPORT.md` | **1.1.0** | Updated Sections 3.1, 4.3, 5.2, 5.3, 5.4, 7.1 with corrected defect models and mathematical formulas. |
| `docs/PHASE_0_2_7_COMPLETION_REPORT.md` | **1.0.0** | Created formal completion and reconciliation report (this document). |

---

## 4. Current Decision Register Status

### Approved Project-Owner Business Decisions (PRESERVED)
- **BR-01:** Single attendance session per employee per attendance day (1 punch-in, 1 punch-out).
- **BR-02:** Shift management required (Morning, Evening, Night).
- **BR-03:** Permit leave applications with insufficient balance, subject to Manager approval.
- **BR-04:** Automated absent marking enabled via shift-aware partition logic.
- **POD-01:** Overnight Shift Attendance Date Attribution = **Shift Start Date**.
- **POD-04:** Attendance Regularization on Manager Rejection = **Admin Regularization Permitted**.

### Pending Decisions (Tracked for Pre-Phase 1 Owner Direction)
- **POD-02:** Background Scheduler Execution Model (BullMQ Worker vs. PM2 Single-Instance Cron).
- **POD-03:** Leave Deficit Accounting Model (Hard Negative vs. Unpaid LOP Deductions).
- **POD-05:** Holiday Calendar Organizational Ownership (Centralized vs. Branch-Specific).

---

## 5. Outstanding Infrastructure Verification Items (Phase 0.3 Scope)

The following items cannot be determined from codebase analysis and are deferred strictly to Phase 0.3 live VPS inspection via SSH:

1. **VPS Hardware Inventory:** Exact vCPU core count (`nproc`), RAM allocation (`free -m`), and swap configuration.
2. **MariaDB Host Partitioning:** Confirmed shared host connection limit (`max_connections = 2000`) vs. dedicated HRMS application quota.
3. **Nginx Runtime Configuration:** Gzip compression status, reverse-proxy buffer sizes (`proxy_buffers`), SSL ciphers, and client body limits.
4. **Redis Deployment Topology:** Verification of local Redis installation, maxmemory policy (`volatile-lru` or `allkeys-lru`), and persistence config (`save` / `appendonly`).
5. **System Firewalls & Ports:** Inspection of UFW / iptables rules for port 3306 (MariaDB) and 6379 (Redis) host isolation.
6. **Automated Backup Strategy:** Inspection of daily MariaDB logical dump scripts, rotation retention policies, and offsite sync status.

---

## 6. Concise Unresolved-Risk Register

| Risk ID | Category | Description | Severity | Mitigation Strategy |
|---|---|---|---|---|
| **RISK-01** | Database | Host-wide `wait_timeout = 20` seconds drops idle connections rapidly. | **HIGH** | Configure `mysql2` pool with keep-alive ping validation and `idleTimeout: 10000`. |
| **RISK-02** | Security | Static salt `"nodejs"` in legacy PBKDF2 password hashes (`auth.js`). | **HIGH** | Implement seamless, zero-downtime dual-verifier migration with dynamic salt. |
| **RISK-03** | Operations | Multi-worker PM2 without distributed locking could duplicate cron jobs. | **HIGH** | Require Redis distributed lock or pin scheduler execution to single PM2 instance. |
| **RISK-04** | Cloud Storage | Cloudinary API transient network failures during punch-in photo upload. | **MEDIUM** | Asynchronous intent reconciliation worker cleans orphaned pending files after 2 hours. |
| **RISK-05** | Infrastructure | Shared MariaDB 11.8.9 host could suffer "noisy neighbor" connection exhaustion. | **MEDIUM** | Cap pool size at HRMS allocation quota and monitor MariaDB thread pool. |

---

## 7. Final Acceptance Recommendation

The documentation baseline for the Enterprise HRMS project is now **100% mathematically and architecturally reconciled**. All contradictions between distributed Redis locking and MariaDB parent-row serialization have been resolved, SQL overlap queries handle `NULL` boundaries correctly, Cloudinary intent lifecycles are safe against data loss, load testing acceptance criteria are fully quantified, and worker sizing is bound to empirical host telemetry.

### Recommendation
1. **ACCEPT Phase 0.2 Documentation Baseline:** Approve `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.6.0) and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.6.0) as the definitive technical standard.
2. **PROCEED TO Phase 0.3 (Live Infrastructure Verification):** Authorize read-only SSH access to the production VPS to inspect hardware resources, Nginx, Redis, and MariaDB runtime parameters before beginning any implementation phases.
3. **MAINTAIN ZERO CODE MODIFICATIONS:** Continue enforcing the strict read-only boundary until Phase 0.3 is complete and Phase 1 implementation is explicitly authorized.

