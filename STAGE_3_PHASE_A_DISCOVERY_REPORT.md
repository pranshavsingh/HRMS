# STAGE 3 — PHASE A: FORENSIC DISCOVERY REPORT
## Employee Shift Assignment & Roster Management Foundation Audit
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Base Commit (HEAD):** `c9d391a509fd6efec973d8deb3af3b920badff5b`  
**Target Database:** MariaDB 11.8.9 (`127.0.0.1:3307/hrms_disposable_test`)  
**Audit Date:** 2026-11-16  
**Status:** **GATE 1 COMPLETE — VERIFIED & ACCURATE**  

---

## 1. Executive Summary

This report establishes the baseline discovery and architectural audit for **Stage 3: Employee Shift Assignment & Roster Management**. Stage 3 builds directly on top of the completed, verified Stage 2 foundation.

Every assignment and roster entry must reference the exact published `shift_version_id` selected when the assignment is created or published. This report audits existing tables, columns, constraints, APIs, UI components, permissions, and migration history in `pranshavsingh/HRMS`, identifying what exists, what must be evolved, and what gaps must be bridged in Stage 3.

---

## 2. Git & Repository Baseline

- **Repository:** `pranshavsingh/HRMS`
- **Branch:** `feat/shift-roster-management`
- **Current HEAD SHA:** `c9d391a509fd6efec973d8deb3af3b920badff5b`
- **Git Working Tree:**
  - Modified files from Stage 2: `hrms_saas/src/App.jsx`, `hrms_saas/src/components/layout/Sidebar.jsx`, `node_backend/scripts/run-migrations.js`, `node_backend/src/app.js`, `node_backend/src/middleware/auth.js`.
  - Untracked Stage 2 deliverables: backend services, controllers, routes, migration 014, test suites, and 6 Stage 2 reports.
  - No changes made to production remote; no commits executed.
- **Air-Gap Verification:**
  - Hostinger production server `srv999.hstgr.io` is strictly untouched (0 network requests).
  - Database daemon running locally on port 3307 (`127.0.0.1:3307`).

---

## 3. Database Migration Ledger & Table Inventory

### 3.1 Migration Ledger (`schema_migrations`)
The database contains 14 applied migrations:
1. `001_phase1_security_hardening.sql` (checksum `76407d90...`)
2. `002_phase2_performance_indexes.sql` (checksum `70357571...`)
3. `003_phase3_outbox_events.sql` (checksum `88a7783c...`)
4. `004_phase3_consumer_idempotency.sql` (checksum `e34c72a6...`)
5. `005_phase3_recoverable_consumer_claims.sql` (checksum `b23f4ef3...`)
6. `006_workforce_tenant_and_users.sql` (checksum `3fb71e2f...`)
7. `007_workforce_company_policy.sql` (checksum `61d32a2d...`)
8. `008_workforce_company_holiday.sql` (checksum `0d35508f...`)
9. `009_workforce_shift_and_versions.sql` (checksum `7462b490...`)
10. `010_workforce_assignments_and_rotations.sql` (checksum `8cb25e16...`)
11. `011_workforce_roster_and_swaps.sql` (checksum `cac2a84d...`)
12. `012_attendance_schema_expansion.sql` (checksum `d06eaa51...`)
13. `013_workforce_attribution_exceptions.sql` (checksum `ba2eb595...`)
14. `014_workforce_shift_policy_and_breaks.sql` (checksum `d221ff94...`)

**Next Planned Migration:** `015_workforce_assignments_and_roster.sql`.

### 3.2 Inventory of Existing Tables & Critical Findings

| Table Name | Origin Migration | Current Schema Highlights | Stage 3 Gap / Critical Finding |
| :--- | :---: | :--- | :--- |
| `workforce_shift` | 009, 014 | `id`, `tenant_id`, `name`, `code`, `is_active`, `description`, `timezone`. | Complete template master. |
| `workforce_shift_version` | 009, 014 | `id`, `tenant_id`, `shift_id`, `version_number`, `status` ('draft','published','archived'), `start_time`, `end_time`, `total_work_hours`, `effective_from`, `effective_to`, `policy_id`, `policy_version_id`, `weekly_off_policy_id`, `config_snapshot`, `snapshot_hash`. | Authoritative published shift version foundation. |
| `workforce_shift_break` | 009, 014 | `id`, `tenant_id`, `shift_version_id`, `name`, `start_offset_minutes`, `end_offset_minutes`, `break_duration_minutes`, `is_paid`, `is_mandatory`. | Immutability protected by triggers. |
| `workforce_employee_fixed_assignment` | 010 | `id`, `tenant_id`, `user_id`, `shift_id`, `effective_from`, `effective_to`, `is_active`. | **CRITICAL GAP:** References mutable `shift_id` instead of `shift_version_id`. Lacks lifecycle status (`draft`, `published`, `superseded`, `cancelled`), audit fields, single-draft virtual column, and immutability triggers. |
| `workforce_rotation_definition` | 010 | `id`, `tenant_id`, `code`, `name`, `is_active`. | Lacks configuration metadata (`cycle_length_days`, `status`, `description`, `created_by`, `published_at`). |
| `workforce_rotation_step` | 010 | `id`, `tenant_id`, `rotation_id`, `step_order`, `shift_id`, `duration_days`. | References `shift_id`. Lacks step-specific off-day/rest markers. |
| `workforce_employee_rotation` | 010 | `id`, `tenant_id`, `user_id`, `rotation_id`, `start_date`, `initial_step_order`, `is_active`. | Lacks `effective_to`, `status`, `offset_days`, audit columns. |
| `workforce_roster_header` | 011 | `id`, `tenant_id`, `department_id`, `start_date`, `end_date`, `status` ('draft','published','archived'), `version_number`, `published_by`, `published_at`. | `department_id` is an integer, but HRMS groups employees by `team_name`. Needs `team_name` and scope filters. |
| `workforce_roster_entry` | 011 | `id`, `tenant_id`, `roster_header_id`, `user_id`, `work_date`, `shift_id`, `shift_version_id`, `status` ('scheduled','completed','swapped','absent'). | Composite FK to `workforce_shift_version` already exists! Needs `source_type` ('fixed_assignment','rotation','manual'), `snapshot_hash`, and immutability protection. |
| `accounts_employeeprofile` | Base | `user_id`, `manager_id`, `team_name`, `joining_date`, `designation`, `is_active_employee`. | Identifies employee team affiliation via `team_name` (varchar(120)). |
| `attendance_attendance` | Base, 012 | `id`, `tenant_id`, `user_id`, `date`, `work_date`, `shift_version_id`, `roster_entry_id`, `punch_in_status`, `punch_out_status`, `punctuality_status`, `total_hours`. | `shift_version_id` and `roster_entry_id` columns exist for future integration. |

---

## 4. Existing Services, Controllers & API Inventory

### 4.1 Backend Endpoints (`node_backend`)
- **Authentication & User Management:**
  - `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/profile`
  - `GET /api/v1/auth/employees` (supports filtering by `team`, `search`, pagination)
- **Workforce Shifts & Policies (Stage 2):**
  - `GET /api/v1/shifts`, `POST /api/v1/shifts`, `GET /api/v1/shifts/:id`, `PUT /api/v1/shifts/:id`, `DELETE /api/v1/shifts/:id`
  - `POST /api/v1/shifts/:id/versions`, `POST /api/v1/shifts/:id/versions/:vid/publish`
  - `POST /api/v1/shifts/:id/versions/:vid/breaks` (CRUD on draft breaks)
  - `GET /api/v1/workforce/policies`, `POST /api/v1/workforce/policies`
  - `GET /api/v1/workforce/weekly-off-policies`
- **Attendance & Leave:**
  - `POST /api/v1/attendance/punch-in`, `POST /api/v1/attendance/punch-out`, `GET /api/v1/attendance/history`
  - `GET /api/v1/leave/balances`, `POST /api/v1/leave/apply`

### 4.2 Reusable Backend Services
1. `shift.service.js`: Template retrieval and validation.
2. `shift-version.service.js`: Published shift version resolution and lifecycle state machine.
3. `shift-snapshot.service.js`: RFC 8785 canonical JSON snapshot serializer and SHA-256 integrity verifier.
4. `shift-validation.service.js`: Time arithmetic, duration calculations, and `formatDateToYMD`.
5. `audit.service.js`: Enterprise audit logging with IP tracking and user attribution.
6. `redis.service.js`: High-speed token caching and session verification.
7. `accounts.service.js` & `accounts.repository.js`: Employee lookup, team filtering, and user validation.
8. `tenant.js`: `resolveTenantId` and `attachTenantContext` middleware.

---

## 5. Existing Frontend & Mobile UI Inventory

### 5.1 Web Application (`hrms_saas`)
- **Routing:** React Router v6 in `src/App.jsx`.
- **Existing Screens:**
  - `Shifts.jsx`: Complete Shift Template, Version, and Break Management interface.
  - `Employees.jsx`: Employee directory, team assignments, designation.
  - `Attendance.jsx` & `TeamAttendance.jsx`: Live attendance logs and approvals.
  - `AuditLogs.jsx`: Administrative audit event viewer.
- **Styling:** Tailwind CSS with dark slate theme, modal dialogs, and toast notifications.

### 5.2 Mobile Application (`hrms_mobile`)
- **Platform:** Expo SDK 52 + React Native + TypeScript.
- **Routing:** Expo Router under `src/app/(tabs)/`.
- **Existing Screens:**
  - `dashboard.tsx`: Employee metrics, punch desk shortcut, quick status.
  - `punch.tsx`: Geofenced biometric photo punch-in/out.
  - `history.tsx`: Personal punch history log.
  - `profile.tsx`: Personal details and manager information.
  - `team-attendance.tsx`: Supervisor team roster view placeholder.
- **API Client:** `src/services/api.ts` with Axios, JWT bearer token, and timeout configuration.

---

## 6. Permissions & RBAC Structure

The system enforces role-based access control via `authorize(roles)` middleware:
- **`superadmin` / `admin`:** Full administrative control. Create/edit/publish shifts, fixed assignments, rotation patterns, and rosters; perform bulk scheduling; view all tenant records.
- **`hr`:** Manage shift assignments, draft rosters, rotation definitions, and publish rosters within assigned tenant.
- **`manager`:** View team assignments, team roster, and suggest shift changes. Read-only access to published roster schedules for supervised employees.
- **`employee`:** Self-service read-only access. View personal assigned shift, upcoming roster schedule, and shift timing. Denied all mutation or publication actions.

---

## 7. Stage 3 Missing Capabilities & Gap Analysis

1. **Shift Assignment Entity Modernization:**
   - Existing `workforce_employee_fixed_assignment` only references `shift_id` (the mutable template), violating the **Critical Dependency Rule**. Must be altered to require `shift_version_id`.
   - Lacks formal lifecycle states: `draft`, `published`, `superseded`, `cancelled`.
   - Lacks historical snapshot preservation (`assignment_snapshot`, `snapshot_hash`).
   - Lacks database triggers to prevent mutation of published assignments.
2. **Deterministic Rotation Engine:**
   - Existing `workforce_rotation_definition` and `workforce_rotation_step` are bare skeletons.
   - Missing rotation cycle calculation engine that deterministically computes:
     `work_date -> pattern_step -> shift_version_id`.
   - Missing validation for minimum rest period between rotation steps.
3. **Roster Calendar Engine & Lifecycle:**
   - Roster headers need explicit team and tenant scope.
   - Roster entries require immutability protection once published.
   - Missing API endpoints for generating draft rosters from assignments, publishing scopes atomically, and viewing calendar matrices (Daily, Weekly, Monthly).
4. **Bulk Assignment Engine:**
   - No batch assignment API with atomic validation and structured partial-failure reporting.
5. **Frontend & Mobile Roster Experience:**
   - No web UI for Shift Assignments, Rotation Pattern Builder, or Interactive Roster Calendar.
   - No mobile UI displaying the employee's assigned shift and upcoming roster schedule.

---

## 8. Risks, Dependencies & Mitigation Strategy

| Risk ID | Description | Severity | Mitigation Strategy |
| :--- | :--- | :---: | :--- |
| **R-01** | **Migration 010 Schema Evolution:** Modifying `workforce_employee_fixed_assignment` to add `shift_version_id` and constraints without breaking existing test suites (e.g. `test_migration_010_recovery.mjs`). | Critical | Keep migration 010 file completely untouched. Implement all alterations in `015_workforce_assignments_and_roster.sql`. Backfill existing rows with published Version 1 shift versions. |
| **R-02** | **Race Conditions on Concurrent Assignments:** Two admins assigning conflicting shifts to the same employee simultaneously. | Critical | Enforce monotonic locking: lock `accounts_user` row for the employee, validate no overlapping published assignment exists, then insert/publish within the same transaction. |
| **R-03** | **Cross-Tenant Assignment IDOR:** Assigning an employee from Tenant A to a shift version from Tenant B. | Critical | Enforce composite foreign keys `(tenant_id, shift_id, shift_version_id)` and validate `req.tenantId` matches both employee and shift version in service tier. |
| **R-04** | **Overnight Shift Calendar Misattribution:** A night shift starting at 22:00 and ending at 06:00 attributed to the next calendar day. | High | Store `work_date` strictly as the shift start date. Compute display timestamps using `work_date + start_time` and `(work_date + 1 day) + end_time` when `is_overnight = 1`. |
| **R-05** | **Attendance Regression:** Breaking existing attendance punch-in/out or approval flows. | High | Stage 3 only provides read-only roster lookup for attendance. Zero alterations to `attendance_attendance` schema, statuses, or punch lifecycle. |

---

## 9. Conclusion

Gate 1 Forensic Discovery is complete. The system's existing foundations are verified. We now proceed to **Gate 2: Architecture and Schema Design** to define the complete Stage 3 technical specification.
