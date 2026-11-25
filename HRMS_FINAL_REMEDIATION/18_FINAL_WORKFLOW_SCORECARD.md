# 18. Final Workflow Scorecard

- **Baseline Workflows:** `WF-01` through `WF-11` (11 business workflows)

## Reconciled Summary

| Workflow ID | Name | Final Result | Key Verification Evidence |
|---|---|---|---|
| `WF-01` | Authentication & Refresh Token Rotation | **PASS** | Login UI -> 200 OK; JWT + RTR grace window verified; Logout JTI revoked; 20 protected routes verified in Edge CDP. |
| `WF-02` | OTP Password Reset (Outbox -> BullMQ -> SMTP) | **PASS** | Request OTP -> Outbox event created -> BullMQ worker dispatches -> captured in `captured_emails.jsonl` -> OTP verified -> password reset -> new login succeeds. |
| `WF-03` | Employee Onboarding & Lifecycle | **PARTIAL** | Form validation, RBAC rejection (403), directory search/pagination pass; Cloudinary image upload fails closed (`500`). |
| `WF-04` | Attendance Punch In/Out | **PARTIAL** | Geofence validation (400), unauthenticated rejection (401), 10-concurrency serialization pass; photo upload fails closed. |
| `WF-05` | Attendance Regularization & Approval | **PASS** | Exception approval workflow, leave-status guard, and manager approval verified live in `attendance_concurrency.test.js` after `BUG-PROD-003` fix. |
| `WF-06` | Leave Apply, Approval & Concessions | **PASS** | Apply -> approve (after `BUG-PROD-001` fix) -> grant concession -> reverse concession -> balance updated. |
| `WF-07` | FY Leave Policy & Reset | **PASS** | Policy drafts, preview, publish collision prevention (409), and FY reset runs verified in `financial_year.test.js`. |
| `WF-08` | Shifts, Policies, Rotations & Rosters | **PASS*** | Shift templates CRUD, weekly-off policies, rotations, and roster calendar verified. (*`ROSTER-006` Shift Swap is NOT IMPLEMENTED). |
| `WF-09` | Document Upload & Secure Access | **PARTIAL** | Path traversal blocked (403), cross-tenant blocked (404), IDOR blocked (403); live upload blocked on Cloudinary keys. |
| `WF-10` | Holidays & Work Sites | **PASS** | Holiday calendar CRUD, site CRUD, geofence radius, and employee site assignment verified. |
| `WF-11` | Audit Logs & Reports | **PASS** | Audit log trail, severity filters, Excel/CSV monthly register export verified. |

### Summary Counts:
- **Total Workflows:** 11
- **PASS:** **8**
- **PARTIAL:** **3** (`WF-03`, `WF-04`, `WF-09` — blocked on external Cloudinary credentials)
- **FAIL:** **0**
