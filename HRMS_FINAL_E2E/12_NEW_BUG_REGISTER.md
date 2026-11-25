# 12. New Bug Register

*(All 23 prior remediation bug IDs remain unchanged. Newly discovered defects in this verification pass are assigned new IDs starting at `BUG-E2E-001`.)*

| Bug ID | Severity | Module | Summary | Status |
|---|---|---|---|---|
| `BUG-E2E-001` | Medium | Leave Balance (`node_backend/src/services/leave.service.js`) | `calculateLeaveBalance()` called `leaveDays(l.from_date, l.to_date)` instead of `daysThrough(l.from_date, l.to_date, asOf)` on line 48, causing `tests/leave/leave_balance.test.js` (`approved dates are counted only through the balance date`) to fail (`leaves_used` returned `3` instead of `2`). | **FIXED & VERIFIED** (`leave_balance.test.js` 4/4 PASS) |
| `BUG-E2E-002` | Low (Test Hygiene) | Regression Suite (`node_backend/tests/bugs/remediation_regression.test.js`) | `grantConcession` test mocks `db.transaction`, `siteService`, `auditService`, and `realtimeManager`, but did not mock `db.get` for `financialSchemaReady()` / `legacyBalance()`, causing it to hit live `db.get()` (`ECONNREFUSED 127.0.0.1:3306` when `MYSQL_HOST=127.0.0.1`, or querying `srv999.hstgr.io` when `.env` is active). | **FIXED & VERIFIED** (`remediation_regression.test.js` 17/17 PASS) |
