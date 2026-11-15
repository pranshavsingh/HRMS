# Phase 1: Database Changes & Migration Specification

## 1. Overview
Phase 1 introduces two schema enhancements to support:
1. **Refresh Token Rotation & Family Tracking** (`accounts_refreshtoken`)
2. **Atomic OTP Verification Challenge Tokens & Single-Use Enforcement** (`password_reset_otp`)

All migrations are designed to be **safe, idempotent, and backward-compatible** (`IF NOT EXISTS` column additions).

---

## 2. Migration Script: `scripts/migrations/001_phase1_security_hardening.sql`

```sql
-- Phase 1 Security Hardening Migration
-- 1. Refresh Token Rotation & Session Families
ALTER TABLE accounts_refreshtoken 
  ADD COLUMN IF NOT EXISTS family_id VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at,
  ADD COLUMN IF NOT EXISTS replaced_by_hash VARCHAR(255) NULL AFTER is_revoked;

CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user_revoked ON accounts_refreshtoken(user_id, is_revoked);

-- 2. Password Reset OTP Verified Challenge State
ALTER TABLE password_reset_otp 
  ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(128) NULL AFTER otp_hash,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER verified,
  ADD COLUMN IF NOT EXISTS consumed_at DATETIME NULL AFTER verified_at;

CREATE INDEX IF NOT EXISTS idx_otp_reset_token ON password_reset_otp(reset_token_hash);
```

---

## 3. Rollback Considerations
- Dropping newly added columns will not affect legacy sessions because default values preserve existing operations.
- Rollback script: `scripts/migrations/rollback_001_phase1_security_hardening.sql`.
