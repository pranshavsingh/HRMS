# Phase 1: Security Test Plan & Verification Suite

## 1. Test Strategy
The test suite utilizes Node.js 22's native test runner (`node --test`), `node:assert`, and isolated in-memory/mock environments to test all security boundaries without mutating production data.

---

## 2. Test Coverage Matrix

### Suite 1: Authentication & Password Security (`auth.test.js`)
- `test_password_policy_rejection`: Passwords < 12 characters rejected.
- `test_password_policy_acceptance`: Strong passwords accepted.
- `test_password_max_length`: Passwords > 128 characters safely rejected without DoS.
- `test_authenticated_change_password_success`: Password change succeeds when current password matches.
- `test_authenticated_change_password_invalid_current`: Fails when current password is wrong.
- `test_legacy_pbkdf2_auto_migration`: Legacy `pbkdf2_sha256$` hash verifies and converts to bcrypt.
- `test_login_enumeration_defense`: Unknown username and bad password return identical generic error.

### Suite 2: JWT & Refresh Token Lifecycle (`jwt.test.js`)
- `test_query_string_token_rejection`: Middleware rejects `?token=...`.
- `test_expired_access_token_rejection`: Expired JWT returns 401.
- `test_tampered_signature_rejection`: Invalid signature returns 401.
- `test_wrong_token_type_rejection`: Access token rejected at `/refresh/`; refresh token rejected at API endpoints.
- `test_refresh_token_rotation`: Refresh token is consumed and replaced with new token.
- `test_refresh_token_reuse_family_revocation`: Replaying an old refresh token revokes the entire family.
- `test_concurrent_refresh_grace_window`: Rapid concurrent refresh requests within 15s receive the child token safely without false-positive family revocation.
- `test_logout_revocation`: Logged out refresh token is rejected on subsequent attempts.

### Suite 3: OTP & Password Reset Security (`otp.test.js`)
- `test_otp_cryptographic_randomness`: OTPs generated using `crypto.randomInt`.
- `test_otp_attempt_limiting`: 5 consecutive wrong OTP attempts lock out the OTP.
- `test_otp_unverified_reset_bypass_prevention`: Calling `/reset/` with an unverified OTP fails with 400.
- `test_otp_single_use_consumption`: Once consumed by `/reset/`, the OTP/reset token cannot be used again.
- `test_password_reset_revokes_sessions`: Resetting password clears existing refresh tokens and user session cache.

### Suite 4: RBAC & IDOR Authorization (`rbac.test.js`)
- `test_manager_cross_department_document_idor`: Manager cannot list or view documents of unmanaged employee.
- `test_manager_cross_department_attendance_idor`: Manager cannot view attendance details of unmanaged employee.
- `test_employee_self_document_access`: Employee can view only their own documents.
- `test_prevent_self_approval`: Reviewer cannot approve their own attendance or leave request.
- `test_leave_approval_hierarchy`: Employee requests cannot be approved by another regular employee.

### Suite 5: File & API Input Security (`api_security.test.js`)
- `test_path_traversal_prevention`: File deletion with `../` is safely rejected.
- `test_magic_bytes_spoofing_prevention`: Executable file disguised as `.jpg` is rejected.
- `test_multer_file_size_limit`: Files > 5MB are rejected.
- `test_cors_allowlist_enforcement`: Disallowed origins receive no CORS authorization headers.
- `test_strict_input_validation`: Negative coordinates, out-of-range latitude, and mass assignment rejected.
