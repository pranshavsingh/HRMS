# Phase 1: Security Hardening Checklist

| Item | Requirement | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **P1.1.1** | Password policy: Minimum 12 characters, safe upper limit (128 chars), no silent truncation | `auth.test.js` (Password Policy Validation) | **VERIFIED** |
| **P1.1.2** | Bcrypt cost calibrated to 12 rounds with unique cryptographically random salt | `auth.test.js` (Password Hashing Suite) | **VERIFIED** |
| **P1.1.3** | Authenticated password change requiring valid current password | `accounts.service.js:changePassword` & test | **VERIFIED** |
| **P1.1.4** | Legacy PBKDF2 migration on successful login without logging credentials | `auth.test.js` (Legacy Migration Detection) | **VERIFIED** |
| **P1.1.5** | Generic login failure response preventing account enumeration | `accounts.service.js:login` returns generic 400 | **VERIFIED** |
| **P1.2.1** | Explicit JWT verification (`algorithms: ["HS256"]`, `issuer`, `audience`) | `jwt.test.js` (Alg & Token Type Verification) | **VERIFIED** |
| **P1.2.2** | Remove `req.query.token` query-string authentication | `jwt.test.js` (Query String Rejection Test) | **VERIFIED** |
| **P1.2.3** | Refresh token rotation with family reuse detection | `jwt.test.js` (Session Family & RTR Suite) | **VERIFIED** |
| **P1.2.4** | Concurrent refresh safety (15s grace window for in-flight requests) | `accounts.service.js:refreshSession` grace logic | **VERIFIED** |
| **P1.2.5** | Revoke all sessions on password change, reset, deactivation, or role change | `otp.test.js`, `jwt.test.js` & Redis timestamp | **VERIFIED** |
| **P1.2.6** | Logout revokes active refresh token and blacklists access token | `accounts.service.js:logoutSession` | **VERIFIED** |
| **P1.3.1** | Managers restricted to viewing documents only for their direct reports | `rbac.test.js` (Manager Document IDOR Test) | **VERIFIED** |
| **P1.3.2** | Managers restricted to attendance details only for their direct reports | `rbac.test.js` (Attendance Register IDOR Test) | **VERIFIED** |
| **P1.3.3** | Server-side role enforcement on approvals (attendance & leave) | `rbac.test.js` (Self-Approval & Role Checks) | **VERIFIED** |
| **P1.3.4** | Complete authorization matrix documented | `PHASE_1_API_SECURITY_MATRIX.md` | **VERIFIED** |
| **P1.4.1** | Cryptographically secure OTP generation (`crypto.randomInt`) | `otp.test.js` (Randomness & Range Test) | **VERIFIED** |
| **P1.4.2** | Constant-time OTP comparison (`crypto.timingSafeEqual`) | `accounts.service.js:safeCompare` | **VERIFIED** |
| **P1.4.3** | Atomic attempt limiting (max 5) across both verify and reset endpoints | `otp.test.js` (Attempt Limiting & Lockout) | **VERIFIED** |
| **P1.4.4** | Unverified OTP or direct endpoint bypass prohibited | `otp.test.js` (Direct Reset Bypass Rejection) | **VERIFIED** |
| **P1.4.5** | Single-use transactional OTP consumption | `otp.test.js` (Single-Use Token Consumption) | **VERIFIED** |
| **P1.4.6** | Revoke all user refresh sessions after password reset | `otp.test.js` (Token Revocation Verification) | **VERIFIED** |
| **P1.5.1** | Strict CORS allowlist in production (no wildcard credentials) | `server.js` production origin check | **VERIFIED** |
| **P1.5.2** | Replace `z.any()` in all schemas with typed, bounded validation | `api_security.test.js` (Coordinate bounds test) | **VERIFIED** |
| **P1.5.3** | Error sanitization: Internal stack traces stripped in production | `errorHandler.js` NODE_ENV check | **VERIFIED** |
| **P1.6.1** | Multer 5MB request payload limit enforced | `upload.js` Multer ceiling | **VERIFIED** |
| **P1.6.2** | Magic byte validation (`fileTypeFromBuffer`) for all file uploads | `validation.js` magic byte checks | **VERIFIED** |
| **P1.6.3** | Path traversal prevention in local filesystem deletion routines | `api_security.test.js` (Traversal canary test) | **VERIFIED** |
| **P1.7.1** | Automatic redaction of passwords, tokens, hashes, and PII in logs | `api_security.test.js` (Deep Redaction Suite) | **VERIFIED** |
| **P1.7.2** | Durable audit logging for security events (login fail, reset, role change) | `audit.service.js` transactional logging | **VERIFIED** |
| **P1.8.1** | Production boot validation rejecting missing or placeholder secrets | `env.js` boot check | **VERIFIED** |
| **P1.9.1** | Client API base URL driven by environment variables (`VITE_API_BASE_URL`) | `hrms_saas/src/api/axios.js` & Vite build | **VERIFIED** |
| **P1.10.1** | Automated test suite in `node_backend/tests/security/` passing | 5/5 Suites, 27/27 Tests Passed Cleanly | **VERIFIED** |
