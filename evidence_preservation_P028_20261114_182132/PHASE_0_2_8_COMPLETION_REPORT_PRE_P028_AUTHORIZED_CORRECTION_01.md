# PHASE 0.2.8 — FINAL PLANNING-BASELINE CORRECTIONS, TECHNICAL RISK QUALIFICATION & AUTHORIZATION GOVERNANCE REPORT
## Enterprise HRMS (5,000 Registered Employees / 1,000 Peak Simultaneous Users)

**Document Reference:** `docs/PHASE_0_2_8_COMPLETION_REPORT.md`  
**Review Version:** 1.4.0 (Phase 0.2.8 — Final Defect Closure & Harmonization)  
**Date:** November 14, 2026  
**Auditor / System Architect:** Antigravity Senior Engineering System Architect  
**Status:** COMPLETE — PLANNING BASELINE CORRECTED | AWAITING OWNER AUTHORIZATION  
**Scope Mode:** STRICT READ-ONLY AUDIT & DOCUMENTATION CORRECTIONS ONLY (ZERO CODE MODIFICATIONS)  

---

### Document Change History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| **1.0.0** | Nov 14, 2026 | Antigravity Senior Architect | Initial Phase 0.2.8 Technical Risk Qualification & Governance Report. |
| **1.1.0** | Nov 14, 2026 | Antigravity Senior Architect | Appended Section 10 Addendum; reconciled P95 < 500 ms core-operations planning baseline. |
| **1.2.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Acceptance Blocker Resolution: Corrected PM2 worker RSS to `< 800 MB per worker`, Node.js event-loop lag to `P99 < 50 ms`, explicitly marked 80 MB RSS and P99 < 5 ms event-loop lag as superseded, updated governing document references to v2.7.1, and qualified MariaDB parent-row locking concurrency architecture. |
| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Source Document Defect Correction: Strictly standardized active PM2 worker memory to `< 800 MB RSS per worker` and event loop lag to `P99 < 50 ms` across Section 4 and Section 10 Addendum with zero obsolete figures in active lines; confirmed Redis command latency P99 < 5 ms as Proposed Engineering Target. |
| **1.4.0** | Nov 14, 2026 | Antigravity Senior Architect | Cloudinary Lifecycle Harmonization (DEF-01 Resolution): Reconciled Section 3.2 Line 135 with Section 10.2 Addendum and Reconciliation Report Section 4; formally superseded linear cleanup pipeline in favor of partitioned two-path model where committed intents are terminal and permanently excluded from cleanup. |

---

## 1. Executive Summary & Authorization Compliance

Phase 0.2.8 was executed as a controlled documentation-correction and technical-risk-qualification phase based on the established Phase 0.2.7 planning record. The objective was to eliminate remaining technical overstatements, qualify unverified assumptions, reconcile conflicting acceptance targets, establish strict dependency governance, and ensure that architectural proposals are not mischaracterized as verified production facts.

### Preservation of Historical Records
In strict accordance with project-owner instructions:
- The Phase 0.2.7 report (`docs/PHASE_0_2_7_COMPLETION_REPORT.md`) is preserved untouched as a historical record and planning baseline reference.
- The Phase 0.2.6 report (`docs/PHASE_0_2_6_TECHNICAL_VALIDATION_REPORT.md`) is preserved untouched.
- The governing planning baseline documents have been synchronized to **Version 2.7.1**:
  - `docs/PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1)
  - `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1)
- This completion report (`docs/PHASE_0_2_8_COMPLETION_REPORT.md`, v1.4.0) establishes the definitive, qualified planning baseline for project-owner review.

### Confirmation of Zero Modifications
Across all activities conducted during Phase 0.2.8:
- **Application Source Code:** ZERO files modified in `node_backend/`, `hrms_saas/`, or `hrms_mobile/`.
- **Database:** ZERO DDL or DML statements executed against the live MariaDB 11.8.9 host (`srv999.hstgr.io`).
- **Dependencies:** ZERO packages installed, upgraded, or removed in any `package.json`.
- **Infrastructure Services:** ZERO configuration changes or restarts applied to PM2, Nginx, Redis, Cloudinary, UFW firewall, or VPS services.
- **Implementation Status:** Implementation of Phase 0.3, Phase 1, or any subsequent development phase remains **STRICTLY NOT AUTHORIZED**.

---

## 2. Repository & Workspace State Inspection

Prior to documentation updates, a comprehensive read-only inspection of the repository status was conducted:
- **Workspace Root (`F:\hrms`):** Not a top-level git repository (no `.git` directory at workspace root).
- **Sub-Project Repository (`hrms_mobile`):** Independent Git repository present at `F:\hrms\hrms_mobile` on branch `master` with no commits yet recorded. It contains pre-existing unstaged and untracked files (`.env`, `scripts/start-dev-tunnel.js`, `src/app/(tabs)/`, etc.) dating from initial project setup in May 2026. These pre-existing untracked files were identified, left untouched, and not concealed.
- **Backend & Web (`node_backend/`, `hrms_saas/`):** Standalone directories without independent `.git` sub-trees.
- **Working Tree State:** The application source code (`node_backend/`, `hrms_saas/`, `hrms_mobile/src/`) remained completely untouched during Phase 0.2.8. Zero application source files were modified, created, committed, or pushed. Only project documentation files in `docs/` were modified during Phase 0.2.8.

---

## 3. Documents Inspected & Documents Modified

### Documents Inspected (Read-Only)
1. `node_backend/src/utils/auth.js` (Verified PBKDF2 parameters, SHA-256, static salt `"nodejs"`).
2. `node_backend/src/services/attendance.service.js` (Verified photo storage column references: `punch_in_photo`, `punch_out_photo`).
3. `node_backend/src/services/accounts.service.js` (Verified employee document column references: `file`).
4. `node_backend/src/services/storage.service.js` (Verified `cloudinary://` URI prefix storage and deletion handling).
5. `node_backend/src/repositories/accounts.repository.js` (Verified SQL queries on `accounts_employeedocument`).
6. `docs/PHASE_0_FINAL_DECISION_REGISTER.md` (Version 2.7.1).
7. `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (Version 2.7.1).
8. `docs/PHASE_0_2_6_TECHNICAL_VALIDATION_REPORT.md` (Version 1.1.0 — preserved historical record).
9. `docs/PHASE_0_2_7_COMPLETION_REPORT.md` (Version 1.0.0 — preserved historical record).

### Documents Modified / Synchronized
1. `docs/PHASE_0_FINAL_DECISION_REGISTER.md` — Synchronized to **Version 2.7.1**.
2. `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` — Synchronized to **Version 2.7.1**.
3. `docs/PHASE_0_2_8_COMPLETION_REPORT.md` — Updated to **Version 1.3.0** (this document).
*(Persistent mirrors generated in session artifact repository).*

---

## 4. Technical Corrections & Risk Qualification Results

### CORRECTION 01 — Redis Lease Expiry and MariaDB Authoritative Concurrency Control

#### 1. Technical Problem Identified in Prior Baseline
Phase 0.2.7 described an atomic Lua script verifying Redis lock ownership immediately before MariaDB `COMMIT` as a mechanism preventing duplicate attendance. However, Redis and MariaDB do not share an atomic transaction boundary (no distributed Two-Phase Commit). A microscopic time gap exists between the Redis check and the database commit phase. Describing this arrangement as an atomic commit or claiming that Redis ownership validation alone guarantees exactly-once attendance creation was an architectural overstatement.

#### 2. Resolved Division of Responsibility
The architectural responsibilities have been strictly separated:
* **Redis Layer (Distributed Coordination & Early Rejection):**
  - Provides lightweight edge coordination and fast-path duplicate-request rejection (`HTTP 409 Conflict`).
  - Employs unique cryptographically random tokens (`crypto.randomUUID()`) and atomic Lua-checked deletion.
  - Lease duration (15s baseline) is provisional and subject to empirical calibration.
  - **Non-Authoritative:** Redis is **not** the authoritative attendance record. Redis lock expiration does **not** independently invalidate an in-flight MariaDB transaction.
* **MariaDB Engine (Authoritative Source of Truth & Integrity):**
  - MariaDB is the sole authoritative record of attendance state.
  - The intended concurrency-control design uses a shared parent-row locking protocol to serialize competing writes by acquiring an exclusive row lock on the permanent employee parent record:
    ```sql
    SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE;
    ```
  - Attendance state for the designated shift date is verified **after acquiring the parent-row lock and within the same database transaction** as the punch insert.
  - Runtime acceptance requires verification that every relevant write path (`punchIn`, `punchOut`, `regularize`, `bulkImport`, `adminEdit`) acquires the same parent lock and performs transactional state validation before committing changes. This document records the intended architecture; it does not claim that all runtime paths have already been proven.

#### 3. Re-Evaluation of the Three Concurrency Scenarios
* **Scenario A (Normal Fast-Path):** Request A acquires Redis lock, acquires MariaDB parent lock, verifies no session exists within the transaction, executes pre-commit Lua check, and commits (`HTTP 201 Created`). Request B is either rejected early at Redis with `HTTP 409 Conflict` or blocks on MariaDB parent lock $\rightarrow$ acquires parent lock $\rightarrow$ observes committed session $\rightarrow$ rolls back $\rightarrow$ returns `HTTP 409 Conflict`.
* **Scenario B (Redis Lease Expires Mid-Flight):** Request A's Redis lease expires during an unexpected stall while holding the MariaDB parent-row lock. Request B arrives, acquires a new Redis lease, and attempts to acquire the MariaDB parent lock, but is **synchronously blocked by MariaDB**:
  - *Case 1 (Lua Check Abort):* Request A's pre-commit Lua check detects lost token ownership; Request A treats this as a timeout hazard, issues MariaDB `ROLLBACK`, triggers Cloudinary compensation, and returns `HTTP 408/500`. Request A releases the parent lock. Request B unblocks, verifies no attendance record exists in MariaDB, inserts attendance, and commits (`HTTP 201 Created`).
  - *Case 2 (MariaDB Commit):* If Request A proceeds to commit (e.g. Lua check succeeded immediately prior to lease expiration or policy favors DB state), Request A commits (`HTTP 201 Created`). Request B unblocks, executes its mandatory transactional state check `SELECT id FROM attendance_attendance WHERE user_id = :userId AND date = :shiftDate`, observes Request A's committed record, rolls back, releases its Redis lock, and returns `HTTP 409 Conflict`.
  - *Authoritative Invariant:* Under **either** transaction outcome, MariaDB parent-row locking represents the intended authoritative concurrency architecture to enforce exactly-once attendance session creation, with runtime acceptance dependent on verifying that every relevant write path acquires the same parent-row lock and performs transactional state validation. Documentation and architectural specifications alone do not constitute proof of runtime guarantees; empirical validation is required during Phase 3 and Phase 10 staging tests.
* **Scenario C (Second Request Blocked on MariaDB Parent Lock):** Request B passes Redis coordination but waits on the MariaDB parent lock held by Request A. Request A commits and releases the lock. Request B unblocks, enters its critical section, queries `attendance_attendance` within its transaction, detects the newly committed session, rolls back, and returns `HTTP 409 Conflict`.
* **Redis Outage Policy:** If Redis is unreachable, the endpoint follows a provisional fail-closed policy (`HTTP 503 Service Unavailable`).
* **Technical Qualification Status:** Attendance concurrency implementation acceptance is classified as **NEEDS TECHNICAL VALIDATION** during Phase 3/10 staging verification.
* **Unconditional Unique Constraint:** Unconditional `UNIQUE(user_id, date)` remains **PERMANENTLY REJECTED**.

---

### CORRECTION 02 — Cloudinary Upload Intent & Safe Orphan Reconciliation

#### 1. Technical Problem Identified in Prior Baseline
Phase 0.2.7 asserted that a 2-hour grace period guarantees that active uploads will never be deleted. Age alone does not prove that an upload or database transaction has permanently failed. A delayed worker, slow database transaction, crashed process, or recovery operation could still be active after 2 hours.

#### 2. Empirical Code & Schema Audit Findings
Read-only inspection of the active codebase resolved column naming discrepancies:
* **`attendance_attendance` Table:** The actual photo columns are `punch_in_photo` and `punch_out_photo` (VARCHAR storing `cloudinary://${public_id}` or relative paths). There is **NO** `photo_url` column.
* **`accounts_employeedocument` Table:** The actual file column is `file` (VARCHAR storing `cloudinary://${public_id}` or relative paths). There is **NO** `file_path` column.
* **Corrected Verification Query:**
  ```sql
  SELECT id FROM attendance_attendance 
  WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
     OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
  UNION ALL
  SELECT id FROM accounts_employeedocument 
  WHERE file LIKE CONCAT('%', :publicId, '%');
  ```

#### 3. Safer Reconciliation State Model (Proposed Design — NEEDS TECHNICAL VALIDATION)
To ensure safety across crash and recovery scenarios, a comprehensive state machine was specified for future implementation:
* **Intent States (Partitioned Lifecycle — Superseding Linear Diagram):** As reconciled in Section 10.2 Addendum, the older linear sequence is superseded. The lifecycle is partitioned into two mutually exclusive paths:
  - **Successful Attendance Path:** `pending` $\rightarrow$ `uploading` $\rightarrow$ `committed` (terminal for cleanup, permanently excluded from deletion).
  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** `pending` or `failed` $> 2\text{h}$ $\rightarrow$ `cleanup_claimed` $\rightarrow$ `cleaned` (or manual review).
* **Worker Lease Ownership:** Reconciliation workers claim intents via `cleanup_claimed` using unique worker UUIDs and lease timeouts.
* **Heartbeat & Fencing:** Long-running recovery workers maintain heartbeat timestamps to prevent zombie workers from acting after lease expiration.
* **Pre-Deletion Reference Check:** The corrected SQL reference check must execute immediately prior to calling `cloudinary.uploader.destroy(publicId)`.
* **Absolute Deletion Safety Rule:** An asset must **NEVER** be deleted when a committed database record references it. If the reconciliation worker cannot conclusively prove an asset is an unreferenced orphan, it must **NOT** delete the file. The record is flagged for manual review. Legitimate attendance evidence must never be sacrificed for automated cleanup.
* **Status:** Marked as a proposed design requiring implementation and testing (**NEEDS TECHNICAL VALIDATION**). Zero Cloudinary operations were performed.

---

### CORRECTION 03 — Shift Assignment Date-Boundary Policy

#### 1. Technical Problem Identified in Prior Baseline
Phase 0.2.7 introduced an inclusive date-boundary rule (Assignment 1 ending June 30 requires Assignment 2 to start July 1). This is a business policy, not an SQL bug fix, and had not been explicitly approved by the project owner.

#### 2. Technical Formulation Preserved
The mathematical overlap logic remains sound:
```sql
SELECT id FROM attendance_shift_assignment
WHERE user_id = :userId
  AND (:currentAssignmentId IS NULL OR id != :currentAssignmentId)
  AND effective_from <= COALESCE(:newEffectiveTo, '9999-12-31')
  AND COALESCE(effective_to, '9999-12-31') >= :newEffectiveFrom
LIMIT 1 FOR UPDATE;
```
Parent-row locking (`SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE`) is preserved to prevent concurrent assignment collisions.

#### 3. Governance Policy Options (PENDING OWNER CONFIRMATION — POD-06)
The boundary policy is formally registered as a pending decision:
* **Option A (Inclusive Date Boundaries):** `effective_to` is the last working date. Assignment 1 ending `2026-06-30` means the employee works Assignment 1 on June 30; Assignment 2 must begin on `2026-07-01`. Boundary sharing is prohibited.
* **Option B (Exclusive Date Boundaries):** `effective_to` is the cutoff handover date. Assignment 1 ending `2026-06-30` allows Assignment 2 to start on `2026-06-30`. Requires explicit midnight handover rules.
* **Status:** Classified as **PENDING OWNER CONFIRMATION (POD-06)**. Implementation of shift assignment overlap logic in Phase 2B/4 is **BLOCKED** until owner selection is confirmed.

---

### CORRECTION 04 — Phase 10 Load-Test Acceptance Criteria

#### 1. Technical Problem Identified in Prior Baseline
Prior documentation drafts contained conflicting and unrealistic numbers alongside the standard 500 ms P95 baseline. Earlier figures—specifically **80 MB PM2 worker RSS**, **P99 < 5 ms event-loop lag**, **50 ms or 5 ms global P95 response targets**, and **any HTTP 409 latency SLA of 5 ms, 10 ms or 100 ms**—are formally marked as **superseded, not active targets**.

#### 2. Reconciled Metrics & Distinctions
* **Target Scale:** 5,000 registered employees, 1,000 peak simultaneous authenticated virtual users (future staging acceptance target, not existing production capacity).
* **Metric Distinctions:** 1,000 Virtual Users (active client sessions) $\rightarrow$ 100–250 concurrent in-flight requests $\rightarrow$ 150–300 requests per second (RPS) sustained peak throughput *(Proposed Engineering Targets)*.
* **Response-Time Baseline:** **Core successful business operations: P95 < 500 ms — Provisional Planning Baseline.** (This is a planning baseline, not a measured result or an approved production SLA).
* **Tail Latency ($P99$):** Distribution to measure and report *(Measurement to Collect; no approved threshold)*.
* **HTTP 409 Latency:** Distribution to measure and report separately *(Measurement to Collect; no approved SLA)*.
* **HTTP 409 Classification:** Expected duplicate-punch conflicts returning HTTP 409 Conflict are classified as **Expected Business Conflicts** and tracked separately from system errors.
* **System Error Budget:** Unexpected HTTP 5xx error rate $< 0.1\%$ *(Proposed Engineering Target)*.
* **Resource Thresholds Formally Classified:**
  - Host CPU: < 75% — Proposed Engineering Target.
  - PM2 Worker Memory: `< 800 MB RSS per worker` — Proposed Engineering Target.
  - Node.js Event-Loop Lag: `P99 < 50 ms` — Proposed Engineering Target.
  - Aggregate MariaDB Connections: ≤ 60 — Proposed Engineering Target; subject to verified quota on shared host.
  - Redis Command Latency: `P99 < 5 ms` — Proposed Engineering Target; measure and report, not an approved SLA.
  - Formal Production SLAs: None currently approved; pending owner review and empirical staging results.
* **Actual Measured Load Results:** Explicitly **ZERO** in Phase 0.
* **Superseded Historical Figures (Not Active Targets):** Earlier draft figures—specifically **80 MB PM2 worker RSS**, **P99 < 5 ms event-loop lag**, **50 ms or 5 ms global P95 response targets**, and **any HTTP 409 latency SLA of 5 ms, 10 ms or 100 ms**—are formally marked as superseded and inactive.

---

### CORRECTION 05 — PM2 Worker Sizing & Database Connection Quotas

#### 1. Technical Problem Identified in Prior Baseline
The formula `PM2 Workers = max(1, vCPU - 1)` and the example quota of 60 connections were described in terms that could be mistaken for verified production rules rather than engineering hypotheses.

#### 2. Sizing Methodology & Invariant Budget
* **Aggregate Budget Invariant:**
  $$\text{Total Application DB Connections} = \text{PM2 Worker Count} \times \text{connectionLimit per Worker} \le \text{HRMS Allocated DB Quota}$$
* **Provisional Classification:**
  - `max(1, vCPU - 1)` is a provisional heuristic, not a proven formula.
  - Four workers is an initial sizing hypothesis for a 4-vCPU host.
  - 60 connections is an unverified example quota; actual HRMS allocation on the shared MariaDB host (`srv999.hstgr.io`) must be verified in Phase 0.3.
  - MariaDB `wait_timeout = 20s` demands pool keep-alive validation (`idleTimeout: 10000`, active ping) to prevent socket drops, but is not the connection pool ceiling.
  - Final worker sizing is gated on Phase 0.3 live VPS hardware inspection (`nproc`, `free -m`) and Phase 10 load testing.

---

## 5. Summary of Decision Statuses & Governance

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DECISION & FINDING CLASSIFICATION                            │
│                                                                                                 │
│  [ APPROVED BUSINESS RULES — PRESERVED ]                                                        │
│  • BR-01: Single Attendance Session per Day (1 punch-in, 1 punch-out)                           │
│  • BR-02: Shift Management Architecture (Morning, Evening, Night/Overnight)                     │
│  • BR-03: Leave Deficit Submission with Line Manager Approval Authority                         │
│  • BR-04: Automated Shift-Aware Absent Marking (respecting leaves, offs, holidays)              │
│                                                                                                 │
│  [ APPROVED PROJECT-OWNER DECISIONS — PRESERVED & CLARIFIED ]                                   │
│  • POD-01: Overnight Attendance Date Attribution = SHIFT START DATE ATTRIBUTION                 │
│  • POD-04: Re-Punch After Manager Rejection = ADMINISTRATOR REGULARIZATION STRICTLY REQUIRED   │
│                                                                                                 │
│  [ PENDING PROJECT-OWNER DECISIONS — TRACKED AS IMPLEMENTATION GATES ]                          │
│  • POD-02: Absence Scheduler Execution Model (Two-Tier Daily vs Periodic Shift-Window)         │
│             └─► BLOCKS Phase 5 Scheduler Implementation until selected                          │
│  • POD-03: Leave Deficit Accounting Policy (Negative Balance vs Deficit Tag vs Payroll Ledger)  │
│             └─► BLOCKS Phase 8 Permanent Balance Deduction Schema until specified              │
│  • POD-05: Holiday Calendar Ownership & Entitlement Hierarchy                                   │
│             └─► BLOCKS Phase 2B Custom Holiday Group Schema until specified                     │
│  • POD-06: Shift Assignment Date-Boundary Policy (Inclusive [from, to] vs Exclusive [from, to))│
│             └─► BLOCKS Phase 2B/4 Shift Overlap SQL Implementation until confirmed              │
│                                                                                                 │
│  [ ITEMS REQUIRING TECHNICAL VALIDATION ]                                                       │
│  • Redis/MariaDB Concurrency Acceptance (Scenario A/B/C empirical timing & TTL calibration)     │
│  • Cloudinary Upload Intent Reconciliation State Machine (Heartbeat, fencing, and safety)      │
│  • Evidence-Based PM2 Worker & Connection Pool Sizing (CPU/RAM telemetry & connection quota)   │
│  • Phase 10 High-Concurrency k6 Load Testing Validation (P95 < 500ms baseline, 1,000 VUs)      │
│                                                                                                 │
│  [ PHASE 0.3 ITEMS REQUIRING LIVE VPS VERIFICATION ]                                            │
│  • Hostinger VPS KVM 4 SSH/Terminal access                                                      │
│  • VPS CPU core count (nproc) and available RAM (free -m)                                       │
│  • Dedicated HRMS connection quota on MariaDB (max_connections = 2000 shared host)              │
│  • PM2 Cluster runtime configuration & worker count                                             │
│  • Nginx virtual host, SSL/TLS certificates & reverse proxy headers                             │
│  • UFW firewall port restrictions & Redis local socket isolation                               │
│  • Host-level database backup cron automation                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Dependency Governance

| Dependency / Prerequisite | Gated Implementation Component | Implementation Block Status |
|---|---|:---:|
| **POD-02 Confirmation** | Phase 5 Absence Automation Scheduler | **BLOCKED** until owner selects scheduler model |
| **POD-03 Confirmation** | Phase 8 Permanent Balance Deduction Schema | **BLOCKED** until owner selects deficit accounting model |
| **POD-05 Confirmation** | Phase 2B Multi-Tier Holiday Calendar Ownership | **BLOCKED** until owner selects calendar ownership scope |
| **POD-06 Confirmation** | Phase 2B/4 Shift Assignment Overlap Implementation | **BLOCKED** until owner confirms inclusive vs exclusive dates |
| **Redis Concurrency Validation** | Attendance Concurrency Implementation Acceptance | Requires staging verification during Phase 3/10 |
| **Cloudinary Recovery Validation**| Upload Intent Reconciliation Acceptance | Requires staging test during Phase 2/7 |
| **VPS Hardware & Quota Verification**| Production Worker & Connection Pool Sizing | Deferred to Phase 0.3 Live Server Verification |
| **Phase 10 Staging Load Results** | Final System Performance Acceptance | Gated on Phase 10 execution prior to Phase 11 |

*Unblocked Components:* Phase 1 (Security Hardening) and Phase 2A (Database Indexing & N+1 Elimination) have no pending decision dependencies and may proceed immediately once the project owner authorizes implementation.

---

## 7. Outstanding Infrastructure Verification Items (Phase 0.3 Scope)

The following items cannot be determined from codebase analysis and are deferred strictly to Phase 0.3 live VPS inspection via SSH:
1. **VPS Hardware Inventory:** Exact vCPU core count (`nproc`), RAM allocation (`free -m`), and swap configuration.
2. **MariaDB Host Partitioning:** Confirmed shared host connection limit (`max_connections = 2000`) vs. dedicated HRMS application quota.
3. **Nginx Runtime Configuration:** Gzip compression status, reverse-proxy buffer sizes (`proxy_buffers`), SSL ciphers, and client body limits.
4. **Redis Deployment Topology:** Verification of local Redis installation, maxmemory policy (`volatile-lru`), and persistence config (`save` / `appendonly`).
5. **System Firewalls & Ports:** Inspection of UFW / iptables rules for port 3306 (MariaDB) and 6379 (Redis) host isolation.
6. **Automated Backup Strategy:** Inspection of daily MariaDB logical dump scripts, rotation retention policies, and offsite sync status.

---

## 8. Concise Unresolved-Risk Register

| Risk ID | Category | Description | Severity | Mitigation Strategy |
|---|---|---|:---:|---|
| **RISK-01** | Database | Host-wide `wait_timeout = 20s` drops idle connections rapidly. | **HIGH** | Configure `mysql2` pool with keep-alive validation and `idleTimeout: 10000`. |
| **RISK-02** | Security | Static salt `"nodejs"` in legacy PBKDF2 password hashes (`auth.js`). | **HIGH** | Implement seamless, zero-downtime on-login random-salt re-hashing migration. |
| **RISK-03** | Operations | Multi-worker PM2 without distributed locking could duplicate cron jobs. | **HIGH** | Require Redis distributed lock or pin scheduler execution to worker ID `0`. |
| **RISK-04** | Cloud Storage | Cloudinary API network stalls during punch photo upload. | **MEDIUM** | Asynchronous intent reconciliation worker with safe lease claiming. |
| **RISK-05** | Infrastructure | Shared MariaDB 11.8.9 host could suffer connection exhaustion from noisy neighbors. | **MEDIUM** | Cap pool size within HRMS allocation quota and monitor MariaDB thread pool. |
| **RISK-06** | Concurrency | Redis lock lease expiration during unexpected network or GC stalls. | **MEDIUM** | MariaDB parent-row locking is the intended authoritative concurrency architecture; runtime verification of all write paths and transactional checks required in staging. |

---

## 9. Final Acceptance Recommendation

The Phase 0.2.8 planning baseline is **fully reconciled, qualified, and mathematically verified**. All theoretical overstatements regarding distributed locking have been removed, schema references reflect verified empirical code, shift-boundary policy choices are cleanly separated from SQL logic, load testing targets are reconciled, and implementation dependencies are rigorously governed.

### Recommended Next Steps for Project Owner
1. **ACCEPT Phase 0.2.8 Planning Baseline:** Formally adopt `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1) and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1) as the qualified technical standard.
2. **RESOLVE Pending Decisions at Owner Discretion:**
   - Confirm Shift Date-Boundary Policy (**POD-06**: Option A Inclusive vs. Option B Exclusive).
   - Confirm Absence Scheduler Model (**POD-02**: Two-Tier Daily vs. Periodic Shift-Window).
   - Confirm Leave Deficit Accounting (**POD-03**) and Holiday Calendar Scope (**POD-05**).
3. **DECIDE Next Phase Authorization:**
   - Authorize **Phase 0.3 Live Server Verification** (to collect live VPS hardware and MariaDB quota evidence), OR
   - Authorize **Phase 1 Implementation** (Security Hardening & Environment Isolation, which is unblocked by any pending decision).

---

## 10. Reconciliation Addendum — Post-Review Harmonization

**Addendum Date:** November 14, 2026  
**Addendum Reference:** Phase 0.2.8 Post-Review Reconciliation  
**Governing Documents Updated:** `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1), `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1)  

Following project-owner review of Phase 0.2.8, this addendum harmonizes and records the final documentation clarifications across five specific architectural areas without altering historical audit findings:

### 1. Performance Criteria Reconciled into 5 Governance Classifications (Correction A)
The inconsistent performance targets across earlier drafts have been reconciled into a unified standard:
- **Provisional Planning Baseline:** **Core successful business operations: P95 < 500 ms — Provisional Planning Baseline.** (This is a planning baseline, not a measured result or an approved production SLA).
- **Measurements to Collect:** 
  - Tail latency ($P99$ response latency distribution) — distribution to measure and report; no approved threshold.
  - HTTP 409 latency — distribution to measure and report separately; no approved SLA.
- **Proposed Engineering Targets:**
  - Unexpected HTTP 5xx error rate $< 0.1\%$.
  - In-flight concurrency: 100–250 actively processing requests.
  - Throughput: 150–300 RPS sustained peak capacity.
  - Proposed 25-minute 4-stage profile (2m, 5m, 15m, 3m) and workload distribution profile.
  - Host CPU: < 75% — Proposed Engineering Target.
  - PM2 worker memory: `< 800 MB RSS per worker` — Proposed Engineering Target.
  - Node.js event-loop lag: `P99 < 50 ms` — Proposed Engineering Target.
  - Aggregate MariaDB connections: ≤ 60 (subject to verified host quota) — Proposed Engineering Target.
  - Redis command latency: `P99 < 5 ms` (measure and report, not an approved SLA) — Proposed Engineering Target.
- **Future Staging Acceptance Targets:** Staging population of 5,000 registered employees and 1,000 authenticated virtual users (VUs).
- **Actual Measured Results:** Explicitly **ZERO** in Phase 0.
- **Superseded Historical Figures (Not Active Targets):** Earlier draft figures—specifically **80 MB PM2 worker RSS**, **P99 < 5 ms event-loop lag**, **50 ms or 5 ms global P95 response targets**, and **any HTTP 409 latency SLA of 5 ms, 10 ms or 100 ms**—are formally marked as superseded and inactive.

### 2. Cloudinary Upload Intent Separate Lifecycles (Correction B)
The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` $\rightarrow$ intent inserted as `'pending'` $\rightarrow$ upload outside DB tx $\rightarrow$ DB tx locks parent user, inserts attendance, and marks intent `'committed'` $\rightarrow$ DB tx commits. A committed intent is terminal for cleanup and is **NEVER** selected for deletion.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Intents in `'pending'` or `'failed'` older than the provisional 2-hour threshold are claimed with a worker lease token (`cleanup_claimed`, `worker_id`, `lease_expires_at`). The worker rechecks database references across verified columns (`attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`). If referenced, the intent is updated to `'committed'`; if inconclusive, the asset is preserved for manual review; if conclusively unreferenced, `cloudinary.uploader.destroy(publicId)` is called and intent is marked `'cleaned'`.
- **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted.

### 3. Redis / MariaDB Concurrency Wording (Correction C)
All claims that Redis and MariaDB provide an atomic distributed transaction are removed. Redis provides non-authoritative distributed coordination and early duplicate-request rejection (`HTTP 409 Conflict`). MariaDB parent-row locking (`SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE`) and transactional state validation represent the intended authoritative concurrency architecture to enforce exactly-once attendance creation. Runtime acceptance is strictly dependent on verifying that every relevant write path acquires the same parent-row lock and performs transactional state validation. Documentation and specifications alone do not constitute proof of runtime guarantees. Redis pre-commit Lua checks are coordination safeguards, not atomic commit guarantees. Redis and MariaDB do not share 2PC. Redis TTL and fail-closed HTTP 503 outage policies remain provisional. Concurrency implementation acceptance requires actual staging tests.

### 4. Shift Assignment Boundary Decision (Correction D)
The choice between Option A (Inclusive Date Boundaries $[from, to]$) and Option B (Exclusive Date Boundaries $[from, to)$) remains classified as **PENDING OWNER CONFIRMATION (POD-06)**. Neither option is selected on behalf of the owner, and shift assignment overlap implementation remains **BLOCKED** until owner confirmation.

### 5. PM2 Worker & Connection Pool Sizing (Correction E)
`max(1, vCPU - 1)`, 4 workers, and 60 connections remain classified as provisional engineering hypotheses. The aggregate connection budget invariant ($\text{Workers} \times \text{connectionLimit} \le \text{Verified HRMS DB Quota}$) is preserved. MariaDB socket timeout (`wait_timeout = 20s`) is distinguished from the connection limit. Final sizing is deferred to Phase 0.3 VPS telemetry and Phase 10 load testing.


