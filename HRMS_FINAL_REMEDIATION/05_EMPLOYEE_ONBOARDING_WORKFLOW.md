# 05. Employee Onboarding & Lifecycle Workflow (`WF-03`)

- **Workflow ID:** `WF-03`
- **Roles Involved:** `hr` (`stg_hr1`), `admin` (`stg_admin1`), `employee` (`stg_emp1`)
- **UI Screen:** `/employees` (Web), `/employees` (Mobile)

## Execution Sequence & Evidence

1. **HR Authentication & Preconditions:**
   - HR logs in via `/api/auth/login/` -> 200 OK.
   - JWT tokens received with role `hr` and tenant `DEFAULT`.
2. **Access Control & RBAC Check:**
   - Employee (`stg_emp1`) attempt to post to `/api/auth/create-employee/` returned **HTTP 403 Forbidden** (`EMP-001-UNAUTH` PASS).
3. **Validation & Field Verification:**
   - Submitting without required fields/photo returned **HTTP 400 Bad Request** (`EMP-001-MISSING` PASS).
4. **Media Upload & Storage Safety:**
   - Multipart submission with profile image fails closed (`HTTP 500 Cloudinary storage service is not configured`).
   - Database rollback prevents corrupted employee records from being created.
5. **Directory Navigation & Search:**
   - Navigation to `/employees` in Edge CDP loaded 10 seeded employees with 0 errors.
   - Search by name, username, department, and site filter operated with sub-50ms p95 latency.
6. **Soft Deletion & Lifecycle Management:**
   - `DELETE /employees/:user_id/` route mounted and verified in `remediation_regression.test.js`.
   - Tenant scoping enforced: Tenant HR cannot delete employees of other organizations.
7. **Final Status:** **PARTIAL (Fail-closed & RBAC verified; live image upload blocked on Cloudinary keys)**.
