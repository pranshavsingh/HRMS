# Enterprise HRMS — Technical Bug Fix Details

**Repository:** `pranshavsingh/HRMS`  
**Date:** November 23, 2026  
**Document:** Technical Root Cause & Remediation Details  

---

### BUG-A01: HR Dashboard 403 Forbidden for Admin Role

- **Problem:** When an administrator navigated to the HR Dashboard or requested `/api/v1/attendance/hr-dashboard/`, the backend rejected the request with HTTP 403 Forbidden because route middleware was `authorize(["hr", "superadmin"])` and service logic checked `if (role !== "hr" && role !== "superadmin")`. In standard enterprise HRMS RBAC, `admin` is authorized for organization-wide attendance management.
- **Root Cause:** Incomplete role authorization list in route and service handlers.
- **Code Changes:**
  - `node_backend/src/routes/attendance.routes.js:16`:
    ```javascript
    r.get("/hr-dashboard/", authenticate, authorize(["hr", "admin", "superadmin"]), c.hrDashboard);
    ```
  - `node_backend/src/services/attendance.service.js:1038`:
    ```javascript
    if (role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }
    ```
- **Verification:** Unit tests confirm route authorization and service execution allow `admin` alongside `hr` and `superadmin`.

---

### BUG-A02: Manager Cross-Manager Data Leakage in Team Analytics

- **Problem:** In `/api/v1/attendance/team-analytics/`, when a manager requested metrics without explicit employee filtering, the service queried team statistics without bounding the query to `ep.manager_id = managerId`. This allowed managers to view cross-manager attendance KPIs.
- **Root Cause:** Lack of role differentiation between global viewers (`hr`, `admin`, `superadmin`) and scoped viewers (`manager`).
- **Code Changes:**
  - `node_backend/src/services/attendance.service.js:1127`:
    ```javascript
    const isGlobalViewer = role === "hr" || role === "admin" || role === "superadmin";
    if (!isGlobalViewer) {
      whereConditions.push("ep.manager_id = ?");
      params.push(managerId);
    }
    ```
- **Verification:** Automated tests verify direct reports filter is unconditionally applied when `role === "manager"`.

---

### BUG-A03: Inactive User Enumeration in Authentication Flow

- **Problem:** The login service checked `!user.is_active` before validating the user's password hash (`verifyPassword`). This allowed an external attacker to probe whether an account exists and whether it is active/inactive without needing a valid password.
- **Root Cause:** Incorrect control flow order during credential verification.
- **Code Changes:**
  - `node_backend/src/services/accounts.service.js:64-77`:
    ```javascript
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new AppError("Invalid credentials", 400);
    }
    if (!user.is_active) {
      logger.warn(`Login attempt for inactive user ${user.id} (${user.email})`);
      throw new AppError("Invalid credentials", 400);
    }
    ```
- **Verification:** Tests verify `verifyPassword` executes strictly before `is_active` check and both failure paths emit identical error payloads.

---

### BUG-A04: Site Management Frontend Unrouted & Unlinked

- **Problem:** `SiteManagement.jsx` was present in the codebase but lacked `<Layout>` wrapping, had no route registered in `App.jsx`, and was missing from the sidebar navigation, making work site configuration inaccessible from the web UI.
- **Root Cause:** Incomplete component integration.
- **Code Changes:**
  - `hrms_saas/src/pages/SiteManagement.jsx`: Wrapped inside `<Layout>`.
  - `hrms_saas/src/App.jsx`: Registered routes `/site-management` and `/sites` restricted to `["admin", "superadmin"]`.
  - `hrms_saas/src/components/layout/Sidebar.jsx`: Added `<MapPin size={18} /> Site Management` link for Admin and Superadmin.
  - `hrms_saas/src/components/layout/Navbar.jsx`: Added breadcrumb/title mapping for `/site-management` and `/sites`.
- **Verification:** App routing and sidebar links verified in `master_audit_remediation.test.js`.

---

### BUG-A06: Roster Generation Modal Lacks Work Site Selector

- **Problem:** The Generate Draft Roster modal did not expose a work site dropdown. If a site was not previously selected in the global header, clicking "Generate" prompted an alert warning ("Select one work site in the header before generating a roster"), interrupting user workflow.
- **Root Cause:** Disconnect between modal form inputs and site scoping requirements.
- **Code Changes:**
  - `hrms_saas/src/pages/Roster.jsx`:
    - Loaded `sites` and `loadingSites` from `useSite()`.
    - Added work site dropdown inside the Generate Draft Roster modal dialog.
    - Updated `handleGenerateRoster` to prioritize modal-selected `generateForm.site_id` with fallback to header `siteId`, validating site selection and submitting `site_id: Number(targetSiteId)`.
- **Verification:** Verified form binding and site context consumption.

---

### BUG-A07: Fallback DB Token Revocation When Redis is Down

- **Problem:** Token blacklisting on logout relied entirely on Redis (`redisClient.setEx(`bl_${jti}`...)`). If Redis experienced downtime or network isolation, logout would fail or revoked tokens could be reused until JWT expiration.
- **Root Cause:** Single point of failure in session revocation architecture.
- **Code Changes:**
  - Database Migration `023_accounts_revoked_tokens.sql`: Created table `accounts_revoked_token (id, jti, user_id, expires_at, created_at)` with unique index on `jti` and index on `expires_at`.
  - `node_backend/src/services/accounts.service.js:345`: On logout, writes revoked `jti` to `accounts_revoked_token`.
  - `node_backend/src/middleware/auth.js:30-40`: When Redis is unavailable or JTI not found in Redis, queries `accounts_revoked_token`.
  - `node_backend/src/controllers/accounts.controller.js:415`: Added fallback DB check in SSE ticket issuance.
  - `node_backend/src/utils/cron.js:72`: Hourly cleanup purging expired revoked tokens (`DELETE FROM accounts_revoked_token WHERE expires_at < NOW()`).
- **Verification:** Automated tests verify DB persistence and blacklist queries.

---

### BUG-A08: Removal of Insecure localStorage Token Fallbacks

- **Problem:** `RealtimeContext.jsx` fell back to reading auth tokens from `localStorage.getItem("token")` when in-memory token was null, violating enterprise HttpOnly / in-memory token storage standards and exposing tokens to XSS exfiltration.
- **Root Cause:** Legacy fallback logic from earlier development stages.
- **Code Changes:**
  - `hrms_saas/src/context/RealtimeContext.jsx`: Removed all references to `localStorage.getItem("token")`. Enforced `getInMemoryToken()` accessor.
- **Verification:** Static and unit tests verify complete absence of `localStorage.getItem('token')` in `RealtimeContext.jsx`.

---

### BUG-A09: Attendance Regularization Workflow (API & UI)

- **Problem:** Employees who forgot to punch out or had pending records had no self-service mechanism in the Attendance History UI to request regularization.
- **Root Cause:** Absence of a dedicated regularization request endpoint and corresponding frontend action.
- **Code Changes:**
  - `node_backend/src/services/attendance.service.js`: Added `regularizeAttendance(userId, attendanceId, punchOutTime, reason)`. Validates record ownership, time format, pending duplicate requests, calculates new total hours, routes approval via `approvalRouteForUser`, and creates pending record in `attendance_attendanceapproval`.
  - `node_backend/src/controllers/attendance.controller.js`: Added `regularizeAttendance` handler.
  - `node_backend/src/routes/attendance.routes.js`: Added `POST /attendance/regularize/` route.
  - `hrms_saas/src/pages/AttendanceHistory.jsx`: Added "Action" column in table, "Regularize Now" button for records with missing/pending punch-out, and a modal dialog capturing proposed punch-out time and reason.
- **Verification:** Verified end-to-end API and UI flow in `master_audit_remediation.test.js`.

---

### BUG-A10: Standardized GPS Accuracy (100m Threshold Parity)

- **Problem:** GPS accuracy tolerances were inconsistent across platforms. Web allowed unbounded accuracy values, and mobile checked `Location.Accuracy.High` without validating the resulting `accuracy` in meters against enterprise limits.
- **Root Cause:** Missing centralized accuracy validation rule.
- **Code Changes:**
  - `node_backend/src/services/attendance.service.js`: In `punchIn` and `punchOut`, rejects requests where `accuracy > 100` meters with HTTP 400 error.
  - `node_backend/src/middleware/validation.js`: Added `accuracy` (0 - 10000 optional float) to `punchSchema`.
  - `hrms_saas/src/pages/Attendance.jsx`: Rejects punch if `coords.accuracy > 100` meters, alerts user to acquire higher precision, and passes `accuracy` in both Cloudinary direct and multipart relay flows.
  - `hrms_mobile/src/app/(tabs)/punch.tsx`: Checks `loc.coords.accuracy <= 100`, alerts on weak GPS signal, and appends `accuracy` to multipart request.
- **Verification:** Tested on backend, web, and mobile app code in `master_audit_remediation.test.js`.

---

### BUG-A11: Timezone & Roster Date Boundary Consistency

- **Problem:** Local browser date formatting using client timezone caused roster columns and date ranges to shift backward or forward near midnight for users outside `Asia/Kolkata` (or in different UTC offsets).
- **Root Cause:** Direct use of `date.getFullYear()` / `date.getDate()` and `Date` constructors without anchoring to company timezone or UTC noon.
- **Code Changes:**
  - `hrms_saas/src/pages/Roster.jsx`:
    - Imported `getCompanyLocalDate` from `../utils/date`.
    - Rewrote `dateOnly(date)` to delegate to `getCompanyLocalDate(date)`.
    - Anchored `visibleDates` iteration using `Date.UTC(y, m - 1, d, 12, 0, 0)` so date string generation is immune to local client offsets and DST.
    - Set `todayDate = getCompanyLocalDate()`.
- **Verification:** Tested timezone date generation across IST midnight in `master_audit_remediation.test.js`.

---

### PERF-01: Composite Index on `leave_leave (status, user_id)`

- **Problem:** Reviewer and manager leave approval queries (`SELECT * FROM leave_leave WHERE status = 'pending' AND user_id IN (...)`) relied on single-column indexes, causing index intersection or table scans as leave volume grew.
- **Root Cause:** Missing composite index on filter columns.
- **Code Changes:**
  - Migration `024_leave_status_user_index.sql`:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_leave_status_user ON leave_leave (status, user_id);
    ```
  - Applied directly to MariaDB database.
- **Verification:** Confirmed presence and column order via `SHOW INDEX FROM leave_leave WHERE Key_name = 'idx_leave_status_user'`.
