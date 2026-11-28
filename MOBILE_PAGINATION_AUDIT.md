# HRMS – Mobile & Backend Pagination Audit (`MOBILE_PAGINATION_AUDIT.md`)

**Audit Date:** 2026-11-27  
**Scope:** Complete React Native / Expo Mobile (`hrms_mobile`) and Node.js / Express / MySQL Backend (`node_backend`)

---

## 1. Executive Summary

An end-to-end audit of `hrms_mobile` and `node_backend` found that:
1. **No Cursor-Based Pagination Exists:** Every paginated endpoint in `node_backend` uses `LIMIT / OFFSET` via `parsePagination()` (`node_backend/src/utils/pagination.js`), running `COUNT(*)` on every request and risking duplicate/skipped items when new attendance, leave, approval, or notification records arrive concurrently.
2. **Silent Truncation on Mobile:** 7 of 9 major mobile list screens fetch only page 1 (typically 50 records) without infinite scroll or cursor support—silently hiding records beyond item 50 (`employees.tsx`, `history.tsx`, `leave.tsx`, `approvals.tsx`, `employee-documents.tsx`, `my-documents.tsx`, `audit-logs.tsx`).
3. **ScrollView Anti-Pattern:** `leave.tsx` and `my-documents.tsx` render mapped record lists inside `ScrollView` instead of virtualized `FlatList`.
4. **Heavy Dashboard/Metrics Side-Queries:** `GET /api/auth/employees/` runs 5 parallel queries (including org-wide metrics and document counts) on every page fetch.
5. **Non-Deterministic Sorting:** Several `ORDER BY` clauses (e.g., `attendance.service.js:2322` `ORDER BY date DESC, punch_in_time DESC`) lack a unique `id DESC` tie-breaker required for stable cursor pagination.
6. **TanStack Query / FlashList Status:** Neither `@tanstack/react-query` nor `@shopify/flash-list` is installed in `hrms_mobile/package.json`; React Native `FlatList` + a custom `useCursorPagination` hook with `AbortController` and response adapters fits the existing architecture cleanly with zero new dependencies.

---

## 2. Screen-by-Screen & Endpoint Audit Matrix

| Module | Mobile Screen | API Endpoint | Current Implementation | Current Limit | Database Query / Ordering | Performance & UX Issue | Recommended Strategy | Priority |
|---|---|---|---|---|---|---|---|---|
| **Attendance History** | `(tabs)/history.tsx` | `GET /api/attendance/history/` | `LIMIT/OFFSET` + `COUNT(*)`; mobile loads page 1 only | 50 (500 w/ dates) | `ORDER BY date DESC, punch_in_time DESC` (no `id` tie-breaker), `SELECT *` | Silent truncation >50; non-deterministic sort; `COUNT(*)` per call | **Cursor** (`date DESC, id DESC`) + Infinite Scroll | **P0** |
| **Employee Directory** | `(tabs)/employees.tsx` | `GET /api/auth/employees/` | `LIMIT/OFFSET` + 5 parallel queries; mobile filters page 1 client-side | 50 (max 10,000) | Joins `accounts_employeeprofile`, `workforce_employee_site_assignment`, counts docs | Silent truncation >50; client-side search misses server records; heavy extra queries | **Cursor** (`id ASC`) + server-side debounced search + Infinite Scroll | **P0** |
| **Attendance Approvals** | `(tabs)/approvals.tsx` | `GET /api/attendance/approvals/` | `LIMIT/OFFSET`; mobile loads page 1 only | 50 (max 100) | Joins `attendance_attendance`, `accounts_user`, `accounts_employeeprofile` | Silent truncation >50 pending/history approvals | **Cursor** (`created_at DESC, id DESC`) + Infinite Scroll | **P0** |
| **Leave Approvals** | `(tabs)/approvals.tsx` | `GET /api/leave/approvals/` | `LIMIT/OFFSET`; mobile loads page 1 only | 50 (max 100) | `leave_leave` joined with `accounts_user` & `accounts_employeeprofile` | Silent truncation >50 leave approvals | **Cursor** (`created_at DESC, id DESC`) + Infinite Scroll | **P0** |
| **Leave Management** | `(tabs)/leave.tsx` | `GET /api/leave/my/` | `LIMIT/OFFSET`; mobile renders `leaves.map()` in `ScrollView` | 50 | `leave_leave WHERE user_id = ?` | Silent truncation >50; non-virtualized `ScrollView` | **Cursor** (`applied_at DESC, id DESC`) + `FlatList` Infinite Scroll | **P1** |
| **Notifications** | `notifications.tsx` | `GET /api/notifications` | `LIMIT/OFFSET` (`page`, `limit=20`); mobile appends pages | 20 (max 100) | `workforce_notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC` | `OFFSET` shifts when new notifications arrive via Socket.IO | **Cursor** (`created_at DESC, id DESC`) + Infinite Scroll | **P1** |
| **Employee Documents** | `(tabs)/employee-documents.tsx` | `GET /api/auth/documents/:userId/` & `/auth/employees/` | `LIMIT/OFFSET`; mobile loads page 1 only | 50 | `accounts_employeedocument WHERE user_id = ?` | Silent truncation >50 employees and >50 docs | **Cursor** (`uploaded_at DESC, id DESC`) + Infinite Scroll | **P1** |
| **My Documents** | `my-documents.tsx` | `GET /api/auth/documents/my/` | `LIMIT/OFFSET`; mobile renders in `ScrollView` | 50 | `accounts_employeedocument WHERE user_id = ?` | Silent truncation >50; non-virtualized `ScrollView` | **Cursor** (`uploaded_at DESC, id DESC`) + `FlatList` Infinite Scroll | **P2** |
| **Audit Logs** | `(tabs)/audit-logs.tsx` | `GET /api/auth/audit-logs/` | `LIMIT/OFFSET` (`max 5000`); mobile uses Prev/Next page buttons | 50 | `accounts_auditlog` with search/action filter | Slow `OFFSET` on large audit tables; `COUNT(*)` per page | **Cursor** (`timestamp DESC, id DESC`) + Infinite Scroll | **P1** |
| **My Team Attendance** | `(tabs)/team-attendance.tsx` | `GET /api/manager/team/attendance` | Server-side `page/limit=20`, search, dept/status filters, Load More | 20 (max 100) | `accounts_user` + `attendance_attendance` + `leave_leave` | Date-scoped team roster; already server-paginated | Keep page-based + standardize UI components | **P3** |
| **Shifts / Roster** | `(tabs)/shifts.tsx` | `GET /api/v1/workforce/rosters/my-roster` | Upcoming 10–14 day schedule | 10–14 days | `workforce_roster_entry` | Bounded small window (not an unbounded list) | Keep as bounded schedule view | **N/A** |
| **Reports** | `(tabs)/reports.tsx` | `GET /api/attendance/team-attendance/` | Monthly matrix / CSV export | 50 / `all` | Monthly register aggregation | Web/admin export view; mobile restricts export | Keep page-based where needed | **P3** |
| **Holidays** | `holidays.tsx` | `GET /api/v1/workforce/holidays` | Month-range query | ~1–10/mo | `workforce_company_holiday` | Bounded by month | Keep month-scoped | **N/A** |

---

## 3. Backward Compatibility Constraints

- Web (`hrms_saas`) consumes `data`, `records`, `logs`, and `pagination: { page, limit, total, totalPages, pages, hasNextPage, hasPreviousPage }` on shared endpoints.
- **Solution:** Backend endpoints will **support both** `cursor` (when `cursor` param or `cursor_mode=true` is passed) AND legacy `page`/`limit` offset mode (when `cursor` is omitted), always returning `{ success: true, data, pagination: { limit, nextCursor, hasMore, ... } }` plus existing legacy keys (`records`, `logs`, etc.) so **zero Web or legacy consumers break**.
