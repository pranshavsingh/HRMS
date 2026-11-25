# 08. Database Transaction Verification

**Database:** MySQL Community Server `8.0.46` (`127.0.0.1:3306`, `hrms_staging`, `utf8mb4`, InnoDB, UTC session `time_zone = '+00:00'`).

## Verified Behaviors
1. **Schema & Migrations:** `scripts/init-mysql.js` + `scripts/run-migrations.js` applied all 25 migrations (`001`–`025`) cleanly under distributed advisory lock `hrms_db_migration_lock` (45 tables).
2. **Concurrency & Row Locking (`FOR UPDATE`):** `attendance_concurrency.test.js` (5/5 **PASS**):
   - 10 simultaneous punch-in requests for the same employee -> exactly 1 succeeded.
   - 10 simultaneous punch-out requests -> exactly 1 succeeded.
   - 5 simultaneous leave approval requests -> exactly 1 succeeded (after `BUG-PROD-001` fix).
   - 5 simultaneous attendance exception approval requests -> exactly 1 succeeded (after `BUG-PROD-003` fix).
3. **Transaction Rollbacks & Outbox Atomicity:** `otp_outbox.test.js` (5/5 **PASS**): verified both OTP record and encrypted outbox event roll back atomically on failure; `outbox.test.js` (6/6 **PASS**): verified `PENDING` outbox insertion, unique idempotency constraint, and atomic claim fencing.
4. **Pagination & Query Integrity:** `pagination.test.js` (8/8 **PASS**).
5. **Timezone Consistency Fix (`BUG-PROD-002`):** `node_backend/src/db/index.js` now executes `SET time_zone = '+00:00'` on every pooled MySQL connection so `NOW()` aligns with `mysql2`'s `timezone: "Z"`.
