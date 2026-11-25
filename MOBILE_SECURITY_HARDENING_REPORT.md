# MOBILE SECURITY HARDENING REPORT

**Project:** Enterprise HRMS Mobile Application (`hrms_mobile`)  
**Audit Scope:** Server-side Enforcement of Mobile Restrictions, Endpoint Protection & Authorization Controls  
**Audit Date:** November 24, 2026  

---

## 1. Executive Security Summary

In accordance with enterprise data protection directives, strict mobile security policies have been implemented across the backend API and mobile client:

1. **Employee Account / ID Creation:** Strictly forbidden on all mobile devices for HR, Admin, Superadmin, and any client connecting via the mobile application.
2. **Employee Data & Report Exports:** Strictly forbidden on all mobile devices.
3. **Defense-in-Depth:** Enforcement is applied simultaneously at the Express routing layer, authorization middleware, controller business logic, and mobile UI components.

---

## 2. Server-side Enforcement Architecture

### 2.1 Middleware: `restrictMobileEmployeeCreation`
- **Location:** [node_backend/src/middleware/auth.js](file:///f:/hrms/node_backend/src/middleware/auth.js#L108-L120)
- **Mechanism:** Inspects incoming `X-Platform` header, request body `platform`, and URL query parameters. If the client identifies as `"mobile"`, `"android"`, or `"ios"`, the request is immediately aborted before reaching validation, controller, or database layers:
  ```javascript
  export function restrictMobileEmployeeCreation(req, res, next) {
    const platform = (req.headers["x-platform"] || req.body?.platform || req.query?.platform || "").toLowerCase();
    if (["mobile", "android", "ios"].includes(platform)) {
      return next(new AppError("Employee account creation is restricted on mobile devices in accordance with security policy", 403));
    }
    next();
  }
  ```
- **Guarded Endpoints:** `POST /api/auth/create-employee/`.

### 2.2 Middleware: `restrictMobileDataExport`
- **Location:** [node_backend/src/middleware/auth.js](file:///f:/hrms/node_backend/src/middleware/auth.js#L121-L135)
- **Mechanism:** Intercepts download routes and rejects any mobile device access attempt with HTTP 403 Forbidden:
  ```javascript
  export function restrictMobileDataExport(req, res, next) {
    const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
    if (["mobile", "android", "ios"].includes(platform)) {
      return next(new AppError("Data and document exports are restricted on mobile devices in accordance with security policy", 403));
    }
    next();
  }
  ```
- **Guarded Endpoints:**
  - `GET /api/auth/documents/download/:id/`
  - `GET /api/auth/documents/detail/:id/?download=true`
  - `GET /api/attendance/team-attendance/?export=true`

### 2.3 Controller-Level Dual Verification
Even if a request bypasses the routing middleware via alternative internal dispatch, the controllers (`accounts.controller.js` and `attendance.controller.js`) independently check client platform headers and throw `AppError(..., 403)`.

---

## 3. Mobile UI Attack Surface Elimination

1. **Staff Directory (`employees.tsx`):**
   - The floating action button (`showFAB`) for onboarding employees is completely removed (`showFAB = false`).
   - The onboarding modal is permanently disabled.
   - Any programmatic call to `handleCreateEmployee` triggers an immediate alert and aborts without transmitting network traffic.
2. **Staff Documents (`employee-documents.tsx`):**
   - Restrained to HR, Admin, Superadmin.
   - Manager role cannot view general staff documents.
3. **Reports Desk (`reports.tsx`):**
   - Removed from mobile tab bar navigation (`href: null`).
   - Replaced export button with a prominent red security advisory informing the user that data exports are restricted on mobile devices.
   - Direct execution of `handleExportMonthlyAttendance` is aborted before making any API request.

---

## 4. Verification Evidence

Automated regression suite `node_backend/tests/bugs/mobile_hardening_and_bugs.test.js`:
```
✔ HR cannot create employee account from mobile device (HTTP 403 Forbidden)
✔ Admin cannot create employee account from mobile device (HTTP 403 Forbidden)
✔ Document download from mobile device is strictly rejected (HTTP 403 Forbidden)
✔ Team attendance export parameter from mobile is strictly rejected (HTTP 403 Forbidden)
```
Pass rate: 100% (4/4 tests passed).
