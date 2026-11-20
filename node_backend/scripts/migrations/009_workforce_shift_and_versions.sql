-- ============================================================================
-- Migration: 009_workforce_shift_and_versions.sql
-- Description: Creates workforce_shift and immutable workforce_shift_version tables.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_shift (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ws_tenant_id (tenant_id, id),
  UNIQUE KEY uq_ws_tenant_code (tenant_id, code),
  CONSTRAINT fk_ws_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_shift_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  shift_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_overnight BOOLEAN NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL,
  late_grace_minutes INT NOT NULL DEFAULT 15,
  early_departure_grace_minutes INT NOT NULL DEFAULT 15,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wsv_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wsv_tenant_shift_version (tenant_id, shift_id, id),
  CONSTRAINT fk_wsv_shift
    FOREIGN KEY (tenant_id, shift_id)
    REFERENCES workforce_shift(tenant_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
