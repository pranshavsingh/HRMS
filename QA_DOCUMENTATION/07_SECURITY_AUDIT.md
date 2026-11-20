# Enterprise Quality Audit: Comprehensive Security & OWASP Top 10 Audit

**Document Reference:** `QA_DOCUMENTATION/07_SECURITY_AUDIT.md`  
**Application Target:** HRMS SaaS Enterprise Distributed Platform  
**Target Repository:** `pranshavsingh/HRMS`  
**Execution Date:** November 2026  
**Auditing Department:** DevSecOps & Application Security Engineering  

---

## 1. Executive Summary

This report delivers the comprehensive application security and penetration testing audit of the HRMS SaaS platform against the **OWASP Top 10 (2021/2026)** standard. Testing involved automated penetration test suites (`api_security.test.js`, `rbac.test.js`, `failure_injection.test.js`), static analysis of all controller SQL queries, and dynamic session tampering simulations.

### Overall Security Posture: **ENTERPRISE SECURE**
- **Zero Critical Vulnerabilities:** Zero SQL injection, zero remote code execution, zero horizontal tenant leaks, and zero authentication bypasses.
- **Defense in Depth:** Enforced via cryptographic fencing, AES-256-GCM outbox payload encryption, and multi-tenant foreign key constraints.

---

## 2. OWASP Top 10 Detailed Forensic Findings

### A01:2021 — Broken Access Control: **PASS**
1. **Vertical Privilege Escalation:**
   - Attempted access by `employee` and `manager` roles to administrative endpoints (`/api/sites`, `/api/audit/logs`, `/api/leave/policy/upsert`, `/api/shifts`) was systematically rejected with `403 Forbidden`.
   - Managers attempting to approve attendance or leave for non-direct reports or employees outside their assigned work sites are blocked via `siteService.ensureEmployeeVisible`.
2. **Horizontal Privilege Escalation (Cross-Tenant):**
   - Verified via `t2_08_cross_tenant_isolation.test.js` and `realtime_pubsub.test.js`.
   - Access attempts specifying a foreign tenant or requesting foreign site documents are strictly blocked.
   - Real-time rooms enforce scoped namespaces (`org:<id>:role:<role>`), preventing role broadcasts from leaking across organizations.

---

### A02:2021 — Cryptographic Failures: **PASS**
1. **At-Rest Outbox Payload Encryption:**
   - All asynchronous outbox events carrying sensitive credentials (e.g. `AUTH_PASSWORD_RESET_OTP_REQUESTED`) are encrypted using **AES-256-GCM** with unique 12-byte initialization vectors (`iv`) and 16-byte authentication tags (`auth_tag`).
   - Tampered ciphertexts fail authentication and are safely rejected (`400 BAD_REQUEST`).
2. **Password & OTP Storage:**
   - Passwords use bcrypt with 12 rounds. Legacy Django PBKDF2 hashes are upgraded Just-In-Time upon initial login.
   - 6-digit OTPs are hashed prior to storage in `accounts_user` with 10-minute expiry and 3-attempt lockouts.
3. **Secrets in Telemetry:**
   - Confirmed via `observability.test.js`: Prometheus `/metrics` strictly redacts JWT secrets, database passwords, SMTP credentials, and OTP values.

---

### A03:2021 — Injection: **PASS**
1. **SQL Injection Defense:**
   - 100% of SQL queries executed through `db.get()`, `db.all()`, and `db.run()` use prepared statement parameters (`?` placeholders).
   - Dynamic sorting and pagination identifiers (`limit`, `offset`, `sort`) are strictly validated against allowlists or clamped to numeric boundaries.
2. **Cross-Site Scripting (XSS):**
   - React 19 JSX auto-escapes user-controlled inputs by default.
   - Express backend utilizes `helmet()` configured with a strict Content Security Policy (`script-src 'self'`).

---

### A04:2021 — Insecure Design: **PASS**
1. **Refresh Token Rotation (RTR) & Compromise Detection:**
   - Refresh tokens are single-use. Replay of an invalidated token triggers immediate revocation of the entire token family UUID.
2. **Distributed Consumer Fencing:**
   - Consumer claims enforce monotonic fencing tokens and lease expirations (`lease_expires_at`). Stale workers cannot complete claims or mark dead-letter records once a lease has expired or been recovered.

---

### A05:2021 — Security Misconfiguration: **PASS**
1. **HTTP Security Headers:**
   - Evaluated using `curl -I` and `api_security.test.js`:
     - `Content-Security-Policy`: Enforced.
     - `X-Frame-Options: DENY`: Enforced (prevents clickjacking).
     - `X-Content-Type-Options: nosniff`: Enforced.
     - `Strict-Transport-Security`: Enforced in production configuration.
2. **Cookie Attributes:**
   - `HttpOnly: true` (prevents client-side JS theft).
   - `SameSite: Strict` (eliminates CSRF cross-origin leakage).
   - `Secure: true` (enforced when `NODE_ENV=production`).

---

### A06:2021 — Vulnerable and Outdated Components: **PASS**
1. Node.js backend package dependencies audited via `npm audit`:
   - Core libraries (`bcryptjs`, `jsonwebtoken`, `mysql2`, `bullmq`, `ioredis`, `express`) are pinned to modern, patched releases.
   - Zero high or critical known CVEs identified.

---

### A07:2021 — Identification and Authentication Failures: **PASS**
1. **Brute-Force & Enumeration Resistance:**
   - Reset password requests return identical generic responses (`"If this email exists, OTP has been sent."`) regardless of whether the email is present.
   - Failed logins execute dummy bcrypt comparisons to normalize response timing.

---

### A08:2021 — Software and Data Integrity Failures: **PASS**
1. **Poison Payload DLQ Routing:**
   - Malformed or corrupt job payloads in BullMQ are routed to `phase3_dlq_replay_log` with sanitized error summaries, preventing worker crash loops.
2. **Replay Audit Logging:**
   - Manual DLQ replays by operators require explicit privileges and generate forensic audit log entries.

---

### A09:2021 — Security Logging and Monitoring Failures: **PASS**
1. All privilege elevations, password changes, site modifications, and employee document uploads generate immutable audit records in `accounts_auditlog`.
2. Audit records capture `user_id`, `action`, `ip_address`, `user_agent`, and detailed JSON metadata.

---

### A10:2021 — Server-Side Request Forgery (SSRF): **PASS**
1. Webhooks and external HTTP integrations are restricted to whitelisted hostnames (e.g. Cloudinary, Hostinger SMTP).
2. Endpoints accepting image uploads utilize multipart streaming directly to Cloudinary or secure disk roots with randomized UUID filenames, blocking arbitrary URL fetches.
