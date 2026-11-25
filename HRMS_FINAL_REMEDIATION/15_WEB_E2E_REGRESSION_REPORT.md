# 15. Web E2E Regression Report

- **Framework:** React 19 + Vite 8.0.8
- **Browser Automation:** Headless Microsoft Edge CDP (`158.0.4370.33`)
- **Port:** `127.0.0.1:5173` (Proxied to backend at `127.0.0.1:8000`)

## Automated Web E2E Verification Matrix

| Route | Role Tested | Render Status | JS Errors | HTTP 5xx |
|---|---|---|---|---|
| `/` | Public | PASS (Login Form) | 0 | 0 |
| `/dashboard` | `superadmin` | PASS (Combined System/HR/Team/My Portal) | 0 | 0 |
| `/attendance` | `employee` | PASS (Status, timer, punch controls) | 0 | 0 |
| `/history` | `employee` | PASS (History log, date filters) | 0 | 0 |
| `/monthly-register` | `employee` | PASS (Monthly grid, calendar matrix) | 0 | 0 |
| `/leave` | `employee` | PASS (Leave balance, apply modal) | 0 | 0 |
| `/documents` | `employee` | PASS (Personal document categories) | 0 | 0 |
| `/employees` | `admin` | PASS (Employee directory, search, filters) | 0 | 0 |
| `/employee-documents` | `hr` | PASS (Document directory by employee) | 0 | 0 |
| `/attendance-approvals` | `manager` | PASS (Pending exception punches) | 0 | 0 |
| `/leave-approvals` | `manager` | PASS (Pending leave requests) | 0 | 0 |
| `/team-dashboard` | `manager` | PASS (Direct report metrics) | 0 | 0 |
| `/team-attendance` | `manager` | PASS (Team presence register) | 0 | 0 |
| `/team-analytics` | `manager` | PASS (Shortfall hours, analytics) | 0 | 0 |
| `/hr-dashboard` | `hr` | PASS (Workforce metrics, quick links) | 0 | 0 |
| `/reports` | `admin` | PASS (Excel/CSV export, attendance register) | 0 | 0 |
| `/audit-logs` | `superadmin` | PASS (System audit trail, severity filters) | 0 | 0 |
| `/shifts` | `hr` | PASS (Shift templates, weekly off policy) | 0 | 0 |
| `/roster` | `hr` | PASS (Roster calendar, assignments, rotations) | 0 | 0 |
| `/holidays` | `admin` | PASS (Company holiday calendar) | 0 | 0 |
| `/sites` | `admin` | PASS (Work sites, geofence radius) | 0 | 0 |

**Build & Lint Verification:**
- `npm run lint`: **0 errors**.
- `npm run build`: **PASS** (`dist/` generated in 2.96s).
