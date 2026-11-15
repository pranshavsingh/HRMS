-- ============================================================================
-- HRMS Phase 1 Security Hardening Database Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 001_phase1_security_hardening.sql
-- Description:
--   1. Adds family_id, is_revoked, and replaced_by_hash to accounts_refreshtoken
--      for Refresh Token Rotation (RTR) and Session Replay Attack Detection.
--   2. Adds reset_token_hash, verified_at, and consumed_at to password_reset_otp
--      for Cryptographic Reset Challenges and Atomic Consumption.
-- Note: Use 'npm run db:migrate' for automated pre-checked migration execution.
-- ============================================================================

-- 1. Refresh Token Rotation & Session Family Tracking
ALTER TABLE accounts_refreshtoken 
  ADD COLUMN family_id VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at,
  ADD COLUMN replaced_by_hash VARCHAR(255) NULL AFTER is_revoked;

CREATE INDEX idx_refresh_family ON accounts_refreshtoken(family_id);
CREATE INDEX idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked);

-- 2. Password Reset OTP Hardening & Atomic Consumption
ALTER TABLE password_reset_otp
  ADD COLUMN reset_token_hash VARCHAR(128) NULL AFTER otp_hash,
  ADD COLUMN verified_at DATETIME NULL AFTER verified,
  ADD COLUMN consumed_at DATETIME NULL AFTER verified_at;

CREATE INDEX idx_otp_email_verified ON password_reset_otp(email, verified);
