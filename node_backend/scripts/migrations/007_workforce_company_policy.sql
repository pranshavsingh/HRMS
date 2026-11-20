-- ============================================================================
-- Migration: 007_workforce_company_policy.sql
-- Description: Creates workforce_company_policy and workforce_company_policy_version.
--              Seeds default organizational policy and policy version.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_company_policy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wcp_tenant_id (tenant_id, id),
  CONSTRAINT fk_wcp_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_company_policy_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  policy_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  min_rest_period_minutes INT NOT NULL DEFAULT 660,
  grace_period_in_minutes INT NOT NULL DEFAULT 15,
  early_departure_grace_minutes INT NOT NULL DEFAULT 15,
  allow_unscheduled_punch BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wcpv_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wcpv_tenant_policy_version (tenant_id, policy_id, version_number),
  CONSTRAINT fk_wcpv_policy
    FOREIGN KEY (tenant_id, policy_id)
    REFERENCES workforce_company_policy(tenant_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Default Policy
INSERT INTO workforce_company_policy (id, tenant_id, name, is_active, created_at, updated_at)
VALUES (1, 1, 'Standard Company Attendance Policy', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Seed Default Policy Version
INSERT INTO workforce_company_policy_version (
  id, tenant_id, policy_id, version_number, effective_from, effective_to,
  min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
  allow_unscheduled_punch, created_at
)
VALUES (1, 1, 1, 1, '2026-01-01', NULL, 660, 15, 15, 0, NOW())
ON DUPLICATE KEY UPDATE version_number = 1;
