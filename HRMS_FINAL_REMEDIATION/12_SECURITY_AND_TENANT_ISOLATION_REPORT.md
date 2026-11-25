# 12. Security and Tenant Isolation Report

- **Suite:** [tests/security/run_all.js](file:///f:/hrms/node_backend/tests/security/run_all.js)
- **Score:** **41 / 41 PASS** (100%)

## Security Dimensions Tested

1. **Authentication & Password Hardening (7/7 PASS):**
   - Minimum 12-character length requirement enforced. Excessive (>128 chars) payloads rejected.
   - Bcrypt with 12 rounds generates unique salts.
   - Legacy Django PBKDF2-SHA256 password migration detection verified.
2. **JWT Security & Refresh Token Rotation (6/6 PASS):**
   - URL query parameter tokens (`?token=`) strictly rejected.
   - Insecure `'none'` algorithm rejected.
   - Refresh tokens prohibited in Authorization header for API endpoints.
   - Refresh Token Rotation (RTR) enforces single-use family revocation upon reuse.
3. **Cryptographic OTP & Rate Limiting (7/7 PASS):**
   - Cryptographically random 6-digit OTPs generated.
   - Only HMAC-SHA256 hashes stored in database.
   - Verification locks out after 5 failed attempts.
   - Password reset requires cryptographic single-use reset token.
4. **RBAC & Multi-Tenant Isolation (10/10 PASS):**
   - Object-Level Authorization (IDOR) verified: managers cannot access out-of-team employee documents or attendance records.
   - Self-approval blocked: users cannot approve their own leave or attendance requests.
   - Tenant isolation verified across two isolated tenants (`DEFAULT` and `STAGING_B`). All SQL queries in `getAdminSummary` and `hrDashboard` are tenant-scoped.
5. **API & File Security (11/11 PASS):**
   - Path traversal in file deletion strictly blocked.
   - Coordinates outside valid ranges rejected.
   - Deep log redaction removes passwords, tokens, OTPs, and PAN/Aadhaar from logs.
   - Wildcard CORS (`*`) rejected in production configuration.
   - Direct static access to `/media/documents/` blocked with HTTP 403.
