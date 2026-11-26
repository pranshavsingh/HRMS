# NOTIFICATION_IMPLEMENTATION_AUDIT.md

## 1. Executive Summary & Architectural Reality Check

Before writing code, a full audit of `node_backend`, `hrms_saas` (Web), and `hrms_mobile` (Mobile) was conducted. Several assumptions in the initial engineering brief differ from the actual production codebase; per project rules, this implementation adapts cleanly to the **actual existing architecture** without introducing conflicting ORMs, duplicate servers, or breaking changes.

| Layer | Brief Assumption | Actual Codebase Architecture | Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Backend Language & DB** | TypeScript + Prisma ORM | **Node.js (ESM `.js`) + `mysql2/promise` raw SQL (`db.js`)** + numbered SQL migrations (`001`–`025` via `scripts/run-migrations.js`) | Build modular ESM services/repositories/controllers/routes using `db.js` and add safe SQL migration `026_notifications_and_push_tokens.sql`. |
| **Realtime Transport** | Socket.IO | **Socket.IO (`4.8.4`) + `@socket.io/redis-adapter`** in `src/services/realtime.service.js`, plus SSE fallback (`src/utils/realtime.js`). `NOTIFICATION_CREATED: "notification:created"` already exists in `src/constants/realtime-events.js`. | Reuse `realtimeService.io` and existing authenticated rooms (`user:{id}`, `tenant:{tenantId}:user:{id}`). Add `notification:sync` handler and emit `notification:new`, `notification:read`, `notification:read-all`, `notification:unread-count`. |
| **Background Queues** | Optional queue | **BullMQ + Redis** (`src/jobs/index.js`) & `outbox_events` (`003_phase3_outbox_events.sql`) with automatic fallback when Redis is offline. | Dispatch push notifications asynchronously (via BullMQ if Redis is ready, or non-blocking async task with delivery logging in `notification_deliveries`). |
| **Web Frontend** | React + Vite + TypeScript | **React + Vite + JavaScript (`.jsx`) + Tailwind CSS** (`src/api/axios.js`, `src/context/AuthContext.jsx`, `src/context/RealtimeContext.jsx`). | Add `NotificationContext.jsx`, Navbar bell + dropdown (`Navbar.jsx`), and `/notifications` full history page (`Notifications.jsx`). |
| **Mobile Frontend** | React Native + Expo + TypeScript | **Expo SDK 58 + React Native 0.88.1 + Expo Router + TypeScript** (`src/services/api.ts`, `src/context/AuthContext.tsx`, `src/context/RealtimeContext.tsx`). | Add `NotificationContext.tsx`, header bell immediately left of profile avatar in `(tabs)/_layout.tsx`, `/notifications` modal/screen, and safe `expo-notifications` / FCM push registration. |

---

## 2. Reusable Components & Services Inventory

### Backend (`node_backend`)
- `src/db/index.js`: `db.get`, `db.all`, `db.run`, `db.transaction` with UTC enforcement and slow-query logging.
- `src/middleware/auth.js`: `authenticate`, `requireRole` (JWT verification, JTI revocation, `req.user`).
- `src/utils/tenant.js`: `resolveTenantId` (`req.tenantId` multi-tenant isolation).
- `src/utils/pagination.js`: `parsePagination`, `formatPaginationResponse`.
- `src/middleware/rateLimiter.js`: `createApiLimiter` (per-user 1,200 req/min).
- `src/services/realtime.service.js`: Socket.IO server with JWT auth, JTI revocation, `user:{id}` & `tenant:{tenantId}:user:{id}` rooms, `emitToUser`, `getEventsSince`.
- `src/constants/realtime-events.js`: Centralized event name registry.

### Web (`hrms_saas`)
- `src/api/axios.js`: Axios instance with in-memory JWT & silent refresh interceptor.
- `src/context/AuthContext.jsx`: User session, role, logout cleanup.
- `src/context/RealtimeContext.jsx`: Socket.IO client with `subscribe(event, cb)`, event deduplication (`eventId`), and reconnect sync.
- `src/components/layout/Navbar.jsx`: Fixed top navbar with Holiday Calendar link, User Info pill, Logout button.
- `src/components/common/Pagination.jsx` & `Loader.jsx`: Reusable UI primitives.

### Mobile (`hrms_mobile`)
- `src/services/api.ts`: Axios instance with SecureStore JWT & refresh interceptor.
- `src/context/AuthContext.tsx`: Auth state, SecureStore persistence, logout cleanup.
- `src/context/RealtimeContext.tsx`: Socket.IO client with `subscribe(event, cb)`, AppState foreground reconnect, and `eventId` deduplication.
- `src/app/(tabs)/_layout.tsx`: Tab header with `headerRight` containing `profileButton` and `calendarButton`.

---

## 3. Existing Socket.IO Event Inventory

From `node_backend/src/constants/realtime-events.js`:
- **Lifecycle**: `realtime:connected`, `realtime:disconnected`, `session:revoked`
- **Attendance**: `attendance:punch_in`, `attendance:punch_out`, `attendance:approval_decision`, `attendance:regularization`, `attendance_update`
- **Leave**: `leave:applied`, `leave:action`, `leave:concession_granted`, `leave:concession_reversed`, `leave_update`, `leave_notice`
- **Schedule/Roster**: `shift:created`, `shift:updated`, `shift:deleted`, `assignment:updated`, `rotation:updated`, `roster:generated`, `roster:published`, `schedule_update`
- **Documents**: `document:uploaded`, `document:deleted`, `document_update`
- **Notifications**: `notification:created` (existing) — will be complemented with `notification:new`, `notification:read`, `notification:read-all`, `notification:unread-count`, `notification:sync` (client->server), `notification:sync-required`.

---

## 4. Identified Conflicts & Gaps

1. **No Prisma Schema**: `node_backend` uses raw SQL migrations (`scripts/migrations/*.sql`). Creating a Prisma schema would conflict with `db.js` and `run-migrations.js`. **Resolution**: Use SQL migration `026_notifications_and_push_tokens.sql` compatible with MySQL 8.0 / MariaDB 11.
2. **Backend is ESM JavaScript**: All `node_backend/src/**` files are `.js`. **Resolution**: Author backend notification modules in clean ESM `.js` with JSDoc types matching repo conventions.
3. **Push Notification Credentials**: `expo-notifications` is not yet installed in `hrms_mobile`, and no `google-services.json` / `FCM_SERVER_KEY` / `GOOGLE_APPLICATION_CREDENTIALS` exists in the repo. **Resolution**: Install `expo-notifications` (and `expo-constants` already present), implement device push token registration + Expo Push / FCM v1 dispatch service safely, and document exact Firebase/EAS build configuration without fabricating credentials.
4. **Expo Go SDK 58 Push Limitation**: Remote push notifications on Android require an Expo Development Build (`expo-dev-client` / EAS build) rather than Expo Go. **Resolution**: Guard `Notifications.getExpoPushTokenAsync` / `getDevicePushTokenAsync` cleanly so Expo Go never crashes, while supporting full local/foreground presentation and development-build push tokens.

---

## 5. Required Schema Changes (`026_notifications_and_push_tokens.sql`)

1. `notifications`:
   - `id` (BIGINT AUTO_INCREMENT PK)
   - `tenant_id` (BIGINT NOT NULL DEFAULT 1)
   - `recipient_id` (INT NOT NULL, FK -> `accounts_user.id` ON DELETE CASCADE)
   - `actor_id` (INT NULL, FK -> `accounts_user.id` ON DELETE SET NULL)
   - `type` (VARCHAR(100) NOT NULL)
   - `category` (VARCHAR(32) NOT NULL DEFAULT 'GENERAL') — `LEAVE`, `ATTENDANCE`, `ROSTER`, `DOCUMENT`, `ANNOUNCEMENT`, `SYSTEM`, `GENERAL`
   - `title` (VARCHAR(255) NOT NULL)
   - `message` (TEXT NOT NULL)
   - `data` (JSON NULL)
   - `action_url` (VARCHAR(500) NULL)
   - `priority` (VARCHAR(16) NOT NULL DEFAULT 'NORMAL') — `LOW`, `NORMAL`, `HIGH`, `URGENT`
   - `dedupe_key` (VARCHAR(191) NULL) — prevents duplicate notifications on retries
   - `read_at` (DATETIME NULL)
   - `expires_at` (DATETIME NULL)
   - `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)
   - `updated_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)
   - Indexes: `(tenant_id, recipient_id, created_at)`, `(tenant_id, recipient_id, read_at)`, `(tenant_id, recipient_id, category, created_at)`, `UNIQUE (tenant_id, recipient_id, dedupe_key)`
2. `notification_push_tokens`:
   - `id` (BIGINT AUTO_INCREMENT PK)
   - `tenant_id` (BIGINT NOT NULL DEFAULT 1)
   - `user_id` (INT NOT NULL, FK -> `accounts_user.id` ON DELETE CASCADE)
   - `token` (VARCHAR(512) NOT NULL)
   - `platform` (VARCHAR(20) NOT NULL DEFAULT 'android')
   - `provider` (VARCHAR(20) NOT NULL DEFAULT 'expo') — `expo` | `fcm`
   - `device_id` (VARCHAR(128) NULL)
   - `is_active` (TINYINT(1) NOT NULL DEFAULT 1)
   - `last_used_at` (DATETIME NULL)
   - `created_at` / `updated_at`
   - Unique index on `(token(255))`, index on `(tenant_id, user_id, is_active)`
3. `notification_deliveries`:
   - `id` (BIGINT AUTO_INCREMENT PK)
   - `notification_id` (BIGINT NOT NULL, FK -> `notifications.id` ON DELETE CASCADE)
   - `channel` (VARCHAR(20) NOT NULL) — `socket` | `push`
   - `status` (VARCHAR(20) NOT NULL DEFAULT 'PENDING') — `PENDING` | `SENT` | `FAILED` | `SKIPPED`
   - `provider_message_id` (VARCHAR(255) NULL)
   - `attempts` (INT NOT NULL DEFAULT 0)
   - `error_message` (TEXT NULL)
   - `created_at` / `updated_at`

---

## 6. Phased Implementation Plan

- **Phase 1**: SQL Migration `026_notifications_and_push_tokens.sql` + execute migration on MySQL.
- **Phase 2**: Backend Notification Repository, Validation, Service, Push Service, Controller, Routes (`/api/notifications` & `/api/v1/notifications`), and Socket.IO room/event integration (`notification:new`, `notification:read`, `notification:read-all`, `notification:unread-count`, `notification:sync`).
- **Phase 3**: Event Triggers in Leave, Attendance, Roster/Shifts, and Document workflows (post-commit, deduplicated, RBAC-scoped).
- **Phase 4**: Web Frontend (`NotificationContext.jsx`, Navbar bell + dropdown, `/notifications` history page).
- **Phase 5**: Mobile Frontend (`expo-notifications` setup, `NotificationContext.tsx`, header bell immediately left of profile avatar, `/notifications` screen, push token registration & logout cleanup).
- **Phase 6**: Automated unit, API integration, Socket.IO, security, and regression tests + remaining documentation.
