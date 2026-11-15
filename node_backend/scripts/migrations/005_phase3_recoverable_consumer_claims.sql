-- ============================================================================
-- HRMS Phase 3 Recoverable Consumer Claims Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 005_phase3_recoverable_consumer_claims.sql
-- Description:
--   Adds claimed_by, lease_expires_at, fencing_token, and updated_at to
--   consumer_processed_jobs to support crash recovery, stale worker fencing,
--   and distributed consumer idempotency across separate Node.js processes.
-- ============================================================================

ALTER TABLE consumer_processed_jobs ADD COLUMN claimed_by VARCHAR(100) NULL AFTER handler_name;
ALTER TABLE consumer_processed_jobs ADD COLUMN lease_expires_at DATETIME NULL AFTER claimed_by;
ALTER TABLE consumer_processed_jobs ADD COLUMN fencing_token BIGINT NOT NULL DEFAULT 1 AFTER lease_expires_at;
ALTER TABLE consumer_processed_jobs ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE INDEX idx_consumer_lease ON consumer_processed_jobs (status, lease_expires_at);
