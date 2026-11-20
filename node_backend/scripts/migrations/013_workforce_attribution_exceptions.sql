-- ============================================================================
-- Migration: 013_workforce_attribution_exceptions.sql
-- Description: Creates punch attribution exceptions, candidate evaluation records,
--              and immutable punch attribution history audit ledger.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

-- 1. Attribution Exception Header Table
CREATE TABLE IF NOT EXISTS workforce_punch_attribution_exception (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  attendance_id BIGINT NOT NULL,
  punch_type ENUM('in', 'out') NOT NULL,
  exception_type ENUM('ambiguous_shift_match', 'unscheduled_punch', 'out_of_bounds', 'overlapping_shifts', 'rest_period_violation') NOT NULL,
  status ENUM('pending', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
  pending_attendance_id BIGINT GENERATED ALWAYS AS (
    CASE WHEN status = 'pending' THEN attendance_id ELSE NULL END
  ) VIRTUAL,
  resolution_notes TEXT NULL,
  resolved_by BIGINT NULL,
  resolved_roster_entry_id BIGINT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign Keys (100% RESTRICT)
  CONSTRAINT fk_wpae_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpae_user
    FOREIGN KEY (user_id)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpae_attendance
    FOREIGN KEY (tenant_id, user_id, attendance_id)
    REFERENCES attendance_attendance(tenant_id, user_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpae_resolved_by
    FOREIGN KEY (resolved_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpae_resolved_roster
    FOREIGN KEY (tenant_id, user_id, resolved_roster_entry_id)
    REFERENCES workforce_roster_entry(tenant_id, user_id, id)
    ON DELETE RESTRICT,

  -- Unique Constraints
  UNIQUE KEY uq_wpae_tenant_user_id (tenant_id, user_id, id),
  UNIQUE KEY uq_single_pending_exception (tenant_id, pending_attendance_id, punch_type),

  INDEX idx_wpae_tenant_status (tenant_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Attribution Exception Candidates Table
CREATE TABLE IF NOT EXISTS workforce_punch_attribution_candidate (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  exception_id BIGINT NOT NULL,
  candidate_roster_entry_id BIGINT NOT NULL,
  match_confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  match_criteria_details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Composite Foreign Keys
  CONSTRAINT fk_wpac_exception
    FOREIGN KEY (tenant_id, user_id, exception_id)
    REFERENCES workforce_punch_attribution_exception(tenant_id, user_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpac_roster_entry
    FOREIGN KEY (tenant_id, user_id, candidate_roster_entry_id)
    REFERENCES workforce_roster_entry(tenant_id, user_id, id)
    ON DELETE RESTRICT,

  UNIQUE KEY uq_wpac_exception_candidate (exception_id, candidate_roster_entry_id),
  INDEX idx_wpac_candidate_roster (tenant_id, candidate_roster_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Punch Attribution History Ledger
CREATE TABLE IF NOT EXISTS workforce_punch_attribution_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  attendance_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  action ENUM('initial_attribution', 'exception_raised', 'manager_resolution', 'admin_regularization', 'automatic_recalc') NOT NULL,
  previous_roster_entry_id BIGINT NULL,
  new_roster_entry_id BIGINT NULL,
  previous_shift_version_id BIGINT NULL,
  new_shift_version_id BIGINT NULL,
  changed_by BIGINT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Keys (100% RESTRICT, Composite Tenant & User Integrity)
  CONSTRAINT fk_wpah_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpah_attendance_composite
    FOREIGN KEY (tenant_id, user_id, attendance_id)
    REFERENCES attendance_attendance(tenant_id, user_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpah_changed_by
    FOREIGN KEY (changed_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wpah_user_tenant
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id)
    ON DELETE RESTRICT,

  INDEX idx_wpah_attendance_audit (tenant_id, attendance_id, created_at),
  INDEX idx_wpah_user_history (tenant_id, user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
