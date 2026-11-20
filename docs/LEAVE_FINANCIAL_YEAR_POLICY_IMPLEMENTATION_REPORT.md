# Financial-Year Leave Reset and Company Policy — Implementation Report

**Status:** Source implementation prepared; database migration not applied  
**Decision carried forward:** Preserve `accounts_employeeprofile.leave_allotted` as a shared legacy balance.  
**Default financial year:** 1 April through 31 March, `Asia/Kolkata`

## Implemented

- Added additive migration 020 for tenant-scoped policy versions, leave-type rules, employee eligibility overrides, financial-year entitlement snapshots, immutable leave transactions, reset runs, and employee reset outcomes.
- Seeded the current financial year using the shared legacy balance. Approved leave overlapping the current financial year is backfilled as shared-pool consumption, and pre-year approved usage is recorded as a one-time opening adjustment so the transition-year available balance retains its previous meaning. Existing leave records and prior allocations are not rewritten or split across leave types.
- Added backend policy read, draft, preview, publish, balance, eligibility, reset-history, retry, and employee leave-type endpoints. Management endpoints require HR, Admin, or Super Admin authorization.
- Added scheduled reset reconciliation in the existing worker with per-tenant timezone handling, transaction-protected employee initialization, batches, idempotent entitlement rows, retryable outcomes, and realtime failure alerts.
- Added policy configuration for FY start, timezone, automatic reset, proration, leave types, entitlement, paid/unpaid, carry-forward options, accrual cadence, probation restriction, team/designation rules, and approval/document flags.
- Added a management-only **Company Leave Policy** tab in the existing Leave page, with policy summary, draft editing, preview/publish, employee balances, eligibility exceptions, and reset history/retry.
- Updated employee leave type loading, application balance checks, cross-year approval consumption, leave approval balance summaries, and attendance dashboard balance calculations to use the shared financial-year service.
- Added focused tests for FY boundaries, cross-year date segmentation, invalid ranges, timezone conversion, and the prior balance arithmetic cases.

## Relevant changed files

- `node_backend/scripts/migrations/020_financial_year_leave_policies.sql`
- `node_backend/src/services/financial-leave.service.js`
- `node_backend/src/services/leave.service.js`
- `node_backend/src/controllers/financial-leave.controller.js`
- `node_backend/src/routes/financial-leave.routes.js`
- `node_backend/src/middleware/validation.js`
- `node_backend/src/utils/cron.js`
- `node_backend/src/services/attendance.service.js`
- `node_backend/src/controllers/attendance.controller.js`
- `hrms_saas/src/pages/Leave.jsx`
- `hrms_saas/src/pages/leave/CompanyLeavePolicy.jsx`
- `node_backend/tests/leave/financial_year.test.js`
- `docs/LEAVE_FINANCIAL_YEAR_POLICY_IMPLEMENTATION_PLAN.md`

## Verification performed

- `node --check` passed for the changed financial leave service, leave service, controller, routes, and worker scheduler.
- `node --test tests/leave/*.test.js`: 8 passed, 0 failed.
- `npm run build` in `hrms_saas`: passed. Vite reported the existing large-bundle warning.
- No live database migration, full integration test, concurrency test, Redis worker test, or runtime test was performed.

## Database and deployment

Migration 020 is a file only and has **not** been applied. Policy-management endpoints and reset history/retry require its tables. The existing balance service falls back to the prior shared-balance calculation until the schema is present, so regular leave requests can continue during a staged migration. Apply migration 020 only after reviewing the backfill against the configured database and explicitly authorizing that database operation. Do not run the broad migration runner without checking which older untracked migrations it would apply.

## Limitations before acceptance

- The current leave application has no supporting-document upload/association flow. The `requires_document` flag can be configured, but document submission/enforcement is not implemented.
- When `carry_forward_requires_approval` is enabled, the carry-forward amount is withheld; a manager approval queue for releasing that amount is not implemented.
- Department targeting is unavailable because the current employee profile schema has no department field. Team/designation rules are supported.
- Policy preview estimates aggregate entitlement by type using team/designation rules, probation restrictions, and monthly proration. It does not calculate each employee's old versus new balance and excludes carry-forward, employee exceptions, pending requests, concessions, and used leave.
- Tests do not verify SQL migration execution, live transaction behavior, locking under concurrent approvals, or deployment/worker configuration.

Accordingly, this is not a production acceptance statement. The code requires the database migration and the listed follow-up verification before the feature can be considered production-ready.
