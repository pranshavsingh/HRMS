# HRMS Critical Security Fix Report (Bugs 1, 2, 3, 8)

## 1. Bug 1 – SSE Ticket Authentication (`node_backend/src/middleware/auth.js`)
- **Root Cause:** Missing `accountsRepository` import caused `ReferenceError` at line 163; `req.user` also lacked verified active tenant membership.
- **Fix:** Imported `accountsRepository` from `../repositories/accounts.repository.js` and resolved active membership from `workforce_user_tenant` (`ORDER BY tenant_id ASC LIMIT 1`), rejecting inactive/unassigned users with `401`/`403`.

## 2. Bug 2 – Attendance Rejection & Realtime Tenant Leak (`node_backend/src/services/attendance.service.js`)
- **Root Cause:** All three `status === "rejected"` return blocks in `approvalAction` omitted `user_id: ap.employee_id`, causing `Number(response.user_id)` -> `NaN` in notification creation and `realtimeManager.broadcast` without `tenantId`.
- **Fix:** Added `user_id: ap.employee_id` to all three rejection return blocks, guarded post-transaction dispatch with `Number.isFinite(targetEmployeeId) && targetEmployeeId > 0`, and passed `tenantId` in `realtimeManager.broadcast`.

## 3. Bug 3 – Cross-Tenant Realtime Broadcasts (`utils/realtime.js`, `leave.service.js`, `accounts.service.js`, `financial-leave.service.js`)
- **Root Cause:** Multiple `realtimeManager.broadcast(...)` calls omitted `tenantId`, and `dispatchLocal` allowed role broadcasts when `filter.tenantId == null`.
- **Fix:** Enforced `if (filter.tenantId == null && filter.targetRoles?.length) return;` in `utils/realtime.js` and added `tenantId` to all employee, document, leave, and reset-failure broadcasts.

## 4. Bug 8 – Manager Realtime Pending Counts (`node_backend/src/controllers/accounts.controller.js`)
- **Root Cause:** `realtimeSync` queried all pending rows in `tenant_id = ?` for `manager`.
- **Fix:** Replaced raw tenant-wide SQL with `attendanceService.pendingApprovalsCount(userId, role, req.query, tenantId)` and `leaveService.pendingApprovalsCount(role, userId, req.query, tenantId)`, matching the exact team/site-scoped approval queues.
