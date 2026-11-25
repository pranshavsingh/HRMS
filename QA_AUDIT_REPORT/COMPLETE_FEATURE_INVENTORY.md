# Complete Feature Inventory — Enterprise HRMS

**Application Platform:** Enterprise HRMS (React Web `hrms_saas`, Express API `node_backend`, React Native `hrms_mobile`)  
**Database:** MariaDB 11.8.9 / MySQL 8.0+  
**Audit Scope:** Exhaustive Discovery of all Modules, Pages, Endpoints, Database Tables, and Background Services  

---

## 1. High-Level Architectural Map

```
+----------------------------------------------------------------------------------------------------+
|                                    ENTERPRISE HRMS ECOSYSTEM                                       |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   +-----------------------+     +-----------------------+     +--------------------------------+   |
|   |  hrms_saas (Web)      |     |  hrms_mobile (App)    |     |  node_backend (REST API)       |   |
|   |  - React 18 + Vite    |     |  - React Native Expo  |     |  - Express.js + Node.js        |   |
|   |  - Tailwind + Lucide  |     |  - TypeScript         |     |  - mysql2 Connection Pool      |   |
|   |  - Context + Axios    |     |  - Expo Camera + GPS  |     |  - Redis Session & Rate Limits |   |
|   +-----------+-----------+     +-----------+-----------+     +---------------+----------------+   |
|               |                             |                                 |                    |
|               +-----------------------------+---------------------------------+                    |
|                                             |                                                      |
|                               +-------------v--------------+                                       |
|                               |  MariaDB / MySQL Database  |                                       |
|                               |  - 24 Core Tables          |                                       |
|                               |  - 22 Versioned Migrations |                                       |
|                               +----------------------------+                                       |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Complete Module & Route Inventory (Web Client — `hrms_saas`)

| Module Name | Route URL | Allowed Roles (Frontend) | Primary UI Component | Backend Services Invoked | Key Business Purpose |
|---|---|---|---|---|---|
| **Authentication** | `/login` | Public (Unauthenticated) | `Login.jsx` | `/api/auth/login` | User credential validation, JWT issuance, session bootstrap |
| **Password Reset** | `/forgot-password`, `/reset-password` | Public | `ForgotPassword.jsx`, `ResetPassword.jsx` | `/api/auth/forgot-password`, `/api/auth/reset-password` | Self-service password recovery via secure token |
| **Profile Setup** | `/setup-profile` | First-time users | `SetupProfile.jsx` | `/api/auth/setup-profile` | Initial biometric face capture and profile completion |
| **Employee Dashboard** | `/employee-dashboard` | `employee`, `manager`, `hr`, `admin`, `superadmin` | `EmployeeDashboard.jsx` | `/api/v1/attendance/today`, `/api/v1/attendance/stats` | Individual punch status, monthly hours, upcoming leaves |
| **Manager Dashboard** | `/manager-dashboard` | `manager`, `hr`, `admin`, `superadmin` | `ManagerDashboard.jsx` | `/api/v1/attendance/team-today`, `/api/v1/attendance/team-analytics` | Team presence, pending team approvals, team shift overview |
| **HR Dashboard** | `/hr-dashboard` | `hr`, `admin`, `superadmin` *(See BUG-A01)* | `HRDashboard.jsx` | `/api/v1/attendance/hr-dashboard`, `/api/v1/attendance/hr-analytics` | Company-wide workforce attendance, department absenteeism |
| **Admin Dashboard** | `/admin-dashboard` | `admin`, `superadmin` | `AdminDashboard.jsx` | `/api/v1/attendance/hr-dashboard`, `/api/auth/users` | System overview, administrative KPIs, site health |
| **Super Admin Dashboard** | `/superadmin-dashboard` | `superadmin` | `SuperAdminDashboard.jsx` | `/api/v1/reports/*`, `/api/auth/system-logs` | Master infrastructure controls, audit logs, root operations |
| **Live Attendance & Punch** | `/attendance` | All Authenticated | `Attendance.jsx` | `/api/v1/attendance/punch-in`, `/api/v1/attendance/punch-out` | Webcam capture, GPS geofence validation, face matching |
| **Attendance History** | `/history` | All Authenticated | `History.jsx` | `/api/v1/attendance/history` | Historical logs, punch times, geofence status, work hours |
| **Regularization** | `/attendance-regularization` | All Authenticated | `AttendanceRegularization.jsx` | `/api/v1/attendance/regularize` | Correction requests for missed punches or forgotten punch-out |
| **Leave Management** | `/leave` | All Authenticated | `Leave.jsx` | `/api/v1/leave/apply`, `/api/v1/leave/my-leaves`, `/balance` | Leave application, balance tracking, sandwich policy status |
| **Shift Management** | `/shifts` | All Authenticated | `Shifts.jsx` | `/api/v1/workforce/shifts` | Shift timings view, fixed shift allocations |
| **Roster Planner** | `/roster` | `manager`, `hr`, `admin`, `superadmin` | `Roster.jsx` | `/api/v1/workforce/rosters/*`, `/api/v1/workforce/sites` | Shift schedule generation, roster publishing, shift swapping |
| **Approvals Queue** | `/approvals` | `manager`, `hr`, `admin`, `superadmin` | `Approvals.jsx` | `/api/v1/attendance/approvals/*`, `/api/v1/leave/approve` | Two-tier approval for out-of-geofence punches & leaves |
| **Reports & Analytics** | `/reports` | `hr`, `admin`, `superadmin` | `Reports.jsx` | `/api/v1/reports/attendance/monthly`, `/api/v1/reports/export` | Muster roll exports, attendance audits, CSV/PDF generation |
| **Employee Directory** | `/employees` | `hr`, `admin`, `superadmin` | `Employees.jsx` | `/api/auth/users`, `/api/auth/register-employee` | Employee onboarding, profile edits, manager assignment |
| **Document Vault** | `/employee-documents` | `hr`, `admin`, `superadmin` | `EmployeeDocuments.jsx` | `/api/v1/workforce/documents/*` | KYC upload, employment contracts, ID verification |
| **Company Policies** | `/company-policies` | `hr`, `admin`, `superadmin` | `CompanyPolicies.jsx` | `/api/v1/workforce/company-policies` | Organizational guidelines, leave rules, attendance rules |
| **Work Site Management** | *Unrouted* *(BUG-A04)* | `admin`, `superadmin` | `SiteManagement.jsx` | `/api/v1/workforce/sites` | Office sites, GPS coordinates, geofence radius settings |
| **System Settings** | `/system-settings` | `admin`, `superadmin` | `SystemSettings.jsx` | `/api/auth/system-settings` | Global grace periods, geofence thresholds, email triggers |
| **System Audit Logs** | `/system-logs` | `admin`, `superadmin` | `SystemLogs.jsx` | `/api/auth/system-logs` | Immutable audit trail of administrative and auth events |

---

## 3. Backend API Route Inventory (`node_backend`)

### 3.1 Authentication & Accounts API (`/api/auth/`)
- `POST /api/auth/login` — Login with username/email and password (Rate-limited, Argon2id/bcrypt verification).
- `POST /api/auth/refresh-token` — Refresh access token using refresh token.
- `POST /api/auth/logout` — Logout user and invalidate session / blacklist token in Redis.
- `POST /api/auth/forgot-password` — Issue password reset token.
- `POST /api/auth/reset-password` — Reset password using token.
- `POST /api/auth/change-password` — Change password for authenticated session.
- `GET /api/auth/me` — Retrieve current authenticated user profile and permissions.
- `GET /api/auth/users` — List employee profiles (Filtered by site/role, restricted to `hr`, `admin`, `superadmin`).
- `POST /api/auth/register-employee` — Create employee credentials and profile (`hr`, `admin`, `superadmin`).
- `PUT /api/auth/users/:id` — Update user profile and corporate hierarchy metadata.
- `PATCH /api/auth/users/:id/toggle-status` — Activate/deactivate user account.
- `POST /api/auth/setup-profile` — Upload reference facial biometric embeddings.

### 3.2 Attendance & Real-Time Biometric API (`/api/v1/attendance/`)
- `POST /api/v1/attendance/punch-in` — Web/mobile punch-in with photo upload, GPS coordinates, and face verification.
- `POST /api/v1/attendance/punch-out` — Punch-out with GPS coordinates, auto-calculating `work_hours`.
- `GET /api/v1/attendance/today` — Current day punch status, punch times, and active shifts for current user.
- `GET /api/v1/attendance/history` — Paginated history of punches, approval statuses, and work hours.
- `GET /api/v1/attendance/monthly` — Monthly calendar attendance rollup with daily flags (P, A, WO, H, HD, L).
- `GET /api/v1/attendance/stats` — Summary metrics (Total days worked, leaves taken, overtime hours).
- `GET /api/v1/attendance/team-today` — Team presence overview for managers (`manager`, `hr`, `admin`, `superadmin`).
- `GET /api/v1/attendance/hr-dashboard` — Enterprise workforce attendance snapshot (`hr`, `superadmin`).
- `GET /api/v1/attendance/team-analytics` — Team work-hour and absence rate trends (`manager`, `hr`, `admin`).
- `GET /api/v1/attendance/hr-analytics` — Cross-departmental organizational analytics (`hr`, `admin`, `superadmin`).
- `POST /api/v1/attendance/regularize` — Submit regularization request for missed punches.
- `GET /api/v1/attendance/approvals/pending` — List attendance approval requests awaiting manager/HR review.
- `POST /api/v1/attendance/approvals/:id/review` — Approve or reject out-of-geofence punch or regularization.

### 3.3 Leave & Balance API (`/api/v1/leave/`)
- `POST /api/v1/leave/apply` — Submit leave application with sandwich leave calculation.
- `GET /api/v1/leave/my-leaves` — List personal leave application history and approval statuses.
- `GET /api/v1/leave/balance` — Current leave balance entitlement by leave type (CL, SL, EL, CO).
- `GET /api/v1/leave/team-leaves` — Manager queue for direct report leave requests.
- `GET /api/v1/leave/hr-leaves` — HR queue for company-wide leave requests.
- `POST /api/v1/leave/:id/approve` — Approve leave request (Manager or HR).
- `POST /api/v1/leave/:id/reject` — Reject leave request with mandatory reason.
- `POST /api/v1/leave/:id/cancel` — Cancel pending or future approved leave by applicant.

### 3.4 Workforce Scheduling & Roster API (`/api/v1/workforce/`)
- `GET /api/v1/workforce/shifts` — List active shifts with timing windows, grace periods, and break durations.
- `POST /api/v1/workforce/shifts` — Create shift template (`admin`, `hr`, `superadmin`).
- `PUT /api/v1/workforce/shifts/:id` — Update shift template and create versioned snapshot.
- `POST /api/v1/workforce/rotations` — Define cyclic shift rotation patterns (e.g. 6 Days On, 1 Day Off).
- `POST /api/v1/workforce/shift-assignments/draft` — Create employee fixed shift assignment.
- `POST /api/v1/workforce/shift-assignments/publish` — Publish shift assignments for period.
- `POST /api/v1/workforce/rosters/draft` — Generate draft monthly roster for a work site.
- `POST /api/v1/workforce/rosters/:id/publish` — Publish draft roster, freezing shift snapshots for auditability.
- `POST /api/v1/workforce/rosters/swap` — Request or execute peer shift swaps.
- `GET /api/v1/workforce/rosters/calendar` — Fetch roster grid view scoped by site and month.
- `GET /api/v1/workforce/sites` — List registered company work sites, geofences, and coordinates.
- `POST /api/v1/workforce/sites` — Register new physical office site with geofence radius.
- `GET /api/v1/workforce/company-holidays` — List company holidays for financial/calendar year.
- `POST /api/v1/workforce/company-holidays` — Create official company holiday.
- `GET /api/v1/workforce/weekly-off-policies` — List corporate weekly off schedules (e.g. Sunday fixed, alternate Saturdays).

### 3.5 Reports & Data Export API (`/api/v1/reports/`)
- `GET /api/v1/reports/attendance/daily` — Daily attendance report with punch times and geofence indicators.
- `GET /api/v1/reports/attendance/monthly` — Comprehensive monthly attendance muster roll.
- `GET /api/v1/reports/leave/summary` — Organization-wide leave consumption and liability report.
- `GET /api/v1/reports/export/attendance.csv` — CSV export for payroll processing.
- `GET /api/v1/reports/export/attendance.pdf` — Formatted PDF export for compliance records.

---

## 4. Database Schema Inventory (MariaDB / MySQL)

| Table Name | Primary Purpose | Key Indexes | Foreign Key Relationships |
|---|---|---|---|
| `users` | Core credentials, authentication, role, active status | `email` (UNIQUE), `employee_id` (UNIQUE) | Self-referencing manager mapping |
| `employee_profiles` | Personal details, department, designation, phone, site | `user_id` (UNIQUE), `site_id`, `department` | `users(id)`, `work_sites(id)` |
| `work_sites` | Physical office locations, GPS lat/lng, geofence radius (meters) | `site_code` (UNIQUE) | - |
| `shifts` | Master shift definitions (Morning, Evening, Night, General) | `name` (UNIQUE) | - |
| `shift_versions` | Versioned immutable snapshots of shift start, end, and grace minutes | `(shift_id, version)` | `shifts(id)` |
| `shift_assignments` | Direct employee shift bindings with effective date ranges | `(user_id, start_date)` | `users(id)`, `shifts(id)` |
| `shift_rotations` | Rotation group definitions and cycle length | `name` | `work_sites(id)` |
| `rotation_steps` | Daily steps within a cyclic rotation (Shift ID, Day Index) | `(rotation_id, day_offset)` | `shift_rotations(id)`, `shifts(id)` |
| `rotation_assignments`| Employee membership within rotation groups | `(user_id, rotation_id)` | `users(id)`, `shift_rotations(id)` |
| `roster_headers` | Monthly roster parent record per work site (Draft/Published) | `(site_id, month, year)` | `work_sites(id)` |
| `roster_entries` | Daily scheduled shift per employee per date | `(user_id, date)`, `(roster_id, date)` | `roster_headers(id)`, `users(id)`, `shifts(id)` |
| `attendance` | Daily attendance session records, punches, work hours, statuses | `(user_id, date)` (UNIQUE), `date`, `status` | `users(id)`, `shifts(id)` |
| `attendance_approvals`| Multi-tier approval records for out-of-geofence & regularization | `(attendance_id, reviewer_id)`, `status` | `attendance(id)`, `users(id)` |
| `attendance_photos` | Stored facial punch-in/out photos (purged after 90 days) | `attendance_id` | `attendance(id)` |
| `leave_types` | Master leave categories (Casual, Sick, Earned, Compensatory) | `code` (UNIQUE) | - |
| `leave_requests` | Employee leave applications, dates, status, sandwich flags | `(user_id, from_date)`, `status` | `users(id)`, `leave_types(id)` |
| `leave_balances` | Annual/financial leave entitlement and consumed quota | `(user_id, leave_type_id, financial_year)` | `users(id)`, `leave_types(id)` |
| `company_holidays` | Declared public and regional company holidays | `holiday_date` (UNIQUE) | `work_sites(id)` (Optional) |
| `weekly_off_policies`| Configured weekly offs per site or department | `(site_id, day_of_week)` | `work_sites(id)` |
| `employee_documents`| Uploaded documents (Aadhar, PAN, Degree, Contracts) | `user_id` | `users(id)` |
| `company_policies` | Downloadable HR policy documents and manuals | `title` | - |
| `system_audit_logs` | Immutable audit trail for logins, approvals, and admin actions | `created_at`, `user_id`, `action` | `users(id)` |
| `outbox_events` | Asynchronous event publishing buffer for integrations/notifications | `(status, created_at)` | - |
| `refresh_tokens` | Active JWT refresh tokens for session rotation | `token_hash`, `user_id` | `users(id)` |

---

## 5. Background Scheduled Cron Jobs (`node_backend/src/utils/cron.js`)

1. **Forgotten Punch-Out Auto-Resolution (Runs Daily at 23:59:00):**
   - Scans `attendance` records where `punch_in_time IS NOT NULL` and `punch_out_time IS NULL`.
   - Records running >16 hours are transitioned to `status = 'pending'`, `work_hours = 0.00`, and an attendance approval/regularization record is generated.
2. **Expired OTP & Password Token Cleanup (Runs Hourly):**
   - Deletes expired reset tokens from memory and database tables older than 15 minutes.
3. **Attendance Photo Retention Purge (Runs Weekly on Sunday at 03:00:00):**
   - Deletes biometric capture punch photos older than 90 days to comply with data privacy policies while retaining tabular punch logs.
4. **Database Automated Snapshot Backup (Runs Daily at 02:00:00):**
   - Invokes `mysqldump` to archive the active schema and data into secure storage.
5. **Outbox Event Reconciliation (Runs Every 5 Minutes):**
   - Polls `outbox_events` for unpublished messages and retransmits stalled events.
6. **Financial Year Leave Balance Rollover (Runs Annually on March 31 at 23:59:59):**
   - Computes earned leave carry-forward caps, resets casual/sick leaves, and instantiates new balance rows for the upcoming financial year.
