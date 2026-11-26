# NOTIFICATION_API_DOCUMENTATION.md

All endpoints are mounted under both `/api/notifications` and `/api/v1/notifications` and require `Authorization: Bearer <access_token>`. Recipient identity is always derived from the verified JWT (`req.user.id`).

| Method | Endpoint | Description | Query / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | Paginated notifications for authenticated user | Query: `page`, `limit` (max 100), `category`, `unreadOnly` (`true`/`false`) |
| `GET` | `/api/notifications/unread-count` | Authoritative unread count | — |
| `GET` | `/api/notifications/:id` | Single notification detail (recipient-owned) | Param: `id` |
| `PATCH` | `/api/notifications/:id/read` | Mark one notification as read & emit sync | Param: `id` |
| `PATCH` | `/api/notifications/read-all` | Mark all (or by category) as read & emit sync | Body/Query: `category` (optional) |
| `DELETE` | `/api/notifications/:id` | Delete a notification owned by the user | Param: `id` |
| `POST` | `/api/notifications/push-token` | Register or refresh device push token | Body: `{ token, platform, provider, deviceId }` |
| `DELETE` | `/api/notifications/push-token` | Deactivate device push token on logout | Body: `{ token }` |
| `POST` | `/api/notifications/announcements` | Publish announcement (RBAC: `hr`, `admin`, `superadmin`) | Body: `{ title, message, targetRoles, priority }` |
