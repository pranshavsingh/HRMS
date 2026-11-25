# 05. UI Component Audit

## Web (`hrms_saas`)
- **Lint & Build:** `npm run lint` **0 errors, 0 warnings** (down from 6 errors); `npm run build` **PASSED** (1.84s).
- **Fixed Component Defects:**
  - `Login.jsx`: Added accessible `Eye`/`EyeOff` toggles & 12-char reset validation.
  - `TeamDashboard.jsx`: Replaced misleading `"backend is running"` error on 403 with accurate permission message.
  - `Shifts.jsx` & `SiteManagement.jsx`: Added `embedded` prop to eliminate double `<Layout>`, gated Create Work Site form by `canEditSites`, fixed `current_version_number` and `status === "published"` badges.
  - `Roster.jsx`: Added `try/catch` error feedback on `publishAssignment` and `publishRotation`.
  - `Attendance.jsx`: Preserved `accuracy` in `coords` from `punchDetails`.
  - `EmployeeDocuments.jsx`: Fixed 404 `GET /auth/employees/:id/` lookup.
  - `Navbar.jsx`: Removed permanently disabled placeholder notification bell.
  - `ErrorBoundary.jsx`: Removed stale `localStorage.getItem("token")` check.
  - `AuthContext.jsx`: Dispatched `"token-refreshed"` on `login()` & `silentRefresh()` so `RealtimeContext` connects immediately.
  - `TeamAnalytics.jsx`: Removed non-existent `punch_in`/`punch_out` listeners.
  - ESLint cleanups in `RealtimeContext.jsx`, `MonthlyRegister.jsx`, `EmployeeDashboard.jsx`, `Leave.jsx`, `TeamAttendance.jsx`.

## Mobile (`hrms_mobile`)
- **TypeScript:** `npx tsc --noEmit` **PASSED (0 errors)**.
- **Expo Lint:** Reduced from 75 problems (22 errors) to 69 problems (20 `react-hooks/set-state-in-effect` React Compiler warnings/errors in existing screen `useEffect` fetchers); eliminated `AuthContext.tsx` `react-hooks/immutability` and `set-state-in-effect` errors.
- **Fixed Component Defects:**
  - `team-analytics.tsx`: Fixed 6 field/period mismatches.
  - `audit-logs.tsx`: Fixed 5 field/query mismatches.
  - `team-attendance.tsx`: Fixed `weekday` field & `page: "all"`.
  - `shifts.tsx`: Handled `is_off_day` explicitly (holidays/weekly offs).
  - `leave.tsx`: Loaded dynamic leave types from `/leave/policy/available-types/`.
  - `employee-documents.tsx`: Resolved relative `/media/...` URLs.
  - `employees.tsx`: Gated Archive button to `isAdmin || isSuperadmin`.
  - `RealtimeContext.tsx` & `_layout.tsx`: Fixed foreground `"realtime:connected"` emission and removed non-existent `"auth:session_revoked"` listener.
  - `punch.tsx`: Removed unused `CameraView`, `user`, `cameraRef`.
  - `reports.tsx`: Fixed `weekday` CSV header.
