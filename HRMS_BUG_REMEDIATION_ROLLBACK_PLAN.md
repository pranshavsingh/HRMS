# HRMS Bug Remediation Rollback Plan

## 1. Schema & Data Safety
No database migrations or destructive SQL changes were introduced. Historical attendance records and leave balances remain untouched.

## 2. Per-Layer Rollback
1. **Backend (`node_backend`):**
   - Revert targeted service/controller/middleware edits (`src/middleware/auth.js`, `src/utils/realtime.js`, `src/controllers/accounts.controller.js`, `src/services/attendance.service.js`, `src/services/leave.service.js`, `src/services/accounts.service.js`, `src/services/financial-leave.service.js`, `src/services/manager-team.service.js`) via `git checkout -- <file>` and restart the Node server.
2. **Web (`hrms_saas`):**
   - Revert `src/pages/TeamAnalytics.jsx`, `src/pages/Documents.jsx`, `src/pages/Leave.jsx`, `src/pages/Attendance.jsx`, `src/services/locationService.js`, `src/hooks/useReverseGeocode.js` and re-run `npm run build`.
3. **Mobile (`hrms_mobile`):**
   - Revert `src/context/NotificationContext.tsx`, `src/components/EmployeeRegisterModal.tsx`, `src/app/(tabs)/approvals.tsx`, `src/app/(tabs)/team-analytics.tsx` and rebuild/republish OTA bundle.
