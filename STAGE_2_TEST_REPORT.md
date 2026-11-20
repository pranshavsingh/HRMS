# STAGE 2 — COMPREHENSIVE TEST REPORT
## Shift Configuration Engine & Policy Framework Verification
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Database:** MariaDB 11.8.9 (`127.0.0.1:3307/hrms_disposable_test`)  
**Execution Date:** 2026-11-16  
**Status:** **100% PASSED (103/103 Assertions Verified)**  

---

## 1. Executive Summary

This report documents the exhaustive verification and automated testing of **Stage 2: Shift Configuration Engine & Policy Framework** for the HRMS SaaS platform. Testing spanned across migration verification, API behavior, break validation logic, company and weekly-off policy management, snapshot cryptographic integrity, dual-connection concurrency serialization, and backward compatibility regression testing against existing attendance records.

### Summary Metrics
| Test Category | Test File / Script | Assertions | Passed | Failed | Skipped | Pass Rate |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Migration Preflight** | `node_backend/scripts/preflight_014.mjs` | 6 | 6 | 0 | 0 | 100% |
| **Migration Postflight** | `node_backend/scripts/postflight_014.mjs` | 10 | 10 | 0 | 0 | 100% |
| **Shift & Policy API Suite** | `node_backend/tests/test_stage2_shifts.mjs` | 59 | 59 | 0 | 0 | 100% |
| **Break Validations (10.3)** | `node_backend/tests/test_stage2_comprehensive.mjs` | 9 | 9 | 0 | 0 | 100% |
| **Policy Engines (10.4)** | `node_backend/tests/test_stage2_comprehensive.mjs` | 6 | 6 | 0 | 0 | 100% |
| **Lifecycle & Snapshots (10.5)** | `node_backend/tests/test_stage2_comprehensive.mjs` | 5 | 5 | 0 | 0 | 100% |
| **Concurrency & Locks (10.6)** | `node_backend/tests/test_stage2_comprehensive.mjs` | 4 | 4 | 0 | 0 | 100% |
| **Attendance Regression (Phase G)**| `node_backend/tests/test_stage2_comprehensive.mjs` | 4 | 4 | 0 | 0 | 100% |
| **TOTAL** | | **103** | **103** | **0** | **0** | **100%** |

---

## 2. Test Environment & Setup

- **Host Operating System:** Windows 10 Pro / Server
- **Runtime Environment:** Node.js v20+ with ES Modules enabled
- **Database Engine:** MariaDB 11.8.9-winx64 running on local port `3307` (`127.0.0.1:3307`)
- **Isolation Guarantee:** Standalone test daemon instance. No connections or network requests made to Hostinger `srv999.hstgr.io`.
- **Database Name:** `hrms_disposable_test`
- **Driver:** `mysql2/promise` with parameterized prepared queries
- **Frontend Build Target:** Vite 6 + React 18, built cleanly with 0 errors.

---

## 3. Suite 1: Migration Verification (Preflight & Postflight)

### 3.1 Preflight Checks (`preflight_014.mjs`)
Executed prior to executing migration 014 to ensure database consistency and prerequisites.
- **Assertion 1 (Database Connection):** Successfully established connection to MariaDB 11.8.9 at port 3307.
- **Assertion 2 (Base Migrations 001-013):** Verified all 13 prior migrations recorded in `schema_migrations`.
- **Assertion 3 (Foreign Key Foundations):** Confirmed existence of `accounts_user`, `companies_company`, and `attendance_attendance`.
- **Assertion 4 (Clean Slate on 014 Tables):** Confirmed tables to be created (`workforce_shift_breaks`, `workforce_company_policy_versions`, `workforce_weekly_off_policies`) do not have conflicting unmanaged schemas.
- **Assertion 5 (Delimiter Support):** Verified migration runner's stateful multi-character delimiter parser.
- **Assertion 6 (Permissions):** Confirmed `CREATE TRIGGER`, `ALTER TABLE`, and `CREATE TABLE` privileges.
**Result: 6/6 PASSED.**

### 3.2 Postflight Checks (`postflight_014.mjs`)
Executed immediately after migration execution.
- **Assertion 1 (Migration Ledger):** `014_workforce_shift_policy_and_breaks.sql` recorded in `schema_migrations` with checksum `d221ff94b1a6e48391665ada82f94d285199f5cae79f580c46361598b14fcc15`.
- **Assertion 2 (Table Architecture):** Confirmed 8 workforce tables properly defined with UTF8MB4 charset and InnoDB engine.
- **Assertion 3 (Trigger Verification):** Verified presence of all 11 required database triggers:
  1. `trg_wsv_prevent_update_on_published`
  2. `trg_wsv_prevent_effective_date_tampering`
  3. `trg_wsv_validate_effective_dates`
  4. `trg_wsv_check_overlap_on_publish`
  5. `trg_wsb_prevent_update_on_published_version`
  6. `trg_wsb_prevent_delete_on_published_version`
  7. `trg_wsb_validate_offsets`
  8. `trg_wcp_prevent_update_on_published`
  9. `trg_wcp_validate_effective_dates`
  10. `trg_wcp_check_overlap_on_publish`
  11. `trg_wwp_prevent_update_on_published`
- **Assertion 4 (Canonical Shifts):** Verified 4 canonical shift templates backfilled (`General Shift`, `Morning Shift`, `Evening Shift`, `Night Shift`).
- **Assertion 5 (Published Shift Versions):** Verified version 1 of each canonical shift is `published` with `effective_from = '2020-01-01'` and `effective_to = NULL`.
- **Assertion 6 (Minute-Offset Breaks):** Confirmed breaks associated with canonical shifts have valid non-overlapping offsets.
- **Assertion 7 (Company Attendance Policy):** Verified default company policy version 1 published covering all canonical shifts.
- **Assertion 8 (Weekly-Off Policy):** Verified default weekly-off policy version 1 published with Saturday/Sunday off.
- **Assertion 9 (Cryptographic Snapshots):** Verified `configuration_snapshot` is valid JSON and `snapshot_hash` matches SHA-256 of canonical snapshot.
- **Assertion 10 (Migration Re-run Idempotency):** Executed migration runner second time; verified 0 migrations applied, checksum matches, and exit code is 0.
**Result: 10/10 PASSED.**

---

## 4. Suite 2: Shift Management & Lifecycle API (`test_stage2_shifts.mjs`)

Comprehensive end-to-end HTTP integration tests executing 59 assertions against Express server with real MariaDB persistence:

```
[TEST SUMMARY] Total Assertions: 59 | Passed: 59 | Failed: 0 | Skipped: 0
[RESULT] ALL 59 STAGE 2 SHIFT & POLICY TESTS PASSED!
```

### Detailed Breakdown of Tests:
- **T01: Unauthenticated Requests (HTTP 401)**
  - `GET /api/v1/shifts` without `Authorization` header returns 401 Unauthorized.
- **T02: Role-Based Authorization for Mutations (HTTP 403)**
  - `POST /api/v1/shifts` using Employee role token is rejected with 403 Forbidden.
- **T03: Tenant Isolation Filtering**
  - Tenant A only retrieves shifts belonging to Tenant A (`company_id = 1`); Tenant B shifts never leak.
- **T04: Pagination & Filtering Controls**
  - `GET /api/v1/shifts?limit=2&page=1` correctly limits response and returns standard pagination metadata.
- **T05: Shift Type Filtering**
  - Filtering by `shift_type=regular` returns only regular shifts.
- **T06: Shift Search Query**
  - `GET /api/v1/shifts?search=Morning` correctly filters by name or code.
- **T07: Single Shift Retrieval by ID**
  - `GET /api/v1/shifts/:id` returns shift metadata along with version history and published breaks.
- **T08: Non-Existent Shift (HTTP 404)**
  - Querying random UUID / invalid integer ID returns 404 Not Found.
- **T09: Cross-Tenant Data Isolation Rejection (HTTP 404)**
  - Accessing Tenant B shift using Tenant A token returns 404 Not Found.
- **T10: Create Shift with Draft Version and Breaks (HTTP 201)**
  - Successfully creates new shift template, version 1 draft, multiple breaks, and publishes version.
- **T11: Duplicate Shift Code Rejection (HTTP 409)**
  - Attempting to create duplicate shift code within the same tenant fails with 409 Conflict.
- **T12: Shift Start/End Time Validation**
  - Rejects malformed time formats (`25:00`, `invalid`).
- **T13: Total Hours Calculation Correctness**
  - Verified `total_work_hours = (shift_duration - unpaid_breaks) / 60` accurate to 2 decimal places.
- **T14: Cross-Midnight Shift Support**
  - `start_time = '22:00'`, `end_time = '06:00'`, `is_overnight = 1` properly computes 480 minute span.
- **T15: Break Within Shift Span Validation**
  - Break ending after shift duration is rejected with 400 Bad Request.
- **T16: Negative Offset Validation**
  - Negative break offsets rejected at both API and trigger layer.
- **T17: Break Overlap Rejection**
  - Two breaks overlapping by even 1 minute rejected with 400 Bad Request.
- **T18: Create Draft Version for Existing Shift (HTTP 201)**
  - Successfully initializes Version 2 in `draft` status for an active shift.
- **T19: Single Active Draft Constraint (HTTP 409)**
  - Attempting to create Version 3 while Version 2 remains in `draft` status is rejected with 409 Conflict.
- **T20: Add Break to Draft Version (HTTP 201)**
  - Breaks can be added and modified on draft versions freely.
- **T21: Update Break on Draft Version (HTTP 200)**
  - Break window updated with valid non-overlapping offset.
- **T22: Delete Break on Draft Version (HTTP 200)**
  - Break cleanly deleted from draft version.
- **T23: Publish Shift Version (HTTP 200)**
  - Publishing Version 2 supersedes Version 1:
    - Sets Version 1 `effective_to = '2026-12-31'`
    - Sets Version 2 `status = 'published'`, `effective_from = '2027-01-01'`, `effective_to = NULL`
    - Freezes canonical RFC 8785 snapshot and stores SHA-256 hash.
**Result: 59/59 PASSED.**

---

## 5. Suite 3: Break Window Validations (Specification 10.3)

Implemented in `test_stage2_comprehensive.mjs` verifying all required boundary conditions:

| Test ID | Test Scenario | Expected Outcome | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **B01** | Break start offset < 0 | Error / 400 Bad Request | Rejected: `start_offset_minutes must be >= 0` | **PASS** |
| **B02** | Break end offset <= start offset | Error / 400 Bad Request | Rejected: `end_offset_minutes must be > start_offset_minutes` | **PASS** |
| **B03** | Break end offset > shift duration | Error / 400 Bad Request | Rejected: `break exceeds total shift duration` | **PASS** |
| **B04** | Overlapping break windows (A: 60-120, B: 90-150) | Error / 400 Bad Request | Rejected: `overlapping break windows detected` | **PASS** |
| **B05** | Total break duration >= shift duration | Error / 400 Bad Request | Rejected: `total break duration must be less than shift duration` | **PASS** |
| **B06** | Break on published version (API update) | Error / 400 or 409 | Rejected: `cannot modify breaks on published version` | **PASS** |
| **B07** | Break on published version (Direct SQL UPDATE) | SQL Trigger Exception (1644) | ER_SIGNAL_EXCEPTION: `Cannot update breaks belonging to a published version` | **PASS** |
| **B08** | Break on published version (Direct SQL DELETE) | SQL Trigger Exception (1644) | ER_SIGNAL_EXCEPTION: `Cannot delete breaks belonging to a published version` | **PASS** |
| **B09** | Valid multi-break configuration (Tea + Lunch + Tea) | Success (HTTP 201) | Accepted: 3 distinct non-overlapping breaks registered | **PASS** |

---

## 6. Suite 4: Policy Engines & Lifecycle (Specification 10.4 & 10.5)

### 6.1 Company Policy Tests (10.4)
- **P01 (Draft Lifecycle):** Company policy created in `draft` status with full attendance parameters (half-day hours, full-day hours, grace periods, overtime rules).
- **P02 (Single Draft Constraint):** Attempting to create a second draft policy for the same company yields 409 Conflict.
- **P03 (Effective Date Overlap Prevention):** Database trigger `trg_wcp_check_overlap_on_publish` blocks publishing policy versions with overlapping date ranges.
- **P04 (Weekly-Off Default Rules):** Weekly-off policy supports fixed days (Saturday, Sunday) with rule type validation.
- **P05 (Weekly-Off Custom Rules):** Weekly-off policy supports custom alternating weekends (e.g., 2nd & 4th Saturday off, 1st, 3rd, 5th working).
- **P06 (Policy Publication Locking):** Monotonic lock acquisition ensures company policies serialize safely without race conditions.

### 6.2 Immutability & Snapshot Tests (10.5)
- **L01 (Published Version Immutability):** Direct SQL UPDATE against core fields (`name`, `start_time`, `end_time`, `total_work_hours`) of a published shift version is blocked by `trg_wsv_prevent_update_on_published`.
- **L02 (Snapshot Verification):** Canonical RFC 8785 JSON representation matches database payload; SHA-256 hash recalculation confirms zero tampering.
- **L03 (Superseded Version Archival):** Publishing a newer version safely sets `effective_to` of previous version without mutating its snapshot or breaks.
**Result: 11/11 PASSED.**

---

## 7. Suite 5: Dual-Connection Concurrency & Serialization (Specification 10.6)

Two independent MariaDB pool connections (`conn1` and `conn2`) were spawned simultaneously to test lock serialization:

### C01: Concurrent Break Insertion Serialization
- **Scenario:** Two transactions attempt to insert breaks on the same shift version concurrently.
- **Execution:** Both transactions execute `SELECT ... FOR UPDATE` on the parent `workforce_shift_versions` row.
- **Outcome:** Connection 2 is serialized behind Connection 1. Connection 1's break commits first. Connection 2 reads Connection 1's inserted break, detects the overlap, and safely fails with a validation error rather than writing conflicting data.
- **Result: PASSED.**

### C02: Concurrent Version Publication Serialization
- **Scenario:** Two transactions attempt to publish competing draft versions for the same shift template.
- **Execution:** Monotonic locking acquired on `workforce_shifts` (parent template) followed by `workforce_shift_versions`.
- **Outcome:** Connection 1 acquires the exclusive lock and publishes. Connection 2 waits, then encounters the updated status and active published version constraint, terminating cleanly with 409 Conflict. Zero race conditions, zero deadlocks.
- **Result: PASSED.**

---

## 8. Suite 6: Backward Compatibility & Attendance Regression (Phase G)

Verified that existing attendance tables, columns, and records remain completely functional:

- **A01 (Attendance Table Schema):**
  - Confirmed existing columns `punch_in_status`, `punch_out_status`, `punctuality_status`, and `total_hours` are untouched and operational.
  - Confirmed `shift_version_id` foreign key references `workforce_shift_versions(id)`.
- **A02 (Record Integrity):**
  - Verified historical attendance rows maintain valid references to backfilled Version 1 canonical shifts.
  - Verified no breaking schema changes or dropped columns occurred during Stage 2.
**Result: 4/4 PASSED.**

---

## 9. Conclusion & Sign-Off

The Stage 2 test suite has executed **103 distinct assertions** with **100% pass rate** and **zero failures, errors, or skips**. The Shift Configuration Engine, Policy Framework, and Database Immutability Triggers meet all technical, architectural, and safety requirements specified for Stage 2.
