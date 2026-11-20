-- ============================================================================
-- Migration: 010_workforce_assignments_and_rotations.sql
-- Description: Creates fixed assignments, rotation definitions, rotation steps,
--              and employee rotation enrollment tables.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_employee_fixed_assignment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  shift_id BIGINT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wefa_tenant_user_active (tenant_id, user_id, is_active),
  CONSTRAINT fk_wefa_user
    FOREIGN KEY (user_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wefa_shift
    FOREIGN KEY (tenant_id, shift_id)
    REFERENCES workforce_shift(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wefa_user_tenant
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_rotation_definition (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wrd_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wrd_tenant_code (tenant_id, code),
  CONSTRAINT fk_wrd_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_rotation_step (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  rotation_id BIGINT NOT NULL,
  step_order INT NOT NULL,
  shift_id BIGINT NOT NULL,
  duration_days INT NOT NULL DEFAULT 7,
  UNIQUE KEY uq_wrs_tenant_rotation_step (tenant_id, rotation_id, step_order),
  CONSTRAINT fk_wrs_rotation
    FOREIGN KEY (tenant_id, rotation_id)
    REFERENCES workforce_rotation_definition(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wrs_shift
    FOREIGN KEY (tenant_id, shift_id)
    REFERENCES workforce_shift(tenant_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_employee_rotation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  rotation_id BIGINT NOT NULL,
  start_date DATE NOT NULL,
  initial_step_order INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wer_tenant_user_active (tenant_id, user_id, is_active),
  CONSTRAINT fk_wer_user
    FOREIGN KEY (user_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wer_rotation
    FOREIGN KEY (tenant_id, rotation_id)
    REFERENCES workforce_rotation_definition(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wer_user_tenant
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
