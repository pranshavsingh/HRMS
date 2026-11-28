-- ============================================================================
-- HRMS Unified Web Push + Mobile Push Migration
-- Target: MySQL 8.0+, MariaDB 10+
-- Migration: 032_unified_web_mobile_push.sql
-- ============================================================================

ALTER TABLE notification_push_tokens
  ADD COLUMN IF NOT EXISTS subscription_json TEXT NULL AFTER device_id,
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(120) NULL AFTER subscription_json;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS device_token_id BIGINT NULL AFTER channel,
  ADD COLUMN IF NOT EXISTS clicked_at DATETIME NULL AFTER error_message;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  user_id BIGINT NOT NULL,
  web_push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  mobile_push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  disabled_categories JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  UNIQUE KEY uq_notif_pref_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
