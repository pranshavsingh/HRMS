# Financial-Year Leave Accounting and Company Policy Implementation Plan

## Scope

Extend the existing leave application, approval, and concession workflows with financial-year entitlements, company-managed leave policies, carry-forward rules, and retryable annual initialization. The financial year is 1 April through 31 March. This is a design record written before code changes.

## Current architecture findings

- `accounts_employeeprofile.leave_allotted` is the only base entitlement and is a single shared employee-specific amount. It is currently consumed by approved leave across all leave types.
- `leave_leave` stores dated applications and status. Approval posts one attendance leave row per calendar day. There is no financial-year attribution for approval consumption.
- Management concessions are recorded in the new `leave_concession_ledger` (migration 019); they have effective and optional expiry dates but no financial-year balance snapshot.
- `attendance.service.js`, the web and mobile Leave views, and several dashboards still read `leave_allotted` directly. Those consumers must use the same year-aware calculation to avoid inconsistent balances.
- Existing background processing runs in the dedicated worker via `node-cron`; jobs use a Redis lock where available. The tenant schema has no configured company timezone. `Asia/Kolkata` matches the app's current operating context but must remain editable per tenant.
- Existing RBAC uses backend role authorization and tenant context. HR/Admin/Super Admin can manage company attendance policies; department is not a stored field, while team and designation are.
- No leave-policy editor, leave-type policy versions, financial-year entitlement snapshots, carry-forward ledger, or annual reset execution log currently exists.

## Proposed architecture

### 1. Versioned company leave policies

Add tenant-scoped policy versions with draft/published status, effective financial year, FY start month/day, timezone, automatic reset, and proration configuration. Child rows define leave types and their entitlement, paid status, carry-forward cap/expiry, minimum/maximum days, half-day, approval/document requirements, active status, accrual cadence, and eligibility rules. Add immutable audit/version history, policy preview, and publish endpoints. Published versions are effective-dated and do not rewrite historical versions or entitlements.

Policy read/write APIs and the Company Leave Policy tab are restricted on the backend and frontend to HR, Admin, and Super Admin. Policy changes require a reason and authorized actor.

### 2. Financial-year entitlement and transaction ledger

Add one entitlement snapshot per tenant, employee, leave type, and financial year. Record policy version, base entitlement, proration, eligible carry-forward, opening balance, and initialization status. Add append-only transactions for opening entitlement, accrual, carry-forward, approved consumption, forfeiture, and correction/reversal. Enforce idempotency with unique source/year/type keys.

Approved applications spanning 31 March/1 April are split into daily consumption totals for each financial year inside the existing approval transaction. Pending requests remain visible and are not consumed. The leave application itself remains unchanged as historical evidence. Valid management concessions continue to be evaluated by effective/expiry dates and are included without changing prior grants.

### 3. Legacy allocation and migration

Do not overwrite `leave_allotted`. Preserve legacy balances with an explicit one-time transition into the new entitlement model, record that migration as a ledger opening entry, and keep all original leave/concession records intact. The exact mapping of the current shared allocation into per-type entitlements is a policy decision that must be resolved before initializing employee balances or activating the new calculation.

Backfill approved leave usage into year-specific ledger entries by splitting each existing approved date range across financial years. Use deterministic idempotency keys so a rerun cannot duplicate consumption. Reconcile opening/consumption totals against the pre-transition balance before enabling the year-aware read path.

### 4. Annual reset worker and recovery

Run a reconciliation job in the existing dedicated background worker. Check each tenant's configured local date/timezone and initialize any due FY whose reset date has passed. Use bounded batches, a per-tenant/FY run record, per-employee results, database transactions, and unique FY entitlement keys. Retry failed employee batches safely. Exclude inactive accounts/employees from new eligibility while retaining their history. Leave pending applications untouched. Record counts, errors, started/finished times, and attempt state.

Expose a backend-only HR/Admin/Super Admin manual preview/reconcile/retry operation. Notify authorized users through the existing realtime infrastructure when a run fails; execution history remains persisted for disconnected users to review later.

### 5. Shared balance calculation and UI

Use one server-side calculator for leave submission, approvals, employee summaries, attendance/dashboard balance values, and reports. It calculates balances by type and financial year from the entitlement snapshot plus valid concessions and carry-forward, minus ledgered approved consumption and forfeitures. Cross-year applications show per-year portions and projected results. Existing dashboard and attendance APIs must stop independently subtracting from `leave_allotted`.

Add Company Leave Policy as a management-only tab in the existing Leave module with policy dashboard, financial-year/timezone settings, leave-type editor, eligibility settings, carry-forward configuration, version history, impact preview, and publish action. Preserve current Leave and Leave Approvals routes and workflows. The existing Team field is used where policy targeting needs an organizational grouping; do not fabricate a department field.

### 6. RBAC and traceability

Enforce policy reads/writes, employee exceptions, reset reconciliation, and retries on the backend using tenant context and HR/Admin/Super Admin authorization. Site-scoped HR visibility must follow existing site access checks. Record policy actor/reason/effective FY; entitlement policy version; reset-run and employee outcomes; ledger transaction source, before/after balance, amount, reason, and timestamp. Reversals are new transactions, never edits/deletes.

### 7. Tests and rollout

Add isolated tests for FY date/timezone boundaries, policy version behavior, carry-forward caps/expiry, proration, eligibility, idempotent duplicate reset, batch retry, pending requests, cross-year leave splitting, valid concessions across years, and consistent balance results across all consumers. Add migration preflight/backfill reconciliation and postflight checks before deploying the new reader/writer paths.

Create a new additive migration after 019. Do not run it on the configured database until its backfill/mapping behavior is confirmed and separately authorized. No historical policy or ledger rows should be rewritten by policy publication.

## Legacy allocation decision

The project owner selected **Keep current allocation as a shared legacy balance**. Preserve `leave_allotted` as the shared entitlement bucket for the transition year; snapshot its value into that year's `__legacy_shared__` entitlement, record pre-year approved usage as a one-time transition adjustment, and attribute current-year leave consumption to the shared bucket while the legacy-pool policy is active. Keep typed concessions visible and valid by their effective/expiry dates. Do not split or rewrite prior allocations by leave type. Future policy versions may opt into per-type entitlements after HR configures them; that effective change must not alter the legacy year's snapshot.

## Implementation status

The code and additive migration file are prepared. The web Leave module now has a management-only Company Leave Policy tab, policy version draft/preview/publish endpoints, employee balance view, employee eligibility exceptions, reset history/retry controls, and employee leave-type loading. The backend contains FY-aware entitlement snapshots, shared legacy-balance handling, cross-FY approved-consumption ledger entries, reset reconciliation, accrual/expiry processing, and use of the shared balance service in leave submission, approvals, and attendance dashboard calculations.

The owner selected the existing `leave_allotted` allocation as a shared legacy balance. The migration snapshots it into `__legacy_shared__` for the current FY, records prior approved usage as a one-time transition adjustment, and backfills approved leave that overlaps the current FY. It does not split old allocations by leave type. The new migration is not applied to any database in this task.

Focused pure tests cover 1 April boundaries, cross-year segmentation, invalid date ranges, timezone conversion, and existing balance arithmetic. They do not verify the SQL migration against a live database, transaction locking under concurrent load, worker behavior against Redis, UI/API end-to-end flows, or deployment configuration.

Known limitations before production acceptance:

- Leave application document upload/association is not present in the existing application flow. `requires_document` is stored/configurable, but this task does not add an upload workflow or claim that this requirement is enforced.
- Carry-forward with `carry_forward_requires_approval` is withheld from opening balance; an approval queue for that carry-forward is not included.
- Department-specific targeting is not supported because the current employee profile has no department field. Team and designation eligibility rules are supported.
- The current pure tests do not establish migration correctness on the configured database. Migration 020 must be reviewed, separately authorized, and applied before the new endpoints/workers can run against a database.
- Policy preview estimates aggregate entitlement by type using configured team/designation rules, probation restrictions, and monthly proration. It excludes carry-forward, employee exceptions, pending requests, concessions, and each employee's used balance, so it is not a final per-employee balance simulation.
