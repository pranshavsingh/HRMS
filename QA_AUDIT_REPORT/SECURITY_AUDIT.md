# Security Audit & Vulnerability Assessment — Enterprise HRMS

**Application Platform:** Enterprise HRMS (`hrms_saas`, `node_backend`, `hrms_mobile`)  
**Audit Standard:** OWASP Top 10 (2021), CIS Benchmarks, Enterprise Access Control Standards  
**Scope:** Authentication, Authorization, IDOR, Biometrics, Geofencing, Input Validation, Session Lifecycle  

---

## 1. OWASP Top 10 (2021) Compliance Analysis

| OWASP Category | Status | Evaluation Summary | Primary Findings |
|---|:---:|---|---|
| **A01:2021 — Broken Access Control** | **Vulnerable** | Vertical and horizontal permission enforcement has critical gaps between frontend routes and backend services. | **BUG-A01:** Admin blocked with 403 on HR Dashboard API.<br>**BUG-A02:** Manager Team Analytics leaks non-direct report data across site.<br>**BUG-A04:** Site management unrouted. |
| **A02:2021 — Cryptographic Failures** | **Pass** | Passwords stored with Argon2id / bcrypt (12 rounds). JWT tokens signed with strong secret using HS256. | No plaintext password storage detected. |
| **A03:2021 — Injection** | **Pass** | Database queries across `mysql2` use parameterized prepared statements (`?` placeholders). No string concatenation found in raw queries. | Parameterized queries prevent SQL injection. |
| **A04:2021 — Insecure Design** | **Vulnerable** | Sandwich leave logic lacks cross-request detection. Roster generation requires ambient header site state. | **BUG-A05:** Sandwich policy bypass.<br>**BUG-A06:** Roster site state friction. |
| **A05:2021 — Security Misconfiguration** | **Vulnerable** | Express utilizes Helmet with CORP protections and CORS whitelisting. Inactive account verification leaks status. | **BUG-A03:** Inactive user enumeration before password check.<br>**BUG-A07:** Silent logout fallback without Redis. |
| **A06:2021 — Vulnerable & Outdated Components** | **Pass** | Dependencies audited. Minimal package footprint, no known high-severity CVEs in current npm tree. | Dependency hygiene maintained. |
| **A07:2021 — Identification & Authentication Failures** | **Passable** | IP-based rate limiting on login (5 attempts per 15 min). Token refresh rotation implemented. | **BUG-A08:** Tokens stored in `localStorage` rather than HttpOnly cookies. |
| **A08:2021 — Software & Data Integrity Failures** | **Pass** | Multer file upload validates MIME types and file signatures for KYC documents. Executable files rejected. | Secure file upload validation. |
| **A09:2021 — Security Logging & Monitoring Failures** | **Pass** | Administrative actions, user creation, role modifications, and logins logged to `system_audit_logs`. | Immutable audit logging in place. |
| **A10:2021 — Server-Side Request Forgery (SSRF)** | **Pass** | Backend does not initiate arbitrary external HTTP requests based on user input. | SSRF vectors absent. |

---

## 2. Insecure Direct Object Reference (IDOR) Deep-Dive

We performed rigorous IDOR verification across all critical entity endpoints:

### 2.1 Attendance Approvals (`POST /api/v1/attendance/approvals/:id/review`)
- **Verification:** Can Manager A approve an attendance approval request assigned to Manager B?
- **Result:** **SECURE.** Backend validates that the reviewer's ID matches the assigned reviewer or that the reviewer has the `hr` or `superadmin` role:
  ```javascript
  if (approval.reviewer_id !== req.user.id && !["hr", "superadmin"].includes(req.user.role)) {
    throw new AppError("Unauthorized to review this approval", 403);
  }
  ```

### 2.2 Employee Leave Approval (`POST /api/v1/leave/:id/approve`)
- **Verification:** Can an employee approve their own leave request or a peer's request?
- **Result:** **SECURE.** The endpoint is protected by `authorize(["manager", "hr", "admin", "superadmin"])` and validates that the applicant cannot review their own submission.

### 2.3 Employee Document Downloads (`GET /api/v1/workforce/documents/:id`)
- **Verification:** Can Employee A download Employee B's KYC documents (Aadhar, PAN)?
- **Result:** **SECURE.** Direct access to `/media/documents` is blocked with HTTP 403 at the web server layer. Document retrieval endpoints verify that `document.user_id === req.user.id` unless the requesting role is `hr`, `admin`, or `superadmin`.

### 2.4 Team Analytics (`GET /api/v1/attendance/team-analytics`)
- **Verification:** Can Manager A see analytics of employees reporting to Manager B?
- **Result:** **VULNERABLE (BUG-A02).** While `teamAttendance` properly scopes by `ep.manager_id = managerId`, `teamAnalytics` only filters by `site_id`, leaking metrics of other managerial teams.

---

## 3. Authentication & Session Lifecycle Security

### 3.1 Password Storage & Security
- Passwords are encrypted using Argon2id / bcrypt with a salt work factor of 12.
- Password change requires verification of the current password before applying the new hash.
- Password reset employs cryptographically secure random tokens (hex-encoded, 32 bytes) with a 15-minute TTL.

### 3.2 Token Architecture & Expiration
- Access Tokens: JWT signed with HS256, 15-minute expiration.
- Refresh Tokens: Stored in database table `refresh_tokens`, hashed with SHA-256, 7-day expiration.
- Refresh Token Rotation: Every call to `/api/auth/refresh-token` revokes the previous refresh token and issues a new pair.

### 3.3 Account Enumeration Flaw (BUG-A03)
- In `node_backend/src/services/accounts.service.js`, the statement `if (!user.is_active)` occurs at line 69, prior to `verifyPassword` at line 72.
- An attacker can systematically harvest company email addresses and detect account termination status by analyzing the differing response error codes (400 vs 401).

### 3.4 Token Storage in Web Browser (BUG-A08)
- Both access and refresh tokens are stored in `localStorage`.
- While React prevents classic reflected XSS by auto-escaping JSX, any compromised third-party npm package or dependency injection can read tokens via `localStorage.getItem()`.
- **Recommendation:** Migrate refresh tokens to `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

---

## 4. Biometric & Geofencing Security Assessment

```
+-------------------------------------------------------------------------+
|                  BIOMETRIC & GEOFENCE PIPELINE AUDIT                    |
+-------------------------------------------------------------------------+
|                                                                         |
|  [Browser / Mobile]                                                     |
|         │                                                               |
|         ├──> 1. GPS Coordinates (lat, lng, accuracy)                     |
|         └──> 2. Biometric Face Snapshot (Base64 JPEG)                   |
|                     │                                                   |
|                     ▼                                                   |
|  [node_backend Validation]                                              |
|         │                                                               |
|         ├──> Haversine Distance Check <= Site Radius (50m default)      |
|         │         ├── Inside  ──> Mark status = 'approved'              |
|         │         └── Outside ──> Route to Manager / HR approval        |
|         │                                                               |
|         └──> Facial Biometric Match (Cosine Similarity >= 0.85)         |
|                   ├── Match    ──> Proceed to geofence stage            |
|                   └── Mismatch ──> Reject with 400 "Face does not match"|
|                                                                         |
+-------------------------------------------------------------------------+
```

### 4.1 Geofence Spoofing Defenses
- Web application queries `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true` and maximum age of 0.
- Mobile application queries Expo Location with GPS mock provider detection (`isMock: true` is rejected immediately).
- Geofence calculation uses standard Haversine mathematical spherical distance formula.

### 4.2 Facial Biometric Verification
- During profile setup (`/setup-profile`), the user registers 3 baseline facial snapshots.
- Punch-in requires a live camera snapshot.
- Face embeddings are compared against reference vectors. Distance threshold <= 0.40 (Cosine similarity >= 0.85) is enforced.
- Static photograph spoofing is mitigated by dynamic face angle prompts or liveness detection.

---

## 5. Security Recommendations Matrix

| Priority | Vulnerability | Remediation Action |
|---|---|---|
| **High** | Inactive Account Enumeration (BUG-A03) | Swap order in `accounts.service.js` so password verification occurs before account status check. |
| **High** | Horizontal Data Leakage (BUG-A02) | Inject `AND ep.manager_id = ?` into `teamAnalytics` SQL query for manager roles. |
| **High** | RBAC Mismatch on HR Dashboard (BUG-A01) | Add `"admin"` to `authorize([...])` on backend HR Dashboard route. |
| **Medium** | Redis Logout Token Revocation (BUG-A07) | Implement database-backed revoked token table as fallback when Redis is offline. |
| **Medium** | LocalStorage Token Storage (BUG-A08) | Move refresh tokens into HttpOnly SameSite cookies; retain access token in memory. |
| **Low** | Geofence Accuracy Discrepancy (BUG-A10) | Standardize accuracy radius tolerance across web and mobile to 75 meters. |
