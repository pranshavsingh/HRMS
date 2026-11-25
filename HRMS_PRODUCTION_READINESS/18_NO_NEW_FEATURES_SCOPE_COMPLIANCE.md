# 18. No-New-Features Scope Compliance

**Compliance Status:** **COMPLIANT (NO NEW FEATURES ADDED)**

## Changes Made in `release/final-production-readiness`
Only three targeted bug fixes for newly confirmed runtime defects and their regression tests were added:
1. `node_backend/src/services/audit.service.js`: Fixed `ReferenceError: actor is not defined` -> `user?.tenant_id` (`BUG-PROD-001`).
2. `node_backend/src/db/index.js`: Added `SET time_zone = '+00:00'` on pooled MySQL connections to align with `timezone: "Z"` (`BUG-PROD-002`).
3. `node_backend/src/services/site.service.js`: Removed non-existent `can_view = 1` column filter on `workforce_site_access` (`BUG-PROD-003`).
4. `node_backend/tests/bugs/prod_readiness_fixes.test.js`: Added 3 regression tests for `BUG-PROD-001..003`.

## Explicit Prohibitions Verified
- No new features, modules, workflows, screens, forms, fields, or API endpoints were added.
- `ROSTER-006` (Shift Swap) was **not** implemented; it remains documented as `NOT IMPLEMENTED`.
- `HRMS_FINAL_E2E/` reports were preserved untouched.
- Production database `srv999.hstgr.io` was never modified.
