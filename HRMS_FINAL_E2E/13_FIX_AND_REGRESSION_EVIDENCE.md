# 13. Fix and Regression Evidence

## Fix Applied: `BUG-E2E-001`
- **File:** [leave.service.js](file:///f:/hrms/node_backend/src/services/leave.service.js#L47-L48)
- **Root Cause:** Uncommitted change on `fix/hrms-5-cross-platform-bugs` replaced `daysThrough(l.from_date, l.to_date, asOf)` with `leaveDays(l.from_date, l.to_date)` in `calculateLeaveBalance()`, breaking `asOf` date clamping while leaving `daysThrough()` unused.
- **Smallest-Scope Fix:** Restored `daysThrough(l.from_date, l.to_date, asOf)` on line 48 of `node_backend/src/services/leave.service.js`.
- **Re-Test Evidence:**
  - `node --test tests/leave/*.test.js` -> **8/8 PASS** (4/4 in `leave_balance.test.js`, 4/4 in `financial_year.test.js`, exit code `0`).

## Fix Applied: `BUG-E2E-002`
- **File:** [remediation_regression.test.js](file:///f:/hrms/node_backend/tests/bugs/remediation_regression.test.js#L50-L92)
- **Root Cause:** `grantConcession` test mocked `db.transaction` but left `db.get` unmocked, causing `financialSchemaReady()` and `legacyBalance()` to hit `db.get()` against live/unreachable MySQL.
- **Smallest-Scope Fix:** Mocked `db.get` in `grantConcession` test (with `mock.restore()` in `finally`) to isolate the unit test from MySQL.
- **Re-Test Evidence:**
  - `node --test --test-force-exit tests/bugs/remediation_regression.test.js` -> **17/17 PASS** (exit code `0`).
