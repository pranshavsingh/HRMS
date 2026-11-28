# HRMS Unified Web Push + Mobile Push Notification Implementation Report

## 1. Executive Summary
A unified, tenant-isolated **Web Push (VAPID + Service Worker)** and **Mobile Push (Expo Push API + `expo-notifications`)** notification delivery system has been implemented across `node_backend`, `hrms_saas`, and `hrms_mobile`, while preserving existing Socket.IO, SSE, and notification history workflows.

## 2. Files Created & Modified

### Backend (`node_backend`)
- **Created:**
  - `node_backend/scripts/migrations/032_unified_web_mobile_push.sql`
  - `node_backend/tests/e2e/unified_push_notifications.test.js`
- **Modified:**
  - `node_backend/package.json` (added `web-push` dependency)
  - `node_backend/src/config/env.js` (added `vapidPublicKey`, `vapidPrivateKey`, `vapidSubject`)
  - `node_backend/src/repositories/notification.repository.js` (extended push token upsert/list/deactivation with `subscription_json`, `device_name`, tenant-scoped device removal, `notification_preferences` CRUD, per-device `notification_deliveries` logging & `clicked_at` tracking)
  - `node_backend/src/services/push.service.js` (unified tenant-grouped dispatch to Web Push + Expo Push API, preference filtering, 3-attempt retry with backoff, `404`/`410`/`DeviceNotRegistered` cleanup, lock-screen-safe payload helper `buildSafePushBody`)
  - `node_backend/src/services/notification.service.js` (VAPID/device/preference/click service methods)
  - `node_backend/src/controllers/notification.controller.js` (handlers for VAPID public key, preferences, devices, and click tracking)
  - `node_backend/src/routes/notification.routes.js` (new routes under `/api/notifications`)

### Web (`hrms_saas`)
- **Created:**
  - `hrms_saas/public/sw.js` (Service Worker handling `push` events, foreground duplicate suppression when a client tab is focused & visible, and `notificationclick` deep-linking + `HRMS_NOTIFICATION_CLICK` messaging)
  - `hrms_saas/src/services/webPushService.js` (Service Worker registration, VAPID key conversion, `subscribeBrowserPush`, `unsubscribeBrowserPush`, `getExistingPushSubscription`)
- **Modified:**
  - `hrms_saas/src/context/NotificationContext.jsx` (explicit `enableWebPush`/`disableWebPush`, permission state, preference & device management, SW click message listener, logout push-token cleanup)
  - `hrms_saas/src/pages/Notifications.jsx` (Browser Push toggle, permission status, category & channel preference switches, registered devices list with Remove)

### Mobile (`hrms_mobile`)
- **Modified:**
  - `hrms_mobile/src/context/NotificationContext.tsx` (device registration with `deviceId` + `deviceName`, notification tap click tracking via `POST /notifications/:id/click`, preference & device management helpers, `requestMobilePushPermission`)
  - `hrms_mobile/src/app/notifications.tsx` ("Push & Devices" settings modal for mobile push toggle, category toggles, and registered device removal)

## 3. Database Migration (`032_unified_web_mobile_push.sql`)
Applied cleanly via `npm run db:migrate` against MySQL (`u356351105_attendance`):
- **`notification_push_tokens`**: added `subscription_json TEXT NULL` and `device_name VARCHAR(120) NULL`.
- **`notification_deliveries`**: added `device_token_id BIGINT NULL` and `clicked_at DATETIME NULL`.
- **`notification_preferences`**: created table storing `(tenant_id, user_id, web_push_enabled, mobile_push_enabled, disabled_categories)` with unique `(tenant_id, user_id)` constraint.

## 4. API Endpoint Changes (`/api/notifications`)
- `GET /api/notifications/vapid-public-key` — Returns `{ publicKey, configured }`.
- `POST /api/notifications/push-token` — Accepts Expo tokens (`provider: "expo"`) and Web Push subscriptions (`provider: "webpush"`, `subscription`, `deviceId`, `deviceName`).
- `DELETE /api/notifications/push-token` — Tenant-scoped token deactivation on logout/unsubscribe.
- `GET /api/notifications/preferences` & `PUT /api/notifications/preferences` — Per-tenant, per-user channel (`web_push_enabled`, `mobile_push_enabled`) and `disabled_categories` preferences.
- `GET /api/notifications/devices` & `DELETE /api/notifications/devices/:deviceId` — Lists and deactivates registered devices with strict tenant & user ownership enforcement.
- `POST /api/notifications/:id/click` — Records `clicked_at` on `notification_deliveries` and marks notification read for the owning recipient & tenant.

## 5. Web Push & Service Worker Architecture
- **Explicit User Action:** Browser notification permission is only requested when the user clicks **Enable Browser Push** in `Notifications.jsx`.
- **Foreground Duplicate Suppression:** `public/sw.js` checks `clients.matchAll({ type: "window", includeUncontrolled: true })` and suppresses OS toast notifications when a visible, focused HRMS tab is active (Socket.IO already updates the in-app UI).
- **Background / Closed Tab Delivery:** When tabs are backgrounded or closed, `sw.js` displays the notification and handles `notificationclick` by focusing an existing HRMS tab (or opening the target `actionUrl`) and posting `HRMS_NOTIFICATION_CLICK` for click tracking.

## 6. Mobile Push & Expo Configuration
- `hrms_mobile/app.json` already configures `POST_NOTIFICATIONS` permission on Android, the `expo-notifications` plugin, and EAS `projectId`.
- `NotificationContext.tsx` registers Android's `default` channel (`AndroidImportance.MAX`), suppresses duplicate foreground OS alerts when Socket.IO is active, tracks notification taps via `POST /notifications/:id/click`, and routes users to the target screen on warm or cold start.

## 7. Security & Privacy Controls
- **Tenant Isolation & Ownership:** All preference, device listing/removal, token deactivation, and click tracking queries filter by both `tenant_id` and `user_id`.
- **Lock-Screen-Safe Payloads:** `buildSafePushBody(notification)` sends generic category-level summaries on push payloads so sensitive HRMS details (salary, leave reasons, documents) are not exposed on lock screens and are fetched only after authenticated app navigation.
- **No Hardcoded Secrets:** VAPID keys are loaded exclusively from environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

## 8. Required Environment Variables
Add to `node_backend/.env` (never commit private keys):
```env
VAPID_PUBLIC_KEY=<base64url-vapid-public-key>
VAPID_PRIVATE_KEY=<base64url-vapid-private-key>
VAPID_SUBJECT=mailto:admin@yourdomain.com
```
Generate keys with:
```bash
npx web-push generate-vapid-keys
```

## 9. Production Setup (VAPID, FCM, APNs, Hosting)
- **Web Push:** Serve `hrms_saas` over **HTTPS** (Service Workers and Push API require a secure context; `localhost` works in local development). Ensure `/sw.js` is served from the web root with `Cache-Control: no-cache` so browser updates pick up Service Worker changes promptly.
- **Android (FCM v1):** Configure FCM v1 credentials in Expo/EAS (`eas credentials`) for production Android builds (`expo-notifications` + `POST_NOTIFICATIONS`).
- **iOS (APNs):** Configure Apple Push Notification service key (`.p8`) in Expo/EAS (`eas credentials`) for production iOS builds.

## 10. Automated Verification Results (Observed)
- **Backend Migration:** `npm run db:migrate` — applied `032_unified_web_mobile_push.sql` cleanly (`exit 0`).
- **Backend Syntax Check:** `npm run check` (`node --check src/server.js && node --check src/worker.js`) — passed (`exit 0`).
- **Backend Unified Push E2E Suite:** `node --test --test-force-exit tests/e2e/unified_push_notifications.test.js` — **4/4 tests passed**:
  1. `GET /api/notifications/vapid-public-key` returns configured VAPID public key.
  2. Registers Web Push & Expo devices and enforces cross-user / cross-tenant `404` isolation on `DELETE /api/notifications/devices/:deviceId`.
  3. Persists notification preferences (`GET`/`PUT`) and enforces ownership/tenant isolation on `POST /api/notifications/:id/click` (`clicked_at` populated).
  4. Delivers Web Push & Expo via `pushService.sendForNotifications` (with mocked `web-push` client and `fetch`), verifies lock-screen-safe payload, retries transient `503` failures, and deactivates `410` / `DeviceNotRegistered` tokens.
- **Web Lint & Build (`hrms_saas`):** `npm run lint` (0 errors) and `npm run build` (`vite build`, built in `3.94s`, `exit 0`).
- **Mobile Typecheck & Lint (`hrms_mobile`):** `npx tsc --noEmit` (0 errors) and `npx expo lint` (0 errors, 71 pre-existing warnings in unrelated files, `exit 0`).

## 11. Physical Device & Live Browser Testing Status
- **Live Browser & Physical Device Tests:** Not executed in this CLI environment (no physical iOS/Android device with FCM/APNs credentials or interactive browser push permission grant was run).
- **Manual Verification Checklist for Staging/Production:**
  1. Open `hrms_saas` over HTTPS (or `localhost`), log in, open Notifications, click **Enable Browser Push**, grant permission, close all tabs, trigger a notification, and verify OS toast + click deep-link.
  2. Install an EAS development/production build on Android & iOS, log in, grant notification permission, background/kill the app, trigger a notification, and verify lock-screen delivery + tap navigation.

## 12. Known Limitations
- Expo Go does not support remote push notifications on newer SDKs without a configured EAS development/production build.
- Live Web Push delivery requires HTTPS in production and valid VAPID keys in `node_backend/.env`.
