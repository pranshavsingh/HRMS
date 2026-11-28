# HRMS Web & Mobile Pagination Fix Report (Bugs 5, 6, 7)

## 1. Bug 5 – Web TeamAnalytics Server Pagination, Filtering & CSV Export
- **Backend (`node_backend/src/services/attendance.service.js`):** Updated `teamAnalytics()` to filter the full authorized `records` list by `search`, `statusFilter`, and `focusFilter` after computing `summary`/`insights` and before applying `page`/`limit` or `cursor` pagination.
- **Frontend (`hrms_saas/src/pages/TeamAnalytics.jsx`):**
  - Sends `days`, `page`, `limit`, `search`, `statusFilter`, `focusFilter`, and `site_id` to `GET /api/attendance/team-analytics/`.
  - Resets `page` to `1` whenever `days`, `querySiteId`, `search`, `statusFilter`, or `focusFilter` changes.
  - Uses `requestSeqRef` to prevent stale responses from overwriting newer filters.
  - Updated `handleExportCsv` to fetch all filtered pages (`limit: 100`) when `pageCount > 1` so exports include the complete filtered dataset.

## 2. Bug 6 – Web Documents Pagination Mapping (`hrms_saas/src/pages/Documents.jsx`)
- **Root Cause:** Read `res.data?.total` and `res.data?.totalPages` instead of `res.data?.pagination?.total` / `totalPages`.
- **Fix:** Mapped `const pag = res.data?.pagination || res.data || {}` and clamped `page` to `nextPages` when deleting/filtering reduces page count.

## 3. Bug 7 – Mobile Team Analytics Cursor Pagination (`hrms_mobile/src/app/(tabs)/team-analytics.tsx`)
- **Fix:** Passed `days`, `search`, and `focusFilter` in `useCursorPagination` `params` so cursor state resets on filter changes and searches operate across the full backend dataset.
