# Role-Based Access Control (RBAC) Permission Matrix — Enterprise HRMS

**Application:** Enterprise HRMS (`hrms_saas` & `node_backend`)  
**Target Roles Evaluated:**
1. `employee` — Standard individual contributor
2. `manager` — Team lead / supervisor with direct report hierarchy
3. `hr` — Human resources officer with company-wide people operations authority
4. `admin` — System & operational administrator
5. `superadmin` — Root organizational administrator

---

## 1. Master RBAC Matrix (Route & Feature Access)

| Functional Domain / Action | `employee` | `manager` | `hr` | `admin` | `superadmin` | Frontend Route Guard | Backend Middleware Guard | Parity Status |
|---|:---:|:---:|:---:|:---:|:---:|---|---|:---:|
| **Personal Dashboard** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | `["employee", "manager", "hr", "admin", "superadmin"]` | Authenticated | **PASS** |
| **Manager Team Dashboard** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **HR Workforce Dashboard** | DENY | DENY | ALLOW | **DISCREPANCY** | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "superadmin"])` | **FAIL (BUG-A01)** |
| **Admin System Dashboard** | DENY | DENY | DENY | ALLOW | ALLOW | `["admin", "superadmin"]` | `authorize(["admin", "superadmin"])` | **PASS** |
| **Super Admin Root Dashboard** | DENY | DENY | DENY | DENY | ALLOW | `["superadmin"]` | `authorize(["superadmin"])` | **PASS** |
| **Punch In / Punch Out (Personal)** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | All Authenticated | All Authenticated | **PASS** |
| **View Own Attendance History** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | All Authenticated | Scoped by `req.user.id` | **PASS** |
| **View Direct Reports Attendance** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | Scoped by `manager_id` | **PASS** |
| **View Cross-Team Attendance (Site)**| DENY | **LEAKAGE** | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `teamAnalytics` lacks manager filter | **FAIL (BUG-A02)** |
| **Submit Attendance Regularization** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | All Authenticated | Scoped by `req.user.id` | **PASS** |
| **Approve Attendance (Direct Reports)**| DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **Apply for Leave (Personal)** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | All Authenticated | Scoped by `req.user.id` | **PASS** |
| **Approve Leave (Direct Reports)** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **Approve Leave (Cross-Department)** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **View Personal Shift / Roster** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | All Authenticated | Scoped by `req.user.id` | **PASS** |
| **Generate Draft Roster (Site)** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **Publish Master Roster** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **Execute Peer Shift Swaps** | DENY | ALLOW | ALLOW | ALLOW | ALLOW | `["manager", "hr", "admin", "superadmin"]` | `authorize(["manager", "hr", "admin", "superadmin"])` | **PASS** |
| **Create / Modify Shift Templates** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Create Company Holidays** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Configure Weekly Off Policies** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Employee Directory (View All)** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Create / Onboard New Employee** | DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Deactivate / Terminate Employee** | DENY | DENY | DENY | ALLOW | ALLOW | `["admin", "superadmin"]` | `authorize(["admin", "superadmin"])` | **PASS** |
| **Upload Employee Documents (KYC)**| DENY | DENY | ALLOW | ALLOW | ALLOW | `["hr", "admin", "superadmin"]` | `authorize(["hr", "admin", "superadmin"])` | **PASS** |
| **Manage Work Sites & Geofences** | DENY | DENY | DENY | ALLOW | ALLOW | *Unrouted* (BUG-A04) | `authorize(["admin", "superadmin"])` | **FAIL (BUG-A04)** |
| **System Settings Configuration** | DENY | DENY | DENY | ALLOW | ALLOW | `["admin", "superadmin"]` | `authorize(["admin", "superadmin"])` | **PASS** |
| **View Immutable Audit Logs** | DENY | DENY | DENY | ALLOW | ALLOW | `["admin", "superadmin"]` | `authorize(["admin", "superadmin"])` | **PASS** |
| **Trigger Database Backup** | DENY | DENY | DENY | DENY | ALLOW | Cron / SuperAdmin Only | SuperAdmin / CLI | **PASS** |

---

## 2. In-Depth Discrepancy & Vulnerability Analysis

### 2.1 BUG-A01 — Frontend-Backend Authorization Parity Failure (Admin Role)
- **Frontend Definition (`hrms_saas/src/App.jsx:150`):**
  ```jsx
  <Route
    path="/hr-dashboard"
    element={
      <ProtectedRoute allowedRoles={["hr", "admin", "superadmin"]}>
        <HRDashboard />
      </ProtectedRoute>
    }
  />
  ```
- **Backend Definition (`node_backend/src/routes/attendance.routes.js:16`):**
  ```javascript
  router.get("/hr-dashboard", authorize(["hr", "superadmin"]), attendanceController.hrDashboard);
  ```
- **Backend Service Implementation (`attendance.service.js:983`):**
  ```javascript
  if (role !== "hr" && role !== "superadmin") {
    throw new AppError("Not allowed", 403);
  }
  ```
- **Defect Manifestation:** When a user with the `admin` role logs in and navigates to the HR Dashboard (which is explicitly allowed in the sidebar and React router), the client initiates a `GET /api/v1/attendance/hr-dashboard` request. The backend immediately rejects this request with HTTP 403 Forbidden, throwing an unhandled rejection in the dashboard component and leaving the user with a broken view.
- **Root Cause:** Incomplete synchronization between frontend UI permissions and backend route authorization schemas during multi-role policy implementation.

### 2.2 BUG-A02 — Horizontal Authorization Failure (Manager Data Leakage)
- **Backend Implementation (`attendance.service.js:1120-1153`):**
  ```javascript
  async teamAnalytics(managerId, role, siteId, query = {}) {
    // In teamAttendance, direct reports are strictly filtered:
    // WHERE ep.manager_id = managerId
    // BUT in teamAnalytics:
    const sql = `
      SELECT 
        COUNT(DISTINCT u.id) as total_team_members,
        SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) as present_count,
        AVG(a.work_hours) as avg_work_hours
      FROM users u
      JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
      WHERE 1=1 ${siteScope}
    `;
  }
  ```
- **Defect Manifestation:** In `teamAttendance`, the query correctly enforces `WHERE ep.manager_id = managerId`. However, in `teamAnalytics`, the query only appends `siteScope` (`AND ep.site_id = ?`) without filtering by `ep.manager_id = managerId` when `role === 'manager'`.
- **Impact:** Any departmental manager assigned to Site A can view the aggregated work hours, presence counts, and absenteeism metrics of all other departments and teams operating at Site A.

---

## 3. Horizontal & Vertical Privilege Testing Results

| Test Scenario | Actor Role | Target Resource | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|:---:|
| **EMP-01** | `employee` | Access `/admin-dashboard` | Redirect to `/unauthorized` or 403 | Redirected to `/unauthorized` | **PASS** |
| **EMP-02** | `employee` | Access `GET /api/auth/users` | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **EMP-03** | `employee` | Download peer's KYC document | HTTP 403 Forbidden | HTTP 403 Forbidden (Ownership checked) | **PASS** |
| **EMP-04** | `employee` | Approve own leave request | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **MGR-01** | `manager` | Approve direct report leave | HTTP 200 OK | HTTP 200 OK | **PASS** |
| **MGR-02** | `manager` | Approve peer manager direct report | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **MGR-03** | `manager` | View team analytics | Scoped to direct reports | Returns all site employees | **FAIL (BUG-A02)** |
| **HR-01** | `hr` | View company-wide attendance | HTTP 200 OK | HTTP 200 OK | **PASS** |
| **HR-02** | `hr` | Modify system DB backup cron | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **ADM-01** | `admin` | Access HR Dashboard API | HTTP 200 OK | HTTP 403 Forbidden | **FAIL (BUG-A01)** |
| **ADM-02** | `admin` | Access Site Management UI | Routed to Page | 404 / Missing Route | **FAIL (BUG-A04)** |
| **SAD-01** | `superadmin`| Access Super Admin Dashboard | HTTP 200 OK | HTTP 200 OK | **PASS** |
| **SAD-02** | `superadmin`| View system audit trail | HTTP 200 OK | HTTP 200 OK | **PASS** |

---

## 4. RBAC Remediation Recommendations

1. **Synchronize Route Policies:** Update `node_backend/src/routes/attendance.routes.js:16` and `attendance.service.js:983` to explicitly authorize `["hr", "admin", "superadmin"]` for `/hr-dashboard` and `/hr-analytics`.
2. **Enforce Manager Hierarchy in Analytics:** In `attendance.service.js:1120`, if `role === 'manager'`, inject `AND ep.manager_id = ?` with parameter `managerId` into the SQL query before applying optional site filters.
3. **Register Site Management Route:** Add `<Route path="/site-management" element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><SiteManagement /></ProtectedRoute>} />` into `hrms_saas/src/App.jsx` and link it in `Sidebar.jsx`.
