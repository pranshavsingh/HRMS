-- ============================================================================
-- Migration: 011_workforce_roster_and_swaps.sql
-- Description: Creates workforce_roster_header, workforce_roster_entry,
--              and workforce_shift_swap_request tables.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_roster_header (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  department_id INT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  version_number INT NOT NULL DEFAULT 1,
  published_by BIGINT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wrh_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wrh_period (tenant_id, department_id, start_date, end_date),
  CONSTRAINT fk_wrh_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wrh_publisher
    FOREIGN KEY (published_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_roster_entry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  roster_header_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  shift_id BIGINT NOT NULL,
  shift_version_id BIGINT NOT NULL,
  status ENUM('scheduled', 'completed', 'swapped', 'absent') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wre_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wre_tenant_user_entry (tenant_id, user_id, id),
  UNIQUE KEY uq_wre_employee_date (tenant_id, user_id, work_date),
  CONSTRAINT fk_wre_header
    FOREIGN KEY (tenant_id, roster_header_id)
    REFERENCES workforce_roster_header(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wre_shift_and_version
    FOREIGN KEY (tenant_id, shift_id, shift_version_id)
    REFERENCES workforce_shift_version(tenant_id, shift_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wre_user_tenant
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_shift_swap_request (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  requester_id BIGINT NOT NULL,
  target_id BIGINT NOT NULL,
  requester_roster_entry_id BIGINT NOT NULL,
  target_roster_entry_id BIGINT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  reason VARCHAR(255) NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wssr_requester
    FOREIGN KEY (requester_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wssr_target
    FOREIGN KEY (target_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wssr_req_entry
    FOREIGN KEY (tenant_id, requester_roster_entry_id)
    REFERENCES workforce_roster_entry(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wssr_tgt_entry
    FOREIGN KEY (tenant_id, target_roster_entry_id)
    REFERENCES workforce_roster_entry(tenant_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
