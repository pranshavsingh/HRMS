# MOBILE RBAC VALIDATION REPORT

**Project:** Enterprise HRMS Mobile Application (`hrms_mobile`)  
**Scope:** Role-Based Access Control Verification across Mobile Workspaces  
**Audit Date:** November 24, 2026  

---

## 1. Role Permission Matrix Across Mobile Views

| Screen / Feature | Employee | Manager | HR | Admin | Superadmin |
|---|---|---|---|---|---|
| **Dashboard (Personal View)** | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Dashboard (Workspace View)** | Hidden | Team Only | Workforce | Workforce | Full System |
| **Punch Desk** | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Leave Application** | Own Leaves | Own Leaves | Own Leaves | Own Leaves | Own Leaves |
| **Attendance History** | Own History | Own History | Own History | Own History | Own History |
| **Regularize Missed Clock-Out** | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Shift Schedule (`shifts.tsx`)** | Own Shifts | Own Shifts | Own Shifts | Own Shifts | Own Shifts |
| **Approvals Desk** | Hidden | Team Reports | All Pending | All Pending | All Pending |
| **Roster Attendance Registry** | Hidden | Team Reports | All Staff | All Staff | All Staff |
| **Team Analytics** | Hidden | Team Reports | All Staff | All Staff | All Staff |
| **Staff Directory** | Hidden | Hidden | Read-Only | Read-Only | Read-Only |
| **Employee ID Creation** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** |
| **Staff Compliance Docs** | Hidden | **BLOCKED** | Read-Only | Read-Only | Read-Only |
| **Data / CSV Reports Export** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** |
| **Compliance Audit Logs** | Hidden | Hidden | Hidden | Hidden | Read-Only |

---

## 2. Key RBAC Defect Remediations

### 2.1 Manager Segregation in Staff Documents (BUG 3)
- **Previous State:** Managers were granted the "Staff Docs" tab in the tab bar. Tapping it attempted `GET /auth/employees/`, failing with HTTP 403 Forbidden.
- **Remediated State:** In `hrms_mobile/src/app/(tabs)/_layout.tsx`, `employee-documents` tab visibility was narrowed from `showWorkspace` to `showStaffDir` (`isHR || isAdmin || isSuperadmin`).
- **Validation:** Confirmed that managers no longer see the tab in their navigation bar. Attempting direct route rendering displays an Access Restricted advisory.

### 2.2 Manager Dashboard Scoping (BUG 6)
- **Previous State:** Manager dashboard fell back to empty data or zeros because it only read HR/Admin state variables.
- **Remediated State:** Workspace summary cards and metrics explicitly bind to `managerData.team_summary`, guaranteeing that managers only see aggregated counts and recent punch activity for direct reports assigned to their team.

### 2.3 Read-Only Directory Preservation (BUG 1)
- **Previous State:** Staff Directory broke completely due to response parsing issues.
- **Remediated State:** Directory response contracts now correctly populate employee cards for authorized HR, Admin, and Superadmin users, preserving search and filtering capabilities without exposing creation workflows.

---

## 3. Negative Authorization Testing Results

1. **Unauthenticated API Calls:** All protected endpoints strictly require `Authorization: Bearer <token>` and return HTTP 401 when missing or expired.
2. **Manager Access to Directory:** Hitting `/api/auth/employees/` with Manager token returns **HTTP 403 Forbidden**.
3. **Employee Access to Approvals:** Hitting `/api/attendance/approvals/` with Employee token returns **HTTP 403 Forbidden**.
4. **Mobile Employee Account Creation:** Hitting `/api/auth/create-employee/` with HR or Admin token and `X-Platform: mobile` returns **HTTP 403 Forbidden**.
5. **Mobile Document Download:** Hitting `/api/auth/documents/download/:id/` with `X-Platform: mobile` returns **HTTP 403 Forbidden**.
