# Complete HRMS Software Audit Report (Read-Only)

**Audit Date:** 2026-11-25  
**Repository:** `f:\hrms` (`hrms_saas`, `hrms_mobile`, `node_backend`)  
**Code Modifications:** **None** (100% read-only inspection + non-destructive live HTTP probes + `vite build` / `eslint` / `tsc` / `expo lint`).  
**Note:** Authenticated runtime flows requiring isolated staging MySQL accounts, Chrome DevTools (`DevToolsActivePort` ENOENT), Mobile emulator, or Redis/SMTP were not executed against the live `srv999.hstgr.io` database.

---

## 1. Critical & High Functional / Crash Bugs

| ID | Module | Severity | Issue & Exact Location |
|---|---|---|---|
| **BUG-01** | Leave Concessions | **Critical** | **`ReferenceError: actionResult is not defined` crash:** `node_backend/src/services/leave.service.js:537-541` (`grantConcession`) and `576-580` (`reverseConcession`) reference undeclared `actionResult.employeeId` and `status` in `realtimeManager.broadcast(...)`, crashing every request after DB commit. |
| **BUG-02** | Attendance Regularization | **Critical** | **Broken `punch_out_time` datetime write:** `node_backend/src/services/attendance.service.js:2150-2196` (`regularizeAttendance`) writes an `"HH:mm:ss"` string without a date to `attendance_attendance.punch_out_time` (`DATETIME`/`TIMESTAMP`), fails to validate `0–23`/`0–59` bounds (`99:99` passes regex), and skips `NULL`/`leave`/`rejected` checks. |
| **BUG-03** | Employee Lifecycle | **High** | **Mobile Archive calls unmounted `DELETE` route:** `hrms_mobile/src/app/(tabs)/employees.tsx:213` calls `DELETE /auth/employees/:id/`. Live probe returned **`404 {"error":"Not found"}`** because `deleteEmployee` (`accounts.controller.js:268`) is not mounted in `accounts.routes.js`. |
| **BUG-04** | Realtime Sync | **High** | **Non-existent tables queried silently:** `node_backend/src/controllers/accounts.controller.js:515-527` (`realtimeSync`) queries `attendance_punch_approval` and `leave_application` (actual tables: `attendance_attendanceapproval`, `leave_leave`) inside empty `try/catch` blocks, silently returning `0` pending counts. |
| **BUG-05** | Web Realtime | **High** | **Web Socket.IO never connects on login or silent refresh:** `hrms_saas/src/main.jsx:10-14` mounts `RealtimeProvider` outside `AuthProvider`, and `AuthContext.jsx:49-118` never dispatches `"token-refreshed"` on `login()` or `silentRefresh()`. Socket.IO stays disconnected until a 401 refresh occurs. |
| **BUG-06** | Mobile Analytics | **High** | **6 field/payload mismatches in `team-analytics.tsx`:** Period `"15"` falls back to `30` (`attendance.service.js:1159`); reads `average_work_hours` instead of `average_hours` (`0.00h`); reads `most_punctual_member` instead of `highest_hours_member`; reads `.name` instead of `employee_name`; checks `today_status === "A"` instead of `"ABSENT"`; reads `members_count` instead of `team_members`. |
| **BUG-07** | Mobile Audit Logs | **High** | **5 field/query mismatches in `audit-logs.tsx`:** Reads `user_username` (`username`), `timestamp` (`created_at`), `payload.actions` (`availableActions`), sends `sort: "-timestamp"` (backend checks `"asc"`), and sends `action_type` (backend reads `action`). |
| **BUG-08** | Employee Documents | **High** | **Web `EmployeeDocuments.jsx:215` calls non-existent `GET /auth/employees/:id/` (404)** when `selectedUser` is not in the current paginated list; Mobile `employee-documents.tsx:131-137` passes raw `/media/...` paths to `WebBrowser` without prepending backend origin. |
| **BUG-09** | Shift Assignment | **High** | **Undeclared `logger` `ReferenceError`:** `node_backend/src/services/shift-assignment.service.js:51` calls `logger.warn(...)` in `hasColumn()` `catch`, but `logger` is not imported. Also lines `487-489` mix UTC `YYYY-MM-DD` parsing with local `setDate()`. |
| **BUG-10** | Roster Generation | **High** | **Stale DB unique constraints drop roster entries:** `workforce_roster_header.uq_wrh_period` and `workforce_roster_entry.uq_wre_employee_date` (`011_workforce_roster_and_swaps.sql:21,45`) cause `INSERT IGNORE` (`roster.service.js:362`) to silently drop entries across rosters, leading to empty rosters that fail `publishRoster` (line 589). |
| **BUG-11** | Team Attendance | **Medium** | **Mobile `team-attendance.tsx:284` reads `day_name` instead of `weekday`** (renders `undefined`) and lacks `page: "all"` / pagination (silently truncating >50 members). `attendance.service.js:1415-1421` lacks `YYYY-MM` validation, and line 1649 blocks team-name-matched managers from employee drill-down. |
| **BUG-12** | Mobile Shifts | **Medium** | **`hrms_mobile/src/app/(tabs)/shifts.tsx:62-69`** renders `shift_name` and `start_time/end_time` without checking `is_off_day`, showing blank names, `" – "`, and `"0.0h"` for holidays/weekly-offs. |
| **BUG-13** | Web Leave | **Medium** | **`hrms_saas/src/pages/Leave.jsx:122`** defaults `form.leave_type` to `"casual"` even when `/leave/policy/available-types/` loads custom codes (`cl`, `sl`). Mobile `leave.tsx:350` hardcodes `["casual", "sick", "paid"]`. |
| **BUG-14** | Web / Mobile Auth | **Medium** | **Web `Login.jsx:153-159, 236-242` lacks password visibility toggle** (`AUTH-002`), and `Login.jsx:101` allows 8-char reset passwords while backend `validation.js:157` requires 12 chars. |

---

## 2. Missing & Broken Validations

1. **8 Workforce Route Files Have Zero `validate(...)` Middleware:**
   - `shift.routes.js`, `company-policy.routes.js`, `weekly-off-policy.routes.js`, `shift-assignment.routes.js`, `rotation.routes.js`, `roster.routes.js`, `company-holiday.routes.js`, `site.routes.js` — none use `validate(schema)` from `middleware/validation.js`.
2. **Other Backend Routes Without `validate(...)`:**
   - `POST /attendance/regularize/` (`attendance.routes.js:23`)
   - `POST /documents/register/` (`accounts.routes.js:81`) — missing `title` crashes at `title.toLowerCase()` (`accounts.service.js:1237`)
   - `GET /cloudinary/signature/` (`accounts.routes.js:80`) — unvalidated `folder` & `upload_preset`
   - `GET /audit-logs/` (`accounts.routes.js:85`) — non-numeric `limit`/`page` causes `LIMIT NaN OFFSET NaN` SQL error (`audit.repository.js:145-166`)
   - `GET /attendance/team-attendance/`, `team-analytics/`, `history/`, `my-register/`, `approvals/`, `GET /leave/my/`, `approvals/`, `policy/balances/`, `POST /leave/policy/reset-runs/reconcile/`
   - Unvalidated `:id` / `:user_id` / `:concession_id` / `:version_id` route params across `accounts`, `leave`, and `financial-leave` routes.
3. **Broken `uploadDocumentSchema` & Multer Mismatches:**
   - `node_backend/src/middleware/upload.js:9` limits `files: 5`, but `accounts.routes.js:38-47` (`create-employee`) accepts **8** file fields (`LIMIT_FILE_COUNT` crash if >5 uploaded).
   - `upload.js:8` allows `5MB`, while `validation.js:69` rejects files `> 2MB`.
   - `validation.js:391-403` uses `file: z.any()`, allowing missing `file` to pass validation and crash in `storageService.store`.
   - `validation.js:42-44` masks all `/documents/upload/` errors (including size/MIME errors) as `"user, title, file are required"`.
   - `validation.js:87-88` allows `png` in `ALLOWED_MIMES` but omits PNG from the error message.
4. **Weak/Missing Schema Checks:**
   - `POST /api/auth/login/` with `{}` returned `400 {"error":"Invalid input: expected string, received undefined"}` (raw Zod error).
   - `applyLeaveSchema` (`validation.js:298-309`) does not validate `YYYY-MM-DD` format or `from_date <= to_date`.
   - `rotationService.previewRotationSchedule` (`rotation.service.js:523-535`) lacks date/range bounds validation.
   - `companyHolidayService.list` (`company-holiday.service.js:42-49`) throws `400` if `from`/`to` are omitted.
   - Mobile `documents.tsx:98` & `my-documents.tsx:84` pick `*/*` with no client-side 2MB or MIME check.

---

## 3. Security, RBAC & Multi-Tenant / Site Isolation Gaps

1. **Rate Limiter Key Collision (`node_backend/src/middleware/rateLimiter.js:26-31`):** `auth.slice(7, 40)` hashes only the first 33 chars of the JWT (the identical HS256 header `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXV`), so **all authenticated users share one 1,200 req/min bucket**.
2. **Cross-Tenant Data Leaks:**
   - `getAdminSummary()` (`accounts.service.js:829-875` & `accounts.routes.js:52`): No `attachTenantContext` and no `tenant_id` SQL filter.
   - `hrDashboard()` (`attendance.service.js:1080-1117`): Accepts `tenantId` but never uses it in SQL.
   - `approvalRouteForUser()` (`attendance.service.js:180-228`): Queries `accounts_user` without `workforce_user_tenant` filter (can route approvals to other tenants).
   - `siteService.deleteSite()` (`site.service.js:110`): `leave_leave` count check omits `tenant_id = ?`.
   - SSE `realtime.js:66-118`: Does not store or filter by `tenant_id`.
3. **Site Access & Manager Scoping Bypass:**
   - `siteService.getSiteScope()` (`site.service.js:233-241`) ignores `actor`, allowing managers to access all tenant sites without checking `workforce_site_access`.
   - `siteService.ensureEmployeeVisible()` (`site.service.js:243-262`) ignores `requireDirectReport` and `workDate`.
4. **RBAC Mismatches:**
   - Web `/team-dashboard` (`App.jsx:133-140`) allows `admin`, but backend `attendance.service.js:1120` rejects `admin` with `403`.
   - Mobile `employee-documents.tsx:38` blocks `manager`, though backend `accounts.routes.js:68` allows `manager`.
   - `GET /cloudinary/signature/` (`accounts.routes.js:80`) does not validate `req.query.folder` ownership.
   - `authenticateRealtime` (`auth.js:151-161`) redeems SSE tickets without checking `is_active` or `user:revoked:<userId>`.
   - Socket.IO CORS (`realtime.service.js:63-71`) allows `*` with `credentials: true` even in production.
   - `myMonthlyRegister` (`attendance.controller.js:143`) bypasses `resolveTenantId`.

---

## 4. UI Component Issues & Lint / Build Results

- **Web (`hrms_saas`):**
  - `npm run build` **PASSED** (`dist/assets/index-BBVtU2KL.js` 2,196.03 kB / 542.18 kB gzipped).
  - `npm run lint` **FAILED (6 errors):** `RealtimeContext.jsx:60` (`no-empty`), `MonthlyRegister.jsx:1,49` (`no-unused-vars`), `EmployeeDashboard.jsx:20`, `Leave.jsx:34`, `TeamAttendance.jsx:106` (`react-refresh/only-export-components`).
  - **Nested `<Layout>` (`Shifts.jsx:650,726` -> `SiteManagement.jsx:149`):** Renders double Sidebar + Navbar in the Work Sites tab.
  - **`Shifts.jsx:884,1024,1068,1096,1748,2101`:** Reads `version_number` instead of `current_version_number` (always shows `v1`), and checks `effective_to === null` instead of `status === "published"` (shows drafts as `"Active"`).
  - **`SiteManagement.jsx:179-247`:** Create Work Site form rendered even for roles without create permission.
  - **`Roster.jsx:1128,1220`:** `publishAssignment` and `publishRotation` `onClick` handlers lack `try/catch` (unhandled promise rejections).
  - **`Attendance.jsx:726-729`:** Copies `latitude`/`longitude` from `punchDetails` without `accuracy`.
  - **`Navbar.jsx:115-124`:** Notification bell permanently disabled.
  - **`ErrorBoundary.jsx:19`:** Checks `localStorage.getItem("token")` (tokens are in-memory).
- **Mobile (`hrms_mobile`):**
  - `npx tsc --noEmit` **PASSED** (0 errors).
  - `npx expo lint` **FAILED (75 problems: 22 errors, 53 warnings)** — including `AuthContext.tsx:117:28` (`logout` accessed before declaration) & `46:7`, `approvals.tsx:158:5`, `use-color-scheme.web.ts:11:5` (`react-hooks/set-state-in-effect`).
  - **`RealtimeContext.tsx:175-203`:** `useEffect` deps tear down socket on token refresh; foreground resume emits `"realtime:connected"` before connection completes.
  - **`punch.tsx:11,345,357`:** `CameraView`, `user`, and `cameraRef` unused; face-api models loaded from external CDN inside WebView.

---

## 5. Dead, Unreachable & Orphaned Code

1. **Unreachable `realtimeService.emitToTenant` after `return runWithTx(...)` / `db.transaction(...)`:** `shift.service.js:243-246, 435-438, 498-501`, `company-policy.service.js:394-395`, `weekly-off-policy.service.js:330-331`.
2. **Orphaned Web files:** `hrms_saas/src/pages/UploadDocuments.jsx`, `hrms_saas/src/components/common/Card.jsx`.
3. **Unlinked / Disabled Mobile screens:** `hrms_mobile/src/app/documents.tsx` (unlinked + no role guard), `hrms_mobile/src/app/(tabs)/reports.tsx` (`href: null`, `day_name` bug).
4. **Unmounted DB Table:** `workforce_shift_swap_request` (Migration `011`) has zero backend routes/services/UI.
5. **Socket Event Drift:** `TeamAnalytics.jsx:187-188` listens to `punch_in`/`punch_out`; Mobile `_layout.tsx:20` listens to `auth:session_revoked`; Mobile `shifts.tsx:35` listens to `roster:published`; `financial-leave.service.js:189,576` emits `leave_reset_failed` with no listener; `audit.service.js:104` omits `tenantId` when broadcasting `new_audit_log`.
6. **In-Memory `eventBuffer` (`realtime.service.js:47`):** Per-process only, so `/realtime/sync/` misses events emitted on other PM2 workers.
7. **MySQL-only SQL in Workforce Services:** `DATE_SUB`, `INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`, `BINARY` in `shift*`, `company-policy`, `weekly-off-policy`, `roster`, and `site` services, while `src/db/index.js` has no SQLite adapter.
