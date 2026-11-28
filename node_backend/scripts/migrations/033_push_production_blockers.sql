-- ============================================================================
-- HRMS Unified Push Notification — Production Blocker Remediation
-- Target: MySQL 8.0+, MariaDB 10+
-- Migration: 033_push_production_blockers.sql
-- Description:
--   1. Preserves full push endpoints in notification_push_tokens.token (TEXT)
--      and replaces 255-char prefix unique key with SHA-256 token_hash CHAR(64).
--   2. Adds delivered_at and receipt_checked_at on notification_deliveries
--      for Expo receipt polling and accurate QUEUED/SENT/DELIVERED/FAILED states.
-- ============================================================================

ALTER TABLE notification_push_tokens
  MODIFY COLUMN token TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS token_hash CHAR(64) NULL AFTER token;

UPDATE notification_push_tokens
SET token_hash = SHA2(token, 256)
WHERE token_hash IS NULL;

ALTER TABLE notification_push_tokens
  DROP INDEX uq_push_token,
  ADD UNIQUE KEY uq_push_token_hash (token_hash);

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL AFTER clicked_at,
  ADD COLUMN IF NOT EXISTS receipt_checked_at DATETIME NULL AFTER delivered_at;

CREATE INDEX idx_deliveries_receipt_poll
  ON notification_deliveries(channel, status, receipt_checked_at, created_at);
