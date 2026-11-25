# 03. Business Workflow Audit

All 11 existing business workflows (`WF-01` through `WF-11` from Stage 1) were audited for sequence correctness, calculations, status transitions, transaction safety, tenant isolation, and error handling:

1. **WF-01 (Auth & RTR):** Verified `loginSchema` clean validation, Web/Mobile token storage, and `AuthContext` -> `RealtimeContext` `"token-refreshed"` dispatch. *(Live cookie/RTR runtime blocked without staging MySQL).*
2. **WF-02 (OTP Password Reset):** Verified Web `Login.jsx` 12-char parity with `resetPasswordSchema`. *(Live Outbox/BullMQ/SMTP blocked — Redis offline).*
3. **WF-03 (Employee Onboarding):** Fixed Multer `files: 8` limit (`upload.js`) matching the 8 file fields in `create-employee`, and mounted `DELETE /employees/:user_id/` (`accounts.routes.js`) for archive parity.
4. **WF-04 (Attendance Punch In/Out):** Fixed `Attendance.jsx:726` preserving GPS `accuracy` and scoped `approvalRouteForUser` by `workforce_user_tenant`.
5. **WF-05 (Attendance Regularization):** Fixed **2 critical defects** in `regularizeAttendance` (`attendance.service.js`): (a) invalid `"HH:mm:ss"` string written to `DATETIME` + missing `0-23`/`0-59` bounds, and (b) non-existent `attendanceRepository.createApproval` call (fixed to `insertApproval`). Verified in regression test (`PASS`).
6. **WF-06 (Leave Apply, Approval & Concessions):** Fixed **critical `ReferenceError`** in `grantConcession` & `reverseConcession` (`leave.service.js`), fixed `applyLeaveSchema` date/range validation, and fixed dynamic leave type loading in Web `Leave.jsx` & Mobile `leave.tsx`.
7. **WF-07 (FY Leave Policy & Reset):** Verified routes & added `paramIdSchema` / `validation.js` alignment.
8. **WF-08 (Shifts, Policies, Rotations & Rosters):** Fixed `shift-assignment.service.js` missing `logger` import & UTC date math, fixed `roster.service.js` `INSERT IGNORE` + created Migration `025` (`uq_wre_roster_employee_date`), fixed unreachable `emitToTenant` in `shift.service.js`, `company-policy.service.js`, `weekly-off-policy.service.js`, and fixed `rotationService.previewRotationSchedule` range bounds.
9. **WF-09 (Document Upload & Access):** Fixed `uploadDocumentSchema` missing-file bug & error masking, fixed `EmployeeDocuments.jsx` 404 employee lookup, fixed Mobile `employee-documents.tsx` `/media/` URL resolution, and added folder ownership check to `GET /cloudinary/signature/`.
10. **WF-10 (Holidays & Work Sites):** Fixed `siteService.deleteSite` missing `tenant_id` on `leave_leave`, fixed `getSiteScope` & `ensureEmployeeVisible` manager site/direct-report enforcement, and fixed `SiteManagement.jsx` double `<Layout>` & unauthorized form visibility.
11. **WF-11 (Audit Logs & Reports):** Fixed Mobile `audit-logs.tsx` (5 field/query mismatches), Mobile `reports.tsx` (`weekday`), and added `auditLogsQuerySchema` preventing `LIMIT NaN` SQL errors.
