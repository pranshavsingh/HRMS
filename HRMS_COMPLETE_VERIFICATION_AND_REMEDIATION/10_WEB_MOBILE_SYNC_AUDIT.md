# 10. Web, Mobile & Real-Time Sync Audit

- **Web Socket.IO Connection (`hrms_saas`):** Fixed `AuthContext.jsx` to dispatch `"token-refreshed"` on `login()` and `silentRefresh()` so `RealtimeContext.jsx` connects immediately after login.
- **Mobile Realtime Lifecycle (`hrms_mobile`):** Fixed `RealtimeContext.tsx` foreground resume to only emit `"realtime:connected"` when `socketRef.current?.connected` is true, and removed non-existent `"auth:session_revoked"` listener in `_layout.tsx`.
- **Event & Field Parity:**
  - Removed non-existent `"punch_in"` / `"punch_out"` listeners in `TeamAnalytics.jsx`.
  - Fixed unreachable `realtimeService.emitToTenant` calls in `shift.service.js`, `company-policy.service.js`, and `weekly-off-policy.service.js`.
  - Added `tenantId` to `audit.service.js` `"new_audit_log"` broadcasts when available.
  - Fixed Mobile `team-analytics.tsx` (6 fields), `audit-logs.tsx` (5 fields/params), `team-attendance.tsx` (`weekday`, `page: "all"`), `shifts.tsx` (`is_off_day`), `leave.tsx` (dynamic leave types), `employee-documents.tsx` (`/media/` origin), and `reports.tsx` (`weekday`).
- **Multi-Worker Limitation:** `realtime.service.js` `eventBuffer` remains in-memory per process; multi-worker Redis Pub/Sub live testing is **BLOCKED** (Redis offline locally).
