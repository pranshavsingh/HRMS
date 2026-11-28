# Pagination Rollback Plan

## 1. Safety Guarantees

Because cursor pagination is strictly **opt-in** via `cursor` or `cursor_mode=true`, the Web frontend (`hrms_saas`) and any older mobile builds continue to use legacy offset pagination without any configuration changes.

## 2. Instant Feature-Level Rollback (Zero-Downtime)

1. **Mobile Client Rollback:**
   - Revert mobile screens to pass standard `page` / `limit` parameters instead of `cursor_mode=true` (or deploy the previous OTA/binary release).
   - Backend automatically serves legacy `page`/`limit` offset responses when `cursor` and `cursor_mode` are omitted.

## 3. Backend Code Rollback

If a backend regression occurs in cursor handling:
1. Revert the cursor-mode branches (`if (cursorPag.useCursor) { ... }`) in:
   - `f:\hrms\node_backend\src\services\attendance.service.js`
   - `f:\hrms\node_backend\src\services\leave.service.js`
   - `f:\hrms\node_backend\src\services\notification.service.js`
   - `f:\hrms\node_backend\src\services\accounts.service.js`
   - `f:\hrms\node_backend\src\repositories\accounts.repository.js`
2. Restart the Node.js API server (`npm run check` then process restart).
3. Remove `f:\hrms\node_backend\src\utils\pagination\cursor.js` and `index.js` if no longer referenced.

## 4. Database Index Rollback (Optional)

The composite indexes added by `031_mobile_pagination_indexes.sql` are non-destructive and improve read performance for both cursor and offset queries. If disk space or write overhead ever requires removal, run:

```sql
DROP INDEX idx_att_user_date_id ON attendance_attendance;
DROP INDEX idx_doc_user_uploaded_id ON accounts_employeedocument;
DROP INDEX idx_leave_user_created_id ON leave_leave;
DROP INDEX idx_audit_created_id ON audit_logs;
```
