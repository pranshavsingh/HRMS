-- ============================================================================
-- HRMS Phase 1 Security Hardening Database Migration
-- Target: MySQL / MariaDB (Compatible with SQLite in test environment)
-- Migration: 001_phase1_security_hardening.sql
-- Description:
--   1. Adds family_id, is_revoked, and replaced_by_hash to accounts_refreshtoken
--      for Refresh Token Rotation (RTR) and Session Replay Attack Detection.
--   2. Adds reset_token_hash, verified_at, and consumed_at to password_reset_otp
--      for Cryptographic Reset Challenges and Atomic Consumption.
-- ============================================================================

-- 1. Refresh Token Rotation & Session Family Tracking
ALTER TABLE accounts_refreshtoken 
  ADD COLUMN IF NOT EXISTS family_id VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at,
  ADD COLUMN IF NOT EXISTS replaced_by_hash VARCHAR(255) NULL AFTER is_revoked;

CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked);

-- 2. Password Reset OTP Hardening & Atomic Consumption
ALTER TABLE password_reset_otp
  ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(128) NULL AFTER otp_hash,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER verified,
  ADD COLUMN IF NOT EXISTS consumed_at DATETIME NULL AFTER verified_at;

CREATE INDEX IF NOT EXISTS idx_otp_email_verified ON password_reset_otp(email, verified);
