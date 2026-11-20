# HRMS STAGE 2: DATABASE MIGRATION REPORT
## MIGRATION 014 EXECUTION & VERIFICATION

**Migration Name:** `014_workforce_shift_policy_and_breaks.sql`  
**Ledger Checksum:** `d221ff94b1a6e48391665ada82f94d285199f5cae79f580c46361598b14fcc15`  
**Execution Target:** MariaDB 11.8.9 (`127.0.0.1:3307/hrms_disposable_test`)  
**Applied Timestamp:** 2026-11-16 17:33:50 (IST)  
**Execution Status:** **SUCCESS / FULLY VERIFIED**  

---

## 1. Migration Execution Overview

Migration 014 was executed via the enhanced `run-migrations.js` runner against the disposable MariaDB 11.8.9 database. The migration runner acquired distributed advisory lock `hrms_db_migration_lock`, verified prerequisite migrations 001–013 checksums, parsed 90 statements and 11 DELIMITER blocks, applied schema alterations, created new tables and triggers, performed deterministic backfills, and recorded the ledger entry.

Subsequent re-run testing verified that the runner is 100% idempotent:
```
[Migration] 014_workforce_shift_policy_and_breaks.sql: Already applied on Mon Nov 16 2026 17:33:50 GMT+0530 (checksum verified).
```

---

## 2. Preflight Verification Results (`preflight_014.mjs`)

| Assertion ID | Assertion Name | Threshold / Check | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **PF-01** | Database Engine Version | MariaDB 11.8.9 | **PASS** | `11.8.9-MariaDB` |
| **PF-02** | Prerequisite Migrations Range | Exactly 13 applied | **PASS** | `Found 13/13 migrations` |
| **PF-03** | Roster Foreign Key Integrity | 0 orphaned entries | **PASS** | `Orphaned entries: 0` |
| **PF-05** | Zero Pre-existing Overlaps | 0 overlapping versions | **PASS** | `Overlaps detected: 0` |
| **PF-06** | Active Tenant Scope Check | Shifts belong to active tenants | **PASS** | `Invalid tenant shifts: 0` |
| **PF-07** | Environment Isolation | Disposable DB verified | **PASS** | `Verified isolated port 3307` |

---

## 3. Postflight Validation Results (`postflight_014.mjs`)

| Assertion ID | Assertion Name | Verification Detail | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **PO-01** | Migration Ledger Record | Checksum recorded in `schema_migrations` | **PASS** | `d221ff94...` |
| **PO-02** | Zero NULL Company Policy FKs | All published shifts resolve policy | **PASS** | `Unresolved: 0` |
| **PO-03** | Zero NULL Weekly-Off Policy FKs | All published shifts resolve weekly-off | **PASS** | `Unresolved: 0` |
| **PO-04** | Configuration Snapshot Integrity | Valid JSON with snapshot_version | **PASS** | `3/3 valid snapshots` |
| **PO-05** | Weekly-Off Policy Coverage | All active tenants seeded | **PASS** | `Missing: 0` |
| **PO-06** | Canonical Shifts Existence | 4 standard shift templates seeded | **PASS** | `Found 4/4 canonical types` |
| **PO-07** | Database Trigger Suite | All 11 triggers installed | **PASS** | `Found 11/11 triggers` |
| **PO-08** | Minute-Offset Break Table | Offsets and check constraints active | **PASS** | `Columns: 13, Offsets active` |
| **PO-09** | Single Active Draft Constraint | Virtual column and unique index active | **PASS** | `Indexes: 9 verified` |
| **PO-10** | Immutability Trigger Operational | Direct SQL update on published rejected | **PASS** | `Rejected: DATA INTEGRITY VIOLATION` |

---

## 4. Trigger Inventory Installed

1. `trg_wsv_check_published_interval` — Rejects overlapping published shift intervals.
2. `trg_wcpv_check_published_interval` — Rejects overlapping published company policy intervals.
3. `trg_wwopv_check_published_interval` — Rejects overlapping published weekly-off policy intervals.
4. `trg_wsv_prevent_published_update` — Enforces field-by-field immutability on published shift versions.
5. `trg_wcpv_prevent_published_update` — Enforces immutability on published company policies.
6. `trg_wwopv_prevent_published_update` — Enforces immutability on published weekly-off policies.
7. `trg_wsb_prevent_mutation_on_published_version` — Rejects break insertion on published version.
8. `trg_wsb_prevent_update_on_published_version` — Rejects break modification on published version.
9. `trg_wsb_prevent_delete_on_published_version` — Rejects break deletion on published version.
10. `trg_wsb_validate_duration_limit` — Validates break duration and non-overlap on insert.
11. `trg_wsb_validate_duration_limit_update` — Validates break duration and non-overlap on update.
