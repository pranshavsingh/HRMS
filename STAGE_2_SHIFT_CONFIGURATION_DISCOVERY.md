# STAGE 2: SHIFT CONFIGURATION ENGINE & POLICY FRAMEWORK
## PHASE A.3 — FORENSIC REPOSITORY, DATABASE & ARCHITECTURAL AUDIT (v3.0)

**Document:** `STAGE_2_SHIFT_CONFIGURATION_DISCOVERY.md`  
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Base Commit SHA:** `c9d391a509fd6efec973d8deb3af3b920badff5b`  
**Supported Engine Target:** MariaDB 11.8.9 Disposable Test Database (`127.0.0.1:3307`, `hrms_disposable_test`)  
**Production Hostinger Server (`srv999.hstgr.io`):** STRICTLY ZERO ACCESS (Air-Gapped & Isolated)  
**Stage:** 2 — Phase A.3 Final Architectural & Database Integrity Gate

---

## 1. Git Repository & Working Tree Status

| Parameter | Value | Verification Method |
| :--- | :--- | :--- |
| **Branch** | `feat/shift-roster-management` | Confirmed via `git status` |
| **HEAD Commit SHA** | `c9d391a509fd6efec973d8deb3af3b920badff5b` | Confirmed via `git rev-parse HEAD` |
| **Stage 1 Verification Status** | **13/13 Parts Passed**; Checksum verification fail-closed | Confirmed via `run_stage1_validation.mjs` |
| **Database Engine Target** | MariaDB 11.8.9-winx64 (`127.0.0.1:3307`) | Verified via live connection query |
| **Active Migration Ledger** | Migrations `001` through `013` recorded in `schema_migrations` | Verified via `SELECT * FROM schema_migrations` |
| **Stage 2 Target Migration** | `014_workforce_shift_policy_and_breaks.sql` | Pending user sign-off (Not executed) |

---

## 2. Existing Database & Architecture Inventory

### 2.1 Reusable Database Tables in `hrms_disposable_test`

| Table Name | Primary Role | Multi-Tenancy Key | Existing Relevant Columns |
| :--- | :--- | :--- | :--- |
| `workforce_tenant` | Top-level tenant registry | `id PK`, `code UQ` | `id`, `code`, `name`, `is_active`, `created_at`, `updated_at` |
| `workforce_user_tenant` | User-to-tenant membership & RBAC | `(tenant_id, user_id)` | `tenant_id`, `user_id`, `role`, `is_active`, `created_at` |
| `workforce_company_policy` | Tenant company attendance policy header | `(tenant_id, id)` | `id`, `tenant_id`, `name`, `is_active`, `created_at` |
| `workforce_company_policy_version` | Policy version parameters | `(tenant_id, policy_id, version_number)` | `id`, `tenant_id`, `policy_id`, `version_number`, `effective_from`, `effective_to`, `min_rest_period_minutes`, `grace_period_in_minutes`, `early_departure_grace_minutes`, `allow_unscheduled_punch` |
| `workforce_company_holiday` | Tenant organizational holidays | `(tenant_id, holiday_date)` | `id`, `tenant_id`, `holiday_date`, `name`, `is_optional` |
| `workforce_shift` | Shift definition header | `(tenant_id, id)`, `(tenant_id, code)` | `id`, `tenant_id`, `code`, `name`, `is_active`, `created_at`, `updated_at` |
| `workforce_shift_version` | Shift schedule timing version | `(tenant_id, shift_id, id)` | `id`, `tenant_id`, `shift_id`, `version_number`, `start_time`, `end_time`, `is_overnight`, `duration_minutes`, `late_grace_minutes`, `early_departure_grace_minutes`, `effective_from`, `effective_to`, `created_at` |
| `workforce_roster_entry` | Scheduled shifts for employees (Stage 4) | `(tenant_id, shift_id, shift_version_id)` | Contains composite foreign key referencing `workforce_shift_version` (entries 100, 200, 301 exist in disposable DB) |
| `accounts_user` | Core user identity & credentials | Single-tenant base table | `id`, `username`, `email`, `role`, `is_superuser`, `is_active`, `deleted_at` |
| `audit_logs` | Security & operational audit trail | Global system log | `id`, `user_id`, `username`, `action`, `target_id`, `details`, `ip_address`, `severity`, `created_at` |

---

## 3. Comprehensive Architectural Corrections (Phase A.3 Resolution)

### A11: Engine-Level Effective-Date Overlap Protection
- **Problem**: Previous designs claimed overlap prevention, but only supplied a single-row check constraint (`effective_to IS NULL OR effective_to >= effective_from`), which does not prevent separate published version rows from overlapping.
- **Resolution**:
  - Authored concrete MariaDB triggers: `trg_wsv_check_published_interval`, `trg_wcpv_check_published_interval`, and `trg_wwopv_check_published_interval`.
  - When a version is published, the trigger counts existing published versions whose intervals overlap:
    `(NEW.effective_to IS NULL OR NEW.effective_to >= existing.effective_from) AND (existing.effective_to IS NULL OR existing.effective_to >= NEW.effective_from)`.
  - If count $> 0$, the engine immediately halts the transaction with `SQLSTATE '45000'`.

### A12: Race-Proof Break Mutation Serialization
- **Problem**: In concurrent scenarios, two transactions could insert overlapping breaks or exceed total duration because trigger `SELECT` statements read uncommitted sibling states.
- **Resolution**:
  - The transaction protocol mandates that **every break insertion, update, and deletion acquires an exclusive `SELECT ... FOR UPDATE` lock on the parent `workforce_shift_version` row**.
  - All break operations on the same shift version serialize on this parent row lock.
  - Sibling reads under this lock are guaranteed to be serialized, race-proof, and phantom-free.

### A13 & A17: Published Effective-Date Closure & Archival Lifecycle Rules
- **Problem**: `effective_to` could potentially be altered or reopened arbitrarily, and archival transitions lacked strict metadata rules.
- **Resolution**:
  - In `trg_wsv_prevent_published_update`, `effective_to` can change from `NULL` to a non-NULL date ONLY ONCE.
  - Once closed (`OLD.effective_to IS NOT NULL`), any update to `effective_to` raises `SQLSTATE '45000'`. It can NEVER be reopened to `NULL` or extended.
  - Transition into `'archived'` requires `archived_at` and `archived_by` to be non-NULL, and `effective_to` must be $\le$ `CURRENT_DATE`. Once archived, the row is permanently frozen.

### A14: Deterministic Fail-Closed Policy Backfill
- **Problem**: `LEFT JOIN` in backfill allowed multiple matching policy versions or missing policy versions to produce unpredictable or incomplete rows.
- **Resolution**:
  - Backfill uses deterministic scalar subqueries requiring exactly one active policy version covering `effective_from`.
  - If zero or multiple versions match, MariaDB raises error 1242, failing closed.
  - Post-backfill assertion query verifies zero unassigned policy foreign keys before committing.

### A15: Complete Configuration Snapshot & SHA-256 Hash
- **Problem**: Snapshot previously contained only shift timings and an empty breaks array.
- **Resolution**:
  - Defined a complete, immutable JSON contract freezing: shift metadata, timings, granular breaks, company policy grace/rest/overtime parameters, weekly-off schedule, and a canonical SHA-256 payload hash.
  - Historical backfill rows explicitly include provenance: `"legacy_backfill": true`, `"original_publisher": "UNKNOWN_LEGACY_IMPORT"`.

### A16: Race-Proof Lock Protocol with Re-Verification
- **Problem**: Policy IDs read during initial inspection of a draft could be mutated before locks were acquired.
- **Resolution**:
  - The publication transaction acquires locks in global monotonic order (`tenant` → `company_policy` → `weekly_off_policy` → `shift` → draft version).
  - Immediately upon acquiring the draft lock, the service **re-verifies that `policy_id` and `weekly_off_policy_id` match the locked headers**.
  - If a concurrent edit changed references, the transaction safely aborts and retries with the new references.

### A18: Fail-Closed Migration Preconditions
- **Problem**: The runner could attempt migration execution on invalid schemas or orphaned data.
- **Resolution**:
  - Defined seven mandatory preflight checks (PF-01 through PF-07): Target Engine check, Migration ledger check, Roster FK integrity, 1:1 policy coverage, zero existing overlaps, active tenant check, and offline backup verification.
  - If any check fails, Migration 014 halts immediately without modifying schema or data.

---

## 4. Authoritative Monotonic Lock Sequence

Across every Stage 2 mutation, locks are strictly acquired in this global ascending hierarchy:

```
Step 1: workforce_tenant (PK id = :tenant_id)
  └── Step 2: workforce_company_policy (PK id = :policy_id) [if referenced]
        └── Step 3: workforce_weekly_off_policy (PK id = :weekly_off_policy_id) [if referenced]
              └── Step 4: workforce_shift (PK id = :shift_id)
                    └── Step 5: workforce_company_policy_version (id ASC)
                          └── Step 6: workforce_weekly_off_policy_version (id ASC)
                                └── Step 7: workforce_shift_version (id ASC)
                                      └── Step 8: workforce_shift_break (display_order ASC)
```

---

## 5. Phase A.3 Final Sign-Off Recommendation

Based on the forensic resolution of findings A1 through A18:

### **RECOMMENDATION: APPROVED FOR MIGRATION IMPLEMENTATION DESIGN**

1. All eighteen architectural findings (**A1 through A18**) are fully resolved with concrete DDL, triggers, transaction algorithms, JSON contracts, and preflight assertions.
2. The database schema guarantees true immutability (version and breaks), race-proof concurrency serialization, deterministic policy backfills, and zero data loss on legacy rosters.
3. Per instructions, **no migration files have been created or executed and no application code has been modified pending authorization of Phase B**.
