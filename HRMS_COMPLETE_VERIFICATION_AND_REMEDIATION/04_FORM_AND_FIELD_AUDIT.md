# 04. Form and Field Audit

| Form | Platform | File | Audited Issues Found & Fixed | Status |
|---|---|---|---|---|
| **Login Form** | Web | `hrms_saas/src/pages/Login.jsx` | Missing password visibility toggle (`AUTH-002`); backend `loginSchema` returned raw Zod error on `{}`. Both **Fixed**. | Fixed (UI runtime blocked) |
| **Forgot Password / Reset Form** | Web | `hrms_saas/src/pages/Login.jsx` | Missing eye toggle; checked `length < 8` instead of `12` (`BUG-B1-003`). Both **Fixed**. | Fixed (UI runtime blocked) |
| **Login & Reset Form** | Mobile | `hrms_mobile/src/app/index.tsx` | Has Eye/EyeOff toggle & 12+ char complexity validation. | Verified Static (runtime blocked) |
| **Create / Edit Employee Form** | Web | `hrms_saas/src/pages/Employees.jsx` | Backend `upload.js` capped `files: 5` vs 8 file fields (`Fixed` to `8`); `validateFileBuffer` 2MB vs 5MB Multer. | Fixed (UI runtime blocked) |
| **Edit Employee Bounds Form** | Mobile | `hrms_mobile/src/app/(tabs)/employees.tsx` | Archive button exposed to `hr` while backend restricts to `admin`/`superadmin` (`Fixed`). | Fixed (runtime blocked) |
| **Apply Leave Form** | Web & Mobile | `Leave.jsx`, `leave.tsx` | Web defaulted to `"casual"` on custom policies; Mobile hardcoded `["casual","sick","paid"]`; backend `applyLeaveSchema` lacked calendar date & `from <= to` check. All **Fixed**. | Fixed (Verified schema) |
| **Attendance Regularization Form** | Web & Mobile | `AttendanceHistory.jsx`, `MonthlyRegister.jsx`, `history.tsx` | Backend `POST /attendance/regularize/` lacked `validate(...)` & `regularizeAttendance` wrote invalid time string / called missing `createApproval`. All **Fixed**. | Fixed (Verified unit) |
| **Document Upload Forms** | Web & Mobile | `Employees.jsx`, `my-documents.tsx`, `documents.tsx` | Backend `uploadDocumentSchema` allowed missing file (`z.any()`) & masked errors as `"user, title, file are required"`. **Fixed**. | Fixed (Verified schema) |
| **Create Work Site Form** | Web | `hrms_saas/src/pages/SiteManagement.jsx` | Rendered for unauthorized roles & wrapped in double `<Layout>` inside `Shifts.jsx`. **Fixed**. | Fixed (Build/Lint PASS) |
| **Shift Edit & Version History** | Web | `hrms_saas/src/pages/Shifts.jsx` | Showed `v1` (`version_number` vs `current_version_number`) & marked drafts `"Active"` (`effective_to === null` vs `status === "published"`). **Fixed**. | Fixed (Build/Lint PASS) |
| **Roster / Assignment / Rotation Forms** | Web | `hrms_saas/src/pages/Roster.jsx` | Publish buttons lacked `try/catch`. **Fixed**. | Fixed (Build/Lint PASS) |
