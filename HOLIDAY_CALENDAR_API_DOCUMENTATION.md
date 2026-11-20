# Company Holiday Calendar — API Documentation

Base path: `/api/v1/workforce/holidays`  
Authentication: `Authorization: Bearer <access-token>`  
Tenant scope: resolved from authenticated workforce membership. A superadmin may select a tenant using `X-Tenant-ID` or `tenant_id`; non-superadmins cannot switch tenant.

## Routes

| Method and path | Access | Behavior |
|---|---|---|
| `GET /` | Authenticated | List holidays. Requires `from` and `to` as `YYYY-MM-DD`; optional `search`, `limit` (1–500). Inclusive date range; maximum 1,096 days. |
| `GET /upcoming` | Authenticated | List holidays from optional `from` (defaults to current UTC date), with optional `limit` (1–200, default 50). |
| `GET /:id` | Authenticated | Retrieve one holiday within the resolved tenant. |
| `POST /` | HR, admin, superadmin | Create a holiday. |
| `PATCH /:id` | HR, admin, superadmin | Update provided holiday fields. |
| `DELETE /:id` | HR, admin, superadmin | Delete a holiday. |
| `GET /tenants` | Superadmin | List active tenant ids, codes, and names for the selector. |

## Holiday fields

Create requires `name` (trimmed, 1–255 chars), `holiday_date` (valid `YYYY-MM-DD`), and `description` (trimmed, 1–1,000 chars). `is_optional` is optional and defaults to `false`. Patch accepts any non-empty subset of these fields. A tenant may have at most one holiday per date; conflicting creation/date update returns HTTP 409.

Example:

```json
{
  "name": "Founders Day",
  "holiday_date": "2026-12-25",
  "description": "Company-wide annual observance",
  "is_optional": false
}
```

Responses use `{ "holiday": {...} }` for create/update/detail and `{ "holidays": [...] }` for list operations. Holiday records include `id`, `tenant_id`, `holiday_date`, `name`, `description`, `is_optional`, `created_at`, `updated_at`, `created_by`, and `updated_by`.

## Errors

Expected validation and access errors include 400 invalid/missing fields or range, 401 missing/invalid authentication, 403 disallowed role or tenant switch, 404 no holiday in the resolved tenant, and 409 duplicate tenant/date. Error payload shape follows the existing API error handler.

## Realtime

Socket.IO uses the server origin, path `/socket.io`, and `auth: { token }`; superadmins may also send `tenantId`. Authenticated clients join only their resolved `tenant:<id>` room. Events are `holiday:created`, `holiday:updated`, and `holiday:deleted`. Each event carries the existing realtime envelope; its `payload` includes `holidayId`. These are refresh notifications, not authoritative full holiday records.
