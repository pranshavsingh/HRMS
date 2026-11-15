-- ============================================================================
-- HRMS Phase 3 Transactional Outbox Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 003_phase3_outbox_events.sql
-- Description:
--   Creates the outbox_events table for transactional outbox pattern.
--   Bridges atomic database transactions with durable BullMQ queue dispatch.
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  claimed_by VARCHAR(100) NULL,
  claimed_until DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_outbox_idempotency (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_outbox_pending ON outbox_events(status, id);
CREATE INDEX idx_outbox_claim ON outbox_events(status, claimed_until, id);
CREATE INDEX idx_outbox_created ON outbox_events(created_at);
