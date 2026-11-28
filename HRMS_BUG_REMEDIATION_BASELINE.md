# HRMS Bug Remediation Baseline

## 1. Architecture Overview
- **Backend (`f:\hrms\node_backend`):** Node.js + Express + `mysql2` + Redis (`ioredis`) + SSE (`utils/realtime.js`) + Socket.IO (`realtime.service.js`).
- **Web (`f:\hrms\hrms_saas`):** React 19 + Vite 8 + Tailwind CSS v4 + React Router v7 + Axios.
- **Mobile (`f:\hrms\hrms_mobile`):** Expo React Native + Expo Router + TypeScript + `useCursorPagination` / `PaginatedFlatList`.

## 2. Verified Baseline Checks
- **Backend Syntax (`npm run check`):** Passed.
- **Backend E2E (`company_leave_policy.test.js`, `mobile_cursor_pagination.test.js`):** Passed.
- **Web (`hrms_saas`):** `vite build` passes; `npm run lint` reports 4 errors (`useReverseGeocode.js:17`, `Attendance.jsx:51`, `locationService.js:161, 228`).
- **Mobile (`hrms_mobile`):** `npx tsc --noEmit` passes; `npx expo lint` reports 4 errors (`EmployeeRegisterModal.tsx:67, 98`, `NotificationContext.tsx:155, 198`).

## 3. Verified Bug Inventory (15 Root Causes Mapped to Prompts 1–15)
1. **Bug 1 (Critical):** `node_backend/src/middleware/auth.js:163` calls `accountsRepository.findById(userPayload.id)` without importing `accountsRepository`.
2. **Bug 2 (High):** `node_backend/src/services/attendance.service.js:1142, 1168, 1200` omit `user_id: ap.employee_id` on rejection, and `1268` omits `tenantId` in `realtimeManager.broadcast`.
3. **Bug 3 (High):** `leave.service.js:194-198, 661-672` and `accounts.service.js:1244-1391` call `realtimeManager.broadcast` without `tenantId`.
4. **Bug 4 (High):** `attendance.service.js:628-660, 815-848` check `result.status`/`result.outside` instead of `final_status`/`outside_location`, reference `result.id` (`undefined`) in `dedupeKey`, and use `actor.tenant_id || 1`.
5. **Bug 5 (High):** `hrms_saas/src/pages/TeamAnalytics.jsx` filters paginated 10-row slices client-side (`filteredMembers`, `attentionMembers`, `handleExportCsv`) and does not reset `page` on filter/days/site changes.
6. **Bug 6 (Medium):** `hrms_saas/src/pages/Documents.jsx:73-74` reads `res.data?.total` / `res.data?.totalPages` instead of `res.data?.pagination?.total` / `totalPages`.
7. **Bug 7 (Medium):** `hrms_mobile/src/app/(tabs)/team-analytics.tsx` filters cursor-paginated slices client-side by `searchQuery` and `focusFilter`.
8. **Bug 8 (Medium):** `node_backend/src/controllers/accounts.controller.js:534-559` (`realtimeSync`) queries tenant-wide pending counts for `manager` without team/site scoping.
9. **Bug 9 (Medium):** `manager-team.service.js:256-261` queries non-existent `re.is_weekly_off`; `manager-team.service.js:17-23` and `leave.service.js:601-617` use local `Date` getters on UTC-midnight `Date` values.
10. **Bug 10 (Medium):** `attendance.service.js:1249-1252, 2644-2653` approves regularized attendance without computing `total_hours`, `early_departure_minutes`, or `overtime_minutes`.
11. **Bug 11 (Medium):** `hrms_mobile/src/context/NotificationContext.tsx:155` accesses `Notifications.AndroidImportance` (`import/namespace` ESLint error).
12. **Bug 12 (Low):** `react-hooks/set-state-in-effect` in `useReverseGeocode.js:17`, `EmployeeRegisterModal.tsx:67, 98`, and `NotificationContext.tsx:198`.
13. **Bug 13 (Low):** `Attendance.jsx:51` unused `formatCoordinate`; `Attendance.jsx:1100-1168` `<div>` inside `<p>`; `locationService.js:161, 228` empty catch blocks.
14. **Bug 14 (Low):** `Leave.jsx:256-273` pre-submit overlap check inspects only current page.
15. **Bug 15 (Low):** `hrms_mobile/src/app/(tabs)/approvals.tsx:146-152` recreates `fetchQueues` on every render via `[punchPag, leavePag]`.
