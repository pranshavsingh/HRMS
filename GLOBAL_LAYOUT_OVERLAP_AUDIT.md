# Global Layout Overlap Audit

## 1. Executive Summary

Every authenticated page in `hrms_saas` renders inside `src/components/layout/Layout.jsx`, where a Tailwind CSS cascade conflict caused the fixed `64px` (`4rem`) top navbar to overlap the top `40px` of page content at all viewports `>= 640px` (`sm:` and above).

## 2. Root Cause Analysis

### 2.1 Primary Root Cause: Shorthand `p-4 sm:p-6` Overriding `pt-20`
- **File:** `f:\hrms\hrms_saas\src\components\layout\Layout.jsx`, line 19 (before fix)
- **Original Code:**
  ```jsx
  <div className="pt-20 p-4 sm:p-6 bg-gray-100 min-h-screen min-w-0">
    {children}
  </div>
  ```
- **Navbar Height:** `f:\hrms\hrms_saas\src\components\layout\Navbar.jsx`, line 81:
  ```jsx
  <div className="fixed top-0 left-0 lg:left-64 right-0 h-16 ... z-40">
  ```
  `h-16` = `4rem` = `64px` fixed at `top: 0`.
- **Observed Compiled CSS Cascade (`dist/assets/index-DHu_BWQ5.css` before fix):**
  - Byte `59302`: `.p-4 { padding: calc(var(--spacing) * 4) }` (`1rem` = `16px`)
  - Byte `60964`: `.pt-20 { padding-top: calc(var(--spacing) * 20) }` (`5rem` = `80px`)
  - Byte `94137`: `@media (min-width: 40rem) { .sm\:p-6 { padding: calc(var(--spacing) * 6) } }` (`1.5rem` = `24px`)
- **Impact:** At every viewport `>= 640px` (`40rem`), `.sm\:p-6` appeared later in the stylesheet inside `@media (min-width: 40rem)` and overrode `.pt-20`, collapsing `padding-top` from `80px` down to **`24px`**. Because the `fixed` navbar is `64px` tall, **`40px` (`64px - 24px`) of the top of every page's hero section / first heading was hidden underneath the navbar**.

### 2.2 Secondary Structural Findings
1. **No centralized layout tokens:** Navbar height (`h-16`) and sidebar width (`w-64`, `lg:ml-64`, `lg:left-64`) were hardcoded across `Layout.jsx`, `Navbar.jsx`, and `Sidebar.jsx`.
2. **Non-semantic nested `min-h-screen`:** Both the outer wrapper (`Layout.jsx:9`) and inner content wrapper (`Layout.jsx:19`) declared `min-h-screen` without a flex-column `<main>` structure.
3. **Missing route scroll reset:** `f:\hrms\hrms_saas\src\App.jsx` had no scroll restoration on route transitions, allowing `window.scrollY` to persist when navigating between pages, and `html` lacked `scroll-padding-top` for anchor/focus scrolling under the fixed navbar.
4. **Sidebar mobile viewport height:** `Sidebar.jsx:60` used `h-screen` (`100vh`) without `100dvh` support for mobile browsers with dynamic toolbars.

## 3. Scope of Affected Pages

All 24 authenticated routed pages in `f:\hrms\hrms_saas\src\App.jsx` wrap their UI in `<Layout>` (including `Dashboard.jsx` -> `EmployeeDashboard`, `ManagerDashboard`, `HRDashboard`, `AdminDashboard`, `Attendance`, `AttendanceHistory`, `MonthlyRegister`, `Leave`, `Documents`, `Employees`, `EmployeeDocuments`, `AttendanceApprovals`, `LeaveApprovals`, `TeamDashboard`, `TeamAttendance`, `TeamAnalytics`, `Reports`, `AuditLogs`, `Shifts`, `Roster`, `CompanyHolidayCalendar`, `SiteManagement`, `Notifications`, and `NotFound` when authenticated). None of the pages had negative top margins (`-mt-*`) overriding `Layout`.
