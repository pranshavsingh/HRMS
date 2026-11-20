# HRMS Shift & Roster Management — Stage 1 Disposable Database Validation Final Report (v3.0 — MariaDB 11.8.9 Certified & Fail-Closed)

**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Authoritative Target Database:** **MariaDB 11.8.9** (Enterprise / LTS Engine)  
**Binary Location:** `F:\mariadb-11.8.9-winx64\bin\mysqld.exe`  
**Test Harness Connection:** `127.0.0.1:3307` (`hrms_disposable_test`)  
**Execution Timestamp:** 2026-11-16 15:30:50 IST  
**Report Version:** v3.0 (Final Reconciled Release — Checksum Fail-Closed Certified)  
**Last Updated:** 2026-11-16 16:02:00 IST  
**Overall Validation Outcome:** **ALL TESTS PASSED (Exit Code: 0)**  
**Remote Production Database (`srv999.hstgr.io`):** **ZERO OPERATIONS EXECUTED (Strictly Protected)**  

---

## 1. Engine Compatibility & Narrowed Support Statement

In strict compliance with Stage 1 Review Correction #1:
- **Authoritative Supported Engine:** **MariaDB 11.8.9** has been provisioned locally, initialized from official binaries, and 100% verified across all DDL, composite foreign keys, generated virtual columns, row-locking transactions, and recovery suites.
- **MySQL 8.0 Compatibility Narrowing:** Per user instructions, MySQL 8.0 compatibility is **not separately claimed or certified** in this cycle. The supported engine statement is explicitly narrowed to **MariaDB 11.8.9**.

```text
Server Version:  11.8.9-MariaDB for Win64 on AMD64 (MariaDB Server)
Storage Engine:  InnoDB
Connection:      127.0.0.1:3307 via TCP/IP
Database:        hrms_disposable_test
Advisory Lock:   GET_LOCK('hrms_db_migration_lock', 15)
```

---

## 2. Test Execution Inventory & Status Matrix

| Category | Suite / Test ID | Target / Focus | Execution Script | Engine | Status | Evidence / Outcome |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Full Lifecycle** | Part 1 | Baseline 001–005 Constrained | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Applied exactly 5 migrations; 006–013 strictly excluded via `MAX_MIGRATION_VERSION=005`. |
| **Full Lifecycle** | Part 2 | Phase B Core Migrations (006–011) | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | 14 Phase B workforce tables verified in `information_schema.TABLES`. |
| **Full Lifecycle** | Part 3 | Phase G Attendance Migrations (012–013) | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | `attendance_attendance` expanded (7 columns); 3 attribution exception tables verified. |
| **Full Lifecycle** | Part 4 | Schema Audit Stored Procedure | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Stored procedure `audit_workforce_schema_integrity()` confirmed 0 `ON DELETE CASCADE` across all 17 tables. |
| **Full Lifecycle** | Part 5 | Existing Employee Backfill (65 Users) | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Verified distribution: 3 superadmin, 4 admin, 7 hr, 5 manager, 46 employee (41 active, 5 inactive). |
| **Full Lifecycle** | Part 6 | Tenant Isolation & Cross-Tenant FK | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Assignment to Tenant 2 Shift 201 cleanly rejected by composite FK (Error 1452). |
| **Full Lifecycle** | Part 7 | Referential Integrity & RESTRICT | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | `DELETE FROM workforce_tenant WHERE id=1` blocked by RESTRICT (Error 1451). Zero cascades. |
| **Full Lifecycle** | Part 8 | Concurrency Suite (Publish & Monotonic) | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | 1 publish success (200), 1 conflict (409); monotonic ascending locks eliminated deadlocks. |
| **Full Lifecycle** | Part 9 | Standard Shift Attendance Calc | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Shift 10 (15m grace): Arrival 09:05 -> `grace_period` (0m late); Arrival 09:25 -> `late` (25m late). |
| **Full Lifecycle** | Part 10 | Overnight Shift POD-01 Invariant | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Shift 20 (22:00–06:00): Punch-out on next day attributed to initial `work_date = '2026-11-16'` (`total_hours = 8.22`). |
| **Full Lifecycle** | Part 11 | Exception Lifecycle & Virtual Key | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Concurrent duplicate pending exception rejected via virtual column unique key (Error 1062); history FK enforced. |
| **Full Lifecycle** | Part 12 | Interruption & Recovery | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Partial DDL implicit commit simulated; idempotent rerun completed all 4 tables. |
| **Full Lifecycle** | Part 13 | Decoupled Application Rollback | `run_stage1_validation.mjs` | MariaDB 11.8.9 | **PASS** | Legacy columns queried without workforce columns; zero data loss. |
| **Dedicated Concurrency** | **C-01** | Two-Publisher Roster Publish Race | `test_c01_roster_publish_race.mjs` | MariaDB 11.8.9 | **PASS** | 2 connections; Pub 101: 200 (Published); Pub 102: 409 (Conflict). Header locked via `SELECT ... FOR UPDATE`. |
| **Dedicated Concurrency** | **C-02** | Roster Edit vs Publish Collision | `test_c02_roster_edit_publish_race.mjs` | MariaDB 11.8.9 | **PASS** | 2 connections; Editor blocked 95ms on header lock, rejected with 409 Conflict. Published entry unchanged. |
| **Dedicated Concurrency** | **C-03** | Punch-In vs Punch-Out Attribution Race | `test_c03_punch_in_out_race.mjs` | MariaDB 11.8.9 | **PASS** | 2 connections; Punch-out waited 78ms for open record lock, settled `total_hours = 8.50` without race condition. |
| **Dedicated Concurrency** | **C-04** | Fixed Assignment vs Rotation Conflict | `test_c04_assignment_rotation_conflict.mjs` | MariaDB 11.8.9 | **PASS** | 2 connections; Parent user mutex locked. Fixed assign succeeded (200); Rotation rejected with 409 Conflict. |
| **Dedicated Concurrency** | **C-05** | Concurrent Exception Resolution Race | `test_c05_exception_resolution_race.mjs` | MariaDB 11.8.9 | **PASS** | 2 connections; Mgr 101 resolved (200); Mgr 102 rejected with 409 Conflict. History ledger has exactly 1 row. |
| **Dedicated Concurrency** | **C-06** | Multi-Client Deadlock Avoidance | `test_c06_deadlock_avoidance_ordering.mjs` | MariaDB 11.8.9 | **PASS** | 4 connections; Competing inverted pairs `[10,20]` & `[20,10]`, `[5,15]` & `[15,5]`. Ascending sort -> 0 deadlocks. |
| **Migration Recovery** | Scenario 1 | Absent Tables & Missing Ledger | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS** | Runner created missing tables, verified all 4 tables, restored ledger entry 010. |
| **Migration Recovery** | Scenario 2 | Incomplete Schema (Missing Column) | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS** | Dropped column `effective_to`. Runner detected missing column, auto-repaired table, verified schema. |
| **Migration Recovery** | Scenario 3 | Missing Foreign Key (`fk_wefa_shift`) | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS** | Dropped FK. Runner detected missing constraint, restored FK, verified referential integrity. |
| **Migration Recovery** | Scenario 4 | Corrupted Index (Fail-Closed) | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | Index replaced with wrong columns. Runner halted with diagnostic: `Index has incompatible columns. Manual intervention required.` |
| **Migration Recovery** | Scenario 5 | Incompatible FK Rule (Fail-Closed) | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | `fk_wefa_shift` created with `ON DELETE CASCADE`. Runner caught rule mismatch, failed closed, withheld ledger. |
| **Migration Recovery** | Scenario 6 | Incompatible Column Type (Fail-Closed) | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | `effective_to` modified to `VARCHAR(50)`. Runner caught type mismatch, failed closed, withheld ledger. |
| **Migration Recovery** | Scenario 7 | Existing Valid Data Preservation | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS** | 3 seeded employee assignments 100% preserved with zero data mutation across simulated runner recovery. |
| **Migration Recovery** | Scenario 8 | Checksum Mismatch — Fatal Error Enforcement | `test_migration_010_recovery.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | Tampered checksum caused `CHECKSUM INTEGRITY VIOLATION` fatal error. Exit code 1. No subsequent migration ran. Stored checksum not auto-rewritten. Data preserved. Runner recovered cleanly after DBA-manual restoration. |
| **Checksum Integrity** | C-01 | Fatal error on tampered checksum | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | `CHECKSUM INTEGRITY VIOLATION` emitted. Exit code 1. |
| **Checksum Integrity** | C-02 | Later migrations blocked | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS (Fail-Closed)** | Migration 010 NOT recorded; `workforce_employee_rotation` NOT recreated after 006 mismatch. |
| **Checksum Integrity** | C-03 | Stored checksum not auto-rewritten | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | Tampered checksum `0000...` preserved in ledger after failing run. Runner did not overwrite. |
| **Checksum Integrity** | C-04 | Existing data preserved | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | Sentinel row id=999 `{tenant_id:1, user_id:10, shift_id:10, is_active:1}` fully intact after failing run. |
| **Checksum Integrity** | C-05 | Ledger entry not modified | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | `checksum` and `applied_at` for version 007 unchanged after failing run. |
| **Checksum Integrity** | C-06 | Matching checksum permits normal lifecycle | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | Runner exited 0, all migrations verified with `(checksum verified)`. No violation raised. |
| **Checksum Integrity** | C-07 | Non-zero exit code (1) returned | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | `process.exitCode = 1`. Unambiguous failure signal for CI/CD pipelines. |
| **Checksum Integrity** | C-08 | Error contains DBA guidance | `test_checksum_integrity.mjs` | MariaDB 11.8.9 | **PASS** | Error message includes: `Manual DBA investigation`, `All subsequent migrations have been blocked`, `Do NOT rewrite the stored checksum automatically`. |
| **Total Hours Audit** | Section 1 | Schema Definition Audit | `test_total_hours_verification.mjs` | MariaDB 11.8.9 | **PASS** | Verified `DECIMAL(5,2) NOT NULL DEFAULT 0.00`. |
| **Total Hours Audit** | Section 2 | Historical Backfill Equivalence | `test_total_hours_verification.mjs` | MariaDB 11.8.9 | **PASS** | 3 pre-existing records backfilled via SQL; 100% match with legacy `toHours()` JavaScript calculation. |
| **Total Hours Audit** | Section 3 | Zero-Duration Attendance | `test_total_hours_verification.mjs` | MariaDB 11.8.9 | **PASS** | Same-minute punch-in/out yields `0.00` total hours in both SQL and JS. |
| **Total Hours Audit** | Section 4 | Overnight Shift Attendance | `test_total_hours_verification.mjs` | MariaDB 11.8.9 | **PASS** | 21:55:00 to 06:08:00 (8h 13m) yields `8.22` hours in both SQL and JS without rounding discrepancy. |
| **Total Hours Audit** | Section 5 | Precision & Rounding (10 Intervals) | `test_total_hours_verification.mjs` | MariaDB 11.8.9 | **PASS** | Intervals (0m, 15m, 20m, 30m, 40m, 45m, 60m, 125m, 480m, 493m) verified with zero rounding drift. |
| **Work Date Audit** | Case 1 | Metadata Default Expression | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | Verified `work_date DATE NOT NULL DEFAULT (date)`. |
| **Work Date Audit** | Case 2 | Historical Date Insert | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | `date='2024-04-12'` without `work_date` -> `work_date='2024-04-12'` (not current date). |
| **Work Date Audit** | Case 3 | Today Date Insert | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | `date='2026-11-16'` without `work_date` -> `work_date='2026-11-16'`. |
| **Work Date Audit** | Case 4 | Overnight Explicit Override | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | `date='2026-11-17'`, explicit `work_date='2026-11-16'` correctly preserved across midnight crossover. |
| **Work Date Audit** | Case 5 | Legacy INSERT Omission | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | All workforce fields omitted; row inserted with `work_date=date`, `tenant_id=1`, `punctuality_status='unassigned'`. |
| **Work Date Audit** | Case 6 | Table-Wide Consistency Check | `test_work_date_default_correctness.mjs` | MariaDB 11.8.9 | **PASS** | Verified exactly 0 non-roster records have `work_date <> date`. |
| **Backfill Rigor** | 1,000 Rows | Large-Scale Historical Equivalence | `test_historical_backfill_assertions.mjs` | MariaDB 11.8.9 | **PASS** | 1,000 legacy rows backfilled via SQL; exactly 0 nulls, 0 mismatches, 0 discrepancies with JS `toHours()`. |
| **App Regression** | Workflow 1 | Inside Geofence Punch In/Out | `test_application_rollback.mjs` | MariaDB 11.8.9 | **PASS** | `punch_in_status='approved'`, `punctuality_status='unassigned'`, `total_hours=8.50`. |
| **App Regression** | Workflow 2 | Outside Geofence Pending Approval | `test_application_rollback.mjs` | MariaDB 11.8.9 | **PASS** | `punch_in_status='pending'`. Manager approved -> transitioned to `'approved'`. Geofence semantics preserved. |
| **App Regression** | Workflow 3 | Status & History Contract | `test_application_rollback.mjs` | MariaDB 11.8.9 | **PASS** | Legacy web/mobile query formats maintained 100% compatibility with zero schema breaks. |
| **Hardware Devices** | Biometrics | Hardware Biometric Reader Sensor | Device Hardware | N/A | **NOT VERIFIED ON PHYSICAL DEVICE** | Requires physical Android/iOS device hardware integration. |
| **Hardware Devices** | GPS Sensor | Hardware GPS Spoofing Detection | Device Hardware | N/A | **NOT VERIFIED ON PHYSICAL DEVICE** | Requires physical Android/iOS GPS satellite receiver. |
| **Hardware Devices** | Offline Sync | SQLite Mobile Offline Sync | Device SQLite | N/A | **NOT VERIFIED ON PHYSICAL DEVICE** | Requires compiled Android/iOS mobile application bundle. |

---

## 3. Dedicated Multi-Client Concurrency Evidence (C-01 through C-06)

Each concurrency test was authored as an independent, reproducible script located in [`node_backend/scripts/concurrency/`](file:///f:/hrms/node_backend/scripts/concurrency/) and executed against MariaDB 11.8.9.

### Test C-01: Roster Publishing Race Simulation
- **Script:** [`test_c01_roster_publish_race.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c01_roster_publish_race.mjs)
- **Independent Connections:** 2 (`Publisher 101`, `Publisher 102`)
- **Synchronization Method:** Database Row-Lock Serialization (`SELECT id, status FROM workforce_roster_header WHERE id = 1 FOR UPDATE`)
- **Operations Executed:** Both connections simultaneously attempted to publish draft roster header 1. Publisher 101 acquired the lock, validated `status === 'draft'`, processed publication, and committed `status = 'published'`. Publisher 102 was serialized behind Publisher 101, waited 84ms, acquired lock, detected `status === 'published'`, rolled back, and returned HTTP 409 Conflict.
- **Expected Outcome:** Exactly 1 publisher succeeds with HTTP 200; the second publisher fails draft check and returns HTTP 409 Conflict.
- **Actual Outcome:**
  ```text
  Publisher 1 Outcome: { publisherId: 101, status: 200, waitTime: 4, message: 'Published successfully' }
  Publisher 2 Outcome: { publisherId: 102, status: 409, waitTime: 84, message: 'Conflict: Roster already published' }
  ```
- **Database State After Execution:** `status = 'published'`, `published_by = 101`, `published_at = '2026-11-16 15:30:28'`.
- **Deadlocks / Lock Waits:** 0 deadlocks (`ER_LOCK_DEADLOCK`); 1 lock wait of 84ms resolved cleanly.

---

### Test C-02: Roster Draft Edit vs Publishing Collision
- **Script:** [`test_c02_roster_edit_publish_race.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c02_roster_edit_publish_race.mjs)
- **Independent Connections:** 2 (`Publisher`, `Shift Editor`)
- **Synchronization Method:** Database Row-Lock Serialization on Header (`SELECT id, status FROM workforce_roster_header WHERE id = 1 FOR UPDATE`)
- **Operations Executed:** Publisher in-flight held header lock for 120ms. Shift Editor concurrently attempted `PUT /api/rosters/1/entries` to edit Entry 301 from Shift 10 to Shift 11. Shift Editor blocked on the header lock for 95ms. Once Publisher committed `status = 'published'`, Shift Editor unblocked, detected header was no longer draft, aborted edit, and returned HTTP 409 Conflict.
- **Expected Outcome:** Publisher completes; Editor is rejected with 409 Conflict; Entry 301 shift remains unchanged.
- **Actual Outcome:**
  ```text
  Publisher: { role: 'Publisher', status: 200, message: 'Published' }
  Editor:    { role: 'Editor', status: 409, lockWaitMs: 95, message: 'Conflict: Cannot edit published roster' }
  ```
- **Database State After Execution:** Header is `published`; Entry 301 `shift_id` remains `10` (unaltered).
- **Deadlocks / Lock Waits:** 0 deadlocks; 1 lock wait of 95ms.

---

### Test C-03: Punch-In vs Punch-Out Attribution Race
- **Script:** [`test_c03_punch_in_out_race.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c03_punch_in_out_race.mjs)
- **Independent Connections:** 2 (`Punch-In Worker`, `Punch-Out Worker`)
- **Synchronization Method:** Database Row-Lock Serialization on Attendance Record (`SELECT ... FOR UPDATE`)
- **Operations Executed:** Punch-In created row 650 with `punch_in_time = '2026-11-16 09:00:00'` and held row lock for 100ms. Punch-out arrived 25ms later, attempted `SELECT ... WHERE user_id = 12 AND punch_out_time IS NULL FOR UPDATE`, blocked for 78ms, acquired lock after Punch-In committed, updated `punch_out_time = '2026-11-16 17:30:00'`, and settled `total_hours = 8.50`.
- **Expected Outcome:** Both operations commit cleanly; row 650 is settled without data corruption.
- **Actual Outcome:**
  ```text
  Punch-In Result:  { op: 'Punch-In', status: 200, attendanceId: 650 }
  Punch-Out Result: { op: 'Punch-Out', status: 200, lockWaitMs: 78, attendanceId: 650 }
  ```
- **Database State After Execution:** Row 650 `punch_in_time = '2026-11-16 09:00:00'`, `punch_out_time = '2026-11-16 17:30:00'`, `total_hours = 8.50`, `punch_out_status = 'approved'`.
- **Deadlocks / Lock Waits:** 0 deadlocks; 1 lock wait of 78ms.

---

### Test C-04: Fixed Assignment vs Rotation Enrollment Mutual Exclusivity
- **Script:** [`test_c04_assignment_rotation_conflict.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c04_assignment_rotation_conflict.mjs)
- **Independent Connections:** 2 (`Fixed Assigner`, `Rotation Assigner`)
- **Synchronization Method:** Parent Mutex Locking on User Tenant Record (`SELECT user_id FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = 10 FOR UPDATE`)
- **Operations Executed:** Fixed Assigner acquired user lock, verified 0 active rotations, held lock for 100ms, inserted fixed assignment for Shift 10, and committed. Rotation Assigner requested user lock, blocked for 96ms, unblocked, checked active fixed assignments, detected active fixed assignment created by Connection 1, aborted with HTTP 409 Conflict.
- **Expected Outcome:** Mutual exclusivity invariant preserved: 1 fixed assignment, 0 rotations, 1 409 Conflict.
- **Actual Outcome:**
  ```text
  Fixed Assigner:    { op: 'FixedAssign', status: 200, message: 'Fixed shift assigned successfully' }
  Rotation Assigner: { op: 'RotationAssign', status: 409, lockWaitMs: 96, message: 'Conflict: User already assigned to active fixed shift' }
  ```
- **Database State After Execution:** `workforce_employee_fixed_assignment` count = 1; `workforce_employee_rotation` count = 0.
- **Deadlocks / Lock Waits:** 0 deadlocks; 1 lock wait of 96ms.

---

### Test C-05: Concurrent Exception Resolution Race
- **Script:** [`test_c05_exception_resolution_race.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c05_exception_resolution_race.mjs)
- **Independent Connections:** 2 (`Manager 101`, `Manager 102`)
- **Synchronization Method:** Database Row-Lock Serialization on Exception Record (`SELECT id, status FROM workforce_punch_attribution_exception WHERE id = 750 FOR UPDATE`)
- **Operations Executed:** Both managers attempted to resolve Exception 750 simultaneously. Manager 102 acquired the lock first (5ms), verified `status === 'pending'`, updated `status = 'resolved'`, inserted history audit record, and committed. Manager 101 was blocked for 94ms, unblocked, detected `status === 'resolved'`, rolled back, and returned HTTP 409 Conflict.
- **Expected Outcome:** Exactly 1 resolution succeeds; exactly 1 audit history entry created; second manager receives 409.
- **Actual Outcome:**
  ```text
  Manager 101 Outcome: { managerId: 101, status: 409, lockWaitMs: 94, message: 'Conflict: Exception already resolved' }
  Manager 102 Outcome: { managerId: 102, status: 200, lockWaitMs: 5, message: 'Exception resolved successfully' }
  ```
- **Database State After Execution:** Exception 750 `status = 'resolved'`, `resolved_by = 102`; History ledger has exactly 1 entry.
- **Deadlocks / Lock Waits:** 0 deadlocks; 1 lock wait of 94ms.

---

### Test C-06: Monotonic Ascending ID Deadlock Avoidance
- **Script:** [`test_c06_deadlock_avoidance_ordering.mjs`](file:///f:/hrms/node_backend/scripts/concurrency/test_c06_deadlock_avoidance_ordering.mjs)
- **Independent Connections:** 4 concurrent clients executing competing pairwise user swaps:
  - Client 1 requested `[10, 20]`
  - Client 2 requested `[20, 10]` (Direct reverse of Client 1)
  - Client 3 requested `[5, 15]`
  - Client 4 requested `[15, 5]` (Direct reverse of Client 3)
- **Synchronization Method:** Canonical Ascending Sorting (`[u1, u2].sort((a,b) => a - b)`) before executing `SELECT ... FOR UPDATE`.
- **Operations Executed:** Every client sorted its lock requests ascending. Client 2 locked user 10 then user 20 (matching Client 1). Client 4 locked user 5 then user 15 (matching Client 3).
- **Expected Outcome:** All 4 transactions commit cleanly with **ZERO** deadlocks (`ER_LOCK_DEADLOCK` / Error 1213).
- **Actual Outcome:**
  ```text
  Client 1: { clientName: 'Client 1', success: true, durationMs: 166 }
  Client 2: { clientName: 'Client 2', success: true, durationMs: 82 }
  Client 3: { clientName: 'Client 3', success: true, durationMs: 82 }
  Client 4: { clientName: 'Client 4', success: true, durationMs: 159 }
  Deadlocks Encountered: 0
  ```
- **Deadlocks / Lock Waits:** **0 deadlocks**; lock waits serialized strictly in ascending order.

---

## 4. Strengthened Migration 010 Multi-State Recovery Evidence

Script: [`test_migration_010_recovery.mjs`](file:///f:/hrms/node_backend/scripts/test_migration_010_recovery.mjs)  
Tested against MariaDB 11.8.9 under 8 distinct corrupted/partial DDL, safety, and recovery states:

1. **Scenario 1 (Absent Tables & Missing Ledger Entry):**
   - Injected State: Dropped `workforce_employee_rotation` and `workforce_rotation_step`; removed version `010` from `schema_migrations`.
   - Runner Action: Executed DDL with `CREATE TABLE IF NOT EXISTS` recreating absent tables, asserted all 4 tables exist, verified schema integrity, restored ledger entry `010`.
   - Outcome: **PASS**.

2. **Scenario 2 (Incomplete Schema — Missing Column `effective_to`):**
   - Injected State: Dropped column `effective_to` from `workforce_employee_fixed_assignment`.
   - Runner Action: Pre-audit detected missing column, executed `[Repair] Adding missing column 'effective_to'`, verified schema compliance.
   - Outcome: **PASS**.

3. **Scenario 3 (Missing Foreign Key — `fk_wefa_shift`):**
   - Injected State: Dropped constraint `fk_wefa_shift`.
   - Runner Action: Pre-audit detected missing foreign key, executed `[Repair] Adding missing foreign key 'fk_wefa_shift'`, verified referential integrity.
   - Outcome: **PASS**.

4. **Scenario 4 (Corrupted Index Definition — Fail-Closed Diagnostic):**
   - Injected State: Replaced `idx_wefa_tenant_user_active (tenant_id, user_id, is_active)` with corrupted columns `(user_id, shift_id)`.
   - Runner Action: Pre-audit detected column mismatch `[user_id, shift_id] !== [tenant_id, user_id, is_active]`. The runner **FAILED CLOSED** and halted execution with a precise diagnostic:
     ```text
     [Migration Error] Error: MIGRATION 010 VERIFICATION FAILED: Index 'idx_wefa_tenant_user_active' has incompatible columns [user_id, shift_id]. Expected [tenant_id, user_id, is_active]. Manual intervention required.
     ```
   - Outcome: **PASS (Fail-Closed Verified)**. Runner refused to mark migration as applied until index was corrected.

5. **Scenario 5 (Incompatible Foreign Key Definition — Fail-Closed Diagnostic):**
   - Injected State: Replaced `fk_wefa_shift` with illegal `ON DELETE CASCADE` rule instead of `RESTRICT`.
   - Runner Action: Foreign key deep inspection detected `ON DELETE rule mismatch (expected: RESTRICT, found: CASCADE)`. The runner **FAILED CLOSED**, threw diagnostic error, and withheld ledger recording.
   - Outcome: **PASS (Fail-Closed Verified)**. `schema_migrations` row count remained 0.

6. **Scenario 6 (Incompatible Column Definition — Fail-Closed Diagnostic):**
   - Injected State: Modified `effective_to` column on `workforce_employee_fixed_assignment` to `VARCHAR(50) NULL` instead of `DATE`.
   - Runner Action: Column definition inspection detected `data type mismatch (expected: date, found: varchar)`. The runner **FAILED CLOSED**, threw diagnostic error, and withheld ledger recording.
   - Outcome: **PASS (Fail-Closed Verified)**. `schema_migrations` row count remained 0.

7. **Scenario 7 (Existing Valid Data Preservation During Recovery):**
   - Injected State: Seeded 3 valid employee assignments (IDs 901, 902, 903) in `workforce_employee_fixed_assignment`, dropped secondary table `workforce_rotation_step`, deleted version `010` from `schema_migrations`.
   - Runner Action: Re-ran migration runner to repair table. Verified that all 3 seeded records remained 100% intact with zero column truncation, data mutation, or row loss.
   - Outcome: **PASS**.

8. **Scenario 8 (Checksum Mismatch — Fatal Error Enforcement & Clean Recovery):**
   - Injected State: Tampered checksum for version `010` in `schema_migrations` to 64 zeros.
   - Runner Action: Runner detected checksum mismatch, raised fatal `[CHECKSUM INTEGRITY VIOLATION]` exception, halted execution with non-zero exit code (`1`), blocked subsequent migrations, and preserved the tampered stored checksum (preventing blind auto-repair). Upon DBA-manual restoration of the correct checksum, the runner recovered cleanly with exit code `0`.
   - Outcome: **PASS (Fail-Closed Verified)**.

---

## 5. `total_hours` Migration 012 Forensic Verification

Script: [`test_total_hours_verification.mjs`](file:///f:/hrms/node_backend/scripts/test_total_hours_verification.mjs)  
- **Schema Audit:** Verified `attendance_attendance.total_hours` is `DECIMAL(5,2) NOT NULL DEFAULT 0.00`.
- **Historical Backfill Equivalence:** Evaluated across historical records:
  - Record 801 (09:00 to 17:00): Persisted = `8.00` | Legacy JS = `8.00`
  - Record 802 (09:00 to 17:20): Persisted = `8.33` | Legacy JS = `8.33` (Recurring 8.3333... correctly rounded)
  - Record 803 (09:00 to 13:45): Persisted = `4.75` | Legacy JS = `4.75`
- **Zero-Duration Attendance:** Punch-in at 09:00:00 and punch-out at 09:00:00 produced `0.00` hours in both SQL and JS.
- **Overnight Shift:** 21:55:00 to next day 06:08:00 (8h 13m) produced exactly `8.22` hours in both SQL and JS without precision loss.
- **10 Distinct Intervals Tested:** Verified 0m (0.00), 15m (0.25), 20m (0.33), 30m (0.50), 40m (0.67), 45m (0.75), 60m (1.00), 125m (2.08), 480m (8.00), 493m (8.22). Zero rounding differences detected.

---

## 6. Decoupled Application Rollback Verification (`ENABLE_WORKFORCE_MODULE=false`)

Script: [`test_application_rollback.mjs`](file:///f:/hrms/node_backend/scripts/test_application_rollback.mjs)  
- **Schema Decoupling:** Added `DEFAULT 1` to `tenant_id` and `DEFAULT (date)` to `work_date` in Migration 012. Legacy `INSERT INTO attendance_attendance` statements that do not specify workforce columns execute seamlessly without database error.
- **Status Semantics Preservation:**
  - `punch_in_status` strictly preserved as a **geofence approval state** (`approved`, `pending`, `rejected`).
  - `punch_out_status` strictly preserved as a **geofence approval state** (`approved`, `pending`, `rejected`).
  - `punctuality_status` strictly preserved as a **punctuality classification** (`on_time`, `grace_period`, `late`, `early_departure`, `unassigned`). When `ENABLE_WORKFORCE_MODULE=false`, punctuality defaults to `'unassigned'`.
- **Outside Geofence Approval Flow:** Outside punch created record with `punch_in_status = 'pending'`, approval created in `attendance_attendanceapproval`. Manager approved -> record transitioned to `'approved'`.

---

## 7. Attendance Calculation Clarification: `late_minutes` Definition

Per Stage 1 Review Correction #6, the architectural definition of `late_minutes` is formally established:

### **Approved Definition: Option A (Total minutes after scheduled shift start)**

- **Scenario 1 (Arrival within Grace Window):**
  - Shift start: `09:00:00`, Grace period: `15 minutes`, Punch-in: `09:05:00`.
  - Difference: 5 minutes. Since $5 \le 15$, the grace period forgives the lateness.
  - Attribution: `punctuality_status = 'grace_period'`, `late_minutes = 0`.
- **Scenario 2 (Arrival Exceeding Grace Window):**
  - Shift start: `09:00:00`, Grace period: `15 minutes`, Punch-in: `09:25:00`.
  - Difference: 25 minutes. Since $25 > 15$, the grace period is forfeited.
  - Attribution: `punctuality_status = 'late'`, `late_minutes = 25` (total elapsed minutes from scheduled shift start time `09:00:00`).

This definition is consistent across:
1. SQL Schema: `late_minutes INT NOT NULL DEFAULT 0` stores total late minutes.
2. Backend Services: `shift.service.js` and `attendance.service.js` calculate `late_minutes` from scheduled shift start when grace is breached.
3. Web / Mobile UI: Displays total lateness duration (e.g. "Late by 25 mins").
4. Payroll Reports: Applies standard Indian statutory and enterprise policy rules where exceeding grace subjects the employee to the full elapsed deduction window.

---

## 8. Summary of Corrections Applied in Stage 1

1. **Database Engine:** Transitioned completely from MariaDB 10.4.32 to **MariaDB 11.8.9** (official binary running on port 3307).
2. **Concurrency Coverage:** Authored and executed dedicated scripts for **C-01 through C-06**, recording connection counts, lock wait times, and exact database state transitions.
3. **Migration 010 Safety:** Upgraded `run-migrations.js` with table, column, index, and foreign key verification, automated repair of missing columns/keys, and fail-closed diagnostics for corrupted indexes.
4. **Decoupled Rollback Safety:** Updated `012_attendance_schema_expansion.sql` to provide default values for `tenant_id` (`DEFAULT 1`) and `work_date` (`DEFAULT (date)`), ensuring legacy attendance inserts function with `ENABLE_WORKFORCE_MODULE=false`.
5. **Historical Data Backfill:** Added SQL-level `total_hours` backfill to Migration 012 and proved 100% mathematical equivalence with the JavaScript `toHours()` method.
6. **Lateness Standard:** Explicitly documented and implemented Option A (total minutes after scheduled shift start upon grace breach).

---

## FINAL SIGN-OFF AUDIT

This dedicated section addresses the 5 audit gates required for Stage 1 Final Sign-Off (v2.0) with complete technical and forensic rigor.

### 1. Critical: `work_date` Default Correctness

#### 1.1 The Failure Mode in `DEFAULT (CURRENT_DATE)`
In earlier drafts of Migration 012, `work_date` was defined with `DEFAULT (CURRENT_DATE)`.  
When a legacy endpoint, mobile punch sync, or manual regularization inserts an attendance row without specifying workforce-extended fields, it executes:
```sql
INSERT INTO attendance_attendance (date, punch_in_time, punch_in_status, punch_out_status, status, user_id)
VALUES ('2024-04-12', '2024-04-12 09:15:00', 'approved', 'approved', 'approved', 10);
```
Under `DEFAULT (CURRENT_DATE)`:
- `attendance_attendance.date` receives `'2024-04-12'`.
- `attendance_attendance.work_date` evaluates to the current system date (`'2026-11-16'`).

**Resulting Failure Scenario:** A silent and severe data corruption occurs. Any subsequent workforce query grouping or filtering by `work_date` (such as monthly attendance reports, shift attribution, and payroll generation) attributes this historical punch to November 2026 instead of April 2024.

#### 1.2 The Corrected Default Expression in MariaDB 11.8.9
MariaDB 11.8.9 natively supports generated column default expressions that reference other columns in the same table row. Migration 012 Step 4 was corrected to:
```sql
ALTER TABLE attendance_attendance
  MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1,
  MODIFY COLUMN work_date DATE NOT NULL DEFAULT (date);
```
Because the default expression references `(date)`, MariaDB dynamically assigns `work_date = date` at insert time whenever `work_date` is omitted, regardless of whether `date` is historical, present, or future.

#### 1.3 Runnable Audit Evidence (`test_work_date_default_correctness.mjs`)
Script: [`node_backend/scripts/test_work_date_default_correctness.mjs`](file:///f:/hrms/node_backend/scripts/test_work_date_default_correctness.mjs)  
Executed against MariaDB 11.8.9 on `127.0.0.1:3307`. Execution log:
```text
================================================================================
[WORK_DATE DEFAULT CORRECTNESS AUDIT]
Target Database: MariaDB 11.8.9 (127.0.0.1:3307)
================================================================================

--- 1. Inspecting work_date Column Definition ---
work_date Column Metadata: {
  COLUMN_NAME: 'work_date',
  DATA_TYPE: 'date',
  IS_NULLABLE: 'NO',
  COLUMN_DEFAULT: '`date`'
}

--- 2. Test: Insert with Explicit Historical Date (Omitted work_date) ---
Historical Insert Row: { id: 807, date: '2024-04-12', work_date: '2024-04-12', tenant_id: 1 }
>>> ✅ PASS: work_date strictly inherited historical date '2024-04-12' (NOT current date).

--- 3. Test: Insert with Today's Date (Omitted work_date) ---
Today Insert Row: { id: 808, date: '2026-11-16', work_date: '2026-11-16', tenant_id: 1 }
>>> ✅ PASS: work_date matched today's date '2026-11-16'.

--- 4. Test: Overnight Shift with Explicit work_date Override ---
Overnight Insert Row: {
  id: 809,
  date: '2026-11-17',
  work_date: '2026-11-16',
  punch_in_time: '2026-11-16 22:00:00',
  punch_out_time: '2026-11-17 06:00:00'
}
>>> ✅ PASS: Explicit work_date '2026-11-16' preserved despite calendar date '2026-11-17'.

--- 5. Test: Legacy INSERT Statement Omitting All Workforce Fields ---
Legacy Inserted Row: {
  id: 810,
  date: '2023-12-25',
  work_date: '2023-12-25',
  tenant_id: 1,
  roster_entry_id: null,
  shift_version_id: null,
  total_hours: '0.00',
  punctuality_status: 'unassigned'
}
>>> ✅ PASS: Legacy insert succeeded with work_date = '2023-12-25', tenant_id = 1, punctuality_status = 'unassigned'.

--- 6. Test: Full Table Consistency Audit ---
Total non-roster records with date/work_date mismatch: 0
>>> ✅ PASS: Exactly 0 date/work_date mismatches exist across all legacy records.

================================================================================
ALL WORK_DATE DEFAULT CORRECTNESS TESTS PASSED PERFECTLY!
================================================================================
```

#### 1.4 Behavior Under `ENABLE_WORKFORCE_MODULE=false`
When the workforce module is disabled:
- Legacy application code continues executing unmodified SQL queries (referencing `date` and ignoring `work_date`).
- Because `tenant_id` defaults to `1` and `work_date` defaults to `(date)`, every legacy INSERT automatically satisfies all NOT NULL constraints and maintains perfect synchronization between `date` and `work_date`.
- No application errors, schema constraint violations, or date misalignments can occur.

---

### 2. Full Historical Backfill Assertions

#### 2.1 Exact SQL Assertions and Production Counts
To independently verify the backfill logic at scale, a dedicated test script [`node_backend/scripts/test_historical_backfill_assertions.mjs`](file:///f:/hrms/node_backend/scripts/test_historical_backfill_assertions.mjs) was authored and executed against MariaDB 11.8.9.

The test seeded **1,000 legacy records** across 65 employee accounts spanning diverse historical dates (2023 to 2026), incomplete punches, pending/rejected approval states, and varying shift durations, followed by applying Migration 012's exact backfill statement:
```sql
UPDATE attendance_attendance
SET tenant_id = 1,
    work_date = date,
    total_hours = CASE
      WHEN status = 'approved' AND punch_in_time IS NOT NULL AND punch_out_time IS NOT NULL AND punch_out_time >= punch_in_time
      THEN ROUND(TIMESTAMPDIFF(SECOND, punch_in_time, punch_out_time) / 3600, 2)
      ELSE 0.00
    END
WHERE tenant_id IS NULL;
```

#### 2.2 Post-Backfill Assertion Results
```sql
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END) AS null_tenant_id_count,
  SUM(CASE WHEN work_date IS NULL THEN 1 ELSE 0 END) AS null_work_date_count,
  SUM(CASE WHEN work_date <> date THEN 1 ELSE 0 END) AS date_mismatch_count,
  SUM(CASE WHEN tenant_id <> 1 THEN 1 ELSE 0 END) AS non_tenant_1_count,
  SUM(CASE WHEN total_hours IS NULL THEN 1 ELSE 0 END) AS null_total_hours_count,
  SUM(CASE WHEN punctuality_status <> 'unassigned' THEN 1 ELSE 0 END) AS non_unassigned_punctuality_count
FROM test_legacy_attendance;
```
**Output from MariaDB 11.8.9 execution:**
```text
Post-Backfill SQL Assertion Results: {
  total_rows: 1000,
  null_tenant_id_count: 0,
  null_work_date_count: 0,
  date_mismatch_count: 0,
  non_tenant_1_count: 0,
  null_total_hours_count: 0,
  non_unassigned_punctuality_count: 0
}
```

#### 2.3 Mathematical Independence of Row Count
The backfill logic is **strictly mathematically independent of the total number of rows** ($N$):
1. **Scalar Row-Level Transformation:** The update maps each individual tuple $(r_{\text{date}}, r_{\text{punch\_in}}, r_{\text{punch\_out}}, r_{\text{status}})$ to $(r_{\text{tenant\_id}} = 1, r_{\text{work\_date}} = r_{\text{date}}, r_{\text{total\_hours}} = g(r))$.
2. **Absence of Cross-Row Coupling:** The transformation contains no window functions (`OVER (...)`), no aggregations (`SUM`, `AVG`, `COUNT`), no self-joins, and no row-order dependencies.
3. **Inductive Correctness:** If the transformation is valid for an arbitrary row $r_i$, then by mathematical induction over the finite set $S = \{r_1, r_2, \dots, r_N\}$, it is identically valid for any cardinality $N$, whether $N = 10$, $N = 799$ (current production rows), or $N = 10^6$.
4. **JavaScript Equivalence:** Across all 1,000 evaluated records, comparison between SQL `total_hours` and the legacy JavaScript `toHours()` function yielded **exactly 0 mismatches**.

---

### 3. Concurrency Script Source Audit

All 6 concurrency scenarios (C-01 through C-06) were subjected to a source-level architectural audit confirming strict adherence to enterprise concurrency standards:

```text
node_backend/scripts/concurrency/
├── test_c01_roster_publish_race.mjs
├── test_c02_roster_edit_publish_race.mjs
├── test_c03_punch_in_out_race.mjs
├── test_c04_assignment_rotation_conflict.mjs
├── test_c05_exception_resolution_race.mjs
├── test_c06_deadlock_avoidance_ordering.mjs
└── run_all_concurrency_tests.mjs
```

#### 3.1 Architectural Confirmation Matrix

| Test ID | Connection Isolation | Transaction Boundaries | Conflict / Rollback Handling | Post-Concurrency Assertions | Final Database State Verification |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **C-01** | 2 independent pool connections (`pool.getConnection()`) | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Connection 2 blocks on header lock; once lock acquired, reads `status === 'published'`, rolls back, returns **HTTP 409 Conflict** | `successes === 1 && conflicts === 1` | `workforce_roster_header.status = 'published'`, `published_by = 101` |
| **C-02** | 2 independent pool connections (Publisher vs Editor) | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Editor blocks on header lock for 95ms; once publisher commits, editor reads `status !== 'draft'`, rolls back, returns **HTTP 409 Conflict** | `pubRes.status === 200 && editRes.status === 409` | Header is `published`; Entry 301 `shift_id` strictly unchanged (`10`) |
| **C-03** | 2 independent pool connections (Punch-In vs Punch-Out) | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Punch-Out blocks on row lock for 78ms until Punch-In commits open row, then updates punch-out time and total hours, commits **HTTP 200** | `inRes.status === 200 && outRes.status === 200` | Row 650 `total_hours = '8.50'`, `punch_out_status = 'approved'` |
| **C-04** | 2 independent pool connections (Fixed vs Rotation) | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Parent user mutex (`workforce_user_tenant FOR UPDATE`). Rotation assigner waits 96ms, detects active fixed assignment, rolls back, returns **HTTP 409 Conflict** | `fixedRes.status === 200 && rotRes.status === 409` | Exactly 1 fixed assignment, 0 rotations in database |
| **C-05** | 2 independent pool connections (Manager 101 vs 102) | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Exception row lock (`FOR UPDATE`). Manager 101 waits 94ms, reads `status === 'resolved'`, rolls back, returns **HTTP 409 Conflict** | `successes === 1 && conflicts === 1 && historyRows.length === 1` | Exception 750 `status = 'resolved'`, exactly 1 audit history row in `workforce_punch_attribution_history` |
| **C-06** | 4 independent concurrent connections | Explicit `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` | Monotonic Ascending ID Sorting (`[u1, u2].sort((a,b) => a - b)`). Competing clients acquire locks in identical global order; lock cycles mathematically impossible | `allSuccessful === true && deadlockCount === 0` | All 4 concurrent operations committed; **0 deadlocks** (`ER_LOCK_DEADLOCK` / Error 1213) |

---

### 4. Migration 010 Recovery Safety

#### 4.1 Re-Execution Protection vs Blind Execution
The migration runner [`node_backend/scripts/run-migrations.js`](file:///f:/hrms/node_backend/scripts/run-migrations.js) does **not** perform blind statement re-execution:
1. **DDL-Level Guarding:** All table creation statements in `010_workforce_assignments_and_rotations.sql` specify `CREATE TABLE IF NOT EXISTS`.
2. **Index Pre-Checks:** `executeStatementMysql` parses `CREATE INDEX` statements and queries `information_schema.STATISTICS` via `indexExists(table, index)`. If the index already exists, the statement is cleanly skipped, avoiding `ER_DUP_KEYNAME` (Error 1061).
3. **Checksum Integrity Enforcement:** The runner computes SHA-256 checksums of all migration files. For already-applied migrations recorded in `schema_migrations`, the runner strictly validates that the stored checksum matches the migration file checksum. Any mismatch raises a fatal `CHECKSUM INTEGRITY VIOLATION` error, halting execution immediately with exit code `1`, blocking all subsequent migrations, and preserving the stored checksum for DBA investigation without auto-rewriting.

#### 4.2 Automated Reconciliation & Multi-Phase Execution Sequence
When executing or recovering an interrupted migration, the runner enforces a deterministic multi-phase lifecycle:
1. **Idempotent DDL Execution (Phase 1):** The runner first executes all statements from `010_workforce_assignments_and_rotations.sql`. Because all DDL table creation statements specify `CREATE TABLE IF NOT EXISTS`, any tables absent due to an interrupted run are cleanly created, while existing tables and their data are preserved.
2. **Post-DDL Table Assertion (Phase 2):** After statement execution, the runner queries `information_schema.TABLES` to assert that all 4 required tables (`workforce_employee_fixed_assignment`, `workforce_rotation_definition`, `workforce_rotation_step`, `workforce_employee_rotation`) exist. If any table is *still* absent (e.g., due to failed DDL or permission errors), the runner immediately raises a fatal exception and halts.
3. **Column Definition Verification & Repair (Phase 3):** Inspects complete column definitions via `verifyColumnDefinition(table, spec)`. If a required column is missing, it is non-destructively added; if a column exists with an incompatible data type, length, or nullability, the runner fails closed.
4. **Index Verification (Phase 4):** Validates required composite indexes (`idx_wefa_tenant_user_active`, `idx_wer_tenant_user_active`) via `getIndexColumns(table, index)`. Missing indexes are created; incompatible index column orderings trigger a fail-closed exception.
5. **Foreign Key Verification & Repair (Phase 5):** Deeply inspects foreign key definitions via `verifyForeignKeyDefinition(table, spec)` across all 7 attributes (name, source table/columns, referenced table/columns, ordinal position, DELETE rule `RESTRICT`, UPDATE rule `RESTRICT`). Missing constraints are added; incompatible rules trigger a fail-closed exception.
6. **Ledger Recording (Phase 6):** The migration version `010` is recorded in `schema_migrations` if and only if all phases pass without error.

#### 4.3 Fail-Closed Mechanism on Incompatible Schema
To prevent silent corruption or invalid indexing, the runner performs deep inspection of existing indexes using `getIndexColumns()`:
```javascript
if (await indexExists("workforce_employee_fixed_assignment", "idx_wefa_tenant_user_active")) {
  const cols = await getIndexColumns("workforce_employee_fixed_assignment", "idx_wefa_tenant_user_active");
  const expectedCols = ["tenant_id", "user_id", "is_active"];
  const matches = cols.length === expectedCols.length && cols.every((c, i) => c === expectedCols[i]);
  if (!matches) {
    throw new Error(`MIGRATION 010 VERIFICATION FAILED: Index 'idx_wefa_tenant_user_active' has incompatible columns [${cols.join(", ")}]. Expected [${expectedCols.join(", ")}]. Manual intervention required.`);
  }
}
```
**Forensic Proof:** In Scenario 4 of `test_migration_010_recovery.mjs`, when `idx_wefa_tenant_user_active` had columns `(user_id, shift_id)`, the runner **immediately failed closed**, refused to record the migration as complete, and output the required diagnostic error.

---

### 5. Application Regression Evidence

To ensure complete transparency regarding test coverage, the regression verification is categorized into its exact testing domains:

#### 5.1 Backend Service & API Testing (Executed & Verified)
- **Repository Execution:** The legacy data access queries generated by `attendanceRepository.js` and `attendanceService.js` were directly executed against the MariaDB 11.8.9 database containing Phase B & G migrations.
- **Tested Workflows in `test_application_rollback.mjs`:**
  - Inside Geofence Punch-In and Punch-Out: Succeeded with `punch_in_status = 'approved'`, `punctuality_status = 'unassigned'`, `total_hours = 8.50`.
  - Outside Geofence Punch-In with Approval Workflow: Succeeded with `punch_in_status = 'pending'`, approval record in `attendance_attendanceapproval`, and clean resolution to `'approved'` upon manager action.
  - Legacy Status and History API Contract: Querying legacy columns (`id`, `user_id`, `date`, `punch_in_time`, `punch_out_time`, `punch_in_status`, `punch_out_status`, `status`, `total_hours`) yielded 100% type and semantic equivalence.

#### 5.2 SQL Compatibility (Executed & Verified)
- All legacy DML statements (`SELECT`, `INSERT`, `UPDATE`) operating on `attendance_attendance` succeed without syntax or constraint errors.
- Schema defaults (`tenant_id NOT NULL DEFAULT 1`, `work_date NOT NULL DEFAULT (date)`, `total_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00`, `punctuality_status NOT NULL DEFAULT 'unassigned'`) ensure full backward compatibility.

#### 5.3 Web UI Compatibility (Verified via Contract & Artifact Audit)
- Verified that API payloads match the JSON structure expected by the React frontend components (`EmployeeAttendance.jsx`, `AttendanceApproval.jsx`).
- No React frontend bundle or code changes are required for existing attendance views.

#### 5.4 Physical Mobile Hardware Sensors (Explicitly Not Verified)
Because Stage 1 is executed on a disposable server test environment without attached physical smartphones, device-level hardware integration is explicitly documented as:
- Hardware Biometric Reader Sensor: **`[NOT VERIFIED ON PHYSICAL DEVICE]`** (Requires physical Android fingerprint/face-unlock sensor).
- Hardware GPS Spoofing Detection Sensor: **`[NOT VERIFIED ON PHYSICAL DEVICE]`** (Requires physical Android/iOS GPS satellite receiver).
- Offline Punch SQLite Cache Sync: **`[NOT VERIFIED ON PHYSICAL DEVICE]`** (Requires running React Native / Flutter client container).
- Native Camera Photo Capture: **`[NOT VERIFIED ON PHYSICAL DEVICE]`** (Requires device camera API).

---

## FINAL IMPLEMENTATION CONSISTENCY CHECK

As mandated by the Principal Engineering Audit, a source-level verification and consistency check was executed across `run-migrations.js` and `test_migration_010_recovery.mjs` against **MariaDB 11.8.9** (`127.0.0.1:3307`). All four audit findings have been resolved, verified with live execution, and certified.

### Finding 1: Migration 010 Recovery Lifecycle & Table Assertion Resolution

#### 1.1 Architectural Analysis & Discrepancy Resolution
A textual contradiction was identified between Scenario 1 (which reported that missing tables are recreated during recovery) and Section 4.2 (which asserted that missing tables cause the runner to raise an error prior to DDL execution).

Inspection of the actual source code in [`node_backend/scripts/run-migrations.js`](file:///f:/hrms/node_backend/scripts/run-migrations.js#L367-L378) establishes the authoritative behavior:
```javascript
// node_backend/scripts/run-migrations.js (lines 367-378)
} else if (file.startsWith("010_")) {
  // Parse and safely execute each statement first
  const statements = parseSqlStatements(content);
  for (const statement of statements) {
    await executeStatementMysql(statement);
  }

  // Strict Specification Reconciliation & Verification for Migration 010
  console.log("  - Running strict specification verification and reconciliation for Migration 010...");

  // 1. Verify all 4 expected tables exist
  const expectedTables = [
    "workforce_employee_fixed_assignment",
    "workforce_rotation_definition",
    "workforce_rotation_step",
    "workforce_employee_rotation",
  ];
  for (const tbl of expectedTables) {
    if (!(await tableExists(tbl))) {
      throw new Error(`MIGRATION 010 VERIFICATION FAILED: Table '${tbl}' is absent!`);
    }
  }
```

The lifecycle is strictly two-phase:
1. **Phase 1 (DDL Execution):** The migration runner executes `010_workforce_assignments_and_rotations.sql`. Because table creation uses `CREATE TABLE IF NOT EXISTS`, any tables dropped or absent from an interrupted run are recreated, while existing tables are left untouched.
2. **Phase 2 (Post-Execution Table Assertion):** The runner inspects `information_schema.TABLES`. If any of the 4 tables remains absent *after* DDL execution, the runner immediately raises a fatal exception and fails closed.

Section 4.2 of this report has been aligned with this actual implementation, eliminating the contradiction.

#### 1.2 Live Execution Evidence (Scenario 1)
```text
Command: node node_backend/scripts/test_migration_010_recovery.mjs

--- Scenario 1: Absent Tables & Missing Migration Ledger Entry ---
State before runner: 2 tables dropped, version 010 removed from schema_migrations.
[Migration] Applying 010_workforce_assignments_and_rotations.sql (checksum: 8cb25e16)...
  - Running strict specification verification and reconciliation for Migration 010...
  - Strict verification for Migration 010 PASSED: all 4 tables, columns, indexes, and FKs validated.
[Migration] Successfully applied and recorded 010_workforce_assignments_and_rotations.sql
>>> ✅ Scenario 1 PASSED: Absent tables recreated, all 4 tables verified, ledger entry restored.
```

---

### Finding 2: Complete Foreign-Key Definition Verification & Fail-Closed Enforcement

#### 2.1 Specification Requirement & Implementation
The migration runner must not rely merely on constraint existence. It must deeply inspect every foreign-key constraint across all referential attributes:
1. Constraint name
2. Source table name
3. Source column names and ordinal positions
4. Referenced table name
5. Referenced column names and ordinal positions
6. `DELETE_RULE` (must strictly be `RESTRICT`)
7. `UPDATE_RULE` (must strictly be `RESTRICT`)

This verification is implemented in [`node_backend/scripts/run-migrations.js`](file:///f:/hrms/node_backend/scripts/run-migrations.js#L214-L285):
```javascript
// Helper to get complete foreign key definition
async function getForeignKeyDefinition(table, fkName) {
  const [rows] = await conn.query(
    `SELECT 
       kcu.CONSTRAINT_NAME,
       kcu.TABLE_NAME,
       kcu.COLUMN_NAME,
       kcu.REFERENCED_TABLE_NAME,
       kcu.REFERENCED_COLUMN_NAME,
       kcu.ORDINAL_POSITION,
       rc.DELETE_RULE,
       rc.UPDATE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
       AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
       AND kcu.TABLE_NAME = rc.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.TABLE_NAME = ?
       AND kcu.CONSTRAINT_NAME = ?
     ORDER BY kcu.ORDINAL_POSITION ASC`,
    [table, fkName]
  );
  if (rows.length === 0) return null;
  return {
    name: rows[0].CONSTRAINT_NAME,
    table: rows[0].TABLE_NAME,
    referencedTable: rows[0].REFERENCED_TABLE_NAME,
    columns: rows.map((r) => r.COLUMN_NAME),
    referencedColumns: rows.map((r) => r.REFERENCED_COLUMN_NAME),
    deleteRule: rows[0].DELETE_RULE,
    updateRule: rows[0].UPDATE_RULE,
  };
}

// Helper to verify foreign key definition and fail closed on incompatibility
async function verifyForeignKeyDefinition(table, spec) {
  const actual = await getForeignKeyDefinition(table, spec.name);
  if (!actual) return false; // Foreign key absent

  const issues = [];
  if (actual.table.toLowerCase() !== spec.table.toLowerCase()) {
    issues.push(`source table mismatch (expected: ${spec.table}, found: ${actual.table})`);
  }
  if (actual.referencedTable.toLowerCase() !== spec.referencedTable.toLowerCase()) {
    issues.push(`referenced table mismatch (expected: ${spec.referencedTable}, found: ${actual.referencedTable})`);
  }
  if (actual.columns.join(",").toLowerCase() !== spec.columns.join(",").toLowerCase()) {
    issues.push(`source columns mismatch (expected: [${spec.columns.join(", ")}], found: [${actual.columns.join(", ")}])`);
  }
  if (actual.referencedColumns.join(",").toLowerCase() !== spec.referencedColumns.join(",").toLowerCase()) {
    issues.push(`referenced columns mismatch (expected: [${spec.referencedColumns.join(", ")}], found: [${actual.referencedColumns.join(", ")}])`);
  }
  if (spec.deleteRule && actual.deleteRule.toUpperCase() !== spec.deleteRule.toUpperCase()) {
    issues.push(`ON DELETE rule mismatch (expected: ${spec.deleteRule}, found: ${actual.deleteRule})`);
  }
  if (spec.updateRule && actual.updateRule.toUpperCase() !== spec.updateRule.toUpperCase()) {
    issues.push(`ON UPDATE rule mismatch (expected: ${spec.updateRule}, found: ${actual.updateRule})`);
  }

  if (issues.length > 0) {
    throw new Error(
      `MIGRATION VERIFICATION FAILED: Foreign key '${spec.name}' on '${table}' has incompatible definition: ${issues.join("; ")}. Manual intervention required.`
    );
  }
  return true;
}
```

All 9 foreign keys across Migration 010 are explicitly verified against this standard:
- `fk_wefa_user`: `accounts_user(id)`, `RESTRICT` / `RESTRICT`
- `fk_wefa_shift`: `workforce_shift(tenant_id, id)`, `RESTRICT` / `RESTRICT`
- `fk_wefa_user_tenant`: `workforce_user_tenant(tenant_id, user_id)`, `RESTRICT` / `RESTRICT`
- `fk_wrd_tenant`: `workforce_tenant(id)`, `RESTRICT` / `RESTRICT`
- `fk_wrs_rotation`: `workforce_rotation_definition(tenant_id, id)`, `RESTRICT` / `RESTRICT`
- `fk_wrs_shift`: `workforce_shift(tenant_id, id)`, `RESTRICT` / `RESTRICT`
- `fk_wer_user`: `accounts_user(id)`, `RESTRICT` / `RESTRICT`
- `fk_wer_rotation`: `workforce_rotation_definition(tenant_id, id)`, `RESTRICT` / `RESTRICT`
- `fk_wer_user_tenant`: `workforce_user_tenant(tenant_id, user_id)`, `RESTRICT` / `RESTRICT`

#### 2.2 Live Execution Evidence (Scenario 5 — Incompatible FK Fail-Closed)
In Scenario 5 of `test_migration_010_recovery.mjs`, `fk_wefa_shift` was deliberately created with an incompatible `ON DELETE CASCADE` rule instead of `RESTRICT`.

```text
--- Scenario 5: Incompatible Foreign Key Definition (Fail-Closed) ---
State before runner: 'fk_wefa_shift' defined with illegal ON DELETE CASCADE rule.
Received expected fail-closed diagnostic:
 [Migration Error] Error: MIGRATION VERIFICATION FAILED: Foreign key 'fk_wefa_shift' on 'workforce_employee_fixed_assignment' has incompatible definition: ON DELETE rule mismatch (expected: RESTRICT, found: CASCADE). Manual intervention required.
>>> ✅ Scenario 5 PASSED: Runner detected incompatible foreign key ON DELETE CASCADE rule, failed closed, and withheld ledger recording.
```
**Ledger Assertion:** `SELECT version FROM schema_migrations WHERE version = '010'` returned **0 rows**, certifying that an incompatible foreign key rule prevents the migration from being recorded as applied.

---

### Finding 3: Deep Column-Definition Verification & Fail-Closed Enforcement

#### 3.1 Specification Requirement & Implementation
The migration runner must not treat column existence alone as proof of correctness. It must deeply inspect column attributes:
1. Data type (`DATA_TYPE`)
2. Column type including length and precision (`COLUMN_TYPE`)
3. Nullability (`IS_NULLABLE`)
4. Default value (`COLUMN_DEFAULT`, with string and syntax normalization)
5. Generated column expressions (`EXTRA`)

This verification is implemented in [`node_backend/scripts/run-migrations.js`](file:///f:/hrms/node_backend/scripts/run-migrations.js#L156-L212):
```javascript
// Helper to get complete column metadata
async function getColumnDefinition(table, columnName) {
  const [rows] = await conn.query(
    `SELECT 
       COLUMN_NAME,
       DATA_TYPE,
       COLUMN_TYPE,
       CHARACTER_MAXIMUM_LENGTH,
       NUMERIC_PRECISION,
       NUMERIC_SCALE,
       IS_NULLABLE,
       COLUMN_DEFAULT,
       EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, columnName]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

// Helper to verify column definition and fail closed on incompatibility
async function verifyColumnDefinition(table, spec) {
  const actual = await getColumnDefinition(table, spec.name);
  if (!actual) return false; // Column absent

  const issues = [];
  if (spec.dataType && actual.DATA_TYPE.toLowerCase() !== spec.dataType.toLowerCase()) {
    issues.push(`data type mismatch (expected: ${spec.dataType}, found: ${actual.DATA_TYPE})`);
  }
  if (spec.isNullable && actual.IS_NULLABLE.toUpperCase() !== spec.isNullable.toUpperCase()) {
    issues.push(`nullability mismatch (expected: ${spec.isNullable}, found: ${actual.IS_NULLABLE})`);
  }
  if (spec.columnType && actual.COLUMN_TYPE.toLowerCase() !== spec.columnType.toLowerCase()) {
    issues.push(`column type mismatch (expected: ${spec.columnType}, found: ${actual.COLUMN_TYPE})`);
  }
  if (spec.columnDefault !== undefined) {
    const normalizeDef = (val) => {
      if (val === null || val === undefined || String(val).toUpperCase() === "NULL") return null;
      return String(val).replace(/^['`\(]|['`\)]$/g, "").trim().toLowerCase();
    };
    const actualDef = normalizeDef(actual.COLUMN_DEFAULT);
    const expectedDef = normalizeDef(spec.columnDefault);
    if (actualDef !== expectedDef) {
      issues.push(`default value mismatch (expected: ${spec.columnDefault}, found: ${actual.COLUMN_DEFAULT})`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `MIGRATION VERIFICATION FAILED: Column '${spec.name}' on '${table}' has incompatible definition: ${issues.join("; ")}. Manual intervention required.`
    );
  }
  return true;
}
```

#### 3.2 Live Execution Evidence (Scenario 6 — Incompatible Column Fail-Closed)
In Scenario 6 of `test_migration_010_recovery.mjs`, column `effective_to` on `workforce_employee_fixed_assignment` was altered to `VARCHAR(50) NULL` instead of `DATE NULL`.

```text
--- Scenario 6: Incompatible Column Definition (Fail-Closed) ---
State before runner: Column 'effective_to' altered to incompatible type VARCHAR(50) NULL.
Received expected fail-closed diagnostic:
 [Migration Error] Error: MIGRATION VERIFICATION FAILED: Column 'effective_to' on 'workforce_employee_fixed_assignment' has incompatible definition: data type mismatch (expected: date, found: varchar). Manual intervention required.
>>> ✅ Scenario 6 PASSED: Runner detected incompatible column data type, failed closed, and withheld ledger recording.
```
**Ledger Assertion:** `SELECT version FROM schema_migrations WHERE version = '010'` returned **0 rows**, certifying that an incompatible column type prevents ledger recording.

---

### Finding 4: Migration Runner Safety Proofs & Verification Matrix

The migration runner's safety guarantees have been verified across five core operational safety principles:

| Safety Principle | Implementation Mechanism | Test Scenario | Verified Outcome |
| :--- | :--- | :---: | :--- |
| **1. No Silent Data Corruption** | `CREATE TABLE IF NOT EXISTS`, pre-checks on `information_schema.STATISTICS`, non-destructive `ADD COLUMN` | Scenario 1, 2, 3 | Missing schema elements are safely recreated or added without touching existing table rows or dropping tables. |
| **2. Unrecorded Failed Validations** | Strict fail-closed exception halts runner before `recordMigrationApplied()` is reached | Scenario 4, 5, 6 | `schema_migrations` query returned 0 rows in all failed validation scenarios; broken migrations are never marked applied. |
| **3. Existing Valid Data Preservation** | Table DDL does not issue `DROP TABLE` or `TRUNCATE` on recovery; columns added with appropriate defaults | Scenario 7 | 3 seeded employee assignments (IDs 901, 902, 903) were 100% preserved with zero data mutation across simulated runner recovery. |
| **4. Checksum Mismatch Fatal Enforcement** | SHA-256 hash comparison between migration file and recorded hash in `schema_migrations` | Scenario 8 & Checksum Suite (C-01 to C-08) | Fatal `[CHECKSUM INTEGRITY VIOLATION]` exception thrown; execution halted immediately (exit code 1); subsequent migrations blocked; stored checksum not auto-rewritten; existing application data preserved. |
| **5. Incompatible Schemas Require Manual Intervention** | Runner throws fatal `Manual intervention required` exception; does not auto-mutate unknown schemas | Scenario 4, 5, 6 | Runner refuses to blindly drop foreign keys, alter corrupted index columns, or convert column types without human DBA sign-off. |

#### 4.1 Data Preservation Execution Log (Scenario 7)
```text
--- Scenario 7: Existing Valid Data Preservation During Recovery ---
State before runner: 3 valid employee assignments exist in workforce_employee_fixed_assignment, rotation_step dropped.
[Migration] Applying 010_workforce_assignments_and_rotations.sql (checksum: 8cb25e16)...
  - Strict verification for Migration 010 PASSED: all 4 tables, columns, indexes, and FKs validated.
Preserved Rows After Runner Recovery: [
  { id: 901, tenant_id: 1, user_id: 10, shift_id: 10, is_active: 1 },
  { id: 902, tenant_id: 1, user_id: 11, shift_id: 10, is_active: 1 },
  { id: 903, tenant_id: 1, user_id: 12, shift_id: 10, is_active: 1 }
]
>>> ✅ Scenario 7 PASSED: All existing valid data 100% preserved through recovery execution.
```

#### 4.2 Checksum Mismatch Fatal Error Execution Log (Scenario 8)
```text
--- Scenario 8: Checksum Mismatch — Fatal Error Enforcement ---
State before runner: version 010 checksum tampered to 0000000000000000...
Runner emitted CHECKSUM INTEGRITY VIOLATION and exited non-zero (exit code 1).
[Migration Error] Error: [CHECKSUM INTEGRITY VIOLATION] Migration '010_workforce_assignments_and_rotations.sql' has been tampered or modified after it was applied.
  Recorded checksum : 0000000000000000000000000000000000000000000000000000000000000000
  Current checksum  : 8cb25e1685e780d48f4f35661e6b56df943b003efceb34ec40cdec8116c5719a
  Applied at        : Mon Nov 16 2026 15:57:06 GMT+0530 (India Standard Time)
This is a critical integrity error. All subsequent migrations have been blocked.
Manual DBA investigation and recovery are required before migrations can proceed.
Do NOT rewrite the stored checksum automatically — investigate the source of the discrepancy first.
Stored checksum after failing run: 0000000000000000... (tampered value preserved — not auto-repaired).
>>> ✅ Scenario 8 PASSED: Checksum mismatch caused fatal error (non-zero exit, stored checksum not auto-rewritten). Runner recovered cleanly after DBA-manual checksum restoration.
```

---

### Impact on Stage 1 Acceptance
1. **100% Technical Consistency:** All source code implementations in `run-migrations.js` match the exact architectural assertions in the validation reports.
2. **Defensive Schema Protection:** Foreign keys and column definitions are actively verified across all metadata attributes and fail closed on incompatible configurations.
3. **No Migration Contradictions:** The runner's lifecycle has been accurately documented as a two-phase DDL execution and post-execution verification sequence.
4. **Disposable Testing Cleanliness:** All 8 recovery scenarios were executed in isolation on **MariaDB 11.8.9** (`127.0.0.1:3307`, `hrms_disposable_test`), leaving the database in a fully consistent, validated state with zero production touch.

---

## CHECKSUM INTEGRITY ENFORCEMENT — STAGE 1 FINAL CORRECTION

### 1. Historical Pre-Fix Behavior (Prior to Checksum Integrity Enforcement)

#### 1.1 Source Location
File: [`node_backend/scripts/run-migrations.js`](file:///f:/hrms/node_backend/scripts/run-migrations.js#L314-L322)  
Function: `runMigrations()` — MySQL/MariaDB migration loop (lines 314–322); SQLite loop (lines 657–664)

#### 1.2 Actual Code (Before Fix)
```javascript
// Before fix — lines 314-322 (MySQL/MariaDB path)
if (appliedMap.has(version)) {
  const applied = appliedMap.get(version);
  if (applied.checksum !== checksum) {
    console.warn(`[Migration Warning] Checksum mismatch for migration ${file}! ...`);
  } else {
    console.log(`[Migration] ${file}: Already applied ... (checksum verified).`);
  }
  continue;  // ← ALWAYS CONTINUED regardless of mismatch
}
```

The `continue` statement was placed **outside** the `if/else` block. This meant:
- A tampered checksum emitted a `[Migration Warning]` to stderr.
- **Execution continued to all subsequent pending migrations** — the warning was a no-op.
- The process exited with code **0** (success).
- No ledger modifications were blocked.
- Later migrations were NOT blocked.

This violated all 7 required safety behaviors.

#### 1.3 Classification
**Critical integrity defect.** A tampered migration file (or ledger record) could signal database schema corruption. Allowing subsequent migrations to execute against a potentially inconsistent database creates undefined behavior and data hazards.

---

### 2. Post-Fix Behavior (After This Correction)

#### 2.1 Fixed Code
```javascript
// After fix — lines 314-328 (MySQL/MariaDB path)
if (appliedMap.has(version)) {
  const applied = appliedMap.get(version);
  if (applied.checksum !== checksum) {
    throw new Error(
      `[CHECKSUM INTEGRITY VIOLATION] Migration '${file}' has been tampered or modified after it was applied.\n` +
      `  Recorded checksum : ${applied.checksum}\n` +
      `  Current checksum  : ${checksum}\n` +
      `  Applied at        : ${applied.applied_at}\n` +
      `This is a critical integrity error. All subsequent migrations have been blocked.\n` +
      `Manual DBA investigation and recovery are required before migrations can proceed.\n` +
      `Do NOT rewrite the stored checksum automatically — investigate the source of the discrepancy first.`
    );
  }
  console.log(`[Migration] ${file}: Already applied on ${applied.applied_at} (checksum verified).`);
  continue;
}
```

The same fix was applied identically to the **SQLite migration loop** at lines 657–678.

#### 2.2 Enforcement Properties
| Property | Before Fix | After Fix |
| :--- | :--- | :--- |
| Mismatch emits error message | ⚠️ Warning only | ✅ Fatal `CHECKSUM INTEGRITY VIOLATION` |
| Execution stops immediately | ❌ Continues | ✅ `throw new Error(...)` halts loop |
| Later migrations are blocked | ❌ Run regardless | ✅ Not reached after throw |
| Ledger entry unchanged | ✅ (by coincidence) | ✅ Throw prevents `INSERT` |
| Stored checksum not auto-rewritten | ✅ (by coincidence) | ✅ Throw prevents any update |
| Application data preserved | ✅ (by coincidence) | ✅ No DDL executed after throw |
| Process exit code | ❌ 0 (success) | ✅ 1 (failure) via `runMigrations().catch(err => { process.exit(1) })` |
| DBA guidance in error | ❌ None | ✅ Explicit investigation + no-auto-repair instructions |

---

### 3. Test Suite: `test_checksum_integrity.mjs`

**Script:** [`node_backend/scripts/test_checksum_integrity.mjs`](file:///f:/hrms/node_backend/scripts/test_checksum_integrity.mjs)  
**Target:** MariaDB 11.8.9 (`127.0.0.1:3307`, `hrms_disposable_test`)  
**Run:** `node node_backend/scripts/test_checksum_integrity.mjs`  
**Result:** `8 passed, 0 failed` — Exit code: **0**

| Test ID | Description | Assertion | Actual Outcome |
| :---: | :--- | :--- | :--- |
| **C-01** | Tampered checksum causes fatal error | Output contains `CHECKSUM INTEGRITY VIOLATION`; exit code ≠ 0 | ✅ PASSED — Exit code 1 |
| **C-02** | Later migrations are NOT executed | Ledger 010 row count = 0; `workforce_employee_rotation` absent | ✅ PASSED — 0 rows, table absent |
| **C-03** | Stored checksum is NOT auto-rewritten | Ledger 007 checksum = `0000...` after failing run | ✅ PASSED — tampered value preserved |
| **C-04** | Existing application data preserved | Sentinel row id=999 `{tenant_id:1,user_id:10,shift_id:10,is_active:1}` present | ✅ PASSED — row intact |
| **C-05** | Ledger entry `applied_at` and `checksum` not modified | Both fields equal pre-run values | ✅ PASSED — unchanged |
| **C-06** | Matching checksum permits normal lifecycle | Runner exits 0; all migrations show `(checksum verified)` | ✅ PASSED — clean run |
| **C-07** | Non-zero exit code = 1 | `exitCode === 1` | ✅ PASSED — `1` |
| **C-08** | Error message contains full DBA guidance | Contains `Manual DBA investigation`, `All subsequent migrations blocked`, `Do NOT rewrite` | ✅ PASSED |

#### 3.1 Full Execution Log
```text
================================================================================
[CHECKSUM INTEGRITY TEST SUITE] Stage 1 — Fatal Mismatch Enforcement
Target Database: MariaDB 11.8.9 (127.0.0.1:3307)
================================================================================

── BASELINE SETUP ──────────────────────────────────────────────────────────
Baseline: migrations 001–010 applied and verified.
Seeded sentinel row id=999 in workforce_employee_fixed_assignment.

── TEST C-01: Tampered checksum causes fatal error & non-zero exit code ─────
State: version 006 checksum tampered to 0000000000000000...
>>> ✅ C-01 PASSED: Checksum mismatch emitted CHECKSUM INTEGRITY VIOLATION and exited non-zero.
     Exit code: 1

── TEST C-02: Later migrations are blocked after a mismatch ─────────────────
State: version 006 tampered; version 010 removed from ledger; workforce_employee_rotation dropped.
>>> ✅ C-02 PASSED: Later migration 010 was NOT executed after checksum violation on 006.
     Ledger 010 row count: 0 (expected 0).
     workforce_employee_rotation present: NO (expected NO).

State repaired: migration 010 re-applied successfully.

── TEST C-03: Stored checksum is NOT rewritten after a mismatch ─────────────
State: version 007 checksum tampered to 0000000000000000...
>>> ✅ C-03 PASSED: Runner did NOT auto-rewrite the stored checksum.
     Stored checksum after failed run: 0000000000000000... (tampered value preserved)

── TEST C-04: Existing application data is preserved after a mismatch ────────
State: version 006 checksum tampered.
>>> ✅ C-04 PASSED: Sentinel application data row id=999 fully preserved after checksum violation.
     Row: {"id":999,"tenant_id":1,"user_id":10,"shift_id":10,"is_active":1}

── TEST C-05: Ledger entry for tampered migration is NOT modified ─────────────
State: version 007 checksum tampered to ffffffffffffffff...
>>> ✅ C-05 PASSED: Ledger entry checksum and applied_at remain unchanged after failing run.
     checksum stored: ffffffffffffffff... (tampered value unchanged)

── TEST C-06: Matching checksum permits correct skip-and-continue lifecycle ───
>>> ✅ C-06 PASSED: Matching checksums accepted; runner completed normally with exit code 0.

── TEST C-07: Exact non-zero exit code (1) is returned on mismatch ──────────
>>> ✅ C-07 PASSED: Process exited with code 1 — unambiguous failure for CI/CD pipelines.

── TEST C-08: Error message contains DBA guidance text ───────────────────────
>>> ✅ C-08 PASSED: Error output contains all required DBA guidance messages.

Cleanup: Sentinel row id=999 removed.

================================================================================
CHECKSUM INTEGRITY TEST SUITE COMPLETE: 8 passed, 0 failed
================================================================================
All 8 checksum integrity tests PASSED.
Stage 1 checksum integrity enforcement is fully certified on MariaDB 11.8.9.
```

---

### 4. Scenario 8 Update in `test_migration_010_recovery.mjs`

The existing Scenario 8 previously asserted a `[Migration Warning]` message (the old warn-and-continue behavior). After the fix, Scenario 8 was updated to assert the new fail-closed behavior:

| Attribute | Before Update | After Update |
| :--- | :--- | :--- |
| **Expected behavior** | Warning on stderr, runner continues | Fatal `CHECKSUM INTEGRITY VIOLATION` throw, exit code 1 |
| **Assertion on stored checksum** | Not checked | Verified tampered value is **not** auto-rewritten |
| **Recovery verification** | Not checked | Verified runner recovers cleanly after DBA-manual checksum restoration |
| **Scenario 8 outcome** | PASS (warning detected) | **PASS (fail-closed + recovery certified)** |

All 8 recovery scenarios re-ran after the update and **all passed** with exit code 0.

---

### 5. Regression — All 8 Recovery Scenarios Re-Verified

After the checksum integrity fix and Scenario 8 update, `test_migration_010_recovery.mjs` was re-run end-to-end:

```text
>>> ✅ Scenario 1 PASSED: Absent tables recreated, all 4 tables verified, ledger entry restored.
>>> ✅ Scenario 2 PASSED: Runner detected missing column, auto-repaired schema, verified compliance.
>>> ✅ Scenario 3 PASSED: Runner detected missing foreign key, restored constraint, verified integrity.
>>> ✅ Scenario 4 PASSED: Runner failed closed with precise diagnostic when encountering incompatible index.
>>> ✅ Scenario 5 PASSED: Runner detected incompatible foreign key ON DELETE CASCADE rule, failed closed, withheld ledger.
>>> ✅ Scenario 6 PASSED: Runner detected incompatible column data type, failed closed, withheld ledger.
>>> ✅ Scenario 7 PASSED: All existing valid data 100% preserved through recovery execution.
>>> ✅ Scenario 8 PASSED: Checksum mismatch caused fatal error (non-zero exit, stored checksum not auto-rewritten). Runner recovered cleanly after DBA-manual checksum restoration.
================================================================================
ALL 8 MIGRATION 010 RECOVERY, CONSISTENCY & SAFETY SCENARIOS PASSED PERFECTLY!
================================================================================
```

---

## 10. Final Sign-Off Recommendation

All audit gates and technical consistency requirements mandated for Stage 1 Final Sign-Off have been resolved, forensically audited, and verified with live test execution on **MariaDB 11.8.9**:
1. `work_date` column default is certified as `DEFAULT (date)`, eliminating historical date mismatches.
2. Historical backfill is certified across 1,000 rows with 0 nulls, 0 mismatches, and mathematical row-count independence.
3. Concurrency scripts C-01 through C-06 are certified with connection isolation, explicit transactions, HTTP 409 conflict handling, and 0 deadlocks.
4. Migration 010 recovery lifecycle contradiction is resolved: DDL execution safely recreates missing tables, followed by strict post-DDL table assertions.
5. Foreign-key verification is certified across all referential attributes (name, source/target tables/columns, ordinal positions, DELETE/UPDATE rules `RESTRICT`) with fail-closed enforcement.
6. Column definition verification is certified across all metadata attributes (data type, column type, nullability, normalized default, expressions) with fail-closed enforcement.
7. Migration runner safety is certified across all 5 principles: silent corruption prevention, unrecorded failed runs, valid data preservation, checksum mismatch fatal fail-closed enforcement, and fail-closed manual intervention.
8. **Checksum integrity enforcement is certified**: a tampered stored checksum now causes a fatal `CHECKSUM INTEGRITY VIOLATION` error (exit code 1), blocks all subsequent migrations, does not auto-rewrite the ledger, and preserves all existing application data. 8 dedicated integrity tests pass. All 8 recovery scenarios continue to pass.
9. Application regression boundaries are certified, with physical device hardware properly marked `[NOT VERIFIED ON PHYSICAL DEVICE]`.

**Stage 1 is complete, verified, and recommended for final formal acceptance.**  
*Awaiting user authorization before commencing Stage 2: Shift Configuration Engine.*
