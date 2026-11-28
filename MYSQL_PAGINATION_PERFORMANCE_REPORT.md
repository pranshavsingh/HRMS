# MySQL Pagination Performance Report

## 1. Migration & Added Composite Indexes

Migration `f:\hrms\node_backend\scripts\migrations\031_mobile_pagination_indexes.sql` was applied to database `u356351105_attendance` via `npm run db:migrate`.

| Table | Index Name | Columns | Purpose |
| :--- | :--- | :--- | :--- |
| `attendance_attendance` | `idx_att_user_date_id` | `(user_id, date DESC, id DESC)` | Keyset pagination for employee attendance history |
| `accounts_employeedocument` | `idx_doc_user_uploaded_id` | `(user_id, uploaded_at DESC, id DESC)` | Keyset pagination for employee & my documents |
| `leave_leave` | `idx_leave_user_created_id` | `(user_id, created_at DESC, id DESC)` | Keyset pagination for my leaves |
| `audit_logs` | `idx_audit_created_id` | `(created_at DESC, id DESC)` | Keyset pagination for admin audit logs |
| `notifications` | `idx_notifications_tenant_recipient` *(pre-existing)* | `(tenant_id, recipient_id, created_at)` | Keyset pagination for user notifications |

## 2. 10,000-Row Benchmark Results (Observed)

Measured directly against local MySQL 8.0.46 (`u356351105_attendance`) with 10,000 seeded `attendance_attendance` rows for a single isolated test user (followed by `ANALYZE TABLE attendance_attendance` and full cleanup).

### 2.1 `EXPLAIN` Execution Plans (Deep Page at Position 9,000)

| Metric | Legacy `OFFSET 9000` | Keyset Cursor (`(date < ? OR (date = ? AND id < ?))`) |
| :--- | :--- | :--- |
| `type` | `ALL` | `range` |
| `key` | `NULL` (full scan) | `idx_att_user_date_id` |
| `key_len` | `NULL` | `19` |
| `rows` examined | `10,153` | `1,000` (~90.2% fewer rows) |
| `Extra` | `Using where; Using filesort` | `Using index condition; Using where` (no filesort) |

### 2.2 Query Latency & Payload Size

- **20-iteration warm average (`OFFSET 9000`, `LIMIT 20`):** `44.375 ms`
- **20-iteration warm average (Keyset cursor at row 9,000, `LIMIT 21`):** `40.467 ms` (`1.1x` faster on warm in-memory InnoDB buffer pool, with `Using filesort` eliminated)
- **Full 10,000-row minimal JSON payload:** `670,001 bytes` (~654.3 KB)
- **Single 20-row cursor page JSON payload:** `1,341 bytes` (~1.31 KB)
- **Payload reduction:** `99.8%`

### 2.3 `EXPLAIN` Verification on Other Indexed Tables

| Table | `type` | `key` | `Extra` |
| :--- | :--- | :--- | :--- |
| `leave_leave` | `ref` | `idx_leave_user_created_id` | `Using where; Using index` |
| `accounts_employeedocument` | `ref` | `idx_doc_user_uploaded_id` | `Using where; Using index` |
| `audit_logs` | `index` | `idx_audit_created_id` | `Using index` |
| `notifications` | `ref` | `idx_notifications_tenant_recipient` | `Using where; Using index` |
