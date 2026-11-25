# 04. Complete Form & Field Results

## Live Browser Form Verification (Unauthenticated)
- **Login Form (`hrms_saas/src/pages/Login.jsx`):**
  - Verified live in headless Chrome (`http://127.0.0.1:5173/`):
    - Username/email input present (`type="text"` / `name="username"`).
    - Password input present (`type="password"`).
    - Password visibility toggle (`AUTH-002`) verified live: clicking toggle switches `type` from `"password"` to `"text"`.
    - Responsive layout verified at `1440x900`, `1280x800`, `768x1024`, `375x812` with `overflow: false`.

## Backend Zod Validation Schema Verification (`remediation_regression.test.js`)
- `loginSchema`: Rejects empty body with clean required error (`PASS`).
- `applyLeaveSchema`: Rejects invalid calendar dates (e.g., `2026-02-30`) and inverted date ranges (`from_date > to_date`) (`PASS`).
- `uploadDocumentSchema`: Rejects missing `file` and surfaces exact size/MIME errors without masking (`PASS`).
- `regularizeAttendanceSchema`: Rejects out-of-bounds times (`99:99`, `24:00`) (`PASS`).
- `registerDocumentSchema`, `auditLogsQuerySchema`, `paramIdSchema`: Validated (`PASS`).

## Authenticated Forms (Web & Mobile)
- **Status:** **BLOCKED** — Live submission and DB round-trip verification for Employee Onboarding, Leave Application, Attendance Regularization, Shift/Policy/Rotation/Roster, Site Management, Holiday, and Document Upload forms require an isolated staging MySQL database and authenticated test accounts.
