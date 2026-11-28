# Responsive Layout Regression Report

## 1. CSS & Box-Model Verification Across Viewports

Because `Layout.jsx` now separates horizontal/bottom padding (`px-4 pb-4`, `sm:px-6 sm:pb-6`) from top padding (`pt-[calc(var(--hrms-navbar-height)+1rem)]`, `sm:pt-[calc(var(--hrms-navbar-height)+1.5rem)]`), the compiled CSS guarantees:

| Breakpoint / Viewport | Sidebar Mode | Navbar Height (`--hrms-navbar-height`) | `<main>` `padding-top` | Clearance Below Navbar |
| :--- | :--- | :--- | :--- | :--- |
| `< 640px` (mobile) | Off-canvas drawer (`z-50`) | `64px` (`4rem`) | `80px` (`5rem`) | `+16px` |
| `768 × 1024` (`sm:` / `< lg:`) | Off-canvas drawer (`z-50`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1024 × 768` (`lg:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1280 × 720` (`xl:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1366 × 768` (`xl:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1440 × 900` (`xl:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1680 × 1050` (`2xl:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |
| `1920 × 1080` (`2xl:`) | Fixed `256px` (`16rem`) | `64px` (`4rem`) | `88px` (`5.5rem`) | `+24px` |

Because both the navbar height (`4rem`) and the top offset (`4rem + 1rem` / `4rem + 1.5rem`) are expressed in `rem` relative to root font size, browser zoom levels (`80%`, `90%`, `100%`, `110%`, `125%`) scale the fixed header and `<main>` top offset proportionally with zero drift.

## 2. Page-by-Page Layout Coverage

Every authenticated route in `f:\hrms\hrms_saas\src\App.jsx` uses `<Layout>` as its sole outer shell:
- `/dashboard` (Role-based: `EmployeeDashboard`, `ManagerDashboard`, `HRDashboard`, `AdminDashboard`, plus `?view=personal`)
- `/attendance`, `/history`, `/monthly-register`, `/leave`, `/documents`
- `/employees`, `/employee-documents`, `/attendance-approvals`, `/team-attendance-approvals`, `/leave-approvals`, `/team-leave-approvals`
- `/team-dashboard`, `/team-attendance`, `/team-analytics`, `/hr-dashboard`
- `/reports`, `/audit-logs`, `/shifts`, `/roster`, `/holidays`, `/site-management`, `/sites`, `/notifications`, and `*` (`NotFound`)

Sticky table columns (`Roster.jsx`, `TeamAttendance.jsx`) and modals (`AttendanceApprovals.jsx`, `CompanyHolidayCalendar.jsx`, `Shifts.jsx`) remain functional because the outer container uses `overflow-x-clip` instead of `overflow-x-hidden`.

## 3. Remaining Issues / Environment Notes

- **Live Browser Screenshots:** Automated Chrome DevTools inspection (`chrome_devtools` MCP) could not connect because Chrome remote debugging was not active (`Could not find DevToolsActivePort for chrome at C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\DevToolsActivePort`), and `playwright`/`puppeteer` are not installed in the workspace. Visual before/after screenshots across all viewports should be captured once Chrome remote debugging is enabled (`chrome://inspect/#remote-debugging`).
- **Pre-existing ESLint Errors Outside Layout Scope:** `npm run lint` reports 4 pre-existing errors in `src/hooks/useReverseGeocode.js`, `src/pages/Attendance.jsx`, and `src/services/locationService.js`; all modified layout and router files (`Layout.jsx`, `Navbar.jsx`, `Sidebar.jsx`, `App.jsx`) pass ESLint with 0 errors.
