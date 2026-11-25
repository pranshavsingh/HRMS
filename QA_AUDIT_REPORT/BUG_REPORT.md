# Master Bug Report — Enterprise HRMS QA Audit

**Total Confirmed Bugs:** 11  
**Severity Breakdown:**
- **Critical:** 0
- **High:** 3
- **Medium:** 5
- **Low / Cosmetic:** 3

---

## BUG-A01 — Frontend-Backend Authorization Mismatch: Admin Blocked from HR Dashboard API

**Severity:** High

**Category:** Security / RBAC

**Affected Application:** Backend (`node_backend`) & Web (`hrms_saas`)

**Affected Module:** Dashboards / Attendance

**Affected File:** `node_backend/src/routes/attendance.routes.js` & `node_backend/src/services/attendance.service.js`

**Function / Component / API:** `GET /api/v1/attendance/hr-dashboard` / `attendanceService.hrDashboard`

**Line Numbers:** `attendance.routes.js:16`, `attendance.service.js:983`

**Description:**
The React frontend permits users with the `admin` role to access the `/hr-dashboard` route (`allowedRoles={["hr", "admin", "superadmin"]}` in `App.jsx:150`). However, the backend route restricts access using `authorize(["hr", "superadmin"])` and the underlying service explicitly throws `new AppError("Not allowed", 403)` if `role !== "hr" && role !== "superadmin"`. Consequently, an Admin navigating to the HR Dashboard receives an HTTP 403 Forbidden error, resulting in broken charts and unhandled API rejections.

**Preconditions:**
- User account with role `admin` exists and is authenticated.
- Environment has backend API running.

**Steps to Reproduce:**
1. Log in to `hrms_saas` as an `admin` user.
2. Click on "HR Dashboard" in the navigation sidebar or navigate directly to `http://localhost:5173/hr-dashboard`.
3. Observe network request `GET /api/v1/attendance/hr-dashboard`.
4. Inspect the response and UI state.

**Expected Result:**
The Admin user should successfully fetch organizational HR attendance metrics and render the dashboard.

**Actual Result:**
The API returns HTTP 403 Forbidden (`{"success":false,"error":"Not allowed"}`). The dashboard UI crashes or displays a blank layout with an error toast.

**Business Impact:**
System administrators are blocked from monitoring organization-wide attendance, departmental absenteeism, and workforce distribution, crippling administrative visibility.

**Technical Root Cause:**
Route authorization middleware in `attendance.routes.js` and role checking logic in `attendance.service.js` omit the `admin` role from the authorization whitelist, while the frontend router permits it.

**Evidence:**
- Source Code:
  ```javascript
  // node_backend/src/routes/attendance.routes.js:16
  router.get("/hr-dashboard", authorize(["hr", "superadmin"]), attendanceController.hrDashboard);
  ```
  ```javascript
  // node_backend/src/services/attendance.service.js:983
  if (role !== "hr" && role !== "superadmin") {
    throw new AppError("Not allowed", 403);
  }
  ```
- Frontend Code:
  ```jsx
  // hrms_saas/src/App.jsx:150
  <Route path="/hr-dashboard" element={<ProtectedRoute allowedRoles={["hr", "admin", "superadmin"]}><HRDashboard /></ProtectedRoute>} />
  ```

**Recommended Fix:**
Add `"admin"` to the `authorize` role array in `attendance.routes.js` and update the service check in `attendance.service.js:983` to:
`if (role !== "hr" && role !== "admin" && role !== "superadmin") throw new AppError("Not allowed", 403);`

**Regression Test Required:**
Add an automated integration test verifying that an authenticated `admin` user calling `GET /api/v1/attendance/hr-dashboard` receives HTTP 200 OK with valid metrics.

---

## BUG-A02 — Horizontal Authorization Failure: Team Analytics Lacks Direct Report Filtering for Managers

**Severity:** High

**Category:** Security / Data Isolation

**Affected Application:** Backend (`node_backend`)

**Affected Module:** Attendance / Analytics

**Affected File:** `node_backend/src/services/attendance.service.js`

**Function / Component / API:** `attendanceService.teamAnalytics` / `GET /api/v1/attendance/team-analytics`

**Line Numbers:** `attendance.service.js:1120-1153`

**Description:**
In `teamAttendance`, attendance records are strictly filtered by direct reports using `ep.manager_id = managerId`. However, in `teamAnalytics`, the query only applies `siteScope` (`AND ep.site_id = ?`) without filtering by `ep.manager_id = managerId` when the requesting user is a manager. As a result, a manager viewing team analytics sees aggregate presence, work hours, and absence trends of employees belonging to other managers at the same work site.

**Preconditions:**
- Multiple managers assigned to different teams at the same physical work site.
- Employees assigned to each respective manager.

**Steps to Reproduce:**
1. Log in as Manager A (responsible for Engineering team at Site 1).
2. Navigate to Manager Dashboard -> Team Analytics.
3. Inspect the returned employee count, average hours, and department distribution.

**Expected Result:**
Analytics should reflect only the direct reports of Manager A.

**Actual Result:**
Analytics include all employees stationed at Site 1, including Sales and Support teams managed by Manager B.

**Business Impact:**
Breaches departmental data confidentiality and employee privacy policies. Managers can deduce work habits and absence patterns of other managerial units.

**Technical Root Cause:**
The SQL query builder in `teamAnalytics` fails to check `if (role === 'manager')` and omit the `ep.manager_id = ?` clause.

**Evidence:**
- Source Code (`node_backend/src/services/attendance.service.js:1120`):
  ```javascript
  const sql = `
    SELECT COUNT(DISTINCT u.id) as total_team_members ...
    FROM users u
    JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
    WHERE 1=1 ${siteScope}
  `;
  // Notice ep.manager_id is NOT included in the WHERE clause when role === 'manager'!
  ```

**Recommended Fix:**
Update `teamAnalytics` to dynamically append `AND ep.manager_id = ?` when `role === 'manager'`, passing `managerId` into the query parameters array.

**Regression Test Required:**
Add an integration test asserting that Manager A only receives metrics for employees where `employee_profiles.manager_id == Manager A.id`.

---

## BUG-A03 — Account Enumeration via Pre-Authentication Status Validation

**Severity:** High

**Category:** Security / Authentication

**Affected Application:** Backend (`node_backend`)

**Affected Module:** Accounts & Auth

**Affected File:** `node_backend/src/services/accounts.service.js`

**Function / Component / API:** `accountsService.login` / `POST /api/auth/login`

**Line Numbers:** `accounts.service.js:69-71`

**Description:**
During the login flow, the backend checks whether the account is active (`if (!user.is_active) throw new AppError("Account is inactive...", 400);`) *before* invoking `verifyPassword`. An attacker can submit arbitrary usernames or emails with random passwords; if the API returns "Account is inactive", the attacker confirms that the account exists in the system.

**Preconditions:**
- An inactive user account exists in the database (`is_active = 0`).

**Steps to Reproduce:**
1. Send `POST /api/auth/login` with an inactive user's email and a completely bogus password (e.g. `WrongPassword123!`).
2. Observe HTTP response status and error message.

**Expected Result:**
The server should return HTTP 401 Unauthorized with a generic message ("Invalid email or password").

**Actual Result:**
The server returns HTTP 400 Bad Request with `"Account is inactive. Please contact your administrator."` without checking the password.

**Business Impact:**
Enables malicious actors to enumerate corporate employee email addresses, identify terminated or inactive staff, and perform targeted spear-phishing or credential stuffing.

**Technical Root Cause:**
Order-of-operations vulnerability: account status check precedes cryptographic password verification.

**Evidence:**
- Source Code (`node_backend/src/services/accounts.service.js:69`):
  ```javascript
  if (!user.is_active) {
    throw new AppError("Account is inactive. Please contact administrator.", 400);
  }
  const isMatch = await verifyPassword(password, user.password_hash);
  if (!isMatch) throw new AppError("Invalid credentials", 401);
  ```

**Recommended Fix:**
Verify the password first. Only after successful credential validation should account status be checked:
```javascript
const isMatch = await verifyPassword(password, user.password_hash);
if (!isMatch) throw new AppError("Invalid credentials", 401);
if (!user.is_active) throw new AppError("Account is inactive. Please contact administrator.", 403);
```

**Regression Test Required:**
Write a test asserting that submitting an invalid password for an inactive user returns HTTP 401 "Invalid credentials".

---

## BUG-A04 — Orphaned Feature: Work Site Management Page Unlinked in Frontend Shell

**Severity:** Medium

**Category:** Functional / UI

**Affected Application:** Web (`hrms_saas`)

**Affected Module:** Work Site & Workforce Management

**Affected File:** `hrms_saas/src/pages/SiteManagement.jsx`, `hrms_saas/src/App.jsx`, `hrms_saas/src/components/layout/Sidebar.jsx`

**Function / Component / API:** `SiteManagement` / Route declaration

**Line Numbers:** `App.jsx` (Missing Route), `Sidebar.jsx` (Missing Link)

**Description:**
The codebase includes a fully realized `SiteManagement.jsx` component and full backend APIs for creating sites, updating coordinates, and setting geofence radii. However, `SiteManagement` is not registered in `App.jsx` and has no entry in `Sidebar.jsx`. As a result, Admin and HR users have no UI mechanism to manage physical office locations or geofence settings.

**Preconditions:**
- Authenticated Admin user navigating the application shell.

**Steps to Reproduce:**
1. Log in as `admin`.
2. Review all sidebar navigation items.
3. Observe absence of "Site Management" or "Work Sites".
4. Attempt to navigate directly to `/site-management` or `/sites`.

**Expected Result:**
Site Management page loads with site lists, coordinates, and geofence configuration forms.

**Actual Result:**
Browser displays 404 / redirects to unauthorized or dashboard.

**Business Impact:**
Administrators cannot configure physical offices or geofence boundaries via the web interface without direct database manipulation.

**Technical Root Cause:**
The component was developed but not wired into the router and sidebar configuration.

**Evidence:**
- File exists at `hrms_saas/src/pages/SiteManagement.jsx`.
- Grep of `App.jsx` shows zero references to `SiteManagement`.

**Recommended Fix:**
Import `SiteManagement` in `App.jsx`, register `<Route path="/sites" element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><SiteManagement /></ProtectedRoute>} />`, and add a navigation item in `Sidebar.jsx`.

**Regression Test Required:**
Add a routing test verifying that `/sites` renders `SiteManagement` for `admin` and `superadmin` roles.

---

## BUG-A05 — Sandwich Leave Policy Evasion via Consecutive Split Applications

**Severity:** Medium

**Category:** Business Logic / Payroll

**Affected Application:** Backend (`node_backend`)

**Affected Module:** Leave Management

**Affected File:** `node_backend/src/services/leave.service.js`

**Function / Component / API:** `leaveService.applyLeave` / `leaveDays`

**Line Numbers:** `leave.service.js:16-20`, `leave.service.js:124-140`

**Description:**
The sandwich leave policy is designed to treat weekend days or holidays as leave days if an employee takes leave on both surrounding working days. The system calculates this correctly when an employee applies for a single range spanning Friday through Monday (deducting 4 days). However, if an employee applies for Friday in Request 1 and Monday in Request 2, the system processes them independently and deducts only 2 days, evading the sandwich penalty.

**Preconditions:**
- Standard weekend policy (Saturday and Sunday are Weekly Offs).
- Employee has sufficient leave balance.

**Steps to Reproduce:**
1. Submit Leave Request A for Friday (1 day).
2. Submit Leave Request B for following Monday (1 day).
3. Both requests get approved by Manager/HR.
4. Check leave balance deduction.

**Expected Result:**
The system should detect that the weekend (Saturday-Sunday) is sandwiched between two approved leave applications and deduct 4 days total.

**Actual Result:**
Only 2 days are deducted from the employee's leave balance.

**Business Impact:**
Employees can systematically circumvent company sandwich leave rules, leading to unauthorized paid time off and incorrect payroll deductions.

**Technical Root Cause:**
`applyLeave` only inspects the date range of the incoming request (`fromDate` to `toDate`) without querying adjacent approved leave records in `leave_requests`.

**Evidence:**
- Source Code (`leave.service.js:16`):
  ```javascript
  function leaveDays(fromDate, toDate) {
    // Only counts days between fromDate and toDate of the CURRENT request
  }
  ```

**Recommended Fix:**
During leave submission or approval, query `leave_requests` for approved leaves immediately preceding `fromDate - 1 day` or succeeding `toDate + 1 day` separated by non-working days (Weekly Offs/Holidays). If detected, convert intermediate days to sandwich leave.

**Regression Test Required:**
Automated unit test verifying that split applications for Friday and Monday deduct 4 days when sandwich policy is active.

---

## BUG-A06 — Roster Generation Modal Lacks Site Selector Triggering Header Warning Popup

**Severity:** Medium

**Category:** UI / Workflow Friction

**Affected Application:** Web (`hrms_saas`)

**Affected Module:** Shift & Roster Planning

**Affected File:** `hrms_saas/src/pages/Roster.jsx`

**Function / Component / API:** `Roster` / `handleGenerateRoster`

**Line Numbers:** `Roster.jsx:491-494`

**Description:**
When a manager opens the "Generate Draft Roster" modal, the modal displays Start Date, End Date, and Team Filter, but does not provide a Work Site dropdown. If the user has "All Sites" or no site selected in the top page header, clicking "Generate" triggers an intrusive warning modal: *"Select one work site in the header before generating a roster"* (as captured in user evidence screenshot).

**Preconditions:**
- User on Roster page with global site filter unselected or set to "All Sites".

**Steps to Reproduce:**
1. Navigate to `/roster`.
2. Ensure top header site filter is set to "All Sites".
3. Click "Generate Roster" button.
4. Click "Generate" inside the modal.

**Expected Result:**
The modal should either include a Work Site selector or default to the user's primary work site without throwing an error dialog.

**Actual Result:**
Warning modal appears: *"Select one work site in the header before generating a roster"*.

**Business Impact:**
Creates user friction, confusion, and support tickets for managers attempting to publish monthly team rosters.

**Technical Root Cause:**
`handleGenerateRoster` relies exclusively on the ambient page-level `siteId` state rather than providing an explicit site selector inside the generation dialog.

**Evidence:**
- Source Code (`hrms_saas/src/pages/Roster.jsx:491`):
  ```javascript
  if (!siteId || siteId === "all" || siteId === "unassigned") {
    popup?.showPopup("Select one work site in the header before generating a roster", "warning");
    return;
  }
  ```
- User Screenshot: `media_1795432720345_f4a43139.png`.

**Recommended Fix:**
Add a "Work Site" dropdown selector directly inside the "Generate Draft Roster" dialog so managers can select or verify the target site directly without having to close the modal.

**Regression Test Required:**
UI component test asserting that opening the Generate Roster modal when header site is "all" allows selecting a site from inside the modal.

---

## BUG-A07 — Incomplete Session Revocation When Redis Cache is Offline

**Severity:** Medium

**Category:** Security / Session Lifecycle

**Affected Application:** Backend (`node_backend`)

**Affected Module:** Authentication & Middleware

**Affected File:** `node_backend/src/middleware/auth.js` & `node_backend/src/services/accounts.service.js`

**Function / Component / API:** `authMiddleware` / `logout`

**Line Numbers:** `auth.js:35-45`, `accounts.service.js:145-160`

**Description:**
When a user logs out, the backend attempts to add the JWT access token to a Redis blacklist. If Redis is unavailable or disconnected, the service catches the error silently and returns HTTP 200 OK. However, because JWTs are stateless, the token remains valid and can continue to be used to make authenticated requests until its TTL expires.

**Preconditions:**
- Redis service offline or network-isolated.
- User logs out with valid access token.

**Steps to Reproduce:**
1. Stop Redis service.
2. Log in and obtain valid access token.
3. Call `POST /api/auth/logout`.
4. Immediately submit a request to `GET /api/auth/me` with the logged-out token.

**Expected Result:**
The token should be rejected or session invalidated.

**Actual Result:**
Request succeeds with HTTP 200 OK using the logged-out token.

**Business Impact:**
Allows session hijacking or token replay if an employee logs out on a shared terminal.

**Technical Root Cause:**
No database-backed fallback token revocation table exists when Redis is unreachable.

**Evidence:**
- `auth.js` checks Redis for blacklist; if Redis is unreachable, error is caught and token validation proceeds based solely on JWT signature.

**Recommended Fix:**
Maintain a database fallback blacklist table or use short-lived access tokens (10 minutes) with database-backed refresh tokens.

**Regression Test Required:**
Test asserting that upon logout without Redis, subsequent calls with the token fail.

---

## BUG-A08 — Sensitive Auth State Stored in Plain LocalStorage

**Severity:** Medium

**Category:** Security / Storage

**Affected Application:** Web (`hrms_saas`)

**Affected Module:** Authentication Client

**Affected File:** `hrms_saas/src/context/AuthContext.jsx`

**Function / Component / API:** `AuthContext` state initialization

**Line Numbers:** `AuthContext.jsx:24-35`

**Description:**
The web client persists JWT access and refresh tokens directly in browser `localStorage`. Any prospective Cross-Site Scripting (XSS) vulnerability or rogue third-party dependency can access `localStorage.getItem("token")` and exfiltrate user credentials.

**Preconditions:**
- User logged in via web application.

**Steps to Reproduce:**
1. Log in to `hrms_saas`.
2. Open DevTools -> Application -> Local Storage.
3. Inspect `token` and `refreshToken` keys.

**Expected Result:**
Tokens stored in secure, HttpOnly, SameSite cookies.

**Actual Result:**
Tokens stored in plain text inside `localStorage`.

**Business Impact:**
Increases blast radius of any future XSS defect to full session compromise.

**Technical Root Cause:**
Client-side token architecture chosen instead of server-managed HttpOnly cookies.

**Recommended Fix:**
Transition refresh tokens to HttpOnly, SameSite=Lax cookies, and store access tokens in React memory.

**Regression Test Required:**
Security audit test verifying `document.cookie` / `localStorage` boundaries.

---

## BUG-A09 — Incomplete Attendance History UI Presentation for Forgotten Punch-Out

**Severity:** Low

**Category:** UI / Functional

**Affected Application:** Web (`hrms_saas`)

**Affected Module:** Attendance History

**Affected File:** `hrms_saas/src/pages/History.jsx`

**Function / Component / API:** `History` row renderer

**Line Numbers:** `History.jsx:180-210`

**Description:**
When an employee forgets to punch out and the midnight cron sets the session to `pending` with `0.00` hours, the Attendance History table displays the row with status "Pending" and "0.00 hrs". However, the UI does not offer an inline "Regularize" button on that row, requiring the employee to navigate to the separate Regularization page and re-enter the date manually.

**Preconditions:**
- Attendance record flagged as `pending` by forgotten punch-out cron.

**Steps to Reproduce:**
1. Log in as employee with a forgotten punch-out record.
2. Navigate to `/history`.
3. Locate the pending record with 0.00 hours.

**Expected Result:**
Row displays an actionable badge or button: "Regularize This Day" linking directly to the regularization form with pre-filled date.

**Actual Result:**
Static table cell showing "Pending" without actionable CTA.

**Business Impact:**
Creates employee confusion regarding zero hours and delays monthly attendance closure.

**Technical Root Cause:**
Missing interactive action handler in the `History.jsx` table column definitions.

**Recommended Fix:**
Render a "Regularize" action button on rows where `status === 'pending'` and `punch_out_time === null`, passing the row date via state to the regularization form.

**Regression Test Required:**
Component test verifying that pending rows render a regularize link.

---

## BUG-A10 — Geolocation Accuracy Threshold Inconsistency Between Web and Mobile

**Severity:** Low

**Category:** Functional / Cross-Platform Parity

**Affected Application:** Web (`hrms_saas`) & Mobile (`hrms_mobile`)

**Affected Module:** Attendance / Geolocation

**Affected File:** `hrms_saas/src/pages/Attendance.jsx` & `hrms_mobile/src/services/location.ts`

**Function / Component / API:** Geolocation accuracy filter

**Line Numbers:** `Attendance.jsx:142`, `location.ts:58`

**Description:**
The web application rejects GPS fixes with an accuracy radius exceeding 50 meters, whereas the mobile application accepts fixes with an accuracy radius up to 100 meters. As a result, an employee attempting to punch in from a specific desk inside a building may be rejected on the web browser with a "Low GPS accuracy" error while succeeding on the mobile app.

**Preconditions:**
- Employee located at office desk where indoor GPS accuracy is ~75 meters.

**Steps to Reproduce:**
1. Open web application on laptop and attempt punch-in.
2. Fix returns accuracy of 75 meters.
3. Web application rejects with accuracy error.
4. Open mobile app on smartphone at same desk.
5. Mobile app accepts fix and records punch.

**Expected Result:**
Consistent accuracy thresholds and behavior across platforms.

**Actual Result:**
Web rejects punch while mobile allows it.

**Business Impact:**
Inconsistent user experience causing employees to believe the web application is broken.

**Technical Root Cause:**
Divergent constant definitions: `MAX_ACCURACY = 50` on web vs `MAX_ACCURACY = 100` on mobile.

**Recommended Fix:**
Standardize accuracy tolerance across both platforms (recommended: 75m - 100m for indoor commercial facilities).

**Regression Test Required:**
Unit test validating accuracy validation logic against standardized constants.

---

## BUG-A11 — Calendar Month Boundary Offset in Monthly Roster View

**Severity:** Low

**Category:** UI / Date Handling

**Affected Application:** Web (`hrms_saas`)

**Affected Module:** Roster Management

**Affected File:** `hrms_saas/src/pages/Roster.jsx`

**Function / Component / API:** `Roster` / `loadCalendar`

**Line Numbers:** `Roster.jsx:215-240`

**Description:**
When switching between months on the Roster Calendar, local date conversions using `new Date(year, month, 1).toISOString()` cause the request parameter to shift back by one day in timezones behind UTC (or forward near UTC boundaries), leading to misaligned day columns on the calendar grid.

**Preconditions:**
- Browser running in non-UTC timezone (e.g. UTC-5 or UTC+5:30).

**Steps to Reproduce:**
1. Navigate to `/roster`.
2. Toggle month forward and backward.
3. Inspect the first day of the month column header.

**Expected Result:**
First day of the month corresponds accurately to the calendar weekday.

**Actual Result:**
On specific boundary dates, the first day shifts by one column.

**Business Impact:**
Minor visual confusion when planning monthly shift rosters.

**Technical Root Cause:**
Mixing UTC `toISOString()` representations with local date constructor arguments.

**Recommended Fix:**
Use format string `YYYY-MM-01` constructed directly from numeric month and year values without converting through `toISOString()`.

**Regression Test Required:**
Date formatting utility test across diverse timezone offsets.
