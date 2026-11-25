# 01. Test Account Matrix

**Status:** **BLOCKED** (No isolated staging MySQL database is available to seed test tenants or role accounts; creating or modifying accounts on `srv999.hstgr.io` is prohibited by production safety rules).

## Discovered RBAC Roles (from `node_backend/src/constants/roles.js` & `auth.js`)
- `superadmin`
- `admin`
- `hr`
- `manager`
- `employee`

## Planned Staging Account Matrix (Blocked Pending Staging DB)

| Account Alias | Role | Tenant | Site / Manager Relationship | Status |
|---|---|---|---|---|
| `qa_superadmin_t1` | `superadmin` | Tenant 1 (Staging) | Global tenant access | **BLOCKED** (Needs Staging DB) |
| `qa_admin_t1` | `admin` | Tenant 1 (Staging) | Tenant 1 admin, Site A | **BLOCKED** (Needs Staging DB) |
| `qa_hr_t1` | `hr` | Tenant 1 (Staging) | Tenant 1 HR, Site A | **BLOCKED** (Needs Staging DB) |
| `qa_manager_t1` | `manager` | Tenant 1 (Staging) | Tenant 1 Manager, Site A (manages `qa_emp_t1`) | **BLOCKED** (Needs Staging DB) |
| `qa_emp_t1` | `employee` | Tenant 1 (Staging) | Tenant 1 Employee, Site A, reports to `qa_manager_t1` | **BLOCKED** (Needs Staging DB) |
| `qa_admin_t2` | `admin` | Tenant 2 (Isolation) | Tenant 2 admin, Site B | **BLOCKED** (Needs Staging DB) |
| `qa_emp_t2` | `employee` | Tenant 2 (Isolation) | Tenant 2 Employee, Site B | **BLOCKED** (Needs Staging DB) |

*(Note: Passwords and tokens are intentionally omitted per security rules.)*
