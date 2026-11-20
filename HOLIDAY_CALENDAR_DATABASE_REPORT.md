# Company Holiday Calendar — Database Report

## Migration

New migration: `node_backend/scripts/migrations/017_workforce_company_holiday_details.sql`.

It extends the table created by migration 008, preserving `UNIQUE (tenant_id, holiday_date)` and the tenant foreign key. Added columns:

| Column | Definition / purpose |
|---|---|
| `description` | Nullable `VARCHAR(1000)` reason/details. API creation requires a non-empty value. |
| `updated_at` | `DATETIME`, current timestamp on insert/update. |
| `created_by` | Nullable `BIGINT`, references `accounts_user(id)` with `ON DELETE RESTRICT`. |
| `updated_by` | Nullable `BIGINT`, references `accounts_user(id)` with `ON DELETE RESTRICT`. |

The migration was applied successfully to a disposable MariaDB 11.8.9 database after creating the base tenant, user, membership, and holiday schema fixtures. `SHOW CREATE TABLE` confirmed the resulting columns, unique index, and foreign keys. Reapplication is designed to tolerate existing columns and named foreign keys.

## Persistence and transaction behavior

Create, update, and delete execute the holiday write and audit log insertion on the same database transaction connection. A duplicate tenant/date key maps to HTTP 409. Realtime publication occurs after transaction completion. Tenant filtering is included in all holiday repository reads, updates, and deletes. Attendance-register lookup filters by tenant and date range.

This confirms application transaction usage in the inspected code and the tested disposable database path; it does not prove production schema compatibility, distributed transaction semantics, race freedom, or runtime safety under contention.

## Environment boundary

Only `127.0.0.1:13307/hrms_holiday_test` was used for database tests. No production connection, migration, or data change occurred. The disposable test container/database are test fixtures and must not be treated as a deployment migration record.
