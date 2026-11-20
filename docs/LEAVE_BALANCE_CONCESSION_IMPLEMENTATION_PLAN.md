# Leave Balance Visibility and Concession Implementation Plan

## Inspection findings

- Leave requests are stored in `leave_leave`; approved requests are also written to attendance records during the existing approval transaction.
- The current base allocation is `accounts_employeeprofile.leave_allotted`, one shared pool per employee. Approved inclusive calendar days are subtracted. Pending requests are not deducted. The current employee summary clamps the displayed balance at zero.
- Leave types are recorded on requests, but there is no per-type entitlement, accrual, carry-forward, leave year, or leave ledger. This plan preserves the shared base pool and does not invent those policies.
- Approval is already protected by a transaction, a locked leave row, and a conditional pending-to-final status update. Audit records are written transactionally.
- Approval rows currently omit employee ID, designation, and balance detail. The employee details modal already shows base leave allocation.
- There is no leave-specific notification service. The application has a Redis-backed realtime event channel and leave updates; it can deliver online notifications without creating a second notification system.
- Current approval roles are manager, HR, admin, and superadmin, with direct-report/site restrictions. Management concession permission will be explicitly limited to HR, admin, and superadmin, with backend checks and the existing site visibility service.

## Proposed changes

### Data and calculation

1. Add migration `019_leave_concession_ledger.sql` for append-only concession grants and reversals, including tenant and employee references, leave type, signed adjustment days, effective/optional expiry dates, mandatory reason, actor, timestamp, balance-before/after snapshot, idempotency key, and an optional reference to the reversed grant. Add constraints and indexes for tenant-scoped lookup and one-time reversal. The standalone base schema initializer cannot safely create this tenancy-dependent table before migrations 006 and 018, so the migration is the schema creation path.
2. Do not change `leave_allotted`; it remains the base shared entitlement. A requested leave type's available amount is base allocation plus valid concessions for that type minus approved consumption under the existing shared-pool accounting. Show type-scoped concession and requested leave alongside the shared base pool so the calculation is transparent. Do not count pending requests as consumed; show their days separately.
3. Add shared server-side calculation helpers used by employee summary, application validation, approval listing, and post-approval audit. Preserve existing inclusive calendar-day counting and do not add a leave-year reset.

### API and security

1. Keep existing endpoints and response fields compatible; add balance summary fields to `/leave/my/` and approval rows.
2. Add an optional `confirm_insufficient_balance` field to leave application submission. First insufficient submission returns HTTP 409 with code `INSUFFICIENT_LEAVE_BALANCE` and the current/requested/projected values. A second submission with explicit confirmation proceeds as pending. No deduction happens on submission and the request is not automatically rejected.
3. Add a concession grant endpoint and an auditable reversal endpoint. Require HR/admin/superadmin on the backend, reject self-grants, validate positive finite day amounts and date/reason fields, enforce tenant and site visibility, and make repeated idempotency keys safe.
4. For leave approval, keep the existing row lock and status transition. Lock the employee profile in the same transaction when obtaining the before/after shared-pool balance, then record those snapshots in the existing audit event. Do not block approval solely because the projected balance is negative.
5. Send employee-targeted realtime updates after a grant, reversal, approval, or rejection with relevant leave type, days, balance, and status. This is online delivery through the existing channel; no persistent notification history or email capability is claimed.

### UI

1. In the web and mobile Leave screens, show the current base allocation, valid concession total, used, pending days, and available balance. For an insufficient submission, show the required “Insufficient Leave Balance” confirmation with Cancel Application and Continue & Submit. Confirmation includes a balance snapshot so a changed balance is re-confirmed.
2. In web and mobile Leave Approvals, display employee ID, name, team (the current schema has no department field), designation, request/application details, and a balance summary: base entitlement, concession for the requested type, used, pending, available, requested, projected. Highlight negative projected balances without preventing the decision.
3. Add a “Leave Concession / Additional Leave Allocation” action to the existing employee details modal for authorized roles. Include employee, leave type, additional days, effective date, optional expiry, and mandatory reason; show actor as the authenticated user. Provide a reversal action that creates an adjustment record instead of editing history.
4. Refresh relevant leave views on existing realtime updates and show targeted employee notices when connected.

### Tests and compatibility

- Add automated tests for sufficient/zero/insufficient balance, explicit confirmation, pending-versus-approved treatment, valid/expired concessions, type-scoped concessions, reversal/idempotency, approval balance visibility, negative approval, and existing leave status/deduction behavior.
- Keep old API fields and existing approval/application workflows intact. Add no new notification service and no modification to original entitlement values.
- Run targeted backend tests and frontend build only; do not run migrations against the configured remote database. The new migration must be reviewed and applied separately in the intended environment.

## Dependencies and limitations

- The current schema has one shared `leave_allotted` value and does not model department, per-type base entitlements, carry-forward, accrual, or leave-year boundaries. Those remain unchanged and require a separate policy decision if needed.
- Concessions are per leave type while the legacy base entitlement and approved consumption are shared. The UI/API must label this mixed calculation clearly; a future fully type-specific leave ledger would require a broader migration and policy agreement.
- Realtime notifications are best-effort for connected users; there is no persisted leave notification inbox in the inspected architecture.

## Authorization boundary

This plan is documentation of the inspected architecture and proposed implementation. Implementation will preserve existing workflows and compatibility. No production database migration will be applied without separate authorization.
