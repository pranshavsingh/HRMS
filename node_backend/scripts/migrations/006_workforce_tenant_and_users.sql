-- ============================================================================
-- Migration: 006_workforce_tenant_and_users.sql
-- Description: Creates workforce_tenant and workforce_user_tenant tables.
--              Seeds Default Tenant (ID=1) and backfills accounts_user records.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_tenant (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wt_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_user_tenant (
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role ENUM('superadmin', 'admin', 'hr', 'manager', 'employee') NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, tenant_id),
  UNIQUE KEY uq_wut_tenant_user (tenant_id, user_id),
  INDEX idx_wut_role_status (tenant_id, role, is_active),
  CONSTRAINT fk_wut_user
    FOREIGN KEY (user_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wut_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Default Tenant (ID=1)
INSERT INTO workforce_tenant (id, code, name, is_active, created_at, updated_at)
VALUES (1, 'DEFAULT', 'Primary Organization', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Backfill users from accounts_user into workforce_user_tenant
INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active, created_at, updated_at)
SELECT
  1 AS tenant_id,
  u.id AS user_id,
  CASE
    WHEN u.is_superuser = 1 THEN 'superadmin'
    WHEN u.role = 'admin' THEN 'admin'
    WHEN u.role = 'hr' THEN 'hr'
    WHEN u.role = 'manager' THEN 'manager'
    ELSE 'employee'
  END AS role,
  u.is_active,
  NOW(),
  NOW()
FROM accounts_user u
ON DUPLICATE KEY UPDATE updated_at = NOW();
