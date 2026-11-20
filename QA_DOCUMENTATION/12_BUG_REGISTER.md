# Enterprise Quality Audit: Comprehensive Defect & Bug Register

**Document Reference:** `QA_DOCUMENTATION/12_BUG_REGISTER.md`  
**Application Target:** HRMS SaaS Enterprise Distributed Platform  
**Target Repository:** `pranshavsingh/HRMS`  
**Execution Date:** November 2026  
**Auditing Department:** Complete Enterprise Software QA Department  

---

## 1. Executive Summary

This register catalogs every defect, error, vulnerability, and architectural gap uncovered during the forensic end-to-end quality audit. All defects have been analyzed for root cause, impact, and resolution status.

---

## 2. Master Bug Inventory Table

| Defect ID | Severity | Category | Title / Description | Affected Component | Status |
|---|---|---|---|---|---|
| **BUG-001** | **Critical** | Database / Runtime | `ER_CANT_AGGREGATE_2COLLATIONS` 500 error on Leave page | `src/services/financial-leave.service.js` | **RESOLVED** |
| **BUG-002** | **High** | UI/UX / Usability | Manual User ID entry required in Shift & Roster modals | `src/pages/Roster.jsx`, `ShiftAssignments.jsx` | **RESOLVED** |
| **BUG-003** | **Medium** | UI/UX / Layout | Extraneous controls cluttering the Work Sites management view | `src/pages/SiteManagement.jsx` | **RESOLVED** |
| **BUG-004** | **High** | Security / RBAC | Information disclosure & 404 leakage in Document & Approval checks | `src/services/accounts.service.js`, `attendance.service.js` | **RESOLVED** |
| **BUG-005** | **High** | Database / Integrity | `ER_NO_REFERENCED_ROW_2` on attendance/leave in Phase 2 tests | `tests/concurrency/attendance_concurrency.test.js` | **RESOLVED** |
| **BUG-006** | **Medium** | Service / Date Parsing | Non-ISO `attendance_date` parsing causing site assignment lookup failure | `src/services/attendance.service.js`, `site.service.js` | **RESOLVED** |
| **BUG-007** | **Medium** | Test Harness | Open Redis sockets preventing clean exit in Phase 3 test runners | `tests/phase3/otp_outbox.test.js`, `worker_lifecycle.test.js` | **RESOLVED** |
| **GAP-001** | **High** | Architecture Gap | Unimplemented Payroll & Compensation module | Planned `/api/payroll/*` | **OPEN / BACKLOG** |
| **GAP-002** | **Medium** | Architecture Gap | Unimplemented Expense & Reimbursement module | Planned `/api/expenses/*` | **OPEN / BACKLOG** |
| **GAP-003** | **Medium** | Architecture Gap | Unimplemented Recruitment & ATS module | Planned `/api/recruitment/*` | **OPEN / BACKLOG** |
| **GAP-004** | **Low** | Architecture Gap | Unimplemented Performance & Appraisal module | Planned `/api/performance/*` | **OPEN / BACKLOG** |

---

## 3. Detailed Forensic Bug Reports

### BUG-001: Collation Aggregation 500 Error on Leave Records
- **Severity:** Critical
- **Affected File:** `node_backend/src/services/financial-leave.service.js`
- **Root Cause:** Prepared statement placeholders `?` with collation `utf8mb4_general_ci` were directly compared against string literals (`'__legacy_shared__'`, `''`) with collation `utf8mb4_unicode_ci` in lines 373 & 377, triggering MariaDB fatal error: `ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations (utf8mb4_general_ci,COERCIBLE) and (utf8mb4_unicode_ci,COERCIBLE) for operation '='`.
- **Impact:** Crashed `GET /api/leave/my` and `GET /api/leave/policy/reset-runs` with HTTP 500 Internal Server Error, completely blocking employees and admins from viewing leave balances or policies.
- **Resolution:** Re-architected `getBalance()` to dynamically construct SQL filters in JavaScript (`${approvedTypeFilter}`, `${pendingTypeFilter}`), eliminating SQL-level collation comparison. Tested and verified passing.

---

### BUG-002: Shift & Roster Assignment Manual User ID Input
- **Severity:** High
- **Affected Files:** `hrms_saas/src/pages/Roster.jsx`, `ShiftAssignments.jsx`, `src/components/common/SearchableEmployeeSelect.jsx`
- **Root Cause:** Forms contained plain HTML text inputs requesting "Employee User ID (e.g. 10)", requiring operators to memorize or cross-reference arbitrary database auto-increment IDs.
- **Impact:** High error rate, data entry frustration, risk of assigning shifts to inactive or incorrect user IDs.
- **Resolution:** Engineered `SearchableEmployeeSelect.jsx` component that queries `accountsService.getEmployees()`, renders employee full names, designations, and emails, and filters dynamically on user keystrokes. Integrated into Roster and Shift Assignment modals.

---

### BUG-003: Cluttered Work Sites Tab Layout
- **Severity:** Medium
- **Affected File:** `hrms_saas/src/pages/SiteManagement.jsx`
- **Root Cause:** Work Sites tab contained unnecessary nested sub-tabs and controls beyond the requirements.
- **Impact:** Cluttered user interface and poor administrative UX.
- **Resolution:** Refactored `SiteManagement.jsx` to render strictly:
  1. A site creation form (`Site Name`, `Site Code`, optional `Address`).
  2. A responsive grid of created site cards.
  3. Edit and delete controls restricted to Superadmin users.

---

### BUG-004: Premature Site Visibility Verification Leaking 404 Instead of 403
- **Severity:** High
- **Affected Files:** `node_backend/src/services/accounts.service.js`, `node_backend/src/services/attendance.service.js`
- **Root Cause:** In `getEmployeeDocuments` and `approvalAction`, `siteService.ensureEmployeeVisible` was invoked before verifying the caller's role or ownership. When synthetic test users lacked rows in `workforce_user_tenant`, `ensureEmployeeVisible` threw 404, preventing the intended 403 Forbidden check from executing.
- **Impact:** Security boundary violation: leaked entity non-existence to unauthorized callers and prevented self-approval rejection.
- **Resolution:** Reordered checks so that role permissions, document ownership, and self-approval constraints (403) are verified before site visibility lookup.

---

### BUG-005: Missing Tenant Registration in Concurrency & Load Tests
- **Severity:** High
- **Affected Files:** `tests/concurrency/attendance_concurrency.test.js`, `tests/performance/load_simulation.test.js`
- **Root Cause:** Migration 006, 012, and 018 added strict composite foreign keys: `CONSTRAINT fk_att_user_tenant FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id)`. Older Phase 2 tests only inserted into `accounts_user`, causing MariaDB to reject punch-ins with `ER_NO_REFERENCED_ROW_2`.
- **Resolution:** Updated `before()` hooks in both test suites to seed test users into `workforce_user_tenant`, `workforce_employee_site_assignment`, and `workforce_site_access`, with clean cascading teardown in `after()`.

---

### BUG-006: Non-ISO Date Parsing in Attendance Approval Visibility Check
- **Severity:** Medium
- **Affected Files:** `node_backend/src/services/attendance.service.js`, `node_backend/src/services/site.service.js`
- **Root Cause:** `attendance.service.js` called `String(ap.attendance_date || "").slice(0, 10)` on a JavaScript `Date` instance returned by MySQL, yielding `"Wed Nov 18"` instead of ISO `"2026-11-18"`. MariaDB rejected date comparison against `effective_from`, causing `getEmployeeSiteId` to return `null` and throwing `"Employee has no site assignment for this date"`.
- **Resolution:** Updated `attendance.service.js` to call `getYYYYMMDD(ap.attendance_date)` and hardened `site.service.js` with `toIsoDateString()` normalization.

---

### BUG-007: Unclosed Redis & BullMQ Handles Causing Test Process Hang
- **Severity:** Medium
- **Affected Files:** `tests/phase3/otp_outbox.test.js`, `tests/phase3/worker_lifecycle.test.js`, `tests/phase3/observability.test.js`
- **Root Cause:** Background services (`queueProducerService`, `queueWorkerManager`, `redisService.client`) maintained persistent TCP connections or retry timers to Redis. When test suites finished, the active event loop handles prevented Node.js from exiting until the 90-second runner timeout killed them.
- **Resolution:** Added explicit `await queueProducerService.close()`, `await queueWorkerManager.close()`, and `redisService.client.disconnect()` in the `after()` hooks. Reduced suite execution times from 90s timeout to ~5-15s clean exit.

