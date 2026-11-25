# 13. Remediation Changelog

## Backend (`node_backend/`)
- `src/services/leave.service.js`: Fixed `BUG-01` (`grantConcession`, `reverseConcession`), imported `logger`, validated `concessionId`, guarded realtime broadcasts.
- `src/services/attendance.service.js`: Fixed `BUG-02` (`regularizeAttendance` datetime, bounds, `insertApproval`), `BUG-B1-007` (`hrDashboard` tenant scoping), `approvalRouteForUser` tenant scoping, `teamAttendance` `YYYY-MM` validation & manager drill-down.
- `src/controllers/attendance.controller.js`: Added `resolveTenantId` to `myMonthlyRegister` and `regularizeAttendance`.
- `src/controllers/accounts.controller.js`: Imported `db` & `logger`; fixed `adminSummary` tenantId, `deleteEmployee` tenantId, `getCloudinarySignature` folder ownership, `realtimeSync` table names & error handling (`BUG-04`).
- `src/services/accounts.service.js`: Fixed `getAdminSummary(tenantId)` SQL tenant filtering (`BUG-B1-006`) and `deleteEmployee` tenant membership/self-delete checks (`BUG-03`).
- `src/routes/accounts.routes.js`: Mounted `DELETE /employees/:user_id/`, added `attachTenantContext` to `/admin-summary/`, mounted `validate(...)` on `/documents/register/`, `/audit-logs/`, `/documents/*`.
- `src/routes/attendance.routes.js`: Mounted `validate(regularizeAttendanceSchema)` on `POST /regularize/`.
- `src/middleware/rateLimiter.js`: Fixed `keyGenerator` using verified JWT user ID + SHA-256 fallback.
- `src/middleware/auth.js`: Added `is_active` and `user:revoked:<id>` checks to `authenticateRealtime` SSE ticket path.
- `src/middleware/upload.js`: Raised `files` limit from `5` to `8` matching `create-employee`.
- `src/middleware/validation.js`: Removed `/documents/upload/` error masking, fixed `loginSchema` Zod v4 message, fixed `uploadDocumentSchema` required file check, fixed `applyLeaveSchema` date/range checks, added `regularizeAttendanceSchema`, `registerDocumentSchema`, `auditLogsQuerySchema`, `paramIdSchema`.
- `src/utils/realtime.js`: Added `tenantId` filtering to SSE `dispatchLocal`.
- `src/services/realtime.service.js`: Hardened Socket.IO CORS in production.
- `src/services/audit.service.js`: Passed `tenantId` in `new_audit_log` broadcast when available.
- `src/services/site.service.js`: Fixed `deleteSite` `leave_leave` `tenant_id` filter; enforced `actor` site access & `requireDirectReport`/`workDate` in `getSiteScope` & `ensureEmployeeVisible`.
- `src/services/shift-assignment.service.js`: Imported `logger` and fixed UTC `setUTCDate` math (`BUG-09`).
- `src/services/roster.service.js` & `scripts/migrations/025_workforce_roster_constraints.sql`: Replaced `INSERT IGNORE` with `INSERT INTO` + `conflicts` tracking and scoped entry uniqueness to `(roster_header_id, user_id, work_date)` (`BUG-10`).
- `src/services/rotation.service.js`: Validated `previewRotationSchedule` date format and `<= 366` day range.
- `src/services/shift.service.js`, `company-policy.service.js`, `weekly-off-policy.service.js`: Fixed unreachable `emitToTenant` after `return`.
- `tests/bugs/remediation_regression.test.js`: Added 17 automated regression tests.

## Web (`hrms_saas/`)
- `src/App.jsx` & `src/pages/TeamDashboard.jsx`: Aligned `/team-dashboard` to `["manager", "superadmin"]` & fixed 403 error message (`BUG-B1-005`).
- `src/context/AuthContext.jsx`: Dispatched `"token-refreshed"` on `login()` & `silentRefresh()` (`BUG-05`).
- `src/pages/Login.jsx`: Added `Eye`/`EyeOff` toggles & 12-char reset validation (`BUG-14`, `BUG-B1-002/003`).
- `src/pages/EmployeeDocuments.jsx`: Replaced 404 `/auth/employees/:id/` call with `/auth/employees/` lookup (`BUG-08`).
- `src/pages/Leave.jsx`: Auto-synced `form.leave_type` to loaded policy types (`BUG-13`) & fixed ESLint error.
- `src/pages/Shifts.jsx` & `src/pages/SiteManagement.jsx`: Fixed double `<Layout>` via `embedded` prop, gated Create Site form, fixed `current_version_number` & `status === "published"` badges.
- `src/pages/Roster.jsx`: Added `try/catch` error feedback on `publishAssignment` & `publishRotation`.
- `src/pages/Attendance.jsx`: Preserved `accuracy` in `coords`.
- `src/components/layout/Navbar.jsx` & `src/components/common/ErrorBoundary.jsx`: Removed disabled bell & stale `localStorage.getItem("token")` check.
- `src/context/RealtimeContext.jsx`, `src/pages/MonthlyRegister.jsx`, `src/pages/dashboard/EmployeeDashboard.jsx`, `src/pages/TeamAttendance.jsx`, `src/pages/TeamAnalytics.jsx`: Fixed ESLint errors & removed non-existent `punch_in`/`punch_out` listeners.

## Mobile (`hrms_mobile/`)
- `src/context/AuthContext.tsx`: Fixed `logout` declaration order & `syncDefaultTabForUser` (eliminated `react-hooks/immutability` & `set-state-in-effect` errors).
- `src/context/RealtimeContext.tsx` & `src/app/_layout.tsx`: Fixed foreground `"realtime:connected"` emission & removed non-existent `"auth:session_revoked"`.
- `src/app/(tabs)/employees.tsx`: Gated Archive button to `admin`/`superadmin` (`BUG-03`).
- `src/app/(tabs)/employee-documents.tsx`: Resolved relative `/media/...` URLs (`BUG-08`).
- `src/app/(tabs)/team-analytics.tsx`: Fixed 6 field/period mismatches & TS interface (`BUG-06`).
- `src/app/(tabs)/audit-logs.tsx`: Fixed 5 field/query mismatches (`BUG-07`).
- `src/app/(tabs)/team-attendance.tsx`: Fixed `weekday`, `page: "all"`, & TS interface (`BUG-11`).
- `src/app/(tabs)/shifts.tsx`: Handled `is_off_day` explicitly (`BUG-12`).
- `src/app/(tabs)/leave.tsx`: Loaded dynamic leave types from `/leave/policy/available-types/` (`BUG-13`).
- `src/app/(tabs)/reports.tsx`: Fixed `weekday` CSV header.
- `src/app/(tabs)/punch.tsx`: Removed unused `CameraView`, `user`, `cameraRef`.
