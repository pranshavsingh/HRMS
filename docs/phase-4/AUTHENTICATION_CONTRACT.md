# HRMS Authentication Contract and Token Lifecycle Specification

**Document**: `docs/phase-4/AUTHENTICATION_CONTRACT.md`  
**Requirement**: R2 (Authentication Hardening and Token Lifecycle) & R4 (Secure Client Storage)  
**Target Subsystems**: `node_backend/`, `hrms_saas/`, `hrms_mobile/`  
**Certified Baseline Commit**: `0896d0b`  
**Working Branch**: `feat/phase-4-web-mobile-hardening`  
**Date**: 2026-11-16  
**Status**: APPROVED SPECIFICATION — Backend Contract & Client Protocol

---

## 1. Architectural Scope and Principles

This specification governs the end-to-end authentication lifecycle between the HRMS Node.js + Express backend (`node_backend/`) and its client applications: the React + Vite web application (`hrms_saas/`) and the Expo React Native mobile application (`hrms_mobile/`).

The authentication architecture adheres to five non-negotiable security principles:
1. **Dual-Mode Transport Isolation**: Web browsers use server-managed `HttpOnly` cookies for long-lived refresh tokens with in-memory access tokens, eliminating client-side JavaScript access and XSS exfiltration risks. Mobile applications exchange JSON payloads and store refresh tokens exclusively in native hardware-backed secure storage (`Expo.SecureStore`).
2. **Refresh Token Rotation (RTR) with Atomic Check-and-Set**: Every refresh request invalidates the prior refresh token and issues a replacement within the same cryptographically tracked `family_id`. Database updates use atomic check-and-set semantics to eliminate race condition forks.
3. **Concurrency Grace Window Protection**: A configurable grace window (`config.refreshGraceWindowSeconds || 30`, default 30 seconds) absorbs network-level concurrent duplicate requests resulting from multi-tab browsing or mobile connection retries (such as mobile Axios with 15s timeouts), without triggering false-positive replay alarms.
4. **Hardened Multi-Tier Invalidation on Logout**: Logout requires valid credentials, immediately blacklists the access token JTI in Redis (safely handling boundary expirations), purges cached user sessions (resolving `targetUserId` from access token or refresh token record), revokes the refresh token family in MySQL, and clears browser cookies at `Path=/api`.
5. **SSE Stream Authentication Harmonization**: Realtime event streams strictly reject raw JWTs in query parameters (`?token=...`, preserving the Phase 1 VULN-04 fix). The primary client standard is Mechanism 2 (Fetch-based event stream with `Authorization: Bearer <token>`), with Mechanism 3 (Single-use ephemeral ticket `?ticket=...` consumed via Redis `GETDEL`) as the only permitted URL query parameter fallback.

---

## 2. Token Definitions and Lifecycles

### 2.1 Token Specifications

| Parameter | Access Token | Refresh Token |
|---|---|---|
| **Lifespan (TTL)** | 15 minutes (`15m` = 900 seconds) | 30 days (`30d` = 2,592,000 seconds) |
| **Cryptographic Algorithm** | `HS256` (HMAC with SHA-256) | `HS256` (HMAC with SHA-256) |
| **Signing Key** | `config.jwtSecret` (or `ACCESS_TOKEN_SECRET`) | `config.jwtSecret` (or `REFRESH_TOKEN_SECRET`) |
| **Payload Claims** | `userId`, `role`, `type: "access"`, `jti`, `iss`, `aud`, `iat`, `exp` | `userId`, `role`, `type: "refresh"`, `familyId`, `jti`, `iss`, `aud`, `iat`, `exp` |
| **Issuer (`iss`)** | `hrms-api` | `hrms-api` |
| **Audience (`aud`)** | `hrms-client` | `hrms-client` |
| **Storage Location (Web)** | In-Memory (React `AuthContext` state) | Server-managed `HttpOnly`, `SameSite='Lax'`, `Secure` cookie |
| **Storage Location (Mobile)**| `Expo.SecureStore` (Key: `token`) | `Expo.SecureStore` (Key: `refresh_token`) |
| **Persistence in DB** | None (Stateless JWT; JTI checked against Redis blacklist) | SHA-256 hash stored in `accounts_refreshtoken` table |
| **Concurrency Grace Window** | N/A | Configurable via `config.refreshGraceWindowSeconds || 30` (default 30 seconds; absorbs concurrent mobile retries) |

### 2.2 JWT Payload Structure

#### 2.2.1 Access Token Payload
```json
{
  "userId": 42,
  "role": "admin",
  "type": "access",
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "iss": "hrms-api",
  "aud": "hrms-client",
  "iat": 1731720000,
  "exp": 1731720900
}
```

#### 2.2.2 Refresh Token Payload
```json
{
  "userId": 42,
  "role": "admin",
  "type": "refresh",
  "familyId": "c3b2184e-399c-499b-9c7a-9773a4441001",
  "jti": "8e4d29bc-d961-4fa1-841f-132d99c4aa02",
  "iss": "hrms-api",
  "aud": "hrms-client",
  "iat": 1731720000,
  "exp": 1734312000
}
```

---

## 3. Dual-Mode Transport Specification

Clients identify their platform via explicit header or body parameters:
- **Web Client**: Transmits requests with `credentials: "include"` (Axios `withCredentials: true`), optionally setting header `X-Platform: web` or body `platform: "web"`.
- **Mobile Client**: Transmits requests with `X-Platform: mobile` (or body `platform: "android"` / `"ios"`). Does not use cookies; exchanges refresh tokens in JSON request/response bodies.

*CORS Preflight Requirement*: To ensure cross-origin browser requests carrying `X-Platform` do not fail preflight checks, `corsOptions.allowedHeaders` in `node_backend/src/app.js` MUST include `X-Platform` alongside `Content-Type` and `Authorization`.

### 3.1 Web Client Cookie Attributes

The refresh token cookie is set by `node_backend` on login and refresh endpoints:

| Cookie Attribute | Production Value | Development / Testing Value | Purpose |
|---|---|---|---|
| **Name** | `refreshToken` | `refreshToken` | Primary refresh token identifier |
| **HttpOnly** | `true` | `true` | Blocks access via `document.cookie` / JavaScript |
| **Secure** | `true` | `false` | Requires HTTPS in production (allows HTTP on localhost) |
| **SameSite** | `Lax` | `Lax` | Mitigates CSRF while permitting top-level navigation |
| **Path** | `/api` | `/api` | Matches all endpoints under `/api/auth/*` and `/api/v1/auth/*` per RFC 6265 Section 5.1.4, preventing browsers from dropping the refresh cookie on `/api/v1/auth/refresh/` |
| **Max-Age** | `2592000` (30 days in seconds) | `2592000` | Matches token lifespan |

---

## 4. Endpoint Specifications

### 4.1 Login Endpoint

- **Routes**: `POST /api/v1/auth/login/` and `POST /api/auth/login/`
- **Rate Limit**: 5 attempts per IP per 15 minutes (`createLoginLimiter`)
- **Authentication Required**: None

#### 4.1.1 Request Payload
```json
{
  "username": "user@example.com",
  "password": "SecurePassword123!",
  "platform": "web"
}
```
*Notes*: `username` accepts either email or employee username. `platform` can be `"web"`, `"android"`, `"ios"`.

#### 4.1.2 Web Client Response (Dual-Mode: Cookie)
- **Status**: `200 OK`
- **Response Headers**:
  ```http
  Set-Cookie: refreshToken=eyJhbGciOi...; Path=/api; Max-Age=2592000; HttpOnly; SameSite=Lax
  Content-Type: application/json
  ```
- **Response Body**:
  ```json
  {
    "status": "success",
    "data": {
      "access": "eyJhbGciOi...",
      "refresh": null,
      "user": {
        "id": 42,
        "username": "john_doe",
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "role": "admin"
      }
    }
  }
  ```
  *Notice*: For web clients, `refresh` is omitted or set to `null` in the JSON body. The actual refresh token resides safely in the `HttpOnly` cookie.

#### 4.1.3 Mobile Client Response (Dual-Mode: JSON Body)
- **Status**: `200 OK`
- **Response Headers**:
  ```http
  Content-Type: application/json
  ```
- **Response Body**:
  ```json
  {
    "status": "success",
    "data": {
      "access": "eyJhbGciOi...",
      "refresh": "eyJhbGciOi...",
      "user": {
        "id": 42,
        "username": "john_doe",
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "role": "admin"
      }
    }
  }
  ```
  *Notice*: For mobile clients, `refresh` is returned in the response body. Mobile client writes `access` to `SecureStore.setItemAsync("token", access)` and `refresh` to `SecureStore.setItemAsync("refresh_token", refresh)`.

#### 4.1.4 Error Responses
- **Invalid Credentials**: `401 Unauthorized`
  ```json
  { "error": "Invalid credentials" }
  ```
- **Account Inactive / Disabled**: `403 Forbidden`
  ```json
  { "error": "Account is disabled. Contact your administrator." }
  ```
- **Rate Limit Exceeded**: `429 Too Many Requests`
  ```json
  { "error": "Too many login attempts. Please try again later." }
  ```

---

### 4.2 Refresh Token Rotation Endpoint

- **Routes**: `POST /api/v1/auth/refresh/` and `POST /api/auth/refresh/`
- **Authentication Required**: Refresh Token (via Cookie or JSON body)

#### 4.2.1 Request Ingestion
Backend checks `req.cookies?.refreshToken` first. If absent, it checks `req.body?.refresh_token`.

- **Web Request**:
  ```http
  POST /api/v1/auth/refresh/ HTTP/1.1
  Host: api.hrms.com
  Cookie: refreshToken=eyJhbGciOi...
  Content-Type: application/json

  {}
  ```
- **Mobile Request**:
  ```http
  POST /api/v1/auth/refresh/ HTTP/1.1
  Host: api.hrms.com
  Content-Type: application/json

  {
    "refresh_token": "eyJhbGciOi...",
    "platform": "android"
  }
  ```

#### 4.2.2 Backend Rotation Mechanics (Atomic Check-and-Set)
1. Hash incoming token: `tokenHash = SHA256(rawToken)`.
2. Find token in MySQL: `SELECT * FROM accounts_refreshtoken WHERE token_hash = ?`.
3. If not found: Revoke family in MySQL, delete session in Redis, return `401 Unauthorized`.
4. If `is_revoked === 1`:
   - Check grace window: `(Date.now() - new Date(token.last_activity).getTime()) < (config.refreshGraceWindowSeconds || 30) * 1000`.
   - If within grace window (configurable via `config.refreshGraceWindowSeconds || 30`, default 30 seconds): Return `{ access, refresh: null, concurrent_refresh: true }`. During a grace window response (`concurrent_refresh === true`), the backend MUST NOT emit a `Set-Cookie: refreshToken` header.
   - If outside grace window: Replay attack detected. Revoke family in MySQL, blacklist user sessions in Redis (`user:revoked:${userId}`), return `401 Unauthorized`.
5. If `is_revoked === 0`:
   - Issue new access token (15m) and new refresh token (30d) with same `familyId`.
   - Execute **Atomic Check-and-Set**:
     ```sql
     UPDATE accounts_refreshtoken 
     SET is_revoked = 1, replaced_by_hash = ?, last_activity = NOW() 
     WHERE token_hash = ? AND is_revoked = 0
     ```
   - If `rowsAffected === 0`: Another concurrent request rotated this token simultaneously. The transaction must rollback/abort. The backend MUST re-fetch the committed record from MySQL (`SELECT * FROM accounts_refreshtoken WHERE token_hash = ?`) and evaluate the grace window check against the reloaded `tokenRecord`. During a grace window response (`concurrent_refresh === true`), the backend MUST NOT emit a `Set-Cookie: refreshToken` header.
   - If `rowsAffected === 1`: Insert new refresh token record into `accounts_refreshtoken`. Commit transaction and return new tokens (with `Set-Cookie: refreshToken=...; Path=/api` for web clients).

#### 4.2.3 Web Client Rotation Response
- **Status**: `200 OK`
- **Response Headers**:
  ```http
  Set-Cookie: refreshToken=eyJhbGciOiNewRefreshToken...; Path=/api; Max-Age=2592000; HttpOnly; SameSite=Lax
  ```
- **Response Body**:
  ```json
  {
    "access": "eyJhbGciOiNewAccessToken...",
    "refresh": null,
    "concurrent_refresh": false,
    "user": { ... }
  }
  ```

#### 4.2.4 Mobile Client Rotation Response
- **Status**: `200 OK`
- **Response Body**:
  - **Standard Rotation**:
    ```json
    {
      "access": "eyJhbGciOiNewAccessToken...",
      "refresh": "eyJhbGciOiNewRefreshToken...",
      "concurrent_refresh": false,
      "user": { ... }
    }
    ```
  - **Concurrency Grace Window Active**:
    ```json
    {
      "access": "eyJhbGciOiNewAccessToken...",
      "refresh": null,
      "concurrent_refresh": true,
      "user": { ... }
    }
    ```
    *Mobile Rule*: When `concurrent_refresh === true` and `refresh === null`, mobile client updates access token in memory/SecureStore, but **does not discard or nullify** the active `refresh_token` in `SecureStore`.

---

### 4.3 Hardened Logout Endpoint

- **Routes**: `POST /api/v1/auth/logout/` and `POST /api/auth/logout/`
- **Authentication Required**: Optional/Permissive `authenticate` extraction (reads `Authorization: Bearer <access_token>` if present)

#### 4.3.1 Request Transport
- **Web Client**:
  ```http
  POST /api/v1/auth/logout/ HTTP/1.1
  Authorization: Bearer eyJhbGciOi...
  Cookie: refreshToken=eyJhbGciOi...
  Content-Type: application/json

  {}
  ```
- **Mobile Client**:
  ```http
  POST /api/v1/auth/logout/ HTTP/1.1
  Authorization: Bearer eyJhbGciOi...
  Content-Type: application/json

  {
    "refresh_token": "eyJhbGciOi..."
  }
  ```

#### 4.3.2 Backend Hardened Invalidation Protocol
Upon receiving a logout request, `node_backend` executes all five invalidation tiers:
1. **Access Token Blacklisting**: If `req.tokenPayload?.jti` exists:
   - Compute remaining TTL and safely guard against zero/negative expirations:
     ```javascript
     const remainingSeconds = payload.exp - Math.floor(Date.now() / 1000);
     if (remainingSeconds > 0) {
       const ttl = Math.min(900, Math.max(1, remainingSeconds));
       await redisService.set(`token:blacklist:${payload.jti}`, "1", ttl);
     }
     ```
   - *Resilience Guard*: If `remainingSeconds <= 0`, the token is already expired; skipping Redis `set` prevents `ERR invalid expire time` errors that crash Redis on boundary conditions.
2. **User Session Cache & Revocation Invalidation**:
   - Extract `targetUserId = req.user?.id || tokenRecord?.user_id;` so that if `req.user` is undefined (e.g. logging out with an expired access token or without an `Authorization` header), session invalidation still executes:
     ```javascript
     const targetUserId = req.user?.id || tokenRecord?.user_id;
     if (targetUserId) {
       await redisService.del(`user:session:${targetUserId}`);
       await redisService.set(`user:revoked:${targetUserId}`, Date.now(), 86400);
     }
     ```
3. **Database Token Family Revocation**:
   - Extract refresh token from cookie or body.
   - If present, query `accountsRepository.findRefreshTokenByHash(SHA256(refreshToken))`.
   - Revoke family: `accountsRepository.revokeRefreshTokenFamily(tokenRecord.family_id)`.
   - Delete token row: `accountsRepository.deleteRefreshTokenByHash(SHA256(refreshToken))`.
4. **Cookie Purge (Web)**:
   - Clear cookie across `/api` path: `res.clearCookie("refreshToken", { path: "/api", httpOnly: true, sameSite: "lax", secure: isProduction })`.
5. **Response**:
   ```json
   {
     "status": "success",
     "message": "Logged out successfully"
   }
   ```

---

### 4.4 Realtime Server-Sent Events (SSE) Authentication

- **Route**: `GET /api/v1/auth/realtime/` (and `GET /api/auth/realtime/`)
- **Transport**: `text/event-stream`

#### 4.4.1 Security Baseline & Authentication Challenge
- **Strict Query Parameter Rejection**: Direct query parameters carrying raw JWTs (`?token=...` or `?access_token=...`) remain **strictly rejected** by backend `authenticate` middleware, preserving the Phase 1 VULN-04 security fix to prevent token leakage in server access logs, reverse proxy logs, browser history, and HTTP referrer headers.
- **Header Limitations of Browser EventSource**: Native browser `EventSource` cannot transmit custom `Authorization: Bearer <token>` headers.
- **Token Claim Separation**: The web client stores only `refreshToken` in cookies (`Path=/api`), not `accessToken`. Using a 30-day refresh token cookie to authenticate an SSE stream breaks token claim separation (`type: "access"` vs `type: "refresh"`).

#### 4.4.2 Harmonized SSE Authentication Standards
1. **Mechanism 2 (Primary Standard): Fetch-Based Event Stream (Web & Mobile)**:
   - Designated as the primary client standard for both `hrms_saas` and `hrms_mobile`.
   - Uses standard `fetch` with `ReadableStream` (e.g., `@microsoft/fetch-event-source` or native fetch reader):
     ```javascript
     const response = await fetch("/api/v1/auth/realtime/", {
       headers: {
         "Authorization": `Bearer ${accessToken}`,
         "Accept": "text/event-stream"
       }
     });
     ```
   - Fully supports standard `Authorization: Bearer <token>` headers without any query strings or URL tokens, ensuring secure and consistent access token transmission.
2. **Mechanism 3 (Permitted URL Query Fallback): Single-Use Ephemeral Ticket**:
   - If native `EventSource` must be used where fetch streaming is unsupported, this is the **only permitted URL query parameter fallback**:
     - Client requests a short-lived single-use ticket: `POST /api/v1/auth/realtime/ticket/` with `Authorization: Bearer <accessToken>`.
     - Backend creates an ephemeral Redis key `sse:ticket:${ticketId}` (30-second TTL) holding user context.
     - Client opens `new EventSource('/api/v1/auth/realtime/?ticket=' + ticketId)`.
     - Backend consumes and deletes ticket atomically via `GETDEL`, authenticating the connection. Single-use consumption guarantees the ticket cannot be replayed even if logged.
3. **Mechanism 1 (Legacy / Cookie-Only Fallback)**:
   - Supported only when a dedicated short-lived access cookie exists; strictly prohibited from treating `refreshToken` cookies as access authorization.

---

## 5. Client Concurrency Mutex and Refresh Queue

Both web (`hrms_saas`) and mobile (`hrms_mobile`) clients must implement an asynchronous mutex queue around HTTP 401 response handling to ensure exactly one refresh request is dispatched while concurrent requests wait.

### 5.1 Mutex Algorithm Specification

```typescript
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
}
```

### 5.2 Axios Interceptor Handling Rules

1. **Originating Request 401**:
   - Check `if (error.response?.status === 401 && !originalRequest._retry)`:
   - If `isRefreshing === true`:
     - Return `new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))`
     - When resolved with `newToken`:
       - Set `originalRequest._retry = true;` (MANDATORY TO PREVENT INFINITE LOOPS).
       - Set `originalRequest.headers.Authorization = "Bearer " + newToken;`
       - Replay request: `return axios(originalRequest)`.
   - If `isRefreshing === false`:
     - Set `isRefreshing = true;`
     - Set `originalRequest._retry = true;`
     - Initiate refresh call: `POST /api/v1/auth/refresh/`.
     - Upon successful response:
       - Update active access token in memory / SecureStore.
       - If `response.data.refresh` is not null: update refresh token in SecureStore (Mobile).
       - Replay initiator request with new access token.
       - Call `processQueue(null, newAccessToken)`.
     - Upon refresh failure:
       - Call `processQueue(refreshError, null)`.
       - Trigger client logout and navigation to login.
     - Finally:
       - Set `isRefreshing = false;`

---

## 6. Security & Attack Surface Hardening

| Attack Vector | Vulnerability Pre-Hardening | Hardened Mitigation in Contract |
|---|---|---|
| **XSS Exfiltration of Refresh Token** | Stored in `localStorage` in `hrms_saas` | Stored exclusively in server-managed `HttpOnly` cookie with `Path=/api` and `SameSite='Lax'`. |
| **Concurrent RTR Race Condition** | Plain `UPDATE` without `is_revoked = 0` check | Atomic CAS (`UPDATE ... WHERE token_hash = ? AND is_revoked = 0`). On 0 rows affected, abort transaction and re-fetch committed record from MySQL before grace window evaluation. |
| **Token Replay Attack** | Revoked tokens outside grace window accepted | Full family revocation, Redis session deletion, and user revocation marker written; configurable grace window (`config.refreshGraceWindowSeconds || 30`). |
| **Infinite Refresh Loop** | Missing `_retry = true` on queued requests | Explicit `_retry = true` stamped on every queued request prior to replay. |
| **Post-Logout Token Replay** | Access token valid until 15m exp; JTI never blacklisted | Immediate JTI blacklisting in Redis with positive guarded TTL (`Math.min(900, Math.max(1, remainingSeconds))`). |
| **Stale Session Profile** | User profile cached in Redis for 300s after role change / logout | Redis key `user:session:${targetUserId}` purged and `user:revoked:${targetUserId}` set on logout resolving user from access token or refresh token. |
| **Log Leakage via SSE URL** | `?token=...` query param logged in server/proxy logs | Strict rejection of URL tokens; Bearer fetch event stream as primary standard, single-use ephemeral ticket (`GETDEL`) as fallback. |

---
*Contract certified for implementation across `node_backend/`, `hrms_saas/`, and `hrms_mobile/`.*