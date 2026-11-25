# Enterprise HRMS — Security Retest & Verification Report

**Repository:** `pranshavsingh/HRMS`  
**Audit Reference:** Enterprise HRMS Security & Access Control Review  
**Date:** November 23, 2026  
**Auditor:** Application Security & QA Engineering  

---

## 1. Security Testing Overview

This report details the retesting and verification of security vulnerabilities identified during the November 2026 application audit. All tests were executed against the updated codebase and live MariaDB database.

---

## 2. Retest Results Matrix

| Security Area | Issue | Prior Risk | Post-Remediation Status | Retest Result |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Inactive user status probed via early `is_active` check | Medium (Account Enumeration) | Constant-time password verification executed first; unified 400 error message | **PASS** |
| **Session Control** | Token revocation failure when Redis was unavailable | High (Revocation Bypass) | Persistent DB blacklist (`accounts_revoked_token`) with dual-check middleware | **PASS** |
| **Client Storage** | LocalStorage token access fallback in RealtimeContext | Medium (XSS Exposure) | Strictly enforced memory token; zero LocalStorage token lookups | **PASS** |
| **Access Control (RBAC)** | Admin blocked from HR Dashboard API | High (Functional Flaw) | Admin authorized alongside HR and Superadmin in both route & service | **PASS** |
| **Data Privacy** | Manager viewed cross-manager data in Team Analytics | High (Horizontal Leakage) | Mandatory `ep.manager_id = managerId` filter applied for non-global viewers | **PASS** |
| **Sensor Integrity** | Unbounded GPS accuracy allowed spoofed / low-res coordinates | Medium (Audit Tampering) | Strict <= 100m accuracy gate enforced across Backend, Web, and Mobile | **PASS** |

---

## 3. Detailed Security Verification Evidence

### 3.1 Account Enumeration Prevention (BUG-A03)
- **Vulnerability:** Testing username/password combinations previously revealed whether an inactive account existed prior to validating the password.
- **Verification:**
  - When submitting invalid credentials for an active account: returns `HTTP 400: "Invalid credentials"`.
  - When submitting invalid credentials for an inactive account: returns `HTTP 400: "Invalid credentials"` with identical payload and response timing.
  - Password hash computation via `verifyPassword()` is executed regardless of account active state, eliminating timing side-channels.

### 3.2 Token Revocation & Blacklist Resiliency (BUG-A07)
- **Vulnerability:** If Redis crashed or was partitioned, logged-out users could continue accessing protected endpoints until JWT expiration.
- **Verification:**
  - Table `accounts_revoked_token` created in MariaDB with unique index on `jti` and index on `expires_at`.
  - On user logout, `accounts.service.js` inserts `(jti, user_id, expires_at)` into the database.
  - `auth.js` middleware queries `accounts_revoked_token` if Redis is offline or if JTI is not cached.
  - SSE ticket endpoint in `accounts.controller.js` checks the database blacklist prior to granting realtime connections.
  - Expired blacklist rows are automatically pruned hourly via `cron.js`.

### 3.3 Elimination of Client-Side Token Storage (BUG-A08)
- **Vulnerability:** `localStorage.getItem("token")` fallback in realtime context exposed auth tokens to malicious third-party scripts or XSS vectors.
- **Verification:**
  - Codebase audit confirms zero instances of `localStorage.getItem("token")` across all contexts and API interceptors.
  - Realtime SSE and WebSocket connections exclusively use `getInMemoryToken()`.

### 3.4 Horizontal Access Control Scoping (BUG-A02)
- **Vulnerability:** Managers could view attendance KPIs, overtime, and punctuality stats of employees outside their organizational hierarchy.
- **Verification:**
  - Non-global viewers (`role === "manager"`) are constrained by query parameter:
    `WHERE ... AND ep.manager_id = ?`
  - Global roles (`hr`, `admin`, `superadmin`) retain organization-wide visibility.

### 3.5 GPS Geofence & Sensor Integrity (BUG-A10)
- **Vulnerability:** Attendance punches could be recorded with low GPS accuracy (e.g. cellular triangulation with ±2000m uncertainty), defeating geofence enforcement.
- **Verification:**
  - Backend schema validates `accuracy` and rejects any payload where `Number(accuracy) > 100` meters.
  - Web application prompts user and halts punch submission if browser reports accuracy > 100m.
  - Mobile application checks `loc.coords.accuracy <= 100` before taking photo, preventing spoofed or inaccurate punches.
