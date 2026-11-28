# HRMS Realtime & Notification Fix Report (Bugs 4, 11, 15)

## 1. Bug 4 – Punch In / Punch Out Notifications, Dedupe Key & Tenant Resolution (`node_backend/src/services/attendance.service.js`)
- **Root Cause:**
  - `punchOut` checked `result.status` and `result.outside` (both `undefined` instead of `final_status` and `outside_location`).
  - Neither `punchIn` nor `punchOut` returned `id`, producing `att:in:undefined:<id>` and `att:out:undefined:<id>` dedupe keys.
  - Both used `actor.tenant_id || 1` fallback instead of resolved `workforce_user_tenant` tenant ID.
- **Fix:** Resolved `tenantId` inside transaction from `workforce_user_tenant` (throwing `403` if missing), returned `id` and `tenant_id` on both `punchIn` and `punchOut`, and updated conditions to `result.status === "pending" || result.outside_location` and `result.final_status === "pending" || result.outside_location || result.requires_approval || result.is_overtime`.

## 2. Bug 11 – Mobile `AndroidImportance` Import (`hrms_mobile/src/context/NotificationContext.tsx`)
- **Root Cause:** `Notifications.AndroidImportance.MAX` triggered `import/namespace` ESLint error with `expo-notifications`.
- **Fix:** Imported `{ AndroidImportance } from "expo-notifications"` and used `importance: AndroidImportance.MAX`.

## 3. Bug 15 – Mobile Approvals Realtime Subscription Churn (`hrms_mobile/src/app/(tabs)/approvals.tsx`)
- **Root Cause:** `fetchQueues` depended on `[punchPag, leavePag]` (new object literals every render), recreating `useRealtime` listeners continuously.
- **Fix:** Extracted stable `refreshPunch = punchPag.refresh` and `refreshLeave = leavePag.refresh` callbacks and wrapped `useRealtime` handlers in `useCallback`.
