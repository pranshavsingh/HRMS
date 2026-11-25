# 09. Security and RBAC Audit

| Security Area | Finding & Remediation | Verification |
|---|---|---|
| **Admin & HR Dashboard Tenant Isolation** | `getAdminSummary` & `hrDashboard` lacked `tenant_id` SQL filtering (`BUG-B1-006`, `BUG-B1-007`). **Fixed** with `attachTenantContext` + `workforce_user_tenant` & `tenant_id` filters. | `PASS` (Regression test) |
| **Approval Routing Tenant Isolation** | `approvalRouteForUser` queried `accounts_user` globally. **Fixed** with `workforce_user_tenant` join. | Code verified |
| **Site Access & Deletion Isolation** | `siteService.deleteSite` (`leave_leave`) lacked `tenant_id`; `getSiteScope` & `ensureEmployeeVisible` ignored `actor`, `requireDirectReport`, and `workDate`. **Fixed**. | Code verified |
| **Rate Limiter Key Collision** | `rateLimiter.js` sliced `auth.slice(7, 40)` (identical JWT header). **Fixed** using `jwt.verify` user ID + SHA-256 fallback. | `PASS` (Regression test) |
| **Cloudinary Signature Authorization** | `GET /cloudinary/signature/` allowed signing arbitrary folders. **Fixed** (`403` for unauthorized folders, `400` on `..`). | `PASS` (Regression test) |
| **SSE & Socket.IO Hardening** | `realtime.js` lacked `tenantId` filtering; `authenticateRealtime` skipped `is_active` & `user:revoked:*`; `realtime.service.js` allowed `*` CORS with `credentials: true` in prod. All **Fixed**. | `PASS` (`authenticateRealtime` test) |
| **RBAC Parity** | Web `/team-dashboard` aligned to `["manager", "superadmin"]`; Mobile `employees.tsx` Archive aligned to `admin`/`superadmin`. | Code & build verified |
