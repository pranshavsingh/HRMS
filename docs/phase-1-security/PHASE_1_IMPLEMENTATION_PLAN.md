# Phase 1: Security Hardening Implementation Plan

**Repository:** `https://github.com/pranshavsingh/HRMS`  
**Base Commit:** `00cd3cdde082bac3557a40563fa496b9aa4c5f60`  
**Feature Branch:** `feat/phase-1-security-hardening`  
**Lead Engineer:** Senior Application Security Engineer & Backend Architect  
**Status:** In Progress  

---

## 1. Verified Vulnerabilities & Scope of Work

| Vulnerability ID | Category | Component | Description & Root Cause | Severity | Target Module |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **VULN-01** | Authentication | `node_backend/src/utils/auth.js`, `validation.js` | Passwords accepted under 12 characters; no authenticated change-password endpoint with current password verification. | High | **P1.1** |
| **VULN-02** | JWT Security | `node_backend/src/middleware/auth.js` | `req.query.token` accepted in query string (URL leakage in logs/proxies); missing explicit algorithm, issuer, and audience validation. | High | **P1.2** |
| **VULN-03** | Session Management | `node_backend/src/services/accounts.service.js` | Refresh tokens lack cryptographic session family tracking and reuse detection; lack of atomic rotation. | Critical | **P1.2** |
| **VULN-04** | Object Auth / IDOR | `node_backend/src/services/accounts.service.js` | Managers can list and download confidential documents of any employee in the company outside their team (`/documents/:user_id`). | Critical | **P1.3** |
| **VULN-05** | Object Auth / IDOR | `node_backend/src/services/attendance.service.js` | Managers can inspect historical attendance details of unmanaged employees via `?employee_id=X`. | Medium | **P1.3** |
| **VULN-06** | OTP Security | `node_backend/src/services/accounts.service.js` | Insecure pseudo-random generator `Math.random()` for OTPs; reset endpoint does not enforce verified state or atomic attempt limits; direct bypass possible. | Critical | **P1.4** |
| **VULN-07** | API / Input Validation | `node_backend/src/middleware/validation.js` | Ubiquitous `z.any()` in request schemas for coordinates, radii, dates, and manager IDs; mass assignment risk. | High | **P1.5** |
| **VULN-08** | File Storage / Traversal | `node_backend/src/services/storage.service.js` | Local file deletion path lacks path traversal containment check; Multer memory storage lacked payload limit. | High | **P1.6** |
| **VULN-09** | Audit Redaction | `node_backend/src/utils/logger.js`, `audit.service.js` | Logger lacks deep automated redaction filter for secrets, tokens, and PII. | Medium | **P1.7** |
| **VULN-10** | Environment Secrets | `node_backend/src/config/env.js` | Production startup validation needs independent, non-default secret validation for JWT, OTP, and DB. | High | **P1.8** |
| **VULN-11** | Client Hardening | `hrms_saas/src/api/axios.js` | Hardcoded `http://127.0.0.1:8000/api` base URL; localStorage token clearance on logout. | Medium | **P1.9** |

---

## 2. Implementation Modules Breakdown

### P1.1 — Authentication and Password Security
- Enforce strict 12–128 character password policy.
- Calibrate bcrypt cost (12 rounds verified).
- Implement authenticated `change-password` endpoint requiring `current_password` and `new_password`.
- Invalidate all active sessions upon password change.
- Return generic errors on login failure.

### P1.2 — JWT and Refresh Token Security
- Remove `req.query.token` query-string authentication.
- Enforce explicit `algorithms: ["HS256"]`, `issuer: "hrms-api"`, `audience: "hrms-client"`.
- Implement Refresh Token Rotation with Session Families (`family_id`, `is_revoked`, `parent_hash`).
- Add token reuse detection (revokes entire family if an already-rotated token is reused).
- Add 15-second grace window for concurrent requests.
- Implement token blacklisting / revocation on logout, role change, and deactivation.

### P1.3 — RBAC and Object-Level Authorization
- Enforce scope check: Managers can only view documents of employees where `manager_id == actor.id`.
- Enforce scope check: Managers can only view team attendance details of their direct reports.
- Enforce server-side role check: Leave approval, attendance approval, employee management.
- Create unified authorization matrix document.

### P1.4 — Password Reset and OTP Security
- Replace `Math.random()` with `crypto.randomInt(100000, 1000000)`.
- Use constant-time hash verification (`crypto.timingSafeEqual`).
- Atomically enforce 5-attempt limit across all OTP endpoints.
- Return cryptographically signed/random `reset_token` upon OTP verification.
- Enforce that `/reset/` strictly requires verified state and consumes the OTP atomically.
- Revoke all refresh tokens on password reset.

### P1.5 — API Security and Input Validation
- Remove `z.any()` from `validation.js`; enforce numeric coordinates (-90..90, -180..180), integer IDs, strict dates.
- Enforce strict CORS allowlist in production.
- Sanitize error messages in production.

### P1.6 — File Upload and Document Security
- Enforce path traversal prevention in `storage.service.js` using `path.resolve` boundary check.
- Validate file magic bytes.
- Enforce authenticated, authorized signed URL generation for private documents.

### P1.7 — Audit Logging and Sensitive Data Protection
- Implement Winston automatic deep redaction format for passwords, tokens, hashes, and PII.
- Ensure critical security events (login failure, password reset, role update, document access) are recorded in `audit_logs`.

### P1.8 — Environment and Infrastructure Security
- Strict boot validation for separate `JWT_SECRET`, `OTP_SECRET`.
- Reject placeholder secrets in production.

### P1.9 — Web and Mobile Authentication Security
- Replace hardcoded `baseURL` in `hrms_saas/src/api/axios.js` with `VITE_API_BASE_URL`.
- Ensure clean state wipe on logout.
- Maintain backward-compatibility with `hrms_mobile`.

### P1.10 — Automated Security and Regression Testing
- Create comprehensive automated test suite in `node_backend/tests/security/` using Node 22 native test runner (`node --test`).
- Cover authentication, JWT, OTP, RBAC/IDOR, file validation, rate limiting, and audit logging.

---

## 3. Database Migration Strategy
- Migration `001_phase1_security_hardening.sql`:
  - `accounts_refreshtoken`: Add `family_id VARCHAR(64) NOT NULL`, `is_revoked BOOLEAN NOT NULL DEFAULT 0`, `replaced_by_hash VARCHAR(255) NULL`.
  - `password_reset_otp`: Add `reset_token_hash VARCHAR(128) NULL`, `consumed_at DATETIME NULL`.
- Backwards-compatible `IF NOT EXISTS` columns and indexes.
