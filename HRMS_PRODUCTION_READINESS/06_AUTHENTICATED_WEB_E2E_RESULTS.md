# 06. Authenticated Web E2E Results

**Browser Engine:** Headless Microsoft Edge `158.0.4370.33` via Chrome DevTools Protocol (`127.0.0.1:9225`)  
**Target Web App:** `http://127.0.0.1:5173/` (`hrms_saas` Vite dev server -> `http://127.0.0.1:8000/api`)  
**Authenticated Account:** `stg_superadmin` (`superadmin` role)

## Authentication & Route Coverage (20 / 20 PASS)
- **Login UI (`/`):** React form submitted -> `POST /api/auth/login/` `200` -> redirected to `/dashboard`.
- **Protected Routes Verified (no ErrorBoundary, real content rendered):**
  `/dashboard`, `/attendance`, `/history`, `/monthly-register`, `/leave`, `/documents`, `/employees`, `/employee-documents`, `/attendance-approvals`, `/leave-approvals`, `/team-dashboard`, `/team-attendance`, `/team-analytics`, `/hr-dashboard`, `/reports`, `/audit-logs`, `/shifts`, `/roster`, `/holidays`, `/sites`.

## Browser Diagnostics
- **Console Errors:** `0`
- **Uncaught JS Exceptions:** `0`
- **HTTP 5xx Failed Requests:** `0`

## Responsive Viewport Checks (`/dashboard`)

| Viewport | `scrollWidth` | `clientWidth` | Result |
|---|---|---|---|
| `1440x900` (Desktop) | `1440` | `1440` | **PASS** (0px overflow) |
| `1280x800` (Laptop) | `1265` | `1265` | **PASS** (0px overflow) |
| `768x1024` (Tablet) | `788` | `753` | **FAIL** (+35px horizontal overflow) |
| `375x812` (Mobile Web) | `635` | `375` | **FAIL** (+260px horizontal overflow) |

*(Note: Authenticated `/dashboard` exhibits horizontal overflow at `768x1024` and `375x812` viewports; logged as `BUG-PROD-004` in `14_FINAL_BUG_REGISTER.md`.)*
