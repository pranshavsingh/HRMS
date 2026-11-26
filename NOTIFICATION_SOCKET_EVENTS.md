# NOTIFICATION_SOCKET_EVENTS.md

## Transport & Authentication
- Uses the existing Socket.IO server (`node_backend/src/services/realtime.service.js`, path `/socket.io`).
- Connections are authenticated via JWT + JTI blacklist + session revocation checks.
- Users automatically join `user:{userId}` and `tenant:{tenantId}:user:{userId}`.

## Server-to-Client Events
- `notification:new` — `{ notification, unreadCount }`
- `notification:read` — `{ id, readAt, unreadCount }`
- `notification:read-all` — `{ category, updatedCount, unreadCount }`
- `notification:unread-count` — `{ unreadCount }`

## Client-to-Server Events
- `notification:sync` — Requests authoritative `notification:unread-count` from MySQL after reconnection.
