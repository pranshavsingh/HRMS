# 08. Database Integrity Audit

- **Database Engine:** MySQL 8.0 (`mysql2/promise` in `node_backend/src/db/index.js`). No SQLite adapter exists in `src/db/index.js`.
- **Schema & Migration Fixes:**
  1. **New Migration [025_workforce_roster_constraints.sql](file:///f:/hrms/node_backend/scripts/migrations/025_workforce_roster_constraints.sql):** Replaces `uq_wre_employee_date (tenant_id, user_id, work_date)` with `uq_wre_roster_employee_date (roster_header_id, user_id, work_date)` and adds `idx_wre_tenant_user_date`, preventing `roster.service.js` from silently dropping entries across rosters.
  2. **`roster.service.js`:** Replaced `INSERT IGNORE` with `INSERT INTO` + explicit `ER_DUP_ENTRY` conflict reporting in `conflicts`.
  3. **Query Table Name Fix (`accounts.controller.js:535-552`):** Fixed `attendance_punch_approval` -> `attendance_attendanceapproval` and `leave_application` -> `leave_leave` + imported `db`.
  4. **Tenant Scoping on SQL Queries:** Scoped `getAdminSummary`, `hrDashboard`, `approvalRouteForUser`, `siteService.deleteSite` (`leave_leave`), and `realtimeSync` by `tenant_id` / `workforce_user_tenant`.
  5. **Unimplemented Table:** `workforce_shift_swap_request` (Migration `011`) has no routes/services/UI (`NOT IMPLEMENTED`).
- **Safety:** Zero destructive queries or unreviewed migrations were executed against `srv999.hstgr.io`.
