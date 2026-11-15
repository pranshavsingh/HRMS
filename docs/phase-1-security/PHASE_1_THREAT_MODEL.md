# Phase 1: Security Threat Model

**Methodology:** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  
**System:** Enterprise HRMS (Web, Mobile, Node.js Backend, MySQL, Redis, Cloudinary)

---

## 1. Trust Boundaries & Data Flow

```
[ Public Internet ]
      │
      ▼ (TLS / HTTPS)
[ Nginx Reverse Proxy / WAF ]
      │ (Boundary 1: Network Edge)
      ▼
[ Express API Gateway / Cluster ]
      │
      ├───────────────────────┬────────────────────────┬──────────────────────┐
      ▼                       ▼                        ▼                      ▼
(Boundary 2)            (Boundary 3)             (Boundary 4)           (Boundary 5)
[ Redis Cache & State ] [ MySQL Database ]       [ Cloudinary CDN ]     [ Local Filesystem ]
```

---

## 2. Threat Analysis Matrix (STRIDE)

### A. Spoofing (Identity & Tokens)
- **Threat 1: Refresh Token Theft & Replay**: An attacker who steals a long-lived 30-day refresh token can indefinitely maintain unauthorized access.
  - *Mitigation*: Refresh Token Rotation (RTR) with Session Families. Every refresh consumes the token and issues a new pair. If an already-rotated token is presented, the entire family is revoked immediately.
- **Threat 2: URL Token Interception**: Tokens passed in `req.query.token` leak into Nginx access logs, browser history, referer headers, and proxy caches.
  - *Mitigation*: Completely remove `req.query.token` support. Enforce `Authorization: Bearer <token>` header exclusively.

### B. Tampering
- **Threat 3: OTP Brute-Force & Reset Bypass**: An attacker invokes `/forgot-password/reset/` directly without going through OTP verification, or makes unlimited attempts without counter incrementation.
  - *Mitigation*: Strict 2-phase state machine with cryptographically random OTPs (`crypto.randomInt`), constant-time comparison, atomic attempt limiting across all endpoints, and verified challenge token validation.
- **Threat 4: Insecure Direct Object Reference (IDOR)**: A manager tampers with `:user_id` in document URLs or attendance reports to view unauthorized employee records.
  - *Mitigation*: Server-side scope verification: Verify `employee.manager_id === actor.id` before returning documents or detailed records.

### C. Repudiation
- **Threat 5: Unaudited Administrative Actions**: An administrator or manager approves exceptions, updates roles, or deletes accounts without an auditable record.
  - *Mitigation*: Centralized, durable audit logging to `audit_logs` table for all security-sensitive operations.

### D. Information Disclosure
- **Threat 6: Sensitive Data in Logs & Traces**: User passwords, OTPs, auth tokens, or stack traces leak into Winston logs, error responses, or console outputs.
  - *Mitigation*: Centralized logging redaction format. Generic error responses in production without internal stack traces.
- **Threat 7: Path Traversal on Local Storage**: An attacker passes path traversal sequences (`../../etc/passwd`) in document identifiers to delete or access arbitrary server files.
  - *Mitigation*: Enforce `path.resolve` boundary containment against `config.mediaRoot`.

### E. Denial of Service (DoS)
- **Threat 8: Unbounded Upload Buffers**: An attacker uploads hundreds of 500MB multipart requests into memory, starving the Node.js heap.
  - *Mitigation*: Multer `fileSize: 5 * 1024 * 1024` ceiling; route-tiered rate limiting in Redis.
- **Threat 9: Event Loop Starvation on Passwords**: Synchronous `pbkdf2Sync` or excessively large password inputs freeze the single-threaded Node event loop.
  - *Mitigation*: Asynchronous `bcrypt.hash` running on libuv worker threads; 128-character maximum password length.

### F. Elevation of Privilege
- **Threat 10: Role Field Mass Assignment**: A user supplies `{ role: "superadmin" }` in registration or profile update.
  - *Mitigation*: Whitelisted writable fields in Zod schemas; explicit role change validation enforcing hierarchical permissions.
