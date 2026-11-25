# 02. Feature Functionality Audit

**Classification Rules:**
- **PASS:** Executable unit/regression/build/lint verification passed after final edits.
- **VERIFIED WITH LIMITATIONS / BLOCKED (Live E2E):** Code fixed and unit/regression-tested, but live end-to-end execution against isolated staging MySQL + Chrome DevTools + Mobile Emulator + Redis was blocked by environment constraints.
- **NOT IMPLEMENTED:** `ROSTER-006` (Peer shift swap — DB table `workforce_shift_swap_request` exists in Migration 011, no backend routes/UI).
- **OUT OF SCOPE:** No new features were added.

| Area / Feature Group | Pre-Remediation Status | Post-Remediation Verification | Remaining Live Runtime Blocker |
|---|---|---|---|
| `AUTH-001`–`AUTH-010` | `FAIL` (`AUTH-002`, `008`), `PARTIAL` (`001`) | `Login.jsx` eye toggle + 12-char validation fixed; `loginSchema` clean error verified (`PASS` in regression test); Web `npm run lint` & `build` `PASS`; Mobile `tsc` `PASS` | Live login/RTR/OTP SMTP blocked without staging MySQL + Redis |
| `DASH-001`–`DASH-005` | `FAIL` (`DASH-002`, `003`, `004`) | `getAdminSummary` & `hrDashboard` tenant isolation verified (`PASS` in regression test); `/team-dashboard` `admin` 403 mismatch fixed; `EmployeeDashboard` lint fixed | Live dashboard rendering blocked without staging accounts + Chrome |
| `EMP-001`–`EMP-007` | `FAIL` (`EMP-007` 404) | `DELETE /auth/employees/:user_id/` mounted & tenant-scoped; Mobile `employees.tsx` restricted to `admin`/`superadmin`; `upload.js` `files: 8` fixed | Live CRUD/MapPickerModal blocked without staging MySQL + Chrome |
| `ATT-001`–`ATT-013` | `FAIL` (`regularizeAttendance`, `team-analytics`, `team-attendance`) | `regularizeAttendance` DateTime/bounds/`insertApproval` verified (`PASS` in regression test); `approvalRouteForUser` tenant-scoped; `teamAttendance` `YYYY-MM` validated; Mobile `team-analytics.tsx` (6 fields) & `team-attendance.tsx` (`weekday`, `page: "all"`) fixed | Live camera/GPS punch & DB E2E blocked without device/staging |
| `LEAVE-001`–`LEAVE-010` | `FAIL` (`grantConcession`/`reverseConcession` crash, `Leave.jsx`/`leave.tsx` types) | `grantConcession`/`reverseConcession` crash fixed & verified (`PASS` in regression test); `applyLeaveSchema` date/range verified; Web & Mobile dynamic leave types fixed | Live leave reset cron/DB E2E blocked without staging MySQL |
| `SHIFT-001`–`SHIFT-006`, `ROSTER-001`–`005`, `HOL-*`, `SITE-*` | `FAIL` (`Shifts.jsx` double Layout/version/status, `Roster.jsx` try/catch, `shift-assignment` logger, `roster` unique constraint, `shifts.tsx` off-day) | All fixed; Migration `025` created; `previewRotationSchedule` bounds verified (`PASS` in regression test); `siteService` tenant/access checks fixed | Live roster generation/DB migration blocked without staging MySQL |
| `ROSTER-006` (Shift Swap) | `NOT IMPLEMENTED` | **NOT IMPLEMENTED** (DB table only; out of remediation scope to invent UI/routes) | N/A |
| `DOC-001`–`DOC-005` | `FAIL` (`EmployeeDocuments.jsx` 404, `employee-documents.tsx` `/media/` URL, `uploadDocumentSchema`) | Fixed & `uploadDocumentSchema` verified (`PASS` in regression test); `getCloudinarySignature` folder ownership verified (`PASS`) | Live Cloudinary/local file upload blocked without staging |
| `RPT-001`, `AUDIT-001`–`002`, `RT-001`–`002` | `FAIL` (`realtimeSync` 0 counts, `audit-logs.tsx` 5 mismatches, `reports.tsx` `day_name`, Web Socket not connecting, SSE tenant leak) | All fixed; `realtimeSync` & `authenticateRealtime` & `rateLimiter` verified (`PASS` in regression test); `auditLogsQuerySchema` verified (`PASS`) | Live multi-worker Socket.IO & Redis Pub/Sub blocked (Redis offline) |
