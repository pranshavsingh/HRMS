# 05. Complete Form and Field Verification

All core forms and Zod validation schemas were inspected and tested with live staging HTTP requests and UI renders.

| Form / Schema | Tested Scenarios | HTTP Status / Behavior | Result |
|---|---|---|---|
| **Login Form** (`Login.jsx` / `loginSchema`) | Valid credentials, empty body (`{}`), wrong password | Valid: `200` & redirect to `/dashboard`; Empty: `400`; Wrong password: `401` | **PASS** |
| **Forgot Password / OTP** (`forgotPassword` / `requestOtpSchema`) | Valid email (`emp2@staging.hrms.local`), invalid email (`"not-an-email"`) | Valid: `200` + SMTP delivery; Invalid format: `400` | **PASS** |
| **Apply Leave Form** (`Leave.jsx` / `applyLeaveSchema`) | Valid range, inverted range (`to < from`), empty `reason`, insufficient balance `409` confirmation | Valid: `200`; Inverted range: `400`; Empty reason: `400`; Overdraft: `409` with `confirmation_snapshot` | **PASS** |
| **Attendance Punch Form** (`Attendance.jsx` / `punchSchema`) | Out-of-bounds `latitude: 999`, non-JPEG/WEBP PNG mime rejection, valid bounds | `lat=999`: `400`; PNG mime: `400` (`Only JPEG, JPG, and WEBP...`) | **PASS** |
| **Attendance Regularization** (`regularizeAttendanceSchema`) | Valid `attendance_id` + `HH:mm`, `99:99` / `24:00` bounds, `leave`-status record guard | Invalid time: `400`; Leave-status record: `400` | **PASS** |
| **Create Shift Form** (`Shifts.jsx`) | Valid shift payload, missing required fields (`code: ""`) | Valid: `201`; Missing required: `400` | **PASS** |
| **Create Holiday Form** (`CompanyHolidayCalendar.jsx`) | Valid holiday, invalid date (`"invalid"`) | Valid: `201`; Invalid date: `400` | **PASS** |
| **Create Site Form** (`SiteManagement.jsx`) | Missing site `code` | Missing `code`: `400` | **PASS** |
| **Document Upload Form** (`Documents.jsx` / `uploadDocumentSchema`) | Missing `user` / missing `file` | Missing `user`: `400` (`user, title, file are required`); Missing `file`: `400` | **PASS** |
| **FY Leave Policy Draft** (`CompanyLeavePolicy.jsx` / `leavePolicyDraftSchema`) | Valid full draft payload, missing required `reason`/`timezone` | Valid: `201`; Missing fields: `400` | **PASS** |
| **Leave Concession Form** (`leaveConcessionSchema`) | Valid `employee_id`, `additional_days`, `idempotency_key` | Valid: `201` | **PASS** |
