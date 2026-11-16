# Phase 4 Initial Architecture and Security Audit

**Document**: `docs/phase-4/PHASE_4_INITIAL_AUDIT.md`  
**Requirement**: R1 (Initial Architecture and Security Audit)  
**Repository**: `pranshavsingh/HRMS`  
**Certified Baseline Commit**: `0896d0b`  
**Working Branch**: `feat/phase-4-web-mobile-hardening`  
**Prior Verified CI Run**: `43795039356`  
**Audit Date**: 2026-11-16  
**Auditor**: Teamwork Worker (Engineering & Security Audit)  
**Status**: COMPLETE — Initial Baseline Audit

---

## 1. Executive Summary & Context

The HRMS platform has progressed through three rigorous development and hardening phases:
1. **Phase 1 (Security Hardening)**: Eliminated SQL injection, enforced password hashing via Bcrypt, established Role-Based Access Control (RBAC), keyed HMAC-SHA256 OTP password reset flows, and rate limiting.
2. **Phase 2 (Database Performance)**: Enforced index optimization, eliminated N+1 query patterns, added deadlock retry mechanics with exponential backoff, and optimized pagination across high-traffic attendance tables.
3. **Phase 3 (Distributed Outbox & Queue Systems)**: Introduced MySQL transactional outbox with `FOR UPDATE SKIP LOCKED`, BullMQ background worker isolation, consumer idempotency leasing, AES-256-GCM encrypted OTP payload storage, and distributed Socket.IO pub/sub.

**Phase 4** addresses the production-grade hardening of client-facing interfaces communicating with the Node.js + Express backend:
- The React 19 + Vite web application (`hrms_saas/`)
- The Expo SDK 54 React Native mobile application (`hrms_mobile/`)
- The API backend token and session transport interfaces (`node_backend/`)
- Continuous Integration quality gates (`.github/workflows/security.yml`)

This audit was conducted strictly prior to modifying application code. It inventories all architectural components, traces authentication workflows, uncovers security and reliability defects, documents environmental weaknesses, and presents an end-to-end phased implementation sequence across Milestones 1 through 6.

---

## 2. Baseline Verification

| Attribute | Certified Value | Verified Value on Branch | Status |
|---|---|---|---|
| Repository | `pranshavsingh/HRMS` | `pranshavsingh/HRMS` | MATCH |
| Target Branch | `feat/phase-4-web-mobile-hardening` | `feat/phase-4-web-mobile-hardening` | MATCH |
| Base Commit | `0896d0b` (`docs(phase3): update formal acceptance report...`) | `0896d0b` | MATCH |
| Prior Phase 3 Commit | `3d04d5e1f127eb1479c5c2cdc3e9f303c75ae924` | `3d04d5e1f127eb1479c5c2cdc3e9f303c75ae924` | MATCH |
| Prior CI Run ID | `43795039356` | Verified in Git history | MATCH |
| Working Tree | Clean | Clean (`nothing to commit`) | MATCH |

The baseline test suites in `node_backend/` were executed to verify Phase 1–3 stability:
- `npm --prefix f:\hrms\node_backend run test:security`: 5 suites passed (0 failures).
- `npm --prefix f:\hrms\node_backend run test:phase2`: 3 suites passed (0 failures).
- `npm --prefix f:\hrms\node_backend run test:phase3`: 9 suites passed (0 failures).
- Total baseline backend tests: 17 suites passed, 0 failures.

---

## 3. Subsystem Architectural Analysis

### 3.1 Backend Architecture (`node_backend/`)

#### 3.1.1 Server Architecture and Middleware Pipeline
The backend is structured as an Express 4 application (`src/app.js`, 183 lines) with a dedicated cluster/server runner (`src/server.js`, 76 lines) and a separate background worker (`src/worker.js`, 119 lines).

```
node_backend/
├── src/
│   ├── config/env.js                 # Central environment configuration
│   ├── controllers/
│   │   ├── accounts.controller.js    # Auth, user management, and document controllers
│   │   ├── attendance.controller.js  # Geo-fenced biometric attendance
│   │   └── leave.controller.js       # Leave application and approval workflows
│   ├── db/
│   │   ├── index.js                  # mysql2/promise connection pool & deadlock retry
│   │   └── migrations/               # Schema migrations
│   ├── middleware/
│   │   ├── auth.js                   # JWT verification, RBAC, Redis session caching
│   │   ├── error-handler.js          # Centralized error mapping
│   │   ├── rate-limiter.js           # Express-rate-limit login and global limiters
│   │   └── validation.js             # Joi request validation schemas
│   ├── repositories/
│   │   ├── accounts.repository.js    # Raw SQL user and token queries
│   │   ├── attendance.repository.js  # Attendance records and geo queries
│   │   ├── leave.repository.js       # Leave allocation and balance queries
│   │   └── outbox.repository.js       # Transactional outbox SKIP LOCKED queries
│   ├── routes/
│   │   ├── accounts.routes.js        # Authentication & user route definitions
│   │   ├── attendance.routes.js      # Attendance route definitions
│   │   └── leave.routes.js           # Leave route definitions
│   ├── services/
│   │   ├── accounts.service.js       # Auth business logic, RTR, OTP encryption
│   │   ├── redis.service.js          # Redis client and key-value cache
│   │   └── realtime.service.js       # Socket.IO pub/sub & SSE streaming
│   ├── app.js                        # Express app assembly & middleware stack
│   ├── server.js                     # HTTP server startup & graceful shutdown
│   └── worker.js                     # BullMQ & Outbox worker runner
```

The Express middleware pipeline in `app.js` executes:
1. `helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } })`: Sets standard HTTP security headers.
2. `metricsService.httpMetricsMiddleware()`: Records Prometheus request durations.
3. `createLoginLimiter()` mounted on `/api/v1/auth/login` and `/api/auth/login`: Protects against brute-force attacks (5 attempts per window).
4. `createApiLimiter()` applied globally.
5. `cors()`: Dynamic origin check against `config.corsOrigin`, explicitly disallowing `*` when `NODE_ENV === "production"`, specifying `credentials: true`, and configuring `allowedHeaders` (which must include `X-Platform` to avoid CORS preflight rejection of client platform headers).
6. `express.json({ limit: "5mb" })` and `compression()`.
7. **Absence of `cookie-parser`**: `app.js` lacks `cookie-parser` middleware. As a result, `req.cookies` is `undefined`, precluding cookie-based authentication without manual header parsing.
8. URL Rewrite Middleware: Rewrites legacy `/api/accounts/*` paths to `/api/auth/*`.
9. Route Handlers: Mounted at `/api/v1/*` and `/api/*`.

#### 3.1.2 Route Map & Authentication Protections
The authentication router (`src/routes/accounts.routes.js`) defines the following critical routes:

| HTTP Method | Route | Middleware | Controller Function | Auth Required | Description |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/login/` | `loginLimiter`, `validate(loginSchema)` | `c.login` | No | Username/password login; issues access & refresh tokens in JSON body. |
| `POST` | `/api/v1/auth/refresh/` | None | `c.refreshToken` | No (Token Auth) | Rotates refresh token, emits new access token (and new refresh token). |
| `POST` | `/api/v1/auth/logout/` | None | `c.logout` | No | Deletes refresh token row in database. |
| `POST` | `/api/v1/auth/forgot-password/request-otp/` | `validate(requestOtpSchema)` | `c.requestPasswordResetOtp` | No | Creates HMAC-SHA256 OTP and outbox event. |
| `POST` | `/api/v1/auth/forgot-password/verify-otp/` | `validate(verifyOtpSchema)` | `c.verifyPasswordResetOtp` | No | Validates OTP; issues cryptographic 32-byte reset token. |
| `POST` | `/api/v1/auth/forgot-password/reset/` | `validate(resetPasswordSchema)` | `c.resetPasswordWithOtp` | No | Atomic password reset consuming token. |
| `POST` | `/api/v1/auth/change-password/` | `authenticate`, `validate(...)` | `c.changePassword` | Yes | Changes password for authenticated user. |
| `GET` | `/api/v1/auth/realtime/` | `authenticate` | `c.realtimeUpdatesStream` | Yes | Server-Sent Events (SSE) stream for user notifications. |

#### 3.1.3 Token Generation and Lifecycle Mechanics
In `src/services/accounts.service.js`:
- **Access Tokens**:
  - Expiration: 15 minutes (`"15m"`).
  - Signing Algorithm: `HS256` using `config.jwtSecret`.
  - Claims payload: `{ userId: user.id, role: resolvedRole, type: "access" }`.
  - Registered claims: `jwtid: crypto.randomUUID()`, `issuer: "hrms-api"`, `audience: "hrms-client"`.
- **Refresh Tokens**:
  - Expiration: 30 days (`"30d"`).
  - Signing Algorithm: `HS256` using `config.jwtSecret`.
  - Claims payload: `{ userId: user.id, role: resolvedRole, type: "refresh", familyId: crypto.randomUUID() }`.
  - Registered claims: `jwtid: crypto.randomUUID()`, `issuer: "hrms-api"`, `audience: "hrms-client"`.
- **Token Hashing & Database Persistence**:
  - Raw refresh token strings are never stored in the database.
  - Stored as SHA-256 hash: `crypto.createHash("sha256").update(token).digest("hex")`.
  - Stored in `accounts_refreshtoken` with columns: `user_id`, `token_hash`, `expires_at`, `is_revoked`, `replaced_by_hash`, `last_activity`, `family_id`.

#### 3.1.4 Refresh Token Rotation (RTR) & Concurrency Grace Window
The RTR mechanism in `src/services/accounts.service.js:125-254` executes:
1. Validates JWT signature, expiration, and verifies `payload.type === "refresh"`.
2. Hashes incoming token and queries `accountsRepository.findRefreshTokenByHash(refreshHash)`.
3. **If token not found**: Assumes forged or expired record; revokes entire family (`revokeRefreshTokenFamily(payload.familyId)`) and purges Redis session cache.
4. **If token is already revoked (`is_revoked === 1`)**:
   - Checks if request falls within the **15-second concurrency grace window**:
     ```javascript
     const lastActivity = new Date(tokenRecord.last_activity).getTime();
     const nowTime = Date.now();
     if (nowTime - lastActivity < 15000 && tokenRecord.replaced_by_hash) {
       // Return new access token, refresh: null, concurrent_refresh: true
       ...
     }
     ```
   - If outside the 15-second grace window: Replay attack detected. Revokes entire family, clears Redis session cache, and writes user-level revocation timestamp `user:revoked:${payload.userId}` in Redis with 86,400s TTL.
5. **If token is active (`is_revoked === 0`)**:
   - Generates new access token and new refresh token.
   - Updates old token record: `is_revoked = 1, replaced_by_hash = newHash, last_activity = NOW()`.
   - Inserts new token row with identical `familyId`.
   - Returns `{ access, refresh, user }`.

#### 3.1.5 Identified Backend Security & Functional Deficiencies
1. **Lack of Cookie Support**: `node_backend` cannot read HttpOnly refresh cookies because `cookie-parser` is missing, and controllers only extract `req.body.refresh_token`. Additionally, cookie path must be set to `/api` per RFC 6265 to cover both `/api/auth/*` and `/api/v1/auth/*`.
2. **Database Race Condition on RTR & Snapshot Replay Trap**: `markRefreshTokenRevoked` in `accounts.repository.js` executes `UPDATE accounts_refreshtoken SET is_revoked = 1, replaced_by_hash = ?, last_activity = NOW() WHERE token_hash = ?` without checking `AND is_revoked = 0`. Two simultaneous requests can both read `is_revoked === 0` and both rotate the token, creating conflicting branches in the same family. Furthermore, when atomic CAS is applied, if `rowsAffected === 0`, InnoDB `REPEATABLE READ` snapshot isolation returns stale data where `replaced_by_hash` is null unless the transaction aborts and re-fetches the committed record from MySQL before evaluating the grace window.
3. **Incomplete Logout Flow**:
   - `/api/v1/auth/logout/` lacks `authenticate` extraction and permissive fallback.
   - Does not blacklist access token JTI in Redis (`token:blacklist:${jti}`) with safe positive TTL, causing `ERR invalid expire time` crashes if `remainingSeconds === 0`.
   - Bypasses user session cache invalidation (`user:session:${userId}`) and revocation markers if access token is expired or header is missing; requires extracting `targetUserId = req.user?.id || tokenRecord?.user_id`.
   - Does not clear HTTP cookies across `Path=/api` (`res.clearCookie`).
4. **SSE Query Token Rejection vs Browser EventSource**:
   - `authenticate` middleware strictly rejects query parameters (`?token=...`) to prevent log leakage (VULN-04).
   - Standard browser `EventSource` cannot pass `Authorization: Bearer <token>` headers, causing standard SSE browser clients to fail with 401. Harmonization requires standardizing on Mechanism 2 (Fetch-based event stream with `Authorization: Bearer <token>`) as primary, with Mechanism 3 (Single-use ephemeral ticket `?ticket=...` consumed via Redis `GETDEL`) as the only query parameter fallback.
5. **Hardcoded Concurrency Grace Window**:
   - Baseline hardcodes `nowTime - lastActivity < 15000` (15s), conflicting with mobile clients that configure 15s request timeouts. Cellular latency can push retries beyond 15.0s, triggering false-positive replay revocations. Must be configurable via `config.refreshGraceWindowSeconds || 30` (default 30 seconds).

---

### 3.2 Web Client Architecture (`hrms_saas/`)

#### 3.2.1 Application Structure & Stack
`hrms_saas/` is built on React 19 (`19.2.4`), Vite 8 (`8.0.4`), Tailwind CSS v4 (`4.2.2`), and React Router DOM 7 (`7.14.0`).

```
hrms_saas/
├── src/
│   ├── api/
│   │   └── axios.js               # Central Axios client and interceptors
│   ├── components/
│   │   ├── common/                # UI modals and buttons
│   │   └── layout/
│   │       ├── Navbar.jsx         # Header & logout button
│   │       └── Sidebar.jsx        # Navigation sidebar with role checks
│   ├── context/
│   │   ├── PopupContext.jsx       # Alert popup provider
│   │   └── RealtimeContext.jsx    # Realtime SSE event provider
│   ├── pages/                     # 16 dashboard and management views
│   ├── routes/
│   │   └── ProtectedRoute.jsx     # Route authentication guard
│   ├── App.jsx                    # Route definitions and layout assembly
│   └── main.jsx                   # React root entry point
├── package.json                   # Dependencies and scripts
└── vite.config.js                 # Vite bundler configuration
```

#### 3.2.2 State Management and Route Protection
- **Absence of AuthContext**: There is no centralized `AuthContext` or `AuthProvider`. State is fragmented across individual component states and `localStorage`.
- **Unvalidated Route Guard** (`src/routes/ProtectedRoute.jsx`):
  ```jsx
  export default function ProtectedRoute({ children }) {
    const token = localStorage.getItem("token");
    if (!token) return <Navigate to="/" />;
    return children;
  }
  ```
  - Directly checks `localStorage.getItem("token")`.
  - Performs zero validation of JWT expiration or signature.
  - Performs zero role verification; any string in `token` allows access to administrative routes like `/audit-logs`.
  - Triggers UI flashing: when access tokens expire, protected views mount and execute requests, fail with 401, trigger refresh, and either recover or kick the user out.

#### 3.2.3 Client Storage & Insecure Token Persistence (R4 Violation)
`hrms_saas` stores sensitive credentials directly in browser `localStorage`:
- `localStorage.setItem("token", res.data.access)` (`Login.jsx:23`)
- `localStorage.setItem("refresh_token", res.data.refresh)` (`Login.jsx:24`)
- `localStorage.setItem("role", res.data.user.role)` (`Login.jsx:25`)
This is a direct violation of Requirement R4 ("Never store refresh tokens in localStorage or AsyncStorage"). Stored refresh tokens (valid for 30 days) are vulnerable to exfiltration by any Cross-Site Scripting (XSS) exploit or third-party dependency compromise.

#### 3.2.4 Axios Interceptor Bugs & Concurrency Queue Flaws
In `src/api/axios.js`:
1. **Missing `_retry` on Queued Requests**:
   ```javascript
   if (isRefreshing) {
     return new Promise((resolve, reject) => {
       failedQueue.push({ resolve, reject });
     }).then((token) => {
       originalRequest.headers.Authorization = "Bearer " + token;
       return API(originalRequest);
     });
   }
   ```
   `originalRequest._retry = true;` is only set on the initiator request (line 62). Requests queued in `failedQueue` never have `_retry` set. If a replayed request fails with 401, `!originalRequest._retry` evaluates to true, initiating an infinite retry loop.
2. **Null Token Overwrite Bug (Grace Window Desynchronization)**:
   ```javascript
   const { access, refresh } = res.data;
   localStorage.setItem("token", access);
   localStorage.setItem("refresh_token", refresh);
   ```
   When backend handles concurrent refreshes within the grace window (`config.refreshGraceWindowSeconds || 30`, default 30 seconds), it returns `{ access, refresh: null, concurrent_refresh: true }`. Because `refresh` is `null`, `localStorage.setItem("refresh_token", null)` stores the literal string `"null"`. On the next 401, the string `"null"` is sent to `/auth/refresh/`, causing immediate authentication failure and terminating the user session.
3. **No Request Timeout**:
   `axios.create()` does not set `timeout`. Requests to slow or hanging servers will hang indefinitely.

#### 3.2.5 Hardcoded Localhost and Production Bundle Leaks
- Hardcoded `"http://127.0.0.1:8000/api"` in `src/api/axios.js:4` and `src/context/RealtimeContext.jsx:12`.
- Hardcoded `"http://127.0.0.1:8000"` in `src/pages/TeamAttendance.jsx:627, 628, 652, 653`.
- In the absence of `.env` configuration files, `npm run build` minifies these fallbacks directly into `dist/assets/index-*.js`, violating Requirements R3 and R7.

#### 3.2.6 Code Health, Console Logs, and Quality Gates
- **41 console statements** (`console.log`, `console.error`) in production code leaking error payloads and potential sensitive information.
- **6 ESLint Errors** causing `npm run lint` to fail with exit code 1:
  - `PopupContext.jsx:6`: React refresh export restriction.
  - `RealtimeContext.jsx:51`: Unused variable `'err'`.
  - `RealtimeContext.jsx:118`: React refresh export restriction.
  - `EmployeeDocuments.jsx:79`: Unused variable `'handleDownload'`.
  - `Employees.jsx:47`: Unused variable `'isAdmin'`.
  - `Employees.jsx:1080`: Synchronous `setState` inside `useEffect`.
- **Missing Test Runner**: No Vitest, Jest, or React Testing Library installed in `hrms_saas/package.json`.

---

### 3.3 Mobile Client Architecture (`hrms_mobile/`)

#### 3.3.1 Application Structure & Stack
`hrms_mobile/` is built on Expo SDK 54 (`~54.0.35`), React Native 0.81 (`0.81.5`), Expo Router 6 (`~6.0.24`), and TypeScript 5.9.

```
hrms_mobile/
├── src/
│   ├── app/
│   │   ├── (tabs)/                # Tab-based screens (dashboard, attendance, profile)
│   │   ├── _layout.tsx            # Root navigation and segment route guard
│   │   ├── documents.tsx          # Modal document upload
│   │   ├── index.tsx              # Mobile login screen
│   │   └── my-documents.tsx       # Modal employee document viewer
│   ├── context/
│   │   ├── AuthContext.tsx        # Mobile auth state provider
│   │   └── RealtimeContext.tsx    # Mobile SSE realtime updates provider
│   ├── services/
│   │   └── api.ts                 # Mobile Axios client and interceptors
├── app.json                       # Expo application manifest
└── package.json                   # Dependencies and scripts
```

#### 3.3.2 Critical Navigation Trap Bug (`src/app/_layout.tsx`)
Lines 16-25 in `src/app/_layout.tsx`:
```tsx
const inTabsGroup = segments[0] === "(tabs)";

if (!isAuthenticated && inTabsGroup) {
  router.replace("/");
} else if (isAuthenticated && !inTabsGroup) {
  router.replace("/(tabs)/dashboard");
}
```
**Impact**:
When an authenticated employee navigates from `profile.tsx` to `/my-documents` or `/documents`, `segments[0]` is `"my-documents"` or `"documents"`. Because `segments[0] !== "(tabs)"`, `inTabsGroup` evaluates to `false`. The check `isAuthenticated && !inTabsGroup` evaluates to `true`, and the router immediately executes `router.replace("/(tabs)/dashboard")`.
**Result**: Authenticated users are completely trapped in tabs and cannot open `/documents` or `/my-documents`.

#### 3.3.3 Token Storage & Session Restoration
- Access and refresh tokens are stored in hardware-backed `Expo.SecureStore` (`token` and `refresh_token`), satisfying R4 for mobile.
- Non-sensitive user profile is cached in `AsyncStorage` (`user`).
- **Defect**: `restoreSession()` in `AuthContext.tsx` reads `SecureStore` and immediately sets `isAuthenticated = true` without validating the token with the backend. If the token is expired or revoked, the app renders protected screens, immediately encounters a 401, and flashes the user back to the login screen.
- **Defect**: No `AppState` listener is implemented. When the mobile app returns from the background after hours/days, stale expired tokens are not refreshed proactively.

#### 3.3.4 Mobile API Interceptor & Grace Window Desynchronization
In `src/services/api.ts`:
1. **Missing `_retry` on Queued Requests**:
   Identical to web client; queued requests in `failedQueue` do not set `_retry = true`, creating infinite loop risks upon replay failures.
2. **Grace Window Token Poisoning / Desynchronization**:
   ```typescript
   const { access, refresh } = res.data;
   await SecureStore.setItemAsync("token", access);
   if (refresh) {
     await SecureStore.setItemAsync("refresh_token", refresh);
   }
   ```
   During the concurrency grace window (`config.refreshGraceWindowSeconds || 30`, default 30 seconds), the backend returns `{ access, refresh: null, concurrent_refresh: true }`. Because `refresh` is null, `SecureStore` is not updated, retaining the old revoked refresh token. On the next refresh attempt (after the grace window expires), the app sends this revoked token to the backend. The backend flags this as a replay attack and revokes all sessions in the family, locking the user out.
3. **Hardcoded Localhost & Emulator IP Fallback**:
   ```typescript
   const BASE_URL = envUrl || (Platform.OS === "android" ? "http://10.0.2.2:8000/api" : "http://localhost:8000/api");
   ```
   If `EXPO_PUBLIC_API_URL` is omitted in a production build, the app silently falls back to `10.0.2.2:8000`, rendering the production release completely non-functional.

#### 3.3.5 Configuration, Android Permissions, and EAS Build
- `hrms_mobile/app.json` lacks:
  - `android.package` (e.g., `"com.pranshavsingh.hrms"`).
  - `android.versionCode`.
  - Android permissions configuration (`CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `READ_MEDIA_IMAGES`, and `POST_NOTIFICATIONS` for Android 13+).
  - Network security config (`usesCleartextTraffic: false`).
- `hrms_mobile/eas.json` is completely missing.
- `package.json` lacks test scripts, `jest`, and `eslint` dependencies.

---

### 3.4 Continuous Integration Pipeline (`.github/workflows/security.yml`)

The existing workflow (410 lines) contains two jobs:
1. `backend-security` (Lines 14-386): An exhaustive 23-step workflow running MySQL 8.0, Redis 7, npm audit, migrations, Phase 1 security tests, Phase 2 performance tests, and Phase 3 distributed outbox tests.
2. `frontend-build` (Lines 387-410):
   ```yaml
   frontend-build:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with:
           node-version: 22
           cache: 'npm'
           cache-dependency-path: hrms_saas/package-lock.json
       - name: Install dependencies
         run: cd hrms_saas && npm ci
       - name: Build frontend
         run: cd hrms_saas && npm run build
   ```
**Deficiencies**:
- `frontend-build` does not run ESLint (`npm run lint`), nor does it run unit/integration tests.
- `frontend-build` does not set `VITE_API_BASE_URL`, baking `127.0.0.1:8000` into compiled assets.
- `hrms_mobile` is completely absent from the workflow. There is zero mobile CI validation (no typecheck, no lint, no export/build verification).

---

## 4. Classified Defect Inventory

The following table categorizes all identified defects across subsystems, classified by severity (Critical, High, Medium, Low):

| Defect ID | Subsystem | Severity | Category | File Path | Line Range | Defect Description & Systemic Impact |
|---|---|---|---|---|---|---|
| **DEF-01** | `hrms_mobile` | **Critical** | Navigation | `hrms_mobile/src/app/_layout.tsx` | Lines 16-25 | Route segment check `isAuthenticated && !inTabsGroup` traps authenticated users, redirecting `/documents` and `/my-documents` to `/dashboard`. |
| **DEF-02** | `hrms_saas` | **Critical** | Security | `hrms_saas/src/api/axios.js` | Lines 82-83 | Refresh tokens stored in browser `localStorage`, violating Requirement R4 and exposing 30-day tokens to XSS exfiltration. |
| **DEF-03** | `hrms_saas` | **Critical** | Functional | `hrms_saas/src/api/axios.js` | Lines 83-84 | Storing `refresh: null` writes string `"null"` into `localStorage` during grace window, causing subsequent token rejection and session death. |
| **DEF-04** | `hrms_mobile` | **Critical** | Functional | `hrms_mobile/src/services/api.ts` | Lines 113-115 | Skipping `SecureStore` update when `refresh` is null leaves revoked token in storage; next refresh outside grace window triggers full family revocation. |
| **DEF-05** | `node_backend` | **Critical** | Concurrency | `node_backend/src/repositories/accounts.repository.js` | Lines 142-149 | `markRefreshTokenRevoked` lacks `AND is_revoked = 0` check-and-set and transaction abort/re-fetch on 0 rows affected, permitting concurrent race conditions to branch token families. |
| **DEF-06** | `node_backend` | **High** | Security | `node_backend/src/controllers/accounts.controller.js` | Lines 38-42 | `logout` route lacks token blacklisting with safe positive TTL, lacks `targetUserId` fallback resolution (`req.user?.id || tokenRecord?.user_id`), session cache purge, and cookie clearing. |
| **DEF-07** | `node_backend` | **High** | Architecture | `node_backend/src/app.js` | Lines 80-86 | Lacks `cookie-parser` middleware; backend cannot ingest or validate HttpOnly cookies for web authentication. |
| **DEF-08** | `hrms_saas` | **High** | Architecture | `hrms_saas/src/routes/ProtectedRoute.jsx` | Lines 1-11 | Absence of `AuthContext` and token validation; protected routes render immediately on expired tokens causing UI flashing. |
| **DEF-09** | `hrms_saas` | **High** | Reliability | `hrms_saas/src/api/axios.js` | Lines 49-60 | Requests in `failedQueue` lack `_retry = true`, risking infinite retry loops if replayed requests return 401. |
| **DEF-10** | `hrms_mobile` | **High** | Reliability | `hrms_mobile/src/services/api.ts` | Lines 81-94 | Requests in `failedQueue` lack `_retry = true`, risking infinite retry loops if replayed requests return 401. |
| **DEF-11** | `hrms_saas` | **High** | Configuration | `hrms_saas/src/api/axios.js` | Lines 3-5 | Fallback defaults to `"http://127.0.0.1:8000/api"`; absence of `.env` files bakes localhost into production builds. |
| **DEF-12** | `hrms_mobile` | **High** | Configuration | `hrms_mobile/src/services/api.ts` | Lines 6-8 | Defaults to `10.0.2.2:8000` or `localhost:8000` when `EXPO_PUBLIC_API_URL` is omitted, causing silent production failure. |
| **DEF-13** | `hrms_mobile` | **High** | Manifest | `hrms_mobile/app.json` | Lines 13-21 | Missing Android package name, permissions (including `POST_NOTIFICATIONS`), and `usesCleartextTraffic: false`. Missing `eas.json`. |
| **DEF-14** | `CI` | **High** | Quality Gate | `.github/workflows/security.yml` | Lines 387-410 | Missing mobile CI job (lint/test/typecheck); frontend CI lacks lint and test verification. |
| **DEF-15** | `hrms_saas` | **Medium** | Realtime | `hrms_saas/src/context/RealtimeContext.jsx` | Lines 11-15 | Connects to `/auth/realtime?token=...` with query param; backend rejects raw URL tokens (VULN-04); requires Bearer fetch stream standard or ephemeral single-use ticket. |
| **DEF-16** | `hrms_saas` | **Medium** | Code Quality | `hrms_saas/` | Multiple | 6 ESLint errors causing `npm run lint` failure; 41 console logging statements in production code. |
| **DEF-17** | `hrms_mobile` | **Medium** | Lifecycle | `hrms_mobile/src/context/AuthContext.tsx` | Lines 49-69 | Lacks `AppState` handling; session restoration on cold start does not validate token, causing screen flashes. |
| **DEF-18** | `hrms_saas` | **Medium** | Testing | `hrms_saas/package.json` | Lines 36-44 | Missing test runner (Vitest/Jest) and unit/integration test suites for web client. |
| **DEF-19** | `hrms_mobile` | **Medium** | Testing | `hrms_mobile/package.json` | Lines 46-55 | Missing test runner (Jest) and missing ESLint dependencies causing `expo lint` to hang/fail in CI. |
| **DEF-20** | `node_backend` | **Low** | Cryptography | `node_backend/src/config/env.js` | Line 5 | Single secret `jwtSecret` signs both access and refresh tokens without algorithmic/key separation. |

---

## 5. Phased Implementation Sequence (Milestones 1–6)

To resolve all identified defects and satisfy Requirements R1 through R10 without regressions, the implementation must proceed in the following ordered sequence:

```
[M1: Audit & Contracts]
       │
       ▼
[M2: Backend Auth Hardening] ──► [E2E Testing Track]
       │                                │
       ├────────────────────────────────┤
       ▼                                ▼
[M3: Web Hardening]            [M4: Mobile Hardening]
       │                                │
       └────────────────┬───────────────┘
                        ▼
           [M5: Release Builds & CI]
                        │
                        ▼
           [M6: Acceptance & Verification]
```

### Milestone 1: Initial Audit, Architecture, and Contracts Setup
- Check out dedicated branch `feat/phase-4-web-mobile-hardening` from baseline `0896d0b`.
- Author comprehensive initial audit (`docs/phase-4/PHASE_4_INITIAL_AUDIT.md`) (R1).
- Author backend authentication contract (`docs/phase-4/AUTHENTICATION_CONTRACT.md`) (R2).
- Author API environment configuration specification (`docs/phase-4/API_ENVIRONMENT_CONFIGURATION.md`) (R3).

### Milestone 2: Backend Authentication Hardening (`node_backend/`)
- Install and configure `cookie-parser` in `node_backend/src/app.js`.
- Update CORS configuration: include `X-Platform` in `corsOptions.allowedHeaders` alongside `Content-Type` and `Authorization` to avoid browser preflight rejection.
- Implement dual-mode token transport in `accounts.controller.js`:
  - Web requests: issue HttpOnly, Secure, SameSite='Lax' cookie `refreshToken` with `Path=/api` (RFC 6265 compliant, matching all endpoints under `/api/auth/*` and `/api/v1/auth/*`), return access token in JSON body.
  - Mobile requests: issue `refresh` in JSON response body and accept `refresh_token` from JSON request body.
- Implement atomic check-and-set query in `accounts.repository.js:markRefreshTokenRevoked` to eliminate concurrent RTR race conditions:
  - If 0 rows affected, abort transaction, re-fetch committed record from MySQL, and evaluate grace window against reloaded record.
  - Omit `Set-Cookie: refreshToken` during grace window responses (`concurrent_refresh === true`).
- Implement configurable grace window: `config.refreshGraceWindowSeconds || 30` (default 30 seconds) in `src/config/env.js`.
- Harden `POST /api/v1/auth/logout/`:
  - Authenticate caller, blacklist access token JTI in Redis with safe positive TTL (`remainingSeconds > 0`, avoiding Redis `EX 0` crashes).
  - Resolve `targetUserId = req.user?.id || tokenRecord?.user_id` so Redis session cache and `user:revoked` marker are updated unconditionally even if access token is expired or header is omitted.
  - Revoke token family in MySQL, and clear cookies across `Path=/api`.
- Realtime SSE authentication harmonization:
  - Strictly reject raw JWTs in URL query parameters (preserving Phase 1 VULN-04 fix).
  - Designate Mechanism 2 (Fetch-based event stream with `Authorization: Bearer <token>`) as primary client standard.
  - Provide Mechanism 3 (Single-use ephemeral ticket `?ticket=...` consumed via Redis `GETDEL`) as only permitted URL query parameter fallback.
- Add input validation schemas for `/refresh/` and `/logout/` routes in `src/middleware/validation.js`.
- Add backend authentication test suites covering login, bad passwords, expired tokens, revoked tokens, concurrent refresh races, and hardened logout.

### Milestone 3: Web Application Hardening (`hrms_saas/`)
- Create `hrms_saas/src/context/AuthContext.jsx` with centralized authentication state, silent token refresh, and loading states to prevent UI flashing.
- Migrate refresh tokens from `localStorage` to HttpOnly cookies and in-memory access tokens (R4).
- Harden `src/api/axios.js`:
  - Set request timeout (15,000ms) and `withCredentials: true`.
  - Fix concurrent 401 refresh mutex with `_retry: true` flag on all queued requests.
  - Fix grace window handling to prevent `null` overwrite in client storage.
- Create environment files (`.env.development`, `.env.test`, `.env.staging`, `.env.production`, `.env.example`) and eliminate hardcoded `127.0.0.1:8000` URLs.
- Add build-time guard in `vite.config.js` rejecting localhost URLs in production builds.
- Resolve 6 ESLint errors, strip sensitive console logs, and add React Error Boundary.
- Install Vitest and add unit/integration test suites for web authentication and API clients.

### Milestone 4: Mobile Application Hardening (`hrms_mobile/`)
- Fix critical navigation bug in `src/app/_layout.tsx` allowing authenticated navigation to modal screens `/documents` and `/my-documents`.
- Ensure tokens persist exclusively in `Expo.SecureStore` and profile metadata in `AsyncStorage`.
- Harden `src/services/api.ts`:
  - Inject `EXPO_PUBLIC_API_URL` and throw an explicit error in production if the variable is missing (no localhost fallback).
  - Add mutex queue for concurrent 401 refreshes with `_retry: true` flag.
  - Harmonize client grace window handling so `refresh: null` does not leave dead tokens in `SecureStore`.
- Implement `AppState` listener and validated session restoration on cold start to prevent UI flashing.
- Configure `app.json` (package name `com.pranshavsingh.hrms`, versionCode, Android permissions including `android.permission.POST_NOTIFICATIONS`, `usesCleartextTraffic: false`) and author `eas.json` with development, preview, and production profiles.
- Install ESLint dependencies, add Jest test runner, and write mobile authentication test suites.

### Milestone 5: Release Builds & CI Pipeline Quality Gates
- Execute and verify production web build (`npm run build`) in `hrms_saas/`, inspecting output bundles for zero localhost references and zero exposed secrets.
- Verify Android release build configuration (bundle export via `npx expo export --platform android`, EAS profile verification, release signing configuration).
- Author `docs/phase-4/RELEASE_BUILD_REPORT.md` (R7).
- Update `.github/workflows/security.yml` to include:
  - Web CI job: lint, test, typecheck, production build.
  - Mobile CI job: lint, test, TypeScript check, static bundle export.
  - Backend CI job: preserve existing 23-step security and performance suites.

### Milestone 6: Acceptance Verification & Final Reporting
- Execute opaque-box E2E test suite (Tiers 1–4) covering login, session restoration, concurrent refresh, role boundaries, and logout.
- Execute browser compatibility matrix (Chrome, Firefox, Edge, mobile Chrome).
- Execute mobile verification on emulator (mark physical device as `NOT VERIFIED` if hardware unavailable per R8 rules).
- Run full regression testing across Phase 1, Phase 2, and Phase 3 suites.
- Author all remaining Phase 4 documentation files:
  - `docs/phase-4/WEB_ACCEPTANCE_REPORT.md`
  - `docs/phase-4/WEB_SECURITY_AUDIT.md`
  - `docs/phase-4/MOBILE_SECURITY_AUDIT.md`
  - `docs/phase-4/MOBILE_ACCEPTANCE_REPORT.md`
  - `docs/phase-4/PHASE_4_FINAL_ACCEPTANCE_REPORT.md` (22-section final acceptance report).

---
*Audit certified by Teamwork Worker — Baseline verified at commit `0896d0b`.*