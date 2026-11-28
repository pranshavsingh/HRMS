# Pagination API Documentation

## 1. Overview

HRMS list endpoints support **two pagination modes**:
1. **Legacy Offset Mode (Default / Web):** Activated when neither `cursor` nor `cursor_mode` is passed. Returns the existing offset response envelope.
2. **Cursor / Keyset Mode (Mobile):** Activated when `cursor_mode=true` (or `cursor_mode=1`) or `cursor=<token>` is passed.

## 2. Request Parameters (Cursor Mode)

| Parameter | Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `cursor_mode` | `boolean \| "true" \| "1"` | `false` | Optional on page 1 | Enables cursor response envelope without requiring a `cursor` on the initial request. |
| `cursor` | `string` | `null` | Signed opaque token | Returned as `pagination.nextCursor` from the previous page. Implies `cursor_mode=true`. |
| `limit` | `integer` | `20` | Clamped to `1..100` | Number of items per page. Backend queries `limit + 1` rows internally to determine `hasMore`. |

## 3. Response Envelope (Cursor Mode)

```json
{
  "success": true,
  "data": [ ... ],
  "records": [ ... ],
  "pagination": {
    "mode": "cursor",
    "limit": 20,
    "nextCursor": "eyJ2IjoxLCJzIjoiYXR0X2hpc3Rvcnk6NzU4IiwidmFsIjpbIjIwMjYtMTAtMTYiLDIwN119.L0Q2VjT0XKGFSFm2",
    "hasMore": true,
    "count": 20
  }
}
```

### Error Responses (`400 Bad Request`)
- Malformed Base64URL or JSON structure: `"Invalid pagination cursor"`
- Invalid HMAC-SHA256 signature (tampered token): `"Invalid pagination cursor signature"`
- Scope mismatch (e.g., using User A's cursor on User B or another endpoint): `"Pagination cursor scope mismatch"`

## 4. Supported Endpoints

| Module | Method & Path | Sort Key | Scope Prefix |
| :--- | :--- | :--- | :--- |
| Attendance History | `GET /api/attendance/history/` | `(date DESC, id DESC)` | `att_history:<userId>` |
| Attendance Approvals | `GET /api/attendance/approvals/` | `(date DESC, id DESC)` | `att_approvals:<scope>` |
| Employees Directory | `GET /api/auth/employees/` | `(id ASC)` | `emp_list` |
| My Leaves | `GET /api/leave/my/` | `(created_at DESC, id DESC)` | `leave_my:<userId>` |
| Leave Approvals | `GET /api/leave/approvals/` | `(created_at DESC, id DESC)` | `leave_approvals:<scope>` |
| Notifications | `GET /api/notifications` | `(created_at DESC, id DESC)` | `notif:<userId>` |
| My Documents | `GET /api/auth/documents/my/` | `(uploaded_at DESC, id DESC)` | `docs_my:<userId>` |
| Employee Documents | `GET /api/auth/documents/` | `(uploaded_at DESC, id DESC)` | `docs_emp:<filter>` |
| Audit Logs | `GET /api/auth/audit-logs/` | `(created_at DESC, id DESC)` | `audit_logs` |

## 5. Cursor Token Format

Tokens are formatted as `<base64url(JSON)>.<base64url(HMAC-SHA256[0..12])>`:
```json
{
  "v": 1,
  "s": "att_history:758",
  "val": ["2026-10-16", 207]
}
```
The HMAC secret defaults to `JWT_ACCESS_SECRET` / `JWT_SECRET` (or dev fallback when unset) and is verified with `crypto.timingSafeEqual`.
