# 01. Complete Feature Inventory

**Total Modules:** 12 | **Total Submodules:** 33 | **Total Features:** 78 (`AUTH-001` through `OPS-002`)

See [COMPLETE_FEATURE_INVENTORY.md](file:///f:/hrms/HRMS_STAGE_1_DISCOVERY/COMPLETE_FEATURE_INVENTORY.md) for the full 78-row feature table mapping Web (`hrms_saas`), Mobile (`hrms_mobile`), Backend API (`node_backend`), Database tables, and Allowed Roles.

**Module Breakdown:**
- `AUTH` (10 features): Login, visibility toggle, Web/Mobile refresh, logout/JTI revocation, OTP reset, password change API, Mobile profile.
- `DASH` (5 features): Employee, Manager, HR, Admin dashboards + Personal/Workspace switcher.
- `EMP` (7 features): Onboarding, directory/search/pagination, filters, managers dropdown, profile/geofence edit, map picker, archive/soft-delete.
- `ATT` (13 features): Face+GPS punch in/out, Cloudinary signature, status/timer, history, monthly register, regularization, approvals, team attendance/CSV, team analytics/CSV.
- `LEAVE` (10 features): Balances, policy leave types, apply/409 overdraft, history, approvals, concessions, FY leave policy drafts/preview/publish, eligibility, reset runs.
- `SHIFT` (6 features): Shift templates, versioning, breaks, company policies, weekly-off policies.
- `ROSTER` (6 features): My Schedule, calendar/CSV, generation/publish, fixed assignments, rotations, peer shift swaps *(table only — NOT IMPLEMENTED)*.
- `HOL` (3 features): Holiday view, CRUD, superadmin tenant selector.
- `SITE` (3 features): Site list/filter, CRUD, employee assignments & access grants.
- `DOC` (5 features): My documents, upload, direct Cloudinary registration, staff directory, download/delete.
- `RPT` (1 feature): Attendance reports & CSV export (Web only).
- `AUDIT` (2 features): Audit log search/filter/sort/pagination, diff modal & CSV.
- `RT` & `OPS` (4 features): Socket.IO sync, SSE fallback, health/metrics, BullMQ/outbox/cron worker.
