# Enterprise HRMS — Staging Validation & Deployment Checklist

**Repository:** `pranshavsingh/HRMS`  
**Branch:** `fix/hrms-5-cross-platform-bugs`  
**Target Environments:** Staging & Production  
**Date:** November 23, 2026  

---

## 1. Pre-Deployment Database Migrations

Run database migrations before rolling out backend code:
- [ ] **Migration 023:** Ensure `accounts_revoked_token` table exists:
  ```bash
  mysql -u <user> -p <database> < node_backend/scripts/migrations/023_accounts_revoked_tokens.sql
  ```
- [ ] **Migration 024:** Ensure composite index `idx_leave_status_user` exists on `leave_leave`:
  ```bash
  mysql -u <user> -p <database> < node_backend/scripts/migrations/024_leave_status_user_index.sql
  ```
- [ ] Verify both migrations:
  ```bash
  node --env-file=node_backend/.env -e "import('./node_backend/src/db/index.js').then(async ({ db }) => { console.log(await db.all('SHOW TABLES LIKE \"accounts_revoked_token\"')); console.log(await db.all('SHOW INDEX FROM leave_leave WHERE Key_name = \"idx_leave_status_user\"')); process.exit(0); })"
  ```

---

## 2. Role-Based Staging Acceptance Tests

### Scenario A: Admin Access to HR Dashboard (BUG-A01)
1. Log in with role: `admin`.
2. Navigate to `/dashboard` and click the "HR View" or navigate directly to `/dashboard` (switch to HR tab).
3. **Expectation:** Dashboard loads organization-wide attendance cards, headcounts, and present/absent stats without HTTP 403 error.

### Scenario B: Manager Team Analytics Scoping (BUG-A02)
1. Log in with role: `manager` (assigned direct reports).
2. Navigate to Team Analytics.
3. **Expectation:** Metrics and graphs reflect only direct report attendance data; no cross-department employees or statistics are exposed.
4. Log in as `hr` or `admin`.
5. **Expectation:** Global statistics covering all departments are visible.

### Scenario C: Anti-Enumeration Authentication (BUG-A03)
1. Enter an inactive user's email with an incorrect password.
2. **Expectation:** Response is `HTTP 400: "Invalid credentials"`.
3. Enter an active user's email with an incorrect password.
4. **Expectation:** Response is `HTTP 400: "Invalid credentials"` with identical error signature and delay.

### Scenario D: Site Management Web Access (BUG-A04)
1. Log in as `admin` or `superadmin`.
2. Observe the sidebar for "Site Management" with MapPin icon.
3. Click "Site Management" or navigate to `/site-management`.
4. **Expectation:** Page loads within standard application shell (`<Layout>`), displays sites list, and allows adding/editing work sites.
5. Log in as `employee` or `manager` and attempt navigating to `/site-management`.
6. **Expectation:** Access is denied and user is redirected to `/dashboard`.

### Scenario E: Roster Generation Work Site Scoping (BUG-A06)
1. Log in as `admin` or `hr`.
2. Navigate to Roster (`/roster?tab=calendar`).
3. Click "Generate Draft Roster" button.
4. **Expectation:** Modal opens containing a dedicated "Work Site *" dropdown.
5. Select a site, fill dates, and submit.
6. **Expectation:** Draft roster generates for the selected site without displaying the modal header warning.

### Scenario F: Session Revocation Without Redis (BUG-A07)
1. Log in to obtain a valid access token.
2. Stop the Redis container/service (`docker stop redis`).
3. Click "Logout" in web UI.
4. **Expectation:** Logout succeeds. Re-requesting a protected API with the prior token yields HTTP 401 Unauthorized via the MariaDB blacklist fallback.
5. Restart Redis.

### Scenario G: Attendance Regularization Workflow (BUG-A09)
1. Log in as `employee` who has an incomplete punch (missing punch-out).
2. Navigate to Attendance History (`/attendance-history`).
3. Verify that the record row displays a "Regularize Now" button.
4. Click "Regularize Now".
5. Enter proposed punch-out time and explanation reason; submit.
6. **Expectation:** Success popup appears; status updates to "pending"; reviewer receives approval request in Attendance Approvals queue.

### Scenario H: GPS Accuracy Parity (BUG-A10)
1. On Web: Attempt punch-in when browser geolocation has weak accuracy (> 100m).
2. **Expectation:** Warning popup alerts that accuracy exceeds 100m tolerance; punch is halted before upload.
3. On Mobile: Attempt punch-in with weak GPS signal (> 100m).
4. **Expectation:** Native alert prompts user to acquire high-accuracy GPS; punch submission blocked.
5. When GPS accuracy is within 100m:
6. **Expectation:** Punch succeeds on both platforms.

### Scenario I: Roster Timezone Date Boundary (BUG-A11)
1. Change client machine timezone to UTC-5 or UTC+1.
2. Open Roster calendar (`/roster?tab=calendar`).
3. **Expectation:** Column headers, weekly dates, and "Today" indicator match India Standard Time (`Asia/Kolkata`) calendar date without shifting backward or forward.
