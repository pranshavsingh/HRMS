# 11. Error Handling Audit

- **Silent `catch {}` Elimination:**
  - `accounts.controller.js:535-555` (`realtimeSync`): Removed empty `try/catch`, added `logger.error` + `degraded: true` flag.
  - `hrms_saas/src/context/RealtimeContext.jsx:60`: Added `console.warn` on URL parse fallback.
- **Unhandled Promise Rejections Fixed:**
  - `hrms_saas/src/pages/Roster.jsx:1128,1220`: Added `try/catch` + `popup.showPopup(..., "error")` on `publishAssignment` and `publishRotation`.
- **Misleading Error Messages Fixed:**
  - `hrms_saas/src/pages/TeamDashboard.jsx:40`: Replaced misleading `"backend is running"` error on `403` with accurate permission message.
  - `node_backend/src/middleware/validation.js:41-44`: Removed `/documents/upload/` error masking so real file-size/MIME errors surface.
  - `node_backend/src/middleware/validation.js:121`: Fixed `loginSchema` raw Zod error to return `"username and password are required"`.
- **Broadcast Failure Isolation:**
  - `leave.service.js` (`grantConcession`, `reverseConcession`) & `attendance.service.js` (`regularizeAttendance`) wrap realtime broadcasts in `try/catch` with `logger.warn` so committed DB transactions never fail on socket errors.
