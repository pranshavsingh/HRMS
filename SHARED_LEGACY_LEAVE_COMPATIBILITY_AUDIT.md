# Shared Legacy Leave Pool & Typed Leave Application Compatibility Audit

> **Audit Mode:** Strictly READ-ONLY investigation. No source code, database records, employee balances, or published policies were modified, and no live leave applications were created.

---

## 1. Executive Summary

When **Keep Shared Legacy Pool (`legacy_shared_pool_enabled = 1`)** is enabled on the active published policy (`v1`, effective `2026-04-01`), **all three active leave types (`casual`, `sick`, `paid`) appear in the employee Apply Leave dropdown and map to the single shared legacy pool (`__legacy_shared__`)**. Having `annual_entitlement = 0` on those three typed rows does **not** block leave applications, because typed-policy rules and typed-entitlement allocations are bypassed while `legacy_shared_pool_enabled = 1`.

---

## 2. Detailed Investigation Findings (Items 1–15)

### 2.1 How the Legacy Shared Balance Is Stored
- **Profile base allocation:** `accounts_employeeprofile.leave_allotted` (`f:\hrms\node_backend\src\services\financial-leave.service.js:55, 86, 355, 389`).
- **FY entitlement record:** `workforce_employee_leave_entitlement` with `leave_code = '__legacy_shared__'` (`financial-leave.service.js:7, 83, 128-130, 353-368`). On first lookup or annual reset, `opening_balance` and `annual_entitlement` are initialized from `accounts_employeeprofile.leave_allotted` (unless overridden in `workforce_employee_leave_eligibility`).
- **Ledger transactions:** `workforce_leave_ledger_transaction` with `leave_code = '__legacy_shared__'` (`financial-leave.service.js:309, 315-318, 369-372`).
- **Management concessions:** `leave_concession_ledger` (`financial-leave.service.js:383-384`).
- **Approved leave fallback:** `leave_leave` rows with `status = 'approved'` (`financial-leave.service.js:373-380`), where `liveApproved = Math.max(ledgerUsed, directApprovedDays)`.

### 2.2 How `__legacy_shared__` Is Handled
- Defined as `export const LEGACY_LEAVE_CODE = "__legacy_shared__"` (`financial-leave.service.js:7`).
- When `policy.legacy_shared_pool_enabled` is truthy:
  - `ensureYearEntitlement()` (`lines 83, 86`) forces `code = LEGACY_LEAVE_CODE` and `annual = Number(profile.leave_allotted || 0)`.
  - `runTenantReset()` (`line 142`) synthesizes a single `LEGACY_LEAVE_CODE` entry instead of iterating `workforce_leave_type_policy`.
  - `getBalance()` (`lines 353, 373`) maps any `leaveType` (`casual`, `sick`, `paid`, or `null`) to `LEGACY_LEAVE_CODE` and counts all approved `leave_leave` rows (`includeAllTypes = !leaveType || code === LEGACY_LEAVE_CODE`).
  - `recordApprovedLeave()` (`lines 309, 315-318`) records the `consumption` ledger row under `leave_code = '__legacy_shared__'`, while `leave_leave.leave_type` retains the employee's selected type (`casual`, `sick`, or `paid`).

### 2.3 How the Employee Apply Leave Form Loads Available Leave Types
- Frontend `f:\hrms\hrms_saas\src\pages\Leave.jsx:187-203` calls `GET /api/leave/policy/available-types/` (`financial-leave.routes.js:11`, `financial-leave.controller.js:7-10`, `financial-leave.service.js:272-281`).
- `availableTypes()` queries `workforce_leave_type_policy` for the active published policy and returns all rows with `active_status = 1` (`casual`, `sick`, `paid`), regardless of `legacy_shared_pool_enabled`.

### 2.4–2.6 Leave Type Mapping, Balance Source, and Zero Annual Entitlement
- `leaveService.applyLeave()` (`f:\hrms\node_backend\src\services\leave.service.js:126-193`) calls `financialLeaveService.leaveTypePolicy()` (`line 140`) and `balanceFor()` -> `financialLeaveService.getBalance()` (`line 160`).
- Because `policy.legacy_shared_pool_enabled` is truthy:
  1. The typed-policy validation block at `leave.service.js:141-158` (`if (policy && !policy.legacy_shared_pool_enabled)`) is **skipped**.
  2. `getBalance()` checks the **shared legacy balance** (`__legacy_shared__`), **not** the `0.00` `annual_entitlement` on `casual`/`sick`/`paid`.
  3. **Zero annual entitlement does NOT block applications.** Even when `available_balance <= 0`, `applyLeave()` throws `409 INSUFFICIENT_LEAVE_BALANCE` with a `confirmation_snapshot` (`leave.service.js:170-183`), and `Leave.jsx:317-319` allows the employee to resubmit with `confirm_insufficient_balance: true`.

### 2.7–2.9 Pending Reservation, Approval Deduction, Rejection & Cancellation
- **Pending reservation:** **No.** `getBalance()` (`financial-leave.service.js:385-388, 411-413`) computes `pending_days` for display only; `available_balance = base - used + concession` does **not** subtract pending requests.
- **Deduction timing:** **Only on approval.** `applyLeave()` (`leave.service.js:191`) inserts a `pending` row in `leave_leave` without touching `workforce_leave_ledger_transaction`. Only `leaveService.action()` with `status === "approved"` (`leave.service.js:625-627`) calls `financialLeaveService.recordApprovedLeave()`, inserting a `consumption` row (`amount = -portion.days`) into `workforce_leave_ledger_transaction`.
- **Rejection:** `leaveService.action()` with `status === "rejected"` (`leave.service.js:591-637`) updates `leave_leave.status = 'rejected'` and skips `recordApprovedLeave()`. Because no balance was deducted or reserved on apply, no ledger reversal is needed and `available_balance` stays unchanged.
- **Cancellation:** `f:\hrms\node_backend\src\routes\leave.routes.js:1-17` exposes **no leave cancellation endpoint**; employees cannot self-cancel via API.

### 2.10–2.13 Partial/Half-Day, Probation, Minimum Days, Max Consecutive Days
- **Partial-day / half-day:** Not supported in application submission. `applyLeaveSchema` (`validation.js:300-314`) accepts only whole `YYYY-MM-DD` `from_date` and `to_date`, and `leaveDays()` (`leave.service.js:25-29`) computes integer calendar days (`floor((to - from)/day) + 1`).
- **Probation restriction:** Evaluated in `leave.service.js:153-157` and `financial-leave.service.js:110-114` only when `!policy.legacy_shared_pool_enabled`. When `probation_restriction_months = 0` (and/or `legacy_shared_pool_enabled = 1`), no restriction applies.
- **Minimum application days:** Checked in `leave.service.js:143` only when `!policy.legacy_shared_pool_enabled`. Under `applyLeaveSchema` (`from_date <= to_date`), all requests are at least `1` calendar day.
- **Max consecutive days (`null`):** `leave.service.js:144` checks `type.maximum_consecutive_days != null && requestedDays > Number(type.maximum_consecutive_days)` (also skipped when `legacy_shared_pool_enabled = 1`). When blank/`null`, there is **no upper limit**.

### 2.14–2.15 Annual Reset & Future Typed Policy Interaction
- **Annual reset:** `runTenantReset()` (`financial-leave.service.js:142`) initializes `workforce_employee_leave_entitlement` for `leave_code = '__legacy_shared__'` using `profile.leave_allotted` (plus any `workforce_employee_leave_eligibility` override). Carry-forward (`line 116`) and periodic accruals (`line 203`) are skipped while `legacy_shared_pool_enabled = 1`.
- **Future typed policy:** `getPolicyForYear()` (`financial-leave.service.js:72-76`) selects the published policy where `effective_from_fy_start <= yearStart`. `splitFinancialYearDays()` (`lines 283-301`) splits cross-FY leave applications by day:
  - Days in the current legacy FY use `legacy_shared_pool_enabled = 1` (`__legacy_shared__`).
  - Days in the future typed FY use the future policy (`legacy_shared_pool_enabled = 0`), enforcing typed rules (`active_status`, `minimum_application_days`, `maximum_consecutive_days`, team/designation/probation) and checking/deducting the typed `workforce_employee_leave_entitlement` row (`casual`, `sick`, `paid`) **without** remapping prior-year `__legacy_shared__` balances.

---

## 3. Scenario Matrix (Scenarios A–F)

| Scenario | Can Apply? | Balance Checked | Reserved on Apply? | Deducted When? | After Approval | After Rejection | Ledger Updated |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A:** Legacy=19, Casual=0, Apply 2d Casual | **Yes** | Shared legacy (`__legacy_shared__`, 19d) | **No** | On approval | Shared balance becomes `17` | Shared balance remains `19` | `workforce_leave_ledger_transaction` (`__legacy_shared__`, `-2`) on approval only |
| **B:** Legacy=0, Casual=0, Apply 1d Casual | **Yes** (after `409` confirmation prompt with `confirm_insufficient_balance=true`) | Shared legacy (`__legacy_shared__`, 0d) | **No** | On approval | Shared balance becomes `-1` | Shared balance remains `0` | `workforce_leave_ledger_transaction` (`__legacy_shared__`, `-1`) on approval only |
| **C:** Legacy=19, Apply 2d Sick | **Yes** | Shared legacy (`__legacy_shared__`, 19d) | **No** | On approval | Shared balance becomes `17` | Shared balance remains `19` | `workforce_leave_ledger_transaction` (`__legacy_shared__`, `-2`) on approval only |
| **D:** Existing pending request, Apply again | **Yes** (unless overlapping *approved* leave) | Shared legacy (`19 - approved`, pending ignored) | **No** | On approval of each request | Each approved request deducts from shared pool | Rejected request leaves pool untouched | `workforce_leave_ledger_transaction` (`__legacy_shared__`) per approved request |
| **E:** Manager rejects application | N/A (already applied) | Shared legacy | **No** | Never deducted | N/A | `leave_leave.status = 'rejected'`; balance unchanged | None (only `audit_logs` records `leave_approval_rejected`) |
| **F:** Legacy pool active + future FY typed policy published | **Yes** (for dates in either FY, subject to future FY typed rules) | Legacy FY portion -> `__legacy_shared__`; Future FY portion -> typed `leave_code` | **No** | On approval, split by FY | Legacy FY deducts `__legacy_shared__`; Future FY deducts typed `leave_code` | Balance unchanged in both FYs | `workforce_leave_ledger_transaction` records separate rows per FY portion (`__legacy_shared__` vs typed `leave_code`) |
