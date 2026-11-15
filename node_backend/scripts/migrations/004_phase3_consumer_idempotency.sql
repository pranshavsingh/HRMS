-- ============================================================================
-- HRMS Phase 3 Consumer Idempotency Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 004_phase3_consumer_idempotency.sql
-- Description:
--   Creates the consumer_processed_jobs table for durable consumer idempotency.
--   Prevents duplicate side-effects (e.g. repeated email deliveries) across
--   at-least-once queue redeliveries or competing worker executions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS consumer_processed_jobs (
  job_id VARCHAR(128) NOT NULL,
  handler_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  result JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, handler_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_consumer_processed_at ON consumer_processed_jobs (created_at);
