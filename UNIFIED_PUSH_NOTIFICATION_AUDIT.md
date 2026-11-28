# Unified Web Push + Mobile Push Architecture Audit

## 1. Existing Architecture
- **Backend (`node_backend`):** `notifications`, `notification_push_tokens`, and `notification_deliveries` tables (`026_notifications_and_push_tokens.sql`); `notification.service.js`, `notification.repository.js`, `push.service.js`, `notification.controller.js`, `notification.routes.js`.
- **Mobile (`hrms_mobile`):** `expo-notifications` (`AndroidImportance.MAX`, `POST_NOTIFICATIONS` permission in `app.json`), `NotificationContext.tsx` (registers Expo push token to `/api/notifications/push-token`, handles tap deep links via `resolveMobileRoute`).
- **Web (`hrms_saas`):** `NotificationContext.jsx` + `NotificationBell.jsx` + `Notifications.jsx` using Socket.IO/SSE for foreground updates only.

## 2. Missing Functionality
1. **Web Push Delivery:** No `web-push` dependency, no VAPID key management, no `GET /api/notifications/vapid-public-key`, no `hrms_saas/public/sw.js` Service Worker, and no browser subscription registration/cleanup.
2. **Subscription Storage:** `notification_push_tokens.token` (`VARCHAR(512)`) cannot reliably store full Web Push `PushSubscription` JSON (`endpoint` + `p256dh` + `auth`) and lacks `subscription_json` / `device_name`.
3. **Preferences & Device Management:** No `notification_preferences` table (`web_push_enabled`, `mobile_push_enabled`, `disabled_categories`) and no UI/API to toggle channels/categories or revoke registered devices.
4. **Delivery Lifecycle & Retries:** `push.service.js` does not group by `tenantId`, lacks transient retry backoff, and `notification_deliveries` lacks `device_token_id` and `clicked_at`.

## 3. Database Migration Plan (`032_unified_web_mobile_push.sql`)
- Add `subscription_json TEXT NULL`, `device_name VARCHAR(120) NULL` to `notification_push_tokens`.
- Add `device_token_id BIGINT NULL`, `clicked_at DATETIME NULL` to `notification_deliveries`.
- Create `notification_preferences (id, tenant_id, user_id, web_push_enabled, mobile_push_enabled, disabled_categories, created_at, updated_at)` with `UNIQUE KEY uq_notif_pref_tenant_user (tenant_id, user_id)`.

## 4. Security & Reliability Controls
- Enforce `tenant_id` on all token, device, preference, and click operations.
- Never expose `keys.p256dh` / `keys.auth` in device list responses.
- Keep lock-screen push payloads minimal (`buildSafePushBody`), fetching sensitive details only after authenticated navigation.
