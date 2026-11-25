# 13. Database and Transaction Report

- **Database:** MySQL Community Server `8.0.46`
- **Database Name:** `hrms_staging`
- **Collation:** `utf8mb4_unicode_ci`
- **Engine:** InnoDB (ACID compliant)
- **Migrations Applied:** 25 versioned SQL migrations (`001` through `025`)
- **Suite:** [tests/concurrency/attendance_concurrency.test.js](file:///f:/hrms/node_backend/tests/concurrency/attendance_concurrency.test.js) (5/5 PASS)

## Key Verification Results

1. **UTC Timezone Synchronization (`BUG-PROD-002` Fix):**
   - Pooled connections execute `SET time_zone = '+00:00'` on initialization.
   - Database `NOW()` and application timestamps are synchronized in UTC.
2. **Transaction Rollback Safety (`BUG-PROD-001` Fix):**
   - In all service transactions (leave approvals, attendance punch exceptions), failure during audit logging or real-time emission rolls back the transaction safely without leaving dirty state.
3. **High-Concurrency Serialization:**
   - 10 simultaneous punch-in requests for the same employee yielded exactly 1 insert, with 9 requests rejected cleanly.
   - Concurrent leave approvals allow only 1 reviewer decision to succeed, rejecting competing transactions with conflict errors.
4. **Advisory Migration Lock:**
   - Migrations acquire `GET_LOCK('hrms_db_migration_lock', 10)` to prevent race conditions during automated deployments.
