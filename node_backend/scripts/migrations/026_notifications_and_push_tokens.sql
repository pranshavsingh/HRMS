-- ============================================================================
-- HRMS Enterprise Notification System Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 026_notifications_and_push_tokens.sql
-- Description:
--   Creates persistent notifications, push device tokens, and delivery
--   tracking tables with multi-tenant isolation, deduplication, and indexes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  recipient_id BIGINT NOT NULL,
  actor_id BIGINT NULL,
  type VARCHAR(100) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSON NULL,
  action_url VARCHAR(500) NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  dedupe_key VARCHAR(191) NULL,
  read_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES accounts_user(id) ON DELETE SET NULL,
  UNIQUE KEY uq_notifications_dedupe (tenant_id, recipient_id, dedupe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_notifications_recipient_created ON notifications(recipient_id, created_at);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read_at);
CREATE INDEX idx_notifications_recipient_category ON notifications(recipient_id, category, created_at);
CREATE INDEX idx_notifications_tenant_recipient ON notifications(tenant_id, recipient_id, created_at);

CREATE TABLE IF NOT EXISTS notification_push_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  user_id BIGINT NOT NULL,
  token VARCHAR(512) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'android',
  provider VARCHAR(20) NOT NULL DEFAULT 'expo',
  device_id VARCHAR(128) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  UNIQUE KEY uq_push_token (token(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_push_tokens_user_active ON notification_push_tokens(tenant_id, user_id, is_active);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider_message_id VARCHAR(255) NULL,
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deliveries_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_deliveries_notif_channel ON notification_deliveries(notification_id, channel);
CREATE INDEX idx_deliveries_status ON notification_deliveries(status, created_at);
