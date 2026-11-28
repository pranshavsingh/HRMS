# HRMS Bug Remediation Audit

## 1. Executive Summary
All 15 confirmed root causes (covering the 16 reported issues across `node_backend`, `hrms_saas`, and `hrms_mobile`) were verified against live source files, linters, TypeScript compiler, and MySQL schemas.

## 2. Verified Bug Inventory & Root Causes
1. **Bug 1 (Critical) – SSE Ticket Auth:** `node_backend/src/middleware/auth.js:163` called `accountsRepository.findById` without importing `accountsRepository`, throwing `ReferenceError` on every ticket-based SSE connection.
2. **Bug 2 (High) – Attendance Rejection & Tenant Leak:** `node_backend/src/services/attendance.service.js:1142, 1168, 1200` omitted `user_id: ap.employee_id` on rejected `approvalAction` returns, and line `1268` omitted `tenantId` in `realtimeManager.broadcast`.
3. **Bug 3 (High) – Cross-Tenant Realtime Broadcasts:** `leave.service.js:194, 661, 666`, `accounts.service.js:672, 1158, 1244-1391`, and `financial-leave.service.js:581` omitted `tenantId` in `realtimeManager.broadcast`, and `utils/realtime.js:73` allowed role broadcasts without `tenantId`.
4. **Bug 4 (High) – Punch In/Out Notification & Dedupe:** `attendance.service.js` checked `result.status`/`result.outside` instead of `final_status`/`outside_location`, used `result.id` (`undefined`) in `dedupeKey`, and fell back to `actor.tenant_id || 1`.
5. **Bug 5 (High) – Web TeamAnalytics Filtering & Export:** `TeamAnalytics.jsx` filtered a 10-row server page client-side (`filteredMembers`, `attentionMembers`, `handleExportCsv`) and did not reset `page` on filter/days/site changes.
6. **Bug 6 (Medium) – Documents Pagination Mapping:** `Documents.jsx:73-74` read top-level `res.data.total` / `totalPages` instead of `res.data.pagination.total` / `totalPages`.
7. **Bug 7 (Medium) – Mobile Team Analytics Filtering:** `team-analytics.tsx` filtered 20-row cursor slices client-side by `searchQuery` and `focusFilter`.
8. **Bug 8 (Medium) – Manager Realtime Sync Counts:** `accounts.controller.js:534-559` queried tenant-wide pending counts for `manager` instead of team/site-scoped counts.
9. **Bug 9 (Medium) – Invalid Weekly-Off SQL & Date TZ Shift:** `manager-team.service.js:257` queried non-existent `re.is_weekly_off` with `.catch(() => [])`; `manager-team.service.js:17-23` and `leave.service.js:601-617` used local `Date` getters on UTC-midnight MySQL `DATE` objects.
10. **Bug 10 (Medium) – Regularized Approval Hours:** `attendance.service.js:1249-1252` approved regularized `punch_out_time` without computing `total_hours`, `early_departure_minutes`, or `overtime_minutes`.
11. **Bug 11 (Medium) – Mobile `AndroidImportance`:** `NotificationContext.tsx:155` accessed `Notifications.AndroidImportance` (`import/namespace` ESLint error).
12. **Bug 12 (Low) – React Hooks `set-state-in-effect`:** `useReverseGeocode.js:17`, `EmployeeRegisterModal.tsx:67, 98`, `NotificationContext.tsx:198, 207`.
13. **Bug 13 (Low) – Attendance JSX & Empty Catches:** `Attendance.jsx:51` unused `formatCoordinate`; `Attendance.jsx:1166` `<div>` inside `<p>`; `locationService.js:161, 228` empty `catch {}`.
14. **Bug 14 (Low) – Leave Pre-Submit Overlap:** `Leave.jsx:278-281` blocked submit using only the current page's leave list.
15. **Bug 15 (Low) – Mobile Approvals Churn:** `approvals.tsx:146-152` depended on `[punchPag, leavePag]` object identities.
