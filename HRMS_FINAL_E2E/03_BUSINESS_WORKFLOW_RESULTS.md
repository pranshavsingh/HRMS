# 03. Business Workflow Results (`WF-01` through `WF-11`)

**Overall Status:** **PARTIAL / BLOCKED** for live multi-layer UI -> API -> DB -> UI execution due to missing isolated staging MySQL (`127.0.0.1:3306` `ECONNREFUSED`), offline Redis (`127.0.0.1:6379`), and unavailable Android emulator/device.

| Workflow ID | Workflow Name | Offline / Unit / Contract Evidence | Live E2E Status |
|---|---|---|---|
| `WF-01` | Authentication & Refresh Token Rotation | `auth.test.js` (7/7 PASS), `Login.jsx` live CDP render & password toggle PASS, unauthenticated route redirects PASS. | **BLOCKED** (Live RTR requires staging MySQL) |
| `WF-02` | OTP Password Reset | `loginSchema` & `resetPasswordSchema` verified; `otp_outbox.test.js` & `otp.test.js` failed on `ECONNREFUSED 127.0.0.1:3306`. | **BLOCKED** (Requires staging MySQL + Redis + SMTP) |
| `WF-03` | Employee Onboarding & Lifecycle | `DELETE /employees/:user_id/` route mount verified; Multer `files: 8` verified. | **BLOCKED** (Requires staging MySQL) |
| `WF-04` | Attendance Punch In/Out | `BUG-A10` GPS 100m threshold & `api_security.test.js` coordinate bounds PASS. | **BLOCKED** (Requires staging MySQL + camera/GPS) |
| `WF-05` | Attendance Regularization | `BUG-02` bounds/DateTime/rejection unit tests PASS; `BUG-A09` contract PASS. | **BLOCKED** (Requires staging MySQL) |
| `WF-06` | Leave Apply, Approval & Concessions | `leave_balance.test.js` (4/4 PASS after `daysThrough` fix), `financial_year.test.js` (4/4 PASS), `applyLeaveSchema` PASS. | **BLOCKED** (Requires staging MySQL) |
| `WF-07` | FY Leave Policy & Reset | `financial_year.test.js` (4/4 PASS), `paramIdSchema` PASS. | **BLOCKED** (Requires staging MySQL) |
| `WF-08` | Shifts, Policies, Rotations & Rosters | `rotationService` range validation & Migration `025` PASS; `BUG-A06` & `BUG-A11` PASS. | **BLOCKED** (Requires staging MySQL) |
| `WF-09` | Document Upload & Access | `uploadDocumentSchema`, `registerDocumentSchema`, `getCloudinarySignature` folder check, & `/media/documents` 403 PASS. | **BLOCKED** (Requires staging MySQL + Cloudinary) |
| `WF-10` | Holidays & Work Sites | `BUG-A04` routing/sidebar/layout checks PASS. | **BLOCKED** (Requires staging MySQL) |
| `WF-11` | Audit Logs & Reports | `auditLogsQuerySchema` & durable audit fail-closed PASS. | **BLOCKED** (Requires staging MySQL) |
