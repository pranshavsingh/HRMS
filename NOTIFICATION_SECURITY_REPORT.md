# NOTIFICATION_SECURITY_REPORT.md

## Security Controls Implemented & Verified
1. **Authentication**: Every REST endpoint uses `authenticate` (JWT + Redis/MySQL JTI revocation). Every Socket.IO connection verifies JWT + JTI + `user:revoked` timestamp.
2. **Recipient Ownership & IDOR Prevention**: `recipient_id` is always derived from `req.user.id`. `findById`, `markAsRead`, `markAllAsRead`, and `deleteById` filter by `WHERE id = ? AND recipient_id = ? AND tenant_id = ?`. Cross-user access returns `404`.
3. **Tenant Isolation**: All queries scope by `tenant_id` resolved via `resolveTenantId`.
4. **Action URL Sanitization**: `sanitizeActionUrl()` in `src/constants/notification-types.js` blocks `javascript:`, `//`, and external URLs, allowing only whitelisted relative application routes. Mobile `resolveMobileRoute()` maps only known safe Expo Router routes.
5. **RBAC Enforcement**: `POST /api/notifications/announcements` is gated by `authorize(["hr", "admin", "superadmin"])`. Approver recipient resolution uses `resolveApproverIdsForEmployee()` on the backend; clients cannot target arbitrary users.
6. **Lock-Screen Privacy**: `pushService.buildSafePushBody()` sends generic non-PII summaries to device lock screens; sensitive details are fetched inside the authenticated app.
7. **SQL Injection Prevention**: 100% parameterized `mysql2/promise` queries.
