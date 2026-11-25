# 12. Complete Bug Register

| Bug ID | Severity | Module | Summary | Status |
|---|---|---|---|---|
| `BUG-01` | Critical | Leave Concessions | `ReferenceError: actionResult is not defined` in `grantConcession` & `reverseConcession` (`leave.service.js`) | **Fixed & Regression-Tested (PASS)** |
| `BUG-02` | Critical | Attendance Regularization | Invalid `"HH:mm:ss"` written to `DATETIME`, missing `0–23`/`0–59` bounds, + non-existent `attendanceRepository.createApproval` (`attendance.service.js`) | **Fixed & Regression-Tested (PASS)** |
| `BUG-03` / `BUG-B1-001` | High | Employee Lifecycle | Mobile `DELETE /auth/employees/:id/` returned 404 (unmounted in `accounts.routes.js`; `hr` mismatch in `employees.tsx`) | **Fixed & Route-Tested (PASS)** |
| `BUG-04` | High | Realtime Sync | `realtimeSync` queried non-existent `attendance_punch_approval` & `leave_application` + missing `db` & `logger` imports (`accounts.controller.js`) | **Fixed & Regression-Tested (PASS)** |
| `BUG-05` | High | Web Realtime | `RealtimeContext` never connected on `login()` / `silentRefresh()` (`AuthContext.jsx`) | **Fixed (Build/Lint PASS; Live Socket BLOCKED)** |
| `BUG-06` | High | Mobile Team Analytics | 6 field/period mismatches in `team-analytics.tsx` | **Fixed (`tsc` PASS; Device UI BLOCKED)** |
| `BUG-07` | High | Mobile Audit Logs | 5 field/query mismatches in `audit-logs.tsx` | **Fixed (`tsc` PASS; Device UI BLOCKED)** |
| `BUG-08` | High | Employee Documents | Web `EmployeeDocuments.jsx` called 404 `GET /auth/employees/:id/`; Mobile `employee-documents.tsx` failed on `/media/` relative URLs | **Fixed (Build/tsc PASS; Live UI BLOCKED)** |
| `BUG-09` | High | Shift Assignment | Undeclared `logger` `ReferenceError` & local `setDate()` UTC drift (`shift-assignment.service.js`) | **Fixed (`npm run check` PASS)** |
| `BUG-10` | High | Roster Generation | `uq_wre_employee_date` + `INSERT IGNORE` silently dropped roster entries (`011` / `roster.service.js`) | **Fixed + Migration `025` (Schema-Tested PASS)** |
| `BUG-11` | Medium | Team Attendance | Mobile `day_name` vs `weekday`, missing `page: "all"`, backend `YYYY-MM` validation & `selectedEmployeeDetail` team-name manager check | **Fixed (`tsc` + `check` PASS)** |
| `BUG-12` | Medium | Mobile Shifts | `shifts.tsx` rendered blank names/`0.0h` on `is_off_day` | **Fixed (`tsc` PASS)** |
| `BUG-13` | Medium | Leave Types | Web `Leave.jsx` stale `"casual"` default & Mobile `leave.tsx` hardcoded leave types | **Fixed (Build/tsc PASS)** |
| `BUG-14` / `BUG-B1-002/003` | Medium | Web Auth UI | `Login.jsx` missing password visibility toggle & 8-char vs 12-char reset validation | **Fixed (Build/Lint PASS)** |
| `BUG-B1-004` | Low | Login Validation | `POST /auth/login/` `{}` returned raw Zod error | **Fixed & Regression-Tested (PASS)** |
| `BUG-B1-005` | High | Dashboard RBAC | Web `/team-dashboard` allowed `admin`, backend rejected `admin` (`403`), misleading error | **Fixed (Build/Lint PASS)** |
| `BUG-B1-006` | High (Sec) | Admin Dashboard | `getAdminSummary` lacked `attachTenantContext` & `tenant_id` SQL filter | **Fixed & Regression-Tested (PASS)** |
| `BUG-B1-007` | High (Sec) | HR Dashboard | `hrDashboard` ignored `tenantId` in all 5 SQL queries | **Fixed & Regression-Tested (PASS)** |
| `BUG-B1-008` | Medium | Web ESLint | 6 ESLint errors in `hrms_saas` | **Fixed (`npm run lint` 0 errors)** |
| `SEC-01`..`SEC-06` | High (Sec) | Security & Isolation | `rateLimiter` JWT-header collision, `approvalRouteForUser` cross-tenant, `siteService` scope/delete, `realtime.js` SSE tenant leak, `authenticateRealtime` revocation, `getCloudinarySignature` folder auth, Socket.IO prod CORS | **Fixed & Regression-Tested (PASS)** |
| `VAL-01`..`VAL-04` | Medium | Validation & Upload | `upload.js` `files: 5` vs 8, `uploadDocumentSchema` `z.any()` & error masking, `applyLeaveSchema` dates, `auditLogsQuerySchema`, `rotationService` range | **Fixed & Regression-Tested (PASS)** |
| `UI-01`..`UI-05` | Medium | Web & Mobile UI | `Shifts.jsx` double `<Layout>` & version/status bugs, `SiteManagement.jsx` form guard, `Roster.jsx` try/catch, `Attendance.jsx` accuracy, `Navbar.jsx` disabled bell, `ErrorBoundary.jsx` `localStorage`, Mobile `AuthContext.tsx` hook order & `RealtimeContext.tsx` | **Fixed (Web Lint/Build PASS; Mobile `tsc` PASS)** |
| `DEAD-01` | Medium | Backend Realtime | Unreachable `emitToTenant` after `return` in `shift.service.js`, `company-policy.service.js`, `weekly-off-policy.service.js` | **Fixed (`npm run check` PASS)** |
