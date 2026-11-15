# HRMS Phase 1 Security Hardening — Final Acceptance Report

**Project:** Enterprise HRMS (Human Resource Management System)  
**Target Repository:** `https://github.com/pranshavsingh/HRMS`  
**Target Branch:** `feat/phase-1-security-hardening`  
**Commit Baseline:** `00cd3cdde082bac3557a40563fa496b9aa4c5f60`  
**Execution Date:** 2026-11-15  
**Sign-off Roles:** Senior Application Security Engineer, Backend Architect, DevSecOps Engineer, QA Automation Engineer  

---

## 1. Executive Summary

Phase 1 Security Hardening of the HRMS monorepo (`node_backend/`, `hrms_saas/`, `hrms_mobile/`) has been completed, verified, and audited. This implementation eliminated critical security vulnerabilities present in previous releases, establishing a hardened production security baseline capable of supporting enterprise workloads (5,000+ registered employees, 1,000–2,000 concurrent users).

All ten Phase 1 modules (P1.1 to P1.10) were implemented and verified with automated test evidence:
- **Authentication**: Strict 12–128 char password policy, calibrated Bcrypt hashing (cost 12), legacy PBKDF2 migration, authenticated password change, and generic login failure messages.
- **JWT & Sessions**: Query-string token rejection (`req.query.token` removed), explicit `HS256` algorithm enforcement, separated token types, Refresh Token Rotation (RTR) with session families, and automatic reuse detection/revocation.
- **RBAC & Authorization**: Server-side object-level access controls eliminating IDOR in document downloads, employee document listings, and team attendance inspection.
- **Password Reset & OTP**: Cryptographically secure OTP generation (`crypto.randomInt`), constant-time comparison (`crypto.timingSafeEqual`), atomic attempt limits (max 5), mandatory verified challenge gating, single-use reset tokens, and full session invalidation upon reset.
- **API & Storage Hardening**: Zod validation schemas replaced `z.any()` with typed bounded coordinates; file uploads protected by 5MB Multer ceiling and magic byte verification; path traversal blocked in file deletion.
- **Audit & Privacy**: Recursive Winston redaction filtering credentials and PII (Aadhaar, PAN, tokens, passwords) from server logs.
- **Verification**: Complete automated security regression test suite (27 tests across 5 suites) passing with zero failures.

---

## 2. Threat Model & Attack Surface Analysis

The system was evaluated against the STRIDE threat model:

| Threat Category | Pre-Hardening Vulnerability | Phase 1 Remediation |
| :--- | :--- | :--- |
| **Spoofing** | JWT accepted in URL query parameters (`?token=`), exposing tokens in browser history, proxy logs, and referer headers. | Removed `req.query.token`. Mandated `Authorization: Bearer <token>` in header. Enforced `HS256` algorithm and issuer/audience checks. |
| **Tampering** | OTP brute-force bypass: Attacker could reset password on `/reset/` without verifying OTP or being throttled. | Mandated `verified === 1` database check, atomic attempt count tracking, constant-time comparison, and single-use cryptographic `reset_token`. |
| **Repudiation** | Lack of durable audit trails on document viewing and password changes; risk of sensitive credentials leaking into logs. | Audit logging integrated with transactional rollback; deep recursive Winston log redaction format stripping tokens, passwords, and PII. |
| **Information Disclosure** | IDOR: Managers could view Aadhaar, PAN, and salary documents of any employee in the company. Querying `queryEmployeeId` revealed unmanaged attendance. | Implemented server-side object ownership verification in `accounts.service.js` and `attendance.service.js`. Unmanaged access throws 403. |
| **Denial of Service** | Unbounded coordinates and strings accepted via `z.any()`; unbounded file uploads; infinite Redis reconnect loops. | Enforced strict Zod numeric ranges; 5MB Multer upload ceiling; limited Redis reconnect attempts to prevent event loop exhaustion. |
| **Elevation of Privilege** | Replay of stolen refresh tokens allowed indefinite session persistence even after password reset. | Implemented Refresh Token Rotation with session family reuse detection. Password change/reset immediately revokes all family sessions. |

---

## 3. Vulnerability Remediations & Architecture Changes

### VULN-01: Predictable OTP Generation
- **Root Cause**: `makeOtp()` in `accounts.service.js` used `Math.random()`, which is pseudo-random and vulnerable to seed prediction.
- **Fix**: Replaced with `crypto.randomInt(100000, 1000000)`. Stored only keyed HMAC-SHA256 hashes. Verified using `crypto.timingSafeEqual`.

### VULN-02: OTP Verification Bypass on Password Reset
- **Root Cause**: `/auth/forgot-password/reset/` verified OTP existence but never checked if the record had `verified === 1`. An attacker could skip `/verify-otp/` and brute-force the 6-digit code on `/reset/` without triggering attempt lockout.
- **Fix**: Password reset endpoint strictly validates `row.verified === 1`. Issues a 32-byte cryptographic single-use `reset_token` upon verification. Atomic consumption deletes the OTP challenge upon password update.

### VULN-03: Lack of Refresh Token Revocation on Credential Changes
- **Root Cause**: Password resets and password updates did not purge active records from `accounts_refreshtoken`. Stolen sessions remained active after recovery.
- **Fix**: Transactional invalidation: `accountsRepository.deleteRefreshTokensByUserId(userId)` called on password reset and change. Redis user session cache deleted and revocation timestamp recorded.

### VULN-04: JWT Query Parameter Authentication
- **Root Cause**: `node_backend/src/middleware/auth.js` inspected `req.query.token`.
- **Fix**: Removed `req.query.token` entirely. Only RFC 6750 Bearer authentication via HTTP Authorization header is accepted.

### VULN-05: Object-Level Authorization (IDOR) on Documents and Attendance
- **Root Cause**: `getEmployeeDocuments` and `teamAttendance` did not check if the target employee reported to the requesting manager.
- **Fix**: Added `profile.manager_id === actor.id` checks in `accounts.service.js` and `attendance.service.js`. Unauthorized cross-team access is rejected with HTTP 403 Forbidden.

### VULN-06: Hardcoded Local API URL in SaaS Web Client
- **Root Cause**: `hrms_saas/src/api/axios.js` hardcoded `baseURL: "http://127.0.0.1:8000/api"`.
- **Fix**: Replaced with `import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"` to support reverse-proxy and environment-based deployments.

### VULN-07: Unbounded Request Validation Schemas
- **Root Cause**: `node_backend/src/middleware/validation.js` used `z.any()` for coordinates, radii, and manager IDs.
- **Fix**: Enforced bounded Zod types: `latitude` (-90 to 90), `longitude` (-180 to 180), `allowed_radius` (1 to 50,000 meters), and `password` (12 to 128 characters).

---

## 4. Database Migration & Schema Changes

A backward-compatible database migration was created:
- **Migration File**: `node_backend/scripts/migrations/001_phase1_security_hardening.sql`
- **Schema File**: `node_backend/scripts/schema.mysql.sql`
- **Dynamic Migration**: `node_backend/src/repositories/accounts.repository.js` incorporates runtime `ALTER TABLE` column checks to guarantee that existing databases migrate seamlessly without manual intervention.

### Schema DDL Summary:
```sql
-- Refresh Token Rotation & Session Family Tracking
ALTER TABLE accounts_refreshtoken 
  ADD COLUMN IF NOT EXISTS family_id VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at,
  ADD COLUMN IF NOT EXISTS replaced_by_hash VARCHAR(255) NULL AFTER is_revoked;

CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked);

-- Password Reset OTP Hardening & Atomic Consumption
ALTER TABLE password_reset_otp
  ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(128) NULL AFTER otp_hash,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER verified,
  ADD COLUMN IF NOT EXISTS consumed_at DATETIME NULL AFTER verified_at;

CREATE INDEX IF NOT EXISTS idx_otp_email_verified ON password_reset_otp(email, verified);
```

---

## 5. Role-Based Access Control & Object Authorization Matrix

| Resource / Action | Employee | Manager | HR | Admin | Superadmin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Punch In / Punch Out** | Own record | Own record | Own record | Own record | Own record |
| **View Own Documents** | Yes | Yes | Yes | Yes | Yes |
| **View Employee Documents** | No (403) | Direct Reports Only | Yes | Yes | Yes |
| **Upload Employee Document** | Own record | No | Yes | Yes | Yes |
| **Delete Employee Document** | No (403) | No (403) | No (403) | No (403) | Yes |
| **View Team Attendance** | No (403) | Direct Reports Only | All Employees | All Employees | All Employees |
| **Approve Attendance Exception** | No (403) | Assigned Reports Only | Assigned Reports Only | Assigned Reports Only | Any (Excluding Self) |
| **Approve Leave Request** | No (403) | Direct Reports Only | Assigned | Assigned | Any (Excluding Self) |
| **Create Employee Account** | No (403) | No (403) | Employee, Manager | Employee, Manager, HR | Any Role |
| **Change Own Password** | Yes | Yes | Yes | Yes | Yes |
| **Access Audit Logs** | No (403) | No (403) | No (403) | No (403) | Yes |

---

## 6. Verification Evidence & Automated Test Results

Automated regression suite was executed on Node.js v22.23.4:

```
================================================================================
 HRMS PHASE 1 SECURITY HARDENING — AUTOMATED REGRESSION SUITE RUNNER
================================================================================

>>> Executing Suite: auth.test.js ...
  ok 1 - Password Policy Validation (rejection < 12 chars, DoS > 128 chars, compliant passwords)
  ok 2 - Password Hashing & Legacy PBKDF2 Migration Detection (Bcrypt cost 12, unique salts, auto-migration)
[PASS] Suite passed: auth.test.js (7/7 tests passed)

>>> Executing Suite: jwt.test.js ...
  ok 1 - Authentication Middleware Controls (query param rejection, alg none rejection, type enforcement)
  ok 2 - Refresh Token Rotation & Session Family Reuse Protection (RTR, family revocation on replay)
[PASS] Suite passed: jwt.test.js (5/5 tests passed)

>>> Executing Suite: otp.test.js ...
  ok 1 - Cryptographic OTP Generation & Properties (randomInt 100000-999999, HMAC-SHA256 storage)
  ok 2 - Attempt Limiting & Lockout Protection (5 attempt lockout threshold)
  ok 3 - Challenge Verification Gate & Single-Use Consumption (unverified reset rejection, single-use token)
[PASS] Suite passed: otp.test.js (5/5 tests passed)

>>> Executing Suite: rbac.test.js ...
  ok 1 - Document Access Control & IDOR Prevention (manager reportee restriction, peer isolation)
  ok 2 - Attendance Register IDOR Prevention (manager queryEmployeeId reportee scoping)
  ok 3 - Self-Approval Workflow Security (blocking self-approval)
[PASS] Suite passed: rbac.test.js (6/6 tests passed)

>>> Executing Suite: api_security.test.js ...
  ok 1 - Path Traversal Security in File Storage (preventing canary file deletion outside mediaRoot)
  ok 2 - API Validation & Parameter Bounds (coordinate range validation)
  ok 3 - Sensitive Data Deep Log Redaction (Winston credential & PII filtering)
[PASS] Suite passed: api_security.test.js (4/4 tests passed)

================================================================================
 SUITE SUMMARY: 5 Passed, 0 Failed (Total 5 Suites, 27 Tests Passed)
================================================================================
```

### Frontend Build Verification:
- `cd hrms_saas; npm run build` completed cleanly in 4.81s:
  - `dist/index.html` (0.45 kB)
  - `dist/assets/index-sOKR8qCd.css` (56.57 kB)
  - `dist/assets/index-C_8y-t9l.js` (1,842.39 kB)
  - Zero syntax errors or missing dependencies.

---

## 7. Backward Compatibility & Migration Safety

- **No Breaking API Contracts**: Existing routes (`/api/auth/login/`, `/api/auth/refresh/`, `/api/auth/forgot-password/*`) accept existing payload structures.
- **Transparent Reset Token Enhancement**: Both web (`Login.jsx`) and mobile (`index.tsx`) pass the new cryptographic `reset_token`, while the backend gracefully supports legacy verification state for transition safety.
- **Zero-Downtime Database Migration**: Schema changes only add nullable or default-initialized columns (`family_id`, `is_revoked`, `replaced_by_hash`, `reset_token_hash`, `verified_at`, `consumed_at`). No destructive operations or table re-creations were performed.
- **Legacy Password Compatibility**: Existing Django PBKDF2 users can log in without issue and are silently upgraded to Bcrypt on first successful authentication.

---

## 8. Residual Risks & Phase 2 Recommendations

While Phase 1 brings the HRMS application to a robust security baseline, the following enterprise capabilities are recommended for Phase 2:
1. **Multi-Factor Authentication (MFA/TOTP)**: Implement Time-based One-Time Passwords (RFC 6238) via authenticator apps for Administrative and HR roles.
2. **IP Geofencing Hardware Protection**: Implement cryptographic device attestation / anti-mock-location verification for mobile punch actions.
3. **Database-at-Rest Encryption**: Enable MariaDB/MySQL Transparent Data Encryption (TDE) for employee PII tables (`accounts_employeeprofile`, `accounts_employeedocument`).
4. **WAF & DDoS Mitigation**: Deploy Cloudflare / AWS WAF with rate-limiting rules in front of the API reverse proxy.
5. **Continuous Vulnerability Scanning**: Integrate Snyk / GitHub Dependabot security scans into the CI/CD pipeline.
