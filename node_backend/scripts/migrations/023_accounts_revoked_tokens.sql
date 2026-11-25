-- ============================================================================
-- HRMS Migration 023: Resilient Token Revocation Fallback Store (BUG-A07)
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Description:
--   Creates a persistent fallback store for revoked JWT JTIs so that
--   session logout remains guaranteed and secure even when Redis is offline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts_revoked_token (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jti VARCHAR(64) NOT NULL,
  user_id INT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_revoked_jti (jti),
  KEY idx_revoked_expires (expires_at),
  KEY idx_revoked_user (user_id)
);
