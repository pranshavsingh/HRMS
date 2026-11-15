# PHASE 0 — CONSOLIDATED FINAL IMPLEMENTATION MATRIX & CHECKLIST
**Project:** Enterprise HRMS (5,000 Registered Employees / 1,000 Peak Simultaneous Users)  
**Document Version:** 2.7.1 (Phase 0.2.8 — Final Documentation Reconciliation)  
**Date:** November 14, 2026  
**Auditor / System Architect:** Antigravity Senior Engineering System Architect  
**Status:** Planning Baseline Reconciled | Risks Qualified | Implementation Strictly Not Authorized  

---

## 1. Approved Business Rules & Owner Decisions Cross-Reference

This checklist incorporates all binding business rules (BR-01 through BR-04), approved project-owner decisions (POD-01, POD-04), and explicit dependency tracking for pending decisions (POD-02, POD-03, POD-05, POD-06):

* **BR-01 (Single Attendance Session per Day) [APPROVED]:** Exactly one punch-in and one punch-out per employee per attendance day. Intended authoritative concurrency serialization via MariaDB parent row exclusive locks (`SELECT id FROM accounts_user WHERE id = ? FOR UPDATE`) executed within the attendance transaction, with Redis distributed edge coordination (`lock:punch:${userId}`) acting as an early-rejection shield; runtime acceptance requires verifying all write paths and transactional state checks in staging. Unconditional unique DB index on `(user_id, date)` is permanently rejected.
* **BR-02 (Shift Management Architecture) [APPROVED]:** Multi-shift support (Morning, Evening, Night/Overnight). Attendance attributed to assigned shift schedule. Shift and scoped holiday calendar schema allocated to dedicated Phase 2B.
* **BR-03 (Leave Balance Deficit Policy) [APPROVED]:** Permit leave applications exceeding available balance; **manager approval alone is sufficient** to approve or reject. Insufficient balance applications are **not** automatically classified as Loss-of-Pay.
* **BR-04 (Automated Shift-Aware Absence Marking) [APPROVED]:** Automated absence generation evaluated after assigned shift attendance windows close, strictly excluding approved leaves, scheduled weekly offs, and holidays.
* **POD-01 (Overnight Attendance Date Attribution) [APPROVED]:** **Shift Start Date Attribution.** Night shift beginning at 22:00 on Day D and ending at 06:00 on Day D+1 is recorded as a single attendance record attributed to Date D in the shift's local timezone.
* **POD-04 (Re-Punch After Manager Rejection) [APPROVED]:** **Administrator Attendance Regularization Strictly Required.** If a manager rejects a punch-in, the employee cannot submit a self-service re-punch for that day. The rejected record remains for audit; administrative regularization is strictly required.
* **POD-02 (Absence Scheduler Execution Model) [PENDING]:** Choice between Two-Tier Daily Schedule (23:55 + 08:00) vs. Periodic Shift-Window Evaluation. **Phase 5 scheduler implementation is CONDITIONAL / BLOCKED on this selection.**
* **POD-03 (Leave Deficit Accounting Representation) [PENDING]:** Accounting representation of approved deficits (negative balance vs. deficit marker vs. payroll ledger adjustment). **Phase 8 permanent deficit balance deduction is CONDITIONAL / BLOCKED on this specification.**
* **POD-05 (Holiday Calendar Ownership & Entitlement Hierarchy) [PENDING]:** Scope of holiday calendar hierarchy (Location-only vs. Organization/Jurisdiction/Employee Group). **Phase 2B custom holiday group schema is CONDITIONAL / BLOCKED on this specification.**
* **POD-06 (Shift Date-Boundary Policy) [PENDING]:** Choice between Inclusive Date Boundaries $[from, to]$ (gap required between assignments) vs. Exclusive Date Boundaries $[from, to)$ (same-date handover permitted). **Phase 2B/4 shift assignment overlap implementation is CONDITIONAL / BLOCKED on this confirmation.**

---

## 2. Revised Implementation Dependency Graph & Governance

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PHASE IMPLEMENTATION DEPENDENCY GRAPH                           │
│                                                                                                 │
│  Phase 1: Security & Environment Isolation (PBKDF2, CORS, Rate Limiting)                        │
│     │                                                                                           │
│     ▼                                                                                           │
│  Phase 2A: Database Indexing & Set-Based Query Optimization (N+1 Elimination)                   │
│     │                                                 │                                         │
│     ├──────────────────────────┐                      ▼                                         │
│     │                          │           Phase 3: Redis Infrastructure Layer                  │
│     ▼                          │           (Provisional TTL; Non-Authoritative Edge Shield)     │
│  Phase 2B: Shift Domain Schema │                      │                                         │
│  & Scoped Holiday Calendars    │           ┌──────────┴──────────┐                              │
│  [POD-05 & POD-06 PENDING]     │           ▼                     ▼                              │
│     │                          │  Phase 4: BullMQ Queue   Phase 6: Multi-Worker Pub/Sub         │
│     ├──────────────────────────┼───────────┤                     │                              │
│     │                          │           ▼                     │                              │
│     │                          │  Phase 5: Shift Scheduler       │                              │
│     │                          │  & Absence Engine               │                              │
│     │                          │  [CONDITIONAL ON POD-02]        │                              │
│     │                          │           │                     │                              │
│     │                          │           ▼                     │                              │
│     ▼                          ▼           │                     │                              │
│  Phase 7: Shift Attendance Concurrency ◄───┘                     │                              │
│  & Parent-Row Locking (Authoritative MariaDB, POD-01, POD-04)    │                              │
│     │                                                            │                              │
│     ▼                                                            │                              │
│  Phase 8: Server Pagination, Reports & Leave Deficits ◄──────────┘                              │
│  [Deficit Accounting CONDITIONAL ON POD-03]                      │                              │
│     │                                                            │                              │
│     ▼                                                            │                              │
│  Phase 9: Automated Testing Suite & Business Rule Verification   │                              │
│     │                                                                                           │
│     ▼                                                                                           │
│  Phase 10: High-Concurrency Load Testing (k6 Staging Simulation)                                │
│     │                                                                                           │
│     ▼                                                                                           │
│  Phase 11: Production VPS Deployment & Runtime Monitoring (Hostinger KVM 4)                     │
│  [BLOCKED on Phase 0.3 Live Server Verification]                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Dependency Governance Matrix

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

## 3. Detailed Phase Specifications

### Phase 1 — Security Hardening & Environment Isolation

| Attribute | Specification |
|---|---|
| **Objective** | Parameterize web API URLs, restrict CORS, throttle sensitive authentication endpoints, protect verified PBKDF2 parameters, and prepare future-compatible random salt on-login re-hashing. |
| **Confirmed Evidence** | 1. `hrms_saas/src/api/axios.js:4` has hardcoded `baseURL: "http://127.0.0.1:8000/api"`.<br/>2. `node_backend/.env:10` has `CORS_ORIGIN=*`.<br/>3. `node_backend/src/app.js:27` has only a global 300 req/min rate limiter with no endpoint limits for `/login` or `/forgot-password/request-otp`.<br/>4. `node_backend/src/utils/auth.js:21-27` implements verified PBKDF2 with SHA-256, 390,000 iterations, 32-byte key, static salt `"nodejs"`, and Django 4-part format. |
| **Dependencies** | None. |
| **Files to Modify** | `hrms_saas/src/api/axios.js`, `hrms_saas/.env.production` (new), `node_backend/src/app.js`, `node_backend/src/routes/accounts.routes.js`, `node_backend/.env`, `node_backend/src/utils/auth.js`, `node_backend/src/services/accounts.service.js`. |
| **Protected Features** | Preserve verified PBKDF2 password verification (`verifyDjangoPassword`), password generation (`makeNodePassword`), and JWT refresh token rotation logic. |
| **Random Salt Migration Design** | Update `makeNodePassword` to generate unique random 16-byte base64 salts for new passwords. On successful login, if user's salt is `"nodejs"`, transparently re-hash raw password with unique salt and update `accounts_user.password`. Existing Django accounts authenticate seamlessly. |
| **Risks** | Misconfigured CORS origin headers will block legitimate web client calls. |
| **Testing Requirements** | 1. Web app connects to backend using configured `VITE_API_BASE_URL`.<br/>2. Preflight OPTIONS request from unapproved origins returns HTTP 403.<br/>3. Rate limiter triggers HTTP 429 Too Many Requests after 5 consecutive failed login attempts within 15 minutes.<br/>4. Authenticate user with legacy `"nodejs"` salt; verify login succeeds and hash updates to unique random salt. |
| **Acceptance Criteria** | 1. Frontend API endpoints are driven entirely by environment variables.<br/>2. CORS permits requests only from whitelisted web domains.<br/>3. Login and OTP endpoints strictly enforce per-IP / per-identifier rate limits.<br/>4. Existing Django and Node user accounts authenticate successfully without locking out any users. |

---

### Phase 2A — Database Performance Indexing & Query Optimization (N+1 Elimination)

| Attribute | Specification |
|---|---|
| **Objective** | Add secondary indexes in MariaDB 11.8.9 and refactor `getEmployees` into bounded, set-based SQL queries. |
| **Confirmed Evidence** | 1. Live MariaDB `accounts_user` has only `PRIMARY (id)` and `UNIQUE (username)`. Email login `WHERE username=? OR email=?` triggers a full table scan.<br/>2. `accounts.service.js:386` calls `findAllEmployees` and sequentially runs `serializeStaffMember` (3–4 queries per user) in a `for...of` loop with `await` (15,001–20,001 sequential queries for 5,000 employees).<br/>3. Live MariaDB query proved `user_id: 12` has multiple attendance records on `2026-05-30`; unconditional unique constraint on `(user_id, date)` is **PERMANENTLY REJECTED**. |
| **Dependencies** | Phase 1. |
| **Files to Modify** | MariaDB DDL script (`scripts/optimize_indexes.sql`), `node_backend/src/repositories/accounts.repository.js`, `node_backend/src/services/accounts.service.js`. |
| **Protected Features** | Preserve soft-delete semantics (`deleted_at IS NULL`), role hierarchies, and serialized output structure. |
| **Database Engine Standard** | Exclusively **MariaDB 11.8.9-MariaDB-log**. Index creation statements must use verified MariaDB DDL syntax without assuming unsupported options. |
| **Risks** | Index creation on active tables must be scheduled to avoid table metadata lock contention. |
| **Testing Requirements** | 1. Execute `EXPLAIN` on `SELECT * FROM accounts_user WHERE email=?` and confirm index scan.<br/>2. Execute `getEmployees` with query logging active to confirm the sequential loop is eliminated.<br/>3. Compare JSON output payload before and after refactoring to ensure exact field-by-field parity. |
| **Measurable Acceptance Criteria** | 1. **Zero N+1 Queries:** The sequential per-employee SQL query loop is completely eliminated.<br/>2. **Bounded Query Count:** `getEmployees` executes via bounded, set-based queries (e.g. 1 primary join query for user/profile/role data + at most 1–2 batched queries for multi-locations/documents) supporting `LIMIT` and `OFFSET`.<br/>3. **EXPLAIN Verification:** Query plans for key user lookups and attendance filters show index range/ref scans on primary and foreign keys.<br/>4. **Applied Indexes:** Secondary indexes applied based on query patterns (`idx_user_email`, `idx_att_date_status`, `idx_att_user_date`).<br/>5. **Realistic Table Scan Criteria:** Small lookup tables (roles, status enums) are permitted to scan naturally by optimizer choice. |

---

### Phase 2B — Shift Domain Schema, Scoped Holiday Calendars & Assignment Architecture

| Attribute | Specification |
|---|---|
| **Objective** | Design and implement the relational schema required for multi-shift management (BR-02), branch-scoped holiday calendars, shift rosters, weekly offs, and attendance associations prior to scheduler implementation. |
| **Domain Scope** | 1. Shift definitions (start, end, overnight indicator, grace periods, auto-close buffer).<br/>2. Scoped holiday calendars by branch/location (`attendance_holiday_calendar` and `attendance_holiday`).<br/>3. Employee shift assignments with non-overlapping effective date ranges (`effective_from`, `effective_to`).<br/>4. Transaction-safe shift assignment overlap prevention via parent-row locking and NULL-safe boundary queries.<br/>5. Statutory holidays and scheduled weekly offs.<br/>6. Historical shift assignment preservation.<br/>7. Append-only audit event ledger (`attendance_audit_event`) and upload intent ledger (`attendance_upload_intent`). |
| **Dependencies** | Phase 2A (Performance Indexing). **POD-05 scope resolution required for advanced calendar hierarchy; POD-06 confirmation required for boundary policy.** |
| **Files to Modify** | DDL migration scripts (`migrations/001_shift_domain.sql`), `node_backend/src/repositories/shift.repository.js` (new), `node_backend/src/services/shift.service.js` (new). |
| **Schema Entities** | 1. `attendance_shift`: Columns for `id`, `name`, `code` (UNIQUE), `start_time`, `end_time`, `is_overnight`, `grace_in_mins`, `grace_out_mins`, `auto_close_buffer_hours`, `is_active`.<br/>2. `attendance_holiday_calendar`: Columns for `id`, `name`, `location_id`, `timezone`, `is_default`.<br/>3. `attendance_holiday`: Columns for `id`, `calendar_id`, `holiday_date`, `name`, `is_optional`, composite constraint `UNIQUE (calendar_id, holiday_date)`.<br/>4. `attendance_shift_assignment`: Columns for `id`, `user_id`, `shift_id`, `calendar_id`, `effective_from`, `effective_to` (NULL = current), `weekly_offs` (JSON/VARCHAR), composite index on `(user_id, effective_from, effective_to)`.<br/>5. `attendance_audit_event`: Columns for `id`, `attendance_id`, `user_id`, `shift_id`, `event_type`, `actor_type`, `actor_id`, `scheduled_event_time`, `actual_execution_time`, `synthetic_timestamp`, `previous_status`, `resulting_status`, `reason`, `justification`, `created_at`.<br/>6. `attendance_upload_intent`: Columns for `id` (UUID), `user_id`, `public_id`, `file_type`, `status` ('pending', 'uploading', 'committed', 'cleanup_claimed', 'cleaned', 'failed'), `worker_id`, `lease_expires_at`, `created_at`, `updated_at`. |
| **Overlap Prevention (Correction D)** | Mutating assignments requires acquiring `SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE`. Overlap query uses NULL-safe condition: `WHERE user_id = :userId AND effective_from <= COALESCE(:newTo, '9999-12-31') AND COALESCE(effective_to, '9999-12-31') >= :newFrom AND (:currentAssignmentId IS NULL OR id != :currentAssignmentId)`. Boundary policy semantics ($[from, to]$ vs. $[from, to)$) is **PENDING OWNER CONFIRMATION (POD-06)**. Implementation is blocked until owner decision. |
| **Protected Features** | Existing employee foreign key constraints and department hierarchies. |
| **Risks** | Historical attendance records will initially have `shift_id = NULL`; queries must handle legacy records gracefully. |
| **Testing Requirements** | 1. Insert default shifts (Morning, Evening, Night) and verify `is_overnight` flag calculation.<br/>2. Attempt to assign overlapping shift ranges to an employee for both new insertion and assignment update; verify both roll back with 400 Bad Request.<br/>3. Verify branch-specific holiday calendar permits identical dates across different branches while enforcing uniqueness within a branch. |
| **Acceptance Criteria** | 1. Complete shift domain, scoped holiday, and audit ledger schema created in MariaDB 11.8.9.<br/>2. Shift assignment queries resolve active shift for any given employee and date in $\le 1$ indexed query.<br/>3. Transaction-safe non-overlapping assignment date range invariant enforced with NULL-safe queries.<br/>4. Existing attendance table structure extended without breaking backward compatibility. |

---

### Phase 3 — Redis Infrastructure & Connection Layer

| Attribute | Specification |
|---|---|
| **Objective** | Integrate Redis client on the backend to provide distributed edge coordination, request debouncing, cluster pub/sub, and persistent queue storage. |
| **Confirmed Evidence** | Currently, all background queues (`this.jobs = []`) and SSE client pools (`clients = []`) live in isolated Node.js process heap memory. |
| **Dependencies** | Requires Redis service running on Hostinger KVM 4 VPS (`127.0.0.1:6379`) or managed Redis. |
| **Files to Modify** | `node_backend/package.json` (`ioredis`), `node_backend/src/config/env.js`, `node_backend/src/db/redis.js` (new). |
| **Protected Features** | Existing MySQL/MariaDB connection pool wrapper must remain untouched. |
| **Architectural Qualification (Correction C)** | **Non-Authoritative Role:** Redis provides distributed coordination and early duplicate-request rejection. Redis and MariaDB do NOT provide 2PC. Redis lock expiry does not independently invalidate database transactions. Lease TTL (15s baseline) is provisional until calibrated under upload latency and staging load. Outage policy follows a provisional fail-closed model returning `HTTP 503`. Concurrency acceptance requires actual staging validation. |
| **Risks** | Backend must handle temporary Redis connection drops gracefully; fail-closed policy (`HTTP 503`) for punch actions protects uncoordinated races during outages. |
| **Testing Requirements** | 1. Redis ping/pong health check on server startup.<br/>2. Automated retry and reconnection backoff verification upon simulated Redis restart. |
| **Acceptance Criteria** | 1. Redis client initializes on server bootstrap and passes health check.<br/>2. Module exports dedicated publisher, subscriber, and general command clients with automated error handling. |

---

### Phase 4 — Persistent Background Queue & Compensation (BullMQ Integration)

| Attribute | Specification |
|---|---|
| **Objective** | Replace in-memory array queue with a Redis-backed BullMQ queue for email delivery, storage compensation cleanup, and heavy background processing. |
| **Confirmed Evidence** | `node_backend/src/services/queue.service.js:5` uses `this.jobs = []`. Any pending password-reset email is permanently lost if the process crashes or restarts. |
| **Dependencies** | Phase 3 (Redis). |
| **Files to Modify** | `node_backend/package.json` (`bullmq`), `node_backend/src/services/queue.service.js`, `node_backend/src/services/storage.service.js`. |
| **Protected Features** | Existing `nodemailer` SMTP transport configuration and HTML email formatting. |
| **Compensation Queues** | Implement `bullmq:email-delivery` for OTP emails and `bullmq:storage-cleanup` for asynchronous compensation cleanup of failed Cloudinary uploads. |
| **Risks** | Failed jobs must not enter infinite retry loops; exponential backoff and dead-letter logging required. |
| **Testing Requirements** | 1. Enqueue 10 mock email jobs, terminate Node.js process mid-queue, restart, and verify all 10 complete.<br/>2. Trigger a simulated Cloudinary upload with failed database transaction; verify asynchronous cleanup job executes and purges the asset. |
| **Acceptance Criteria** | 1. Password-reset OTP emails processed asynchronously through durable BullMQ queue.<br/>2. Asynchronous compensation queue cleans up orphaned Cloudinary assets upon aborted transactions. |

---

### Phase 5 — Shift-Aware Scheduler, Historical Open Recovery & Master Binding

| Attribute | Specification |
|---|---|
| **Objective** | Eliminate duplicate cron execution across PM2 cluster workers, implement shift-aware auto-close with full auditability, and add shift-aware automated absent marking (BR-04). |
| **Conditional Dependency** | **CONDITIONAL / BLOCKED on POD-02 selection.** The scheduler implementation cannot be finalized until the project owner selects between Model A (Two-Tier Daily Schedule) and Model B (Periodic Shift-Window Evaluation). |
| **Confirmed Evidence** | 1. `node_backend/src/server.js:17` invokes `initCron()` unconditionally; running 4 PM2 workers triggers 4 simultaneous duplicate cron executions.<br/>2. `node_backend/src/utils/cron.js:18` runs `UPDATE attendance_attendance SET punch_out_time=NOW() WHERE punch_out_time IS NULL` with no date filter, retroactively altering old unclosed punches from past months.<br/>3. Auto-absent marking is missing in code despite PRD documentation. |
| **Dependencies** | Phase 1 (Environment), Phase 2B (Shift Domain Schema), Phase 4 (BullMQ Queue), **POD-02 Decision Approval**. |
| **Files to Modify** | `node_backend/src/server.js`, `node_backend/src/utils/cron.js`, `node_backend/src/services/scheduler.service.js` (new). |
| **Protected Features** | Preserve the 3-month attendance photo retention purge logic and batching of 100. |
| **Session Lifecycle Partition** | **Three-Category Recovery Rules:**<br/>1. *Active In-Shift:* Preserved untouched ($\text{NOW()} \le \text{Shift End Time} + \text{Grace}$). Active night shifts protected.<br/>2. *Recently Abandoned:* Closed automatically with synthetic punch-out at shift end, marked `is_auto_closed = TRUE`, audit event written to `attendance_audit_event` with `event_type = 'AUTO_CLOSE_SYSTEM'`.<br/>3. *Historical Open Records:* Pre-baseline unclosed records are **never silently rewritten**; flagged for Administrator Regularization Review. |
| **Absence Scheduler Rules** | **Domain Constraints:**<br/>- Evaluates employees strictly after their assigned shift punch window closes.<br/>- Strictly excludes employees on approved leave, scheduled weekly offs, and branch holidays.<br/>- Execution is strictly idempotent: re-running the job never creates duplicate absences. |
| **Risks** | Cron jobs must not double-execute in multi-worker environment. |
| **Testing Requirements** | 1. Verify cron tasks register strictly on PM2 worker ID `0` (or via Redis distributed leader lock).<br/>2. Verify night shift active at 23:55 is NOT auto-closed and NOT marked absent.<br/>3. Verify unpunched day shift employees receive status `'absent'` after shift window closes, while employees on approved leave or holiday are excluded.<br/>4. Verify legacy open records prior to baseline date are not modified by auto-close. |
| **Acceptance Criteria** | 1. Scheduled jobs execute on exactly one worker instance in cluster mode.<br/>2. Shift-aware auto-close safely terminates abandoned punches with complete audit metadata.<br/>3. Historical records prior to scheduler baseline remain completely untouched.<br/>4. Automated absent marking generates `'absent'` records only after assigned punch windows close, respecting leaves, offs, and holidays. |

---

### Phase 6 — Real-Time Multi-Worker Event Distribution (Redis Pub/Sub)

| Attribute | Specification |
|---|---|
| **Objective** | Enable real-time Server-Sent Events (SSE) to broadcast across all PM2 cluster workers. |
| **Confirmed Evidence** | `node_backend/src/utils/realtime.js:3` maintains a local process variable `let clients = []`. An approval executed on Worker 2 is never broadcast to an employee connected to Worker 1. |
| **Dependencies** | Phase 3 (Redis). |
| **Files to Modify** | `node_backend/src/utils/realtime.js`. |
| **Protected Features** | Preserve existing SSE endpoint path (`/api/v1/auth/realtime`), 30s heartbeat interval, and event payload schemas. |
| **Risks** | Client disconnection memory leaks if response listeners are not cleaned up. |
| **Testing Requirements** | Connect two separate HTTP clients to two distinct PM2 worker ports; trigger an attendance approval on Worker 1; verify Worker 2 client receives the event in real-time. |
| **Acceptance Criteria** | All PM2 workers subscribe to Redis channel `hrms:realtime`; any domain event published on any worker is fanned out to all connected SSE clients across the cluster. |

---

### Phase 7 — Shift Attendance Concurrency, Parent-Row Locking & Regularization (POD-01, POD-04)

| Attribute | Specification |
|---|---|
| **Objective** | Enforce single attendance session per shift day (BR-01, BR-02), handle overnight shifts under Shift Start Date attribution (POD-01), enforce admin regularization on manager rejection (POD-04), decouple Cloudinary I/O, implement deterministic upload intent lifecycle, and serialize concurrency via MariaDB parent row exclusive locks (Scenarios A, B, C). |
| **Confirmed Evidence** | `node_backend/src/services/attendance.service.js:247-293` executes Cloudinary photo upload (1–2s latency) before inserting into MariaDB. Rapid double-taps bypass `findOpenAttendance` and insert multiple open records. `SELECT ... FOR UPDATE` on non-existent records risks gap-lock deadlocks in InnoDB. |
| **Dependencies** | Phase 2B (Shift Domain Schema), Phase 3 (Redis), Phase 4 (BullMQ). |
| **Files to Modify** | `node_backend/src/services/attendance.service.js`, `node_backend/src/controllers/attendance.controller.js`. |
| **Protected Features** | Preserve existing Haversine geofence calculations, multi-location radius evaluation, and cascading approval ticket logic. |
| **Concurrency Safeguards (Correction C)** | 1. **Redis Edge Coordination:** Non-authoritative edge shield (`SET lock:punch:${userId} ${requestToken} NX PX ${provisionalTtl}`). Contention returns `HTTP 409 Conflict`. Redis down returns `HTTP 503`.<br/>2. **Authoritative MariaDB Parent Lock:** Transaction begins with `SELECT id FROM accounts_user WHERE id = :userId FOR UPDATE`. Attendance state is verified *within the transaction after acquiring this lock*.<br/>3. **Three Scenarios Partitioned:**<br/>   - *Scenario A (Fast Path):* Request A commits before Redis lease expires; Request B rejected at Redis (409) or blocked on DB parent lock (sees committed session $\rightarrow$ 409).<br/>   - *Scenario B (Lease Expiry):* Redis lease expires mid-flight; Request B arrives, acquires Redis lease, blocks on DB parent lock. Under either transaction outcome (A rolls back on Lua token check OR commits to DB), MariaDB parent locking represents the intended authoritative concurrency architecture to enforce exactly-once session creation, with runtime acceptance dependent on verifying that every relevant write path acquires the same parent-row lock and performs transactional state validation.<br/>   - *Scenario C (DB Serialization):* Request B passes Redis coordination but waits on MariaDB parent lock; Request A commits; Request B unblocks, detects committed session in DB, rolls back, returns 409.<br/>4. **Status:** Marked **NEEDS TECHNICAL VALIDATION** during Phase 3/10 staging verification. Documentation alone does not prove runtime behavior. |
| **Upload Intent & Safe Orphan Recovery (Correction B)** | **1. Successful Path:** Deterministic `publicId` generated $\rightarrow$ intent inserted as `pending` $\rightarrow$ upload outside DB tx $\rightarrow$ DB tx locks parent, inserts attendance, marks intent `committed` $\rightarrow$ commit. Committed intents are terminal and **NEVER** eligible for cleanup.<br/>**2. Abandoned/Failed Path (Uncommitted Candidates Only):** Intents in `pending`/`failed` $> 2\text{h}$ claimed with worker lease (`cleanup_claimed`, `worker_id`, `lease_expires_at`).<br/>**3. Pre-Deletion DB Check:** Must check verified schema columns (`punch_in_photo`, `punch_out_photo` in `attendance_attendance`, `file` in `accounts_employeedocument`). If referenced, mark `committed`; if inconclusive, preserve and flag for review; if conclusively unreferenced, call destroy and mark `cleaned`.<br/>**4. Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted. |
| **POD-01 Implementation** | **Shift Start Date Attribution:** Overnight shift 22:00 (Day D) to 06:00 (Day D+1) is recorded as exactly 1 attendance record with `date = Day D`, `punch_in_time = Day D 22:00` (UTC), `punch_out_time = Day D+1 06:00` (UTC). |
| **POD-04 Implementation** | **Admin Regularization on Rejection:** If manager rejects punch-in, status transitions to `'rejected'`. Employee cannot submit self-service punch for that date. Administrator attendance regularization is **strictly required**. Audit event records manager rejection and subsequent administrator regularization. |
| **Risks** | Cloudinary network timeouts; handled by decoupled upload outside DB transaction, intent tracking, and try/finally cleanup. |
| **Testing Requirements** | 1. Send 10 simultaneous punch-in requests for the same employee; verify exactly 1 succeeds and 9 return HTTP 409.<br/>2. Simulate expired Redis lock mid-flight (Scenario B); verify exactly 1 session is created under MariaDB parent-row locking.<br/>3. Simulate Scenario C; verify second request blocked at parent-row lock receives 409 after first commits.<br/>4. Verify night shift punch-in at 22:00 on Day 1 and punch-out at 06:00 on Day 2 creates exactly 1 attendance record attributed to Day 1.<br/>5. Verify rejected punch cannot be re-punched by employee and strictly requires administrator regularization. |
| **Acceptance Criteria** | 1. Single attendance session enforced per shift day with MariaDB parent row exclusive locks and Redis coordination across all 3 scenarios.<br/>2. Overnight shifts attributed strictly to Shift Start Date.<br/>3. Re-punch after manager rejection prohibited; admin regularization strictly required with immutable audit event logging.<br/>4. Zero orphan records created; verified active photos are never purged. |

---

### Phase 8 — Server Pagination, Leave Deficits & Reporting Matrix Optimization

| Attribute | Specification |
|---|---|
| **Objective** | Implement server-side pagination for employee management, permit manager-reviewed leave deficit submissions (BR-03), and optimize monthly attendance matrix queries. |
| **Conditional Dependency** | **Leave Deficit Accounting CONDITIONAL / BLOCKED on POD-03 specification.** While application submission and manager approval authority are approved, permanent schema changes for balance deduction (negative balance vs. deficit marker vs. payroll ledger) require POD-03 sign-off. |
| **Confirmed Evidence** | 1. `hrms_saas/src/pages/Employees.jsx` receives an unpaginated array and mounts all records into client state.<br/>2. `attendance.repository.js:252` generates dynamic queries with up to 5,000 parameter placeholders in `user_id IN (...)`.<br/>3. `leave.service.js:73` lacks deficit leave handling. |
| **Dependencies** | Phase 2A (Performance Indexing), Phase 2B (Shift Domain Schema). |
| **Files to Modify** | `node_backend/src/repositories/accounts.repository.js`, `node_backend/src/controllers/accounts.controller.js`, `hrms_saas/src/pages/Employees.jsx`, `node_backend/src/services/leave.service.js`, `node_backend/src/repositories/attendance.repository.js`. |
| **Protected Features** | Preserve existing search filters (role, department, active status) and column sorting. |
| **Leave Deficit Specification** | **BR-03 Implementation:**<br/>- Employees may submit leave applications exceeding remaining balance.<br/>- **Line Manager approval alone is sufficient** to approve or reject the request.<br/>- Applications are **not** automatically classified as Loss-of-Pay.<br/>- Review interface displays allotted days, taken days, and requested deficit.<br/>- Full audit trail recorded upon manager decision.<br/>- Balance deduction respects pending POD-03 specification. |
| **Risks** | Breaking frontend table pagination controls if API metadata response format is inconsistent. |
| **Testing Requirements** | 1. Submit leave request for 15 days with 10 days balance; verify application succeeds with status `'pending'`.<br/>2. Manager approves deficit application; verify status updates to `'approved'` and audit log records decision.<br/>3. Verify `GET /auth/employees/?page=1&limit=25` returns paginated payload with bounded query execution. |
| **Acceptance Criteria** | 1. Employee listing and attendance reports operate under server-side pagination with default page sizes of 25/50 items.<br/>2. Leave deficit applications are accepted for manager review and successfully processed without automated LOP tagging. |

---

### Phase 9 — Automated Testing Suite & Business Rule Verification

| Attribute | Specification |
|---|---|
| **Objective** | Implement an automated test suite verifying functional correctness, business rule compliance, database integrity, and security across all core workflows. |
| **Confirmed Evidence** | The repository currently contains zero automated test runners and zero unit/integration tests (`0% test coverage`). |
| **Dependencies** | Phases 1 through 8. |
| **Files to Modify** | `node_backend/package.json` (`vitest`, `supertest`), `tests/unit/`, `tests/integration/`. |
| **Protected Features** | None (testing harness). |
| **Verification Categories** | 1. **Security & Auth:** PBKDF2 hashing (390k iterations, SHA-256), on-login random salt migration, JWT signing, token rotation, reuse revocation, OTP HMAC hashing, CORS and rate-limiting.<br/>2. **Single-Session Attendance (BR-01):** Punch-in opens session, punch-out closes session, subsequent punches blocked.<br/>3. **Shift Logic (BR-02, POD-01):** Night shift start date attribution, shift window transitions, grace periods, overlap prevention.<br/>4. **Leave Deficits (BR-03):** Balance validation, insufficient-balance submission, manager approval authority.<br/>5. **Absence Engine (BR-04):** Shift-aware absence generation, exclusion of approved leaves, weekly offs, and holidays.<br/>6. **Admin Regularization (POD-04):** Re-punch prevention on manager rejection, administrator regularization audit trail.<br/>7. **Concurrency & Locking:** MariaDB parent row exclusive lock, worker loss rollback, Lua safe release across Scenarios A, B, and C. |
| **Risks** | Integration tests must run against an isolated test database to prevent polluting production or staging data. |
| **Acceptance Criteria** | 1. Automated test suites execute deterministically with 100% pass rate.<br/>2. Decoupled from live load-test benchmarks (which are executed independently in Phase 10).<br/>3. Explicit coverage of all approved business rules and edge cases without reliance on arbitrary assertion count metrics. |

---

### Phase 10 — High-Concurrency Load Testing (k6 Simulation - Staging)

| Attribute | Specification |
|---|---|
| **Objective** | Empirically validate system throughput, calibrate Redis lock TTLs, and measure response latencies under simulated 5,000-user data volume and 1,000-user peak simultaneous concurrency in an isolated staging environment. |
| **Confirmed Evidence** | No performance benchmarks currently exist. Zero load tests performed in Phase 0. |
| **Dependencies** | Phases 1 through 9. |
| **Files to Modify** | `load_tests/k6_shift_burst.js` (new), `load_tests/k6_employee_roster.js` (new). |
| **Protected Features** | None. |
| **Reconciled Performance Criteria (Correction A)** | **A. Scale Target:** 5,000 synthetic employee records, ~300,000 historical attendance records, 10,000 leave records *(Future Staging Acceptance Target; not current production capacity)*.<br/>**B. Concurrency Definitions:**<br/>- *Virtual Users (VUs):* 1,000 authenticated sessions *(Future Staging Acceptance Target)*.<br/>- *In-Flight Concurrency:* 100–250 concurrent simultaneous requests actively processing *(Proposed Engineering Target)*.<br/>- *Throughput Target:* 150–300 requests/sec sustained during peak bursts *(Proposed Engineering Target)*.<br/>**C. Test Stages (Proposed 25-Minute Profile):** 2m warm-up (0-200 VUs), 5m ramp-up (200-1,000 VUs), 15m sustained at 1,000 VUs, 3m ramp-down *(Proposed Engineering Target)*.<br/>**D. Workload Distribution:** 40% Attendance, 25% Real-Time/Dashboard, 15% Directory, 10% Timesheets/Reports, 5% Leaves, 5% Profiles *(Proposed Engineering Target)*.<br/>**E. Response Baselines & Targets:**<br/>- *Core Successful Operations:* **Core successful business operations: P95 < 500 ms — Provisional Planning Baseline.** (Planning baseline; not a measured result or an approved production SLA).<br/>- *Tail Latency ($P99$):* Distribution to measure and report *(Measurement to Collect; no approved threshold)*.<br/>- *HTTP 409 Conflicts:* Distribution to measure and report separately *(Measurement to Collect; no approved SLA)*.<br/>- *System Error Budget:* Unexpected HTTP 5xx error rate $< 0.1\%$ *(Proposed Engineering Target)*.<br/>**F. Infrastructure Telemetry Classification:**<br/>- Host CPU $< 75\%$ *(Proposed Engineering Target)*.<br/>- PM2 Worker Memory $< 800\text{ MB}$ RSS per worker *(Proposed Engineering Target)*.<br/>- Event-loop lag $P99 < 50\text{ ms}$ *(Proposed Engineering Target)*.<br/>- Aggregate MariaDB connections $\le 60$ across cluster *(Proposed Engineering Target; subject to verified host quota)*.<br/>- Redis command latency $P99 < 5\text{ ms}$ *(Proposed Engineering Target; measure and report, not an approved SLA)*.<br/>- Formal SLAs: None approved; pending owner review and staging results.<br/>**G. Measured Results:** Explicitly **ZERO** in Phase 0.<br/>**H. Superseded Historical Figures (Not Active Targets):** Earlier draft figures—specifically **80 MB PM2 worker RSS**, **P99 < 5 ms event-loop lag**, **50 ms or 5 ms global P95 response targets**, and **any HTTP 409 latency SLA of 5 ms, 10 ms or 100 ms**—are formally marked as **superseded, not active targets**. |
| **Risks** | Load tests must never be directed at production Cloudinary credentials or live customer data. |
| **Testing Requirements** | Execute automated k6 profile matching the 25-minute test profile against staging database. |
| **Target Acceptance Criteria** | Sustains 1,000 concurrent active sessions without worker crashes, connection pool exhaustion, or exceeding the 0.1% error budget. |

---

### Phase 11 — Production VPS Deployment & Runtime Monitoring (Hostinger KVM 4)

| Attribute | Specification |
|---|---|
| **Objective** | Deploy hardened application to Hostinger VPS KVM 4 with evidence-based PM2 cluster sizing, Nginx SSL reverse proxy, and automated database backups. |
| **Outstanding Verification** | **BLOCKED on Phase 0.3 Live Server Verification.** VPS runtime parameters (live CPU/RAM allocation, Nginx config, live PM2 status, UFW firewall rules, and host backup automation) remain unverified from the workstation. |
| **Confirmed Evidence** | Live VPS environment is currently unverified; git repository contains no Nginx, PM2, or backup configurations. |
| **Dependencies** | Phases 1 through 10, and authorized SSH/terminal access to the Hostinger KVM 4 VPS for Phase 0.3 inspection. |
| **Files to Modify** | `ecosystem.config.cjs`, Nginx virtual host configuration, backup cron script (`/etc/cron.daily/hrms_db_backup.sh`). |
| **Protected Features** | The existing 7 core features continue running in production. |
| **Evidence-Based Worker Sizing (Correction E)** | PM2 cluster worker count must be determined based on measured CPU cores and RAM on the Hostinger VPS, validated in Phase 10 load testing. Database connection pool demand must satisfy: $\text{Workers} \times \text{connectionLimit} \le \text{Verified HRMS DB Quota}$, avoiding MariaDB socket timeout (`wait_timeout: 20s`) contention. Heuristic formula `max(1, vCPU - 1)`, four workers, and 60-connection quota are strictly provisional hypotheses until Phase 0.3 live telemetry is collected. |
| **Risks** | DNS propagation delay and SSL certificate issuance during cutover. |
| **Testing Requirements** | 1. Verify PM2 runs evidence-based worker count under zero-downtime reload (`pm2 reload ecosystem.config.cjs`).<br/>2. Verify automated daily backup executes and produces compressed `.sql.gz` dump. |
| **Acceptance Criteria** | HRMS production web and API services operate over HTTPS (TLS 1.3), balanced across evidence-sized PM2 workers, with nightly automated database backups verified. |

---

## 4. Phase 0 Authorization Boundary

> [!WARNING]
> **THIS DOCUMENT CLOSES PHASE 0.2.8 FINAL DOCUMENTATION RECONCILIATION ONLY.**
> 
> It strictly **does not authorize**:
> - Application source code modifications.
> - Database DDL execution, table creation, or schema alteration.
> - Dependency installation (`ioredis`, `bullmq`, `vitest`).
> - PM2, Nginx, or VPS configuration changes.
> - Cloudinary file upload, modification, or deletion.
> - Execution of any implementation phase.
> - Phase 0.3 live server verification without explicit SSH credentials/access.
> 
> Antigravity remains in strict read-only audit mode pending project-owner review and explicit approval.

---
*End of Updated Implementation Matrix & Checklist. Implementation remains strictly unauthorized.*
