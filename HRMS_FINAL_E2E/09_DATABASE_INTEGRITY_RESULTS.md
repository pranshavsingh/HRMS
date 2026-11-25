# 09. Database Integrity Results

## Staging Database Isolation Check
- Local MySQL (`127.0.0.1:3306`) is **not running** (`ECONNREFUSED`).
- `node_backend/.env` points to `srv999.hstgr.io` (`u356351105_attendance`), which is the live/production database.
- Per Production Safety rules, **zero write tests, zero test migrations, and zero record creations/deletions** were executed against `srv999.hstgr.io`.

## Verified Schema & Migration Artifacts
- Migration `025_workforce_roster_constraints.sql` verified present and syntactically valid (`uq_wre_employee_date` -> `uq_wre_roster_employee_date`).
- `master_audit_remediation.test.js` DB checks (`idx_leave_status_user`, `myLeaves`, `getHistory`) and `phase3` outbox/concurrency/pagination DB tests all failed with `ECONNREFUSED 127.0.0.1:3306` when guarded with `MYSQL_HOST=127.0.0.1`.

## Overall Database Verification Status
- **BLOCKED** — Requires provisioning an isolated staging MySQL 8.0 / MariaDB 11.x instance, running `npm run db:init:mysql` + `npm run db:migrate`, and executing the DB integration suites against it.
