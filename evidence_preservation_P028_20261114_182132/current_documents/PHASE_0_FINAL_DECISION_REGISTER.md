# PHASE 0 — FINAL DECISION REGISTER & APPROVED BUSINESS RULES
**Project:** Enterprise HRMS (5,000 Registered Employees / 1,000 Peak Simultaneous Users)  
**Document Version:** 2.7.1 (Phase 0.2.8 — Final Documentation Reconciliation)  
**Date:** November 14, 2026  
**Auditor / System Architect:** Antigravity Senior Engineering System Architect  
**Status:** Planning Baseline Reconciled | Risks Qualified | Implementation Strictly Not Authorized  

---

## 1. Executive Decision Summary

The project owner has reviewed and formally established binding operational rules for the HRMS platform. This register tracks approved foundational business rules (BR-01 through BR-04), approved project-owner decisions (POD-01, POD-04), and pending decisions requiring owner resolution before dependent phase execution (POD-02, POD-03, POD-05, POD-06).

| Decision ID | Domain | Decision Title | Operational Status | Approved Rule / Current Specification |
|---|---|---|:---:|---|
| **BR-01** | Attendance | **Daily Attendance Model** | **APPROVED** | Exactly one punch-in and one punch-out per employee per attendance day. Unconditional DB unique constraint permanently rejected. |
| **BR-02** | Shifts | **Shift Management** | **APPROVED** | Multi-shift support required (Morning, Evening, Night/Overnight) with shift-aware scheduling and window evaluation. |
| **BR-03** | Leaves | **Leave Balance Deficit** | **APPROVED** | Applications exceeding balance permitted; manager approval alone is sufficient. No automatic Loss-of-Pay assumption. |
| **BR-04** | Attendance | **Automated Absent Marking** | **APPROVED** | Automatic absent marking evaluated against assigned shift attendance windows, strictly excluding approved leaves, weekly offs, and holidays. |
| **POD-01** | Attendance / Shifts | **Overnight Date Attribution** | **APPROVED** | **Shift Start Date Attribution:** Exactly one attendance record per overnight shift, attributed to the date the shift begins in local shift timezone. |
| **POD-04** | Attendance / Regularization | **Re-Punch After Rejection** | **APPROVED** | **Administrator Regularization Strictly Required:** No immediate re-punch allowed; rejected record retained; admin regularization strictly required. |
| **POD-02** | Scheduler | **Absence Execution Model** | **PENDING** | Choice between Two-Tier Daily Schedule (23:55 + 08:00) vs. Periodic Shift-Window Evaluation (Phase 5 scheduler implementation conditional on this choice). |
| **POD-03** | Leaves / Payroll | **Deficit Accounting Policy** | **PENDING** | Technical representation of approved deficit (negative balance vs. deficit marker vs. payroll ledger review). |
| **POD-05** | Holidays / Shifts | **Holiday Calendar Ownership** | **PENDING** | Multi-tier holiday calendar ownership hierarchy (Location-only vs. Organization/Jurisdiction/Employee Group). |
| **POD-06** | Shifts / Rosters | **Shift Date-Boundary Policy** | **PENDING** | Choice between Inclusive Date Boundaries $[from, to]$ (gap required between assignments) vs. Exclusive Date Boundaries $[from, to)$ (same-date handover permitted). |

---

## 2. Detailed Approved Business Rules & Directives

### BR-01 — Single Attendance Session Per Day
* **Approved Decision:** Exactly one punch-in and one punch-out per employee per attendance day.
* **Business Requirements:**
  1. An employee may have only one valid attendance session per designated attendance day.
  2. A successful punch-in opens the session; a successful punch-out closes that session.
  3. Repeated punch-in requests while a session is open or after a session has successfully closed must not create additional attendance records.
  4. Concurrent punch-in requests must be rejected idempotently without race conditions.
  5. Existing attendance approval, rejection, geofencing, and audit history must remain intact.
* **Technical Constraints & Directives:**
  * **No Unconditional DB Unique Key:** Do not introduce an unconditional `UNIQUE(user_id, date)` constraint on `attendance_attendance`. The live MariaDB database already contains multi-session historical data (e.g. `user_id: 12` on `2026-05-30`), and overnight shifts span across two calendar dates.
  * **Authoritative Relational Serialization Architecture:** Single-session enforcement is intended to be enforced via MariaDB parent-row exclusive locks (`SELECT id FROM accounts_user WHERE id = ? FOR UPDATE`) executed within the attendance transaction as the authoritative concurrency architecture, with runtime acceptance dependent on verifying that every relevant write path acquires the same parent-row lock and performs transactional state validation. Redis distributed edge coordination (`lock:punch:${userId}`) acts as a lightweight early-rejection shield. MariaDB is the sole authoritative source of truth. Documentation and architectural models alone do not prove runtime concurrency behavior; empirical validation is required in Phase 3/10 staging.

---

### BR-02 — Shift Management Architecture
* **Approved Decision:** Shift management is a mandatory core capability.
* **Supported Shift Categories:**
  1. **Morning Shift** (e.g. 08:00 – 16:00 / 09:00 – 18:00)
  2. **Evening / Afternoon Shift** (e.g. 14:00 – 22:00 / 16:00 – 00:00)
  3. **Night / Overnight Shift** (e.g. 22:00 – 06:00, crossing midnight)
* **Domain Design Requirements (Allocated to Dedicated Phase 2B):**
  1. **Shift Definitions:** Shift name, code, start time, end time, cross-midnight flag (`is_overnight`), and active status.
  2. **Configurable Grace Periods:** Punch-in start grace, punch-in late threshold, punch-out early threshold, and auto-close grace buffer.
  3. **Employee Shift Assignments:** Mapping of employee (`user_id`) to shift (`shift_id`) with effective start date (`effective_from`) and optional effective end date (`effective_to`).
  4. **Calendar Rules:** Assignment of scheduled weekly offs (e.g. Sunday or rotational rest days) and scoped public holiday calendars.
  5. **Historical Preservation:** Historical shift assignments are immutable. Updates set `effective_to` on existing records and insert a new assignment, ensuring past attendance evaluations remain historically accurate.
  6. **Attendance-to-Shift Relationship:** Each attendance session references its applicable `shift_id` and assigned shift window.

---

### BR-03 — Leave Balance Deficit Policy & Manager Authority
* **Approved Decision:** Allow leave applications even when the employee has insufficient leave balance, subject to manager review and approval.
* **Manager Approval Authority:**
  * **Manager approval alone is sufficient** to approve or reject leave applications submitted with insufficient balance.
  * Additional HR approval is **not required** unless the project owner explicitly mandates a secondary tier in a future policy update.
* **Business Requirements:**
  1. Employees may submit leave applications exceeding their available balance.
  2. Applications must not be automatically rejected at the API layer solely due to insufficient balance.
  3. The reviewing manager must be provided full visibility into the employee's allotted balance, approved leaves taken, and requested deficit.
  4. The system retains an immutable, auditable record of the manager's decision.
* **Loss-of-Pay (LOP) Directive:**
  * **No automatic Loss-of-Pay classification:** Applications exceeding balance must **not** be automatically converted into or classified as Loss-of-Pay (unpaid leave) unless explicitly designated by organizational policy.
  * The technical accounting representation remains pending under decision **POD-03**.

---

### BR-04 — Automated Shift-Aware Absent Marking & Schedule Reconciliation
* **Approved Decision:** Automatic absent marking is required.
* **Business Requirements:**
  1. The automated scheduler must identify active employees who failed to record an attendance punch for their scheduled workday.
  2. Eligible employees must be marked with an attendance status of `'absent'`.
  3. Employees on approved leave, scheduled weekly offs, or recognized holidays must be strictly excluded from absence generation.
  4. Existing attendance records (present, approved, pending review, rejected) must never be overwritten.
  5. Historical attendance records must never be modified by daily absence jobs.
  6. Idempotent scheduler execution: multiple executions of the absence job must never create duplicate absence entries.
* **Shift Window Reconciliation:**
  * Evaluating all employees at 23:55 is valid for day and evening shifts whose punch windows close prior to 23:55.
  * For night shifts (e.g. 22:00 – 06:00), an evaluation at 23:55 would prematurely mark working employees absent while their shift is actively underway.
  * Absence evaluation must occur **after the assigned shift's attendance window has closed**.

---

### POD-01 — Overnight Attendance Date Attribution (APPROVED)
* **Approved Decision:** **SHIFT START DATE ATTRIBUTION**
* **Attribution Rules:**
  * For an overnight shift beginning at 22:00 on November 14 and ending at 06:00 on November 15:
    * **Attendance Date:** `2026-11-14` (the calendar date on which the scheduled shift commences in the shift's local timezone).
    * **Punch-In Timestamp:** `2026-11-14 22:00:00` local / stored as UTC in `punch_in_time` (`2026-11-14T16:30:00.000Z` for `Asia/Kolkata`).
    * **Punch-Out Timestamp:** `2026-11-15 06:00:00` local / stored as UTC in `punch_out_time` (`2026-11-15T00:30:00.000Z` for `Asia/Kolkata`).
    * **Single Session Record:** Exactly one attendance record in `attendance_attendance` represents the entire shift.
  * **System-Wide Uniformity:** All attendance reports, shift rosters, monthly registers, daily timesheets, and overtime queries uniformly calculate and attribute hours against the shift start date.

---

### POD-04 — Re-Punch After Manager Rejection (APPROVED)
* **Approved Decision:** **ADMINISTRATOR ATTENDANCE REGULARIZATION STRICTLY REQUIRED**
* **Operational Workflow:**
  1. When a reviewing manager rejects an employee's punch-in:
     * The employee **cannot** submit another self-service punch-in for the same attendance day.
     * The existing attendance record transitions to terminal status `'rejected'` and remains immutably stored for audit purposes.
     * Attempting to punch in again returns `HTTP 400 Bad Request` or `HTTP 409 Conflict` indicating that the session for this date was rejected and requires administrative review.
  2. The employee must initiate an attendance regularization request.
  3. An authorized administrator reviews the incident and performs the necessary attendance regularization. Regularization by an administrator is **strictly required** to resolve the rejected attendance day (not merely permitted).
  4. Both the initial manager rejection and the subsequent administrator regularization action must be fully logged in an append-only audit history with actor IDs, timestamps, and justification notes.
  5. No historical record may be silently overwritten or deleted.
* **Authorization Flag for Future Design:** Role-based authorization details for the regularization workflow (e.g. Super Admin vs. Department Admin permissions, regularization request ticket table) are flagged for dedicated design during Phase 7/8.

---

## 3. Technical Specifications & Defect Closures

### 3.1 Password Security & On-Login Random Salt Migration Design
* **Current Implementation:** PBKDF2 (`crypto.pbkdf2Sync`), SHA-256 digest, 390,000 iterations, 32-byte key, static salt `"nodejs"`, 4-part Django format (`node_backend/src/utils/auth.js:1-27`).
* **Vulnerability Analysis:** A static salt allows rainbow-table pre-computation against database dumps and exposes identical passwords across accounts.
* **Future-Compatible Zero-Lockout Migration (Phase 1 Target):**
  1. `makeNodePassword` is updated to generate a 16-byte cryptographically secure random salt (`crypto.randomBytes(16).toString("base64")`) for all new password hashes.
  2. `verifyDjangoPassword` already parses salt dynamically from `encoded.split("$")[2]`, automatically verifying both legacy `"nodejs"` hashes and new unique-salt hashes without modification.
  3. In `accountsService.login`: Upon successful verification, if `user.password.split("$")[2] === "nodejs"`, the service transparently re-hashes the raw password with a fresh random salt and updates `accounts_user.password`.

---

### 3.2 Redis Lease Expiry and MariaDB Authoritative Concurrency Control (Correction C)

#### 1. Fundamental Architecture & Division of Responsibility
Redis and MariaDB do not share an atomic transaction boundary (no distributed Two-Phase Commit). A successful Redis token check cannot guarantee that the Redis lease remains valid until MariaDB completes its `COMMIT`. There is an inherent time gap between external network validation and the database commit phase. Describing this arrangement as an atomic commit or claiming that documentation alone guarantees exactly-once attendance creation is rejected.

The system architecture establishes a strict separation of concerns:

* **Redis Coordination Layer (Non-Authoritative):**
  - Provides distributed request coordination and early duplicate-request rejection at the edge (`HTTP 409 Conflict`).
  - Uses unique cryptographically secure lock tokens (`crypto.randomUUID()`) and atomic Lua-checked release.
  - Operates with a configurable, measurable lease duration (provisional baseline: 15 seconds; to be calibrated under upload latency and staging load).
  - **Non-Authoritative:** Redis is **not** the authoritative attendance record and **not** the final source of truth. Redis lock expiry does not independently determine whether a MariaDB attendance transaction is valid.
* **MariaDB Database Engine (Authoritative Source of Truth):**
  - MariaDB is the sole authoritative source of attendance state and transaction integrity.
  - Concurrency serialization is enforced by acquiring an exclusive row lock on the permanent employee parent record:
    ```sql
    SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE;
    ```
  - Attendance state for the designated shift date is verified **after** acquiring the parent-row lock and **within the same database transaction** as the punch insert.
  - Database serialization and transactional state validation remain the authoritative controls to prevent duplicate attendance sessions, even if Redis leases expire, clock drift occurs, or concurrent requests wait.

#### 2. Re-Evaluation of the Three Concurrency Scenarios

```
SCENARIO A: Request A Commits Before Redis Lease Expires (Fast Path)
Request A (t=0)   ──> [Acquires Redis Lock Token A] ──> [Acquires MariaDB Parent Lock] ──> [Checks DB (None)] ──> [Pre-Commit Lua Check OK] ──> [COMMIT (201)]
Request B (t=10ms)──> [Rejected at Redis Lock with HTTP 409] OR [Waits on DB Parent Lock ──> Sees Committed Session ──> ROLLBACK (409)]

SCENARIO B: Request A Redis Lease Expires Mid-Flight (Lease Expiry Path)
Request A (t=0)   ──> [Acquires Redis Lock (TTL=15s)] ──> [Holds DB Parent Lock] ──> [I/O Delay >15s]
                      Redis Lease Expires (t=15.001s)
Request B (t=15.002s)─> [Acquires Redis Lock Token B] ──> [Attempts DB Parent Lock ──> SYNCHRONOUSLY BLOCKED by MariaDB]
Request A (t=15.010s)─> [Policy Evaluation: See Transaction Policy Below]
                      Case 1 (Lua Check Abort): Request A rolls back (408/500) ──> Request B unblocks ──> Checks DB (None) ──> Commits (201).
                      Case 2 (DB Commit): Request A commits (201) ──> Request B unblocks ──> Checks DB (Sees A's record) ──> Rolls back (409).
                      Result in BOTH cases: Exactly one attendance record created. Zero duplicate sessions.

SCENARIO C: Request B Serialized on MariaDB Parent Row (DB Serialization Path)
Request A (t=0)   ──> [Holds DB Parent Lock] ──> [Pre-Commit Verification] ──> [MariaDB COMMIT (201)] ──> [Releases DB Parent Lock]
Request B (t=1s)  ──> [Passes/Acquires Redis Coordination] ──> [Waits on DB Parent Lock]
                      Request A releases lock (t=1.5s)
Request B (t=1.501s)─> [Acquires DB Parent Lock] ──> [Queries attendance_attendance within tx] ──> [Sees Committed Session] ──> [ROLLBACK (409 Conflict)]
```

#### 3. Detailed Transaction Policy for Scenario B
In Scenario B, if Request A's Redis lease expires while its MariaDB transaction is still running, Request B is safely blocked in MariaDB on `accounts_user FOR UPDATE`. The architectural transaction policy operates as follows:
* **Coordination Safeguard (Lua Token Check):** Prior to issuing `COMMIT`, Request A executes an atomic Lua script:
  ```lua
  if redis.call('get', KEYS[1]) == ARGV[1] then return 1 else return 0 end
  ```
* **If Lua check fails (token expired or acquired by B):** Request A treats lost Redis lease as a potential timeout hazard, immediately issues `ROLLBACK` on MariaDB, triggers compensation for any pending Cloudinary intent, and returns `HTTP 408 Request Timeout` or `HTTP 500`. Request A releases the parent lock; Request B unblocks, verifies that no attendance record exists in MariaDB, inserts its attendance record, and commits (`HTTP 201 Created`).
* **If Request A commits anyway (or Lua check succeeds right before lease boundary):** Request A commits its record to MariaDB (`HTTP 201 Created`) and releases the parent lock. Request B unblocks, executes its mandatory transactional state check `SELECT id FROM attendance_attendance WHERE user_id = :userId AND date = :shiftDate`, detects the record committed by Request A, executes `ROLLBACK`, releases its Redis lock, and returns `HTTP 409 Conflict`.
* **Authoritative Integrity Invariant:** Under neither execution outcome can duplicate attendance records be created. MariaDB parent-row locking is the authoritative integrity control.

#### 4. Design Qualification & Status
* **No Distributed 2PC:** Redis and MariaDB do not participate in a two-phase commit. Redis pre-commit checks are coordination safeguards, not atomic commit guarantees.
* **Fail-Closed Redis Outage Policy:** If Redis is unreachable or times out, the punch endpoint follows a provisional **fail-closed policy**, returning `HTTP 503 Service Unavailable`. No database transaction is opened.
* **Provisional Parameters:** Redis TTL (15s baseline) and lock retry intervals remain provisional until measured under production-like network latencies and staging load in Phase 10.
* **Qualification Status:** Concurrency implementation acceptance is marked **NEEDS TECHNICAL VALIDATION** during Phase 3/10 staging verification.
* **Unconditional Unique Constraint:** An unconditional `UNIQUE(user_id, date)` constraint on `attendance_attendance` remains **EXPLICITLY REJECTED**.

---

### 3.3 Shift Assignment Date-Boundary Policy (Correction D)

#### 1. Technical Overlap Formulation
Shift assignments map an employee (`user_id`) to a shift schedule over a valid date range $[effective\_from, effective\_to]$, where `effective_to IS NULL` represents an open-ended, indefinitely active assignment (modeled mathematically as $+\infty$ or `'9999-12-31'`).

To prevent concurrent insertion of conflicting shift assignments, all operations serialize on the employee's parent record:
```sql
SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE;
```

#### 2. Logical Query Separation
* **Case 1: New Shift Assignment Creation (No ID Excluded)**
  ```sql
  SELECT id, shift_id, effective_from, effective_to 
  FROM attendance_shift_assignment
  WHERE user_id = :userId
    AND effective_from <= COALESCE(:newEffectiveTo, '9999-12-31')
    AND COALESCE(effective_to, '9999-12-31') >= :newEffectiveFrom
  LIMIT 1 FOR UPDATE;
  ```
* **Case 2: Existing Shift Assignment Update (Excluding Current Assignment ID)**
  ```sql
  SELECT id, shift_id, effective_from, effective_to 
  FROM attendance_shift_assignment
  WHERE user_id = :userId
    AND id != :currentAssignmentId
    AND effective_from <= COALESCE(:newEffectiveTo, '9999-12-31')
    AND COALESCE(effective_to, '9999-12-31') >= :newEffectiveFrom
  LIMIT 1 FOR UPDATE;
  ```
  *(Unified parameter query: `AND (:currentAssignmentId IS NULL OR id != :currentAssignmentId)`)*

#### 3. Date-Boundary Policy Options (PENDING OWNER CONFIRMATION — POD-06)
The semantic definition of date boundaries is a business policy requiring explicit project-owner confirmation:

* **Option A: Inclusive Date Boundaries (Standard Calendar Day Policy)**
  - `effective_to` is the final active working calendar date of the assignment.
  - *Example:* Assignment 1 ending on `2026-06-30` means the employee works Assignment 1 through end of day June 30.
  - *Consequence:* Assignment 2 **cannot** begin on `2026-06-30`. It must begin on `2026-07-01`.
  - *Overlap Condition:* `effective_from <= :to AND effective_to >= :from` (boundary sharing is an overlap).
* **Option B: Exclusive Date Boundaries (Handover Boundary Policy)**
  - `effective_to` represents the cutoff boundary where the subsequent assignment begins.
  - *Example:* Assignment 1 with `effective_to = 2026-06-30` permits Assignment 2 to commence on `2026-06-30`.
  - *Consequence:* Requires strict midnight handover semantics; overnight shifts crossing the handover date require explicit shift-start attribution rules.
  - *Overlap Condition:* `effective_from < :to AND effective_to > :from` (boundary sharing is permitted).

> [!IMPORTANT]
> **GOVERNANCE GATE:** The date-boundary policy remains classified as **PENDING OWNER CONFIRMATION (POD-06)**. Neither Option A nor Option B may be treated as approved until the project owner provides explicit written confirmation. Implementation of shift assignment overlap logic in Phase 2B/4 is gated on this confirmation.

---

### 3.4 Cloudinary Upload Intent & Safe Orphan Reconciliation (Correction B)

#### 1. Separate Lifecycle Paths (Successful vs. Abandoned)
To eliminate any ambiguity or implication that committed attendance records could enter an orphan cleanup pipeline, the lifecycle is partitioned into two mutually exclusive paths:

```
SUCCESSFUL ATTENDANCE PATH:
[UUID uploadToken + Deterministic publicId]
       │
       ▼
[Persist Upload Intent: status = 'pending']
       │
       ▼
[Upload to Cloudinary outside DB Transaction]
       │
       ▼
[Open DB Tx: Lock Parent accounts_user FOR UPDATE]
       │
       ├─► Insert into attendance_attendance (referencing publicId)
       │
       └─► UPDATE attendance_upload_intent SET status = 'committed'
       │
       ▼
[COMMIT Database Transaction]
       │
       ▼
[TERMINAL STATE: 'committed' intents are NEVER selected for cleanup or deletion]

ABANDONED OR FAILED UPLOAD PATH (Uncommitted Intents Only):
[Query eligible uncommitted intents: status IN ('pending', 'failed') AND created_at < NOW() - 2h]
       │
       ▼
[Claim Cleanup Lease: UPDATE status = 'cleanup_claimed', worker_id = :workerId, lease_expires_at]
       │
       ▼
[Confirm Worker Lease Ownership]
       │
       ▼
[Pre-Deletion DB Reference Check across punch_in_photo, punch_out_photo, and file]
       │
       ├─► [References Found]: Preserve Asset ──► Reconcile status to 'committed'
       │
       ├─► [Verification Inconclusive/Error]: Preserve Asset ──► Flag for manual review
       │
       └─► [Conclusively Unreferenced]:
             │
             ├─► Call cloudinary.uploader.destroy(publicId)
             │
             └─► UPDATE attendance_upload_intent SET status = 'cleaned'
```

#### 2. Verified Database Reference Schema (Empirical Inspection Findings)
Read-only inspection of the active codebase and schema reveals the following exact field names:
* **Attendance Photos (`attendance_attendance` table):**
  - Columns: `punch_in_photo` (VARCHAR) and `punch_out_photo` (VARCHAR).
  - Storage format: `cloudinary://${public_id}` or legacy relative disk path.
  - *Finding:* There is **NO** `photo_url` column in `attendance_attendance`.
* **Employee Documents (`accounts_employeedocument` table):**
  - Column: `file` (VARCHAR).
  - Storage format: `cloudinary://${public_id}` or legacy relative disk path.
  - *Finding:* There is **NO** `file_path` column in `accounts_employeedocument`.

#### 3. Mandatory Pre-Deletion Reference Verification Query
Immediately prior to issuing any Cloudinary deletion, the worker must re-verify that no committed database record references the asset:
```sql
SELECT id FROM attendance_attendance 
WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
   OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
UNION ALL
SELECT id FROM accounts_employeedocument 
WHERE file LIKE CONCAT('%', :publicId, '%');
```

#### 4. Safety Controls & Invariants
* **`cleanup_claimed` State Scope:** Exclusively applies to eligible uncommitted candidates (`status IN ('pending', 'failed')`). A committed intent (`status = 'committed'`) is terminal and must **never** transition into `cleanup_claimed`.
* **Two-Hour Threshold Qualification:** The 2-hour buffer is a provisional minimum age filter, **not** sufficient proof of abandonment.
* **Worker Leases, Ownership Validation & Fencing:** Worker lease tokens (`worker_id`) and expiration timestamps (`lease_expires_at`) are proposed controls requiring implementation and staging validation.
* **Idempotent Crash Recovery:** If Cloudinary deletion succeeds but the database status update fails, a subsequent worker checking Cloudinary receives an asset-not-found response; the worker marks the intent `cleaned` without treating this as an error.
* **Absolute Deletion Safety Rule:** An asset must **NEVER** be deleted when a committed database record references it. If the reconciliation worker cannot conclusively prove that an asset is an unreferenced orphan, it must **NOT** delete the file. The record is flagged for manual administrative review. Legitimate attendance evidence must never be sacrificed for automated cleanup. No Cloudinary operations are authorized in Phase 0.2.8.

---

### 3.5 Phase 10 Load-Test Acceptance Criteria (Correction A)

#### 1. Performance Metric Classification Table

All load-testing metrics are formally categorized across the five governance classifications:

| Metric / Parameter | Value / Range | Governance Classification | Status & Operational Meaning |
|---|---|:---:|---|
| **Core Operations Response Baseline** | **Core successful business operations: P95 < 500 ms** | **Provisional Planning Baseline** | Planning baseline for successful core read/write endpoints; not a measured result or an approved production SLA. Subject to staging calibration. |
| **High-Latency Tail Response** | $P99$ response latency distribution | **Measurement to Collect** | Distribution to measure and report; no approved threshold. |
| **HTTP 409 Conflict Response** | Distribution to measure and report separately | **Measurement to Collect** | Edge-rejected duplicate punches tracked separately from system failures; latency distribution reported without treating 5ms/10ms/100ms as an approved SLA. |
| **System Error Budget** | Unexpected HTTP 5xx error rate $< 0.1\%$ | **Proposed Engineering Target** | Proposed engineering target ($< 1$ failure per 1,000 requests), subject to owner review. |
| **Target Population Scale** | 5,000 registered employees | **Future Staging Acceptance Target** | Staging population target; not a claim of current production capacity. |
| **Simultaneous Virtual Users (VUs)** | 1,000 authenticated sessions | **Future Staging Acceptance Target** | Staging target for active concurrent sessions; not current production capacity. |
| **In-Flight Concurrency** | 100–250 actively processing requests | **Proposed Engineering Target** | Proposed test workload parameter for actively processing requests at any millisecond. |
| **Throughput Target** | 150–300 requests/second (RPS) | **Proposed Engineering Target** | Proposed test workload parameter for sustained peak throughput capacity. |
| **Test Duration & Profile** | 25-minute 4-stage profile | **Proposed Engineering Target** | Proposed test stages (2m warm-up, 5m ramp-up, 15m sustained, 3m ramp-down); pending approval and staging validation. |
| **Workload Distribution** | 40% Att, 25% Real-time, 15% Dir, 10% Rep, 5% Leave, 5% Prof | **Proposed Engineering Target** | Proposed staging workload profile pending staging validation. |
| **VPS Host CPU Utilization** | $< 75\%$ average across cores | **Proposed Engineering Target** | Proposed engineering target; not an approved binding SLA. |
| **PM2 Worker Memory (RSS)** | $< 800\text{ MB}$ RSS per worker | **Proposed Engineering Target** | Proposed engineering target; not an approved binding SLA. |
| **Node.js Event-Loop Lag** | $P99 < 50\text{ ms}$ | **Proposed Engineering Target** | Proposed engineering target; not an approved binding SLA. |
| **Aggregate MariaDB Connections** | $\le 60$ across all workers | **Proposed Engineering Target** | Proposed engineering target; subject to verified quota on shared host; not an approved binding SLA. |
| **Redis Command Latency** | $P99 < 5\text{ ms}$ | **Proposed Engineering Target** | Proposed engineering target; measure and report, not an approved SLA. |
| **Actual Measured Load Results** | Zero | **Actual Measured Results** | **Explicitly ZERO:** No load tests performed in Phase 0. |

*Superseded Historical Figures (Not Active Targets):* Earlier figures—specifically **80 MB PM2 worker RSS**, **P99 < 5 ms event-loop lag**, **50 ms or 5 ms global P95 response targets**, and **any HTTP 409 latency SLA of 5 ms, 10 ms or 100 ms**—are formally marked as **superseded, not active targets**.

#### 2. Future Phase 10 Test Reporting Requirements
The final Phase 10 execution report must document:
1. Exact test environment hardware, MariaDB version, and Redis configuration.
2. Seeded dataset size and distribution.
3. Test duration, VU ramp curve, and measured in-flight concurrency.
4. Latency percentiles ($P50$, $P95$, $P99$) per endpoint.
5. Itemized counts of HTTP 2xx, HTTP 409 business conflicts, HTTP 4xx errors, and HTTP 5xx errors.
6. MariaDB pool utilization, thread waits, and slow query log summary.
7. Node.js heap consumption, GC pause frequencies, and event-loop lag.
8. Identified bottlenecks and remediation verification evidence.

---

### 3.6 Evidence-Based PM2 Worker Sizing & Database Connection Quotas (Correction E)

#### 1. Sizing Methodology & Factors
The sizing of PM2 cluster workers must not rely on rigid rules of thumb. Sizing must be empirically determined based on live host telemetry in Phase 0.3 and validated under load in Phase 10, considering:
1. Available physical/virtual CPU cores (`nproc`).
2. Total available system RAM (`free -m`).
3. Memory footprint of Node.js under load (150–400 MB RSS per worker).
4. System memory requirements for MariaDB, Redis, Nginx, and OS page cache.
5. Dedicated database connection allocation available specifically to the HRMS application.
6. Database connection pool size per worker (`connectionLimit`).
7. Peak request latency and worker stability (zero unexpected PM2 restarts).

#### 2. Aggregate Connection Budget Invariant
The total database connection allocation must strictly observe the connection budget:
$$\text{Total Application DB Connections} = \text{PM2 Worker Count} \times \text{connectionLimit per Worker} \le \text{Verified HRMS DB Quota}$$

#### 3. Classification of Provisional Parameters
The following parameters are strictly **provisional engineering hypotheses** until verified:
* **Worker Formula:** `PM2 Workers = max(1, vCPU - 1)` is a provisional heuristic, not a proven formula.
* **Four-Worker Configuration:** Retained strictly as an initial sizing hypothesis for a 4-vCPU host.
* **60-Connection Quota:** An unverified example hypothesis; the actual HRMS allocation on the shared MariaDB host (`srv999.hstgr.io`) must be verified in Phase 0.3.
* **Connection Pool Sizing:** Individual worker connection limits cannot be increased independently without violating the aggregate quota.
* **MariaDB Socket Timeout:** The reported parameter `wait_timeout = 20s` demands pool keep-alive validation (`idleTimeout: 10000`, active ping) to prevent socket drops, but must not be confused with the total connection limit.

---

## 4. Protected Core Features Preservation Register

The seven core application features identified in the Phase 0 audit remain protected from unnecessary refactoring:

| # | Protected Feature | Implementation Location | Protective Directive & Verified Parameters |
|---|---|---|---|
| 1 | **PBKDF2 Password Hashing** | `node_backend/src/utils/auth.js` | **Verified Parameters:** PBKDF2, SHA-256 digest, 390,000 iterations, 32-byte key, static salt `"nodejs"`, 4-part Django format. Preserve backward compatibility; future migration via on-login random salting. |
| 2 | **JWT Refresh Token Rotation & Reuse Revocation** | `node_backend/src/services/accounts.service.js` | Retain cryptographic token family tracking, SHA-256 token hashing, and immediate family revocation upon reuse. |
| 3 | **Spherical Haversine Geofencing** | `node_backend/src/services/attendance.service.js` | Retain Great-Circle trigonometric formula and multi-location radius evaluation. |
| 4 | **Cascading Attendance Approval Hierarchy** | `node_backend/src/services/attendance.service.js` | Retain 2-tier / 3-tier supervisor-to-admin approval escalation hierarchy. |
| 5 | **Private Cloudinary KYC Storage & Signed URLs** | `node_backend/src/services/cloudinary.service.js` | Retain authenticated delivery type, private storage buckets, and HMAC-SHA1 signed access URLs. |
| 6 | **Binary Magic-Byte File Inspection** | `node_backend/src/middleware/validation.js` | Retain buffer header inspection (`%PDF`, JPEG, PNG) prior to storage processing. |
| 7 | **Mobile SecureStore Token Interceptors** | `hrms_mobile/src/services/api.ts` | Retain hardware-backed Expo SecureStore keychain persistence and 401 refresh interceptors. |

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

## 7. Authorization Boundary

> [!WARNING]
> **THIS DOCUMENT CLOSES PHASE 0.2.8 FINAL DOCUMENTATION RECONCILIATION ONLY.**
> 
> It strictly **does not authorize**:
> - Application source code modifications.
> - Database DDL execution or schema migrations.
> - Dependency installation or package modifications.
> - Redis installation or configuration.
> - Cloudinary asset upload, modification, or deletion.
> - VPS, PM2, Nginx, or firewall changes.
> - Execution of Phase 0.3, Phase 1, or any implementation phase.
> 
> Antigravity remains in strict read-only audit mode pending project-owner review and explicit approval.

---
*End of Phase 0.2.8 Final Decision Register.*
