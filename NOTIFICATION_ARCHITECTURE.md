# NOTIFICATION_ARCHITECTURE.md

## Overview
The HRMS Notification System is a centralized, persistent, multi-tenant, real-time notification platform shared across **Node.js/Express (`node_backend`)**, **React/Vite Web (`hrms_saas`)**, and **Expo React Native Mobile (`hrms_mobile`)**.

## High-Level Data Flow
1. **Domain Event Occurs** (Leave applied/approved/rejected, Attendance exception/regularization/decision, Roster/Shift assignment published/cancelled, Document uploaded by HR/Admin, Announcement published).
2. **Post-Commit Persistence**: After the primary business transaction commits, `notificationService.createNotification` or `createBulkNotifications` persists records in MySQL (`notifications`) with `dedupe_key` uniqueness to prevent duplicates on retries.
3. **Real-Time Socket.IO Delivery**: `realtimeService.emitToUser` broadcasts `notification:new` and `notification:unread-count` to `user:{recipientId}` across all active Web and Mobile sessions.
4. **Push Delivery**: `pushService.sendForNotifications` queries active `notification_push_tokens` for the recipients, dispatches lock-screen-safe payloads via the Expo Push API (or logs skipped/failed status when FCM credentials are absent), and records delivery status in `notification_deliveries`.
5. **Cross-Platform Read Sync**: Marking one or all notifications read updates `read_at` in MySQL and emits `notification:read` / `notification:read-all` + `notification:unread-count` to all active Web and Mobile sessions for that user.
