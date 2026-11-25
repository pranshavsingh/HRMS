# 07. API & Backend Audit

- **Syntax Check:** `npm run check` (`node --check src/server.js && node --check src/worker.js`) **PASSED**.
- **Critical & High Backend Fixes Implemented & Regression-Tested:**
  1. `leave.service.js`: Fixed `ReferenceError: actionResult is not defined` in `grantConcession` & `reverseConcession` + wrapped realtime broadcasts in `try/catch` + validated `concessionId`.
  2. `attendance.service.js`: Fixed `regularizeAttendance` (`DATETIME` conversion, `0–23`/`0–59` bounds, `leave`/`rejected`/`punch_out_time` guards, `attendanceRepository.insertApproval` instead of non-existent `createApproval`).
  3. `accounts.controller.js`: Imported missing `db` and `logger`, fixed `realtimeSync` table names (`attendance_attendanceapproval`, `leave_leave`), added `tenant_id` scoping & `degraded` flag.
  4. `accounts.routes.js`: Mounted `DELETE /employees/:user_id/` (`authorize(["admin","superadmin"])`), added `attachTenantContext` to `/admin-summary/`, mounted Zod `validate(...)` on `/documents/register/`, `/audit-logs/`, and `/documents/*` ID params.
  5. `attendance.routes.js`: Mounted `validate(regularizeAttendanceSchema)` on `POST /regularize/`.
  6. `validation.js` & `upload.js`: Fixed `loginSchema` clean error on `{}`, `applyLeaveSchema` calendar & range check, `uploadDocumentSchema` missing-file rejection & removed error masking, `upload.js` `files: 8`, and added `auditLogsQuerySchema`, `registerDocumentSchema`, `regularizeAttendanceSchema`, `paramIdSchema`.
  7. `shift-assignment.service.js`: Imported `logger` and fixed UTC `setUTCDate` math.
  8. `rotation.service.js`: Validated `previewRotationSchedule` date format, `start <= end`, and `<= 366` days.
  9. `shift.service.js`, `company-policy.service.js`, `weekly-off-policy.service.js`: Fixed unreachable `emitToTenant` after `return`.
