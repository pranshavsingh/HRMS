# Company Leave Policy – Complete Audit Report

## 1. Existing Architecture

### Frontend (`f:\hrms\hrms_saas`)
- **Entry Tab:** `src/pages/Leave.jsx` (lines 99, 390–395) conditionally renders `<CompanyLeavePolicy />` when `canManagePolicy` (`["hr", "admin", "superadmin"].includes(role)`) is true and `activeTab === "policy"`.
- **Policy Component:** `src/pages/leave/CompanyLeavePolicy.jsx` (lines 1–217) manages:
  - 6 KPI summary cards (lines 163–170)
  - Legacy shared pool banner (line 172)
  - Company policy settings & leave type builder (lines 174–204)
  - Policy version history table (line 206)
  - Searchable, paginated employee balance table (line 208)
  - Annual balance reset / reconciliation card (line 210)
  - Employee eligibility exception form (line 211)

### Backend (`f:\hrms\node_backend`)
- **Routes:** `src/routes/financial-leave.routes.js` (lines 1–22) enforces `authenticate`, `attachTenantContext`, and `authorize(["hr", "admin", "superadmin"])` for all management endpoints (with `GET /available-types/` open to authenticated tenant users).
- **Controller:** `src/controllers/financial-leave.controller.js` (lines 1–42).
- **Service:** `src/services/financial-leave.service.js` (lines 1–638).
- **Validation:** `src/middleware/validation.js` (`leavePolicyDraftSchema` lines 332–354, `employeeLeaveEligibilitySchema` lines 356–363).

---

## 2. API Endpoint Inventory

| Method & Path | Auth / RBAC | Purpose |
| :--- | :--- | :--- |
| `GET /api/leave/policy/available-types/` | Authenticated + Tenant | Active leave types for current FY |
| `GET /api/leave/policy/` | `hr`, `admin`, `superadmin` | Current policy, all versions, active types, next reset, latest reset |
| `POST /api/leave/policy/drafts/` | `hr`, `admin`, `superadmin` | Create new draft policy version (`status='draft'`) |
| `POST /api/leave/policy/:version_id/preview/` | `hr`, `admin`, `superadmin` | Compute employee/entitlement impact of a draft |
| `POST /api/leave/policy/:version_id/publish/` | `hr`, `admin`, `superadmin` | Publish a draft version (`status='published'`) |
| `GET /api/leave/policy/balances/` | `hr`, `admin`, `superadmin` | Searchable, paginated employee balances |
| `GET /api/leave/policy/reset-runs/` | `hr`, `admin`, `superadmin` | List financial-year balance reset runs |
| `POST /api/leave/policy/reset-runs/reconcile/` | `hr`, `admin`, `superadmin` | Trigger or retry FY balance initialization |
| `POST /api/leave/policy/employee-eligibility/` | `hr`, `admin`, `superadmin` | Create employee-specific eligibility/entitlement override |

---

## 3. Database Tables & Live State Inspection

Inspected directly in MySQL `u356351105_attendance`:
- `workforce_leave_policy_version`: Contains `id=1, tenant_id=1, version_number=1, status='published', effective_from_fy_start='2026-04-01', legacy_shared_pool_enabled=1, automatic_reset=1, reason='Initial shared legacy leave balance - no historical type remapping.'`
- `workforce_leave_type_policy`: Contains 3 rows for `policy_version_id=1`: `casual` (`0.00`), `sick` (`0.00`), `paid` (`0.00`), all `active_status=1`.
- `workforce_leave_reset_run`: Contains `id=1, financial_year_start='2026-04-01', policy_version_id=1, status='completed', employee_count=9, success_count=9, failure_count=0`.
- `workforce_employee_leave_entitlement`, `workforce_leave_ledger_transaction`, `workforce_employee_leave_eligibility`, `workforce_leave_reset_employee_result`.
- **Team Storage:** `information_schema.tables` confirmed **no separate team master table** exists; `accounts_employeeprofile.team_name` stores team names directly (`Logistics`, `null`, and leftover test rows `TeamA_1795670809077`, etc.).

---

## 4. Confirmed Bugs & Root Causes

1. **CRITICAL — `Date` Coercion Bug Causes "Not published" Contradiction (`financial-leave.service.js:422-423, 292, 574`):**
   - `mysql2` returns `DATE` column `effective_from_fy_start` as a JavaScript `Date` object.
   - `String(item.effective_from_fy_start).slice(0, 10)` evaluates to `"Wed Apr 01"` instead of `"2026-04-01"`.
   - Lexicographical comparison `"Wed Apr 01" <= "2026-11-27"` evaluates to `false` (`"W" > "2"`), so `getCompanyPolicy()` returns `current: null` and `leave_types: []` even though `v1` is `published` and effective `2026-04-01`.
   - Consequently, `CompanyLeavePolicy.jsx` displays `Current policy: Not published`, `Policy status: Not published`, and falls back to the client-side default template (`lines 60-67`).

2. **KPI & Status Conflation (`CompanyLeavePolicy.jsx:163-170`):**
   - `Current policy` and `Policy status` did not distinguish between a **published legacy shared-pool policy**, a **published typed leave policy**, and a **pending draft**.
   - `Annual entitlement` showed `0 days` without explaining when `legacy_shared_pool_enabled` is active or when typed entitlements are unconfigured (`0`).

3. **Duplicate `leave_code` Risk & Leave Type Builder UX (`CompanyLeavePolicy.jsx:6-13, 185-201`):**
   - Adding a leave type always inserts `leave_code: "new_leave"` with no duplicate check or remove button, and renders all fields + 8 checkboxes expanded in a flat list.

4. **Concurrent Reset Execution Gap (`financial-leave.service.js:143-155`):**
   - `runTenantReset` checks `if (run?.status === "completed")` but does not block `run?.status === "running"`, allowing concurrent requests to execute overlapping batch resets.

5. **Employee Balance Table & Eligibility Form UX (`CompanyLeavePolicy.jsx:208, 211`):**
   - Missing team displays `"—"` instead of `"Unassigned"`, and numeric columns lack tabular alignment.
   - Eligibility form uses a raw numeric `Employee ID` input instead of a searchable employee selector backed by `GET /api/auth/employees/`.

---

## 5. Recommended Corrections

1. Replace all `String(...effective_from_fy_start).slice(0, 10)` calls in `financial-leave.service.js` with `dateString(...)` (and also include `latest_published` in `getCompanyPolicy()` response).
2. Guard `runTenantReset` against `run?.status === "running"` with `409 Conflict`.
3. Enhance `CompanyLeavePolicy.jsx` with accurate policy status separation, expandable Leave Type Builder cards, duplicate/range/IANA-timezone/FY-date validation, `Unassigned` team fallback, improved reset/version tables, and a searchable employee selector using `GET /api/auth/employees/`.
