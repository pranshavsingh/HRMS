# Mobile Pagination Implementation Report

## 1. Executive Summary

An enterprise-grade, cursor-based (keyset) pagination system has been implemented across the HRMS Node.js/MySQL backend and the Expo React Native mobile application (`hrms_mobile`), while preserving 100% backward compatibility with the React + Vite Web application (`hrms_saas`) and all legacy offset-paginated callers.

## 2. Architecture & Design Decisions

### 2.1 Dual-Mode Backward Compatibility
- **Opt-in Cursor Mode:** Backend endpoints activate keyset cursor pagination **only** when `cursor` or `cursor_mode=true` (or `cursor_mode=1`) is supplied in the query string.
- **Unchanged Web/Legacy Mode:** Requests without `cursor` or `cursor_mode` execute the existing `parsePagination` / `formatPaginationResponse` offset path unchanged.
- **Dependency Discipline:** Neither `@tanstack/react-query` nor `@shopify/flash-list` was installed in `hrms_mobile/package.json`. A custom `useCursorPagination` hook and `PaginatedFlatList` wrapper built on React Native `FlatList` were implemented with zero new third-party dependencies.

## 3. Files Created & Modified

### 3.1 Backend (`f:\hrms\node_backend`)
- **Created:** `src/utils/pagination/cursor.js` & `src/utils/pagination/index.js`
  - HMAC-SHA256 signed opaque Base64URL cursors (`<payloadB64>.<16-char-sig>`) using `crypto.timingSafeEqual`.
  - Scope binding (`scope` e.g. `att_history:<userId>`, `notif:<userId>`, `emp_list`, `leave_my:<userId>`) prevents cross-user or cross-endpoint cursor replay.
  - `parseCursorPagination(query, { defaultLimit, maxLimit, scope })` with `limit` clamping (`1..maxLimit`, default `20`, max `100`).
  - `buildKeysetClause({ primaryCol, idCol, cursorValues, direction })` supporting composite `(primaryCol, id)` keyset comparisons (`<` for `DESC`, `>` for `ASC`) and single-column `id` keyset comparisons.
  - `formatCursorResponse(rows, { limit, scope, extractCursorValues, mapItem, extra })` using `limit + 1` fetch-ahead to compute `hasMore` without `COUNT(*)` overhead.
- **Created Migration:** `scripts/migrations/031_mobile_pagination_indexes.sql`
  - Added composite keyset indexes: `idx_att_user_date_id`, `idx_doc_user_uploaded_id`, `idx_leave_user_created_id`, `idx_audit_created_id`.
- **Modified Services & Repositories:**
  - `src/services/attendance.service.js`: cursor mode for `approvals` and `getHistory`.
  - `src/services/leave.service.js`: cursor mode for `myLeaves` and `approvals`.
  - `src/services/notification.service.js`: cursor mode for `getNotifications` (matching `notifications` schema columns).
  - `src/repositories/accounts.repository.js` & `src/services/accounts.service.js`: cursor mode for `getEmployees`, `getMyDocuments`, `getEmployeeDocuments`, and `getAuditLogs`.
- **Created E2E Test Suite:** `tests/e2e/mobile_cursor_pagination.test.js`.

### 3.2 Mobile (`f:\hrms\hrms_mobile`)
- **Created Service:** `src/services/paginationService.ts` (`normalizePaginatedResponse`, `fetchCursorPage`).
- **Created Hook:** `src/hooks/useCursorPagination.ts`
  - Deduplicated merge by `getItemKey`, `AbortController` cancellation on filter/search reset, `isLoadingMore` / `isRefreshing` / `error` / `loadMoreError` states, `reset()`, `refresh()`, `loadMore()`, and `setItems()` for optimistic mutations.
- **Created UI Components:**
  - `src/components/pagination/PaginatedFlatList.tsx` (`onEndReachedThreshold={0.4}`, `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `RefreshControl`, sticky headers, empty/error/footer states).
  - `src/components/pagination/ListFooterLoader.tsx`
  - `src/components/pagination/ListEmptyState.tsx`
  - `src/components/pagination/ListErrorState.tsx`
- **Migrated Mobile Screens (8 screens):**
  - `src/app/(tabs)/employees.tsx`
  - `src/app/(tabs)/approvals.tsx`
  - `src/app/(tabs)/leave.tsx`
  - `src/app/(tabs)/audit-logs.tsx`
  - `src/app/(tabs)/employee-documents.tsx`
  - `src/app/my-documents.tsx`
  - `src/app/(tabs)/history.tsx`
  - `src/app/notifications.tsx`
