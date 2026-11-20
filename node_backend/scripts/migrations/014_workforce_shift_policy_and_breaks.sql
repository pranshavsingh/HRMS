-- ============================================================================
-- Migration: 014_workforce_shift_policy_and_breaks.sql
-- Description: Production-grade Shift Configuration Engine & Policy Framework.
--              Implements workforce_weekly_off_policy, workforce_weekly_off_policy_version,
--              workforce_shift_break (minute offsets), lifecycle state machines,
--              NULL-safe immutability triggers, date overlap rejection triggers,
--              and deterministic fail-closed historical backfills.
-- Target: MariaDB 11.8.9
-- ============================================================================

-- ============================================================================
-- PART 1: DDL ALTERATIONS & NEW TABLES
-- ============================================================================

-- Step 1.1: Add metadata and auditing columns to workforce_shift
ALTER TABLE workforce_shift
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'UTC' AFTER description,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by;

-- Add FKs if not exists
SET @fk_ws_created_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift' AND CONSTRAINT_NAME = 'fk_ws_created_by'
);
SET @sql_ws_created = IF(@fk_ws_created_exists = 0,
  'ALTER TABLE workforce_shift ADD CONSTRAINT fk_ws_created_by FOREIGN KEY (created_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_ws_created;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_ws_updated_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift' AND CONSTRAINT_NAME = 'fk_ws_updated_by'
);
SET @sql_ws_updated = IF(@fk_ws_updated_exists = 0,
  'ALTER TABLE workforce_shift ADD CONSTRAINT fk_ws_updated_by FOREIGN KEY (updated_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_ws_updated;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 1.2: Table Alteration: workforce_company_policy_version
SET @uq_wcpv_tenant_policy_id_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_company_policy_version' AND INDEX_NAME = 'uq_wcpv_tenant_policy_id'
);
SET @sql_uq_wcpv = IF(@uq_wcpv_tenant_policy_id_exists = 0,
  'ALTER TABLE workforce_company_policy_version ADD UNIQUE KEY uq_wcpv_tenant_policy_id (tenant_id, policy_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_uq_wcpv;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE workforce_company_policy_version
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER version_number,
  ADD COLUMN IF NOT EXISTS early_departure_requires_approval BOOLEAN NOT NULL DEFAULT 1 AFTER early_departure_grace_minutes,
  ADD COLUMN IF NOT EXISTS overtime_enabled BOOLEAN NOT NULL DEFAULT 0 AFTER early_departure_requires_approval,
  ADD COLUMN IF NOT EXISTS overtime_min_qualifying_minutes INT NOT NULL DEFAULT 60 AFTER overtime_enabled,
  ADD COLUMN IF NOT EXISTS overtime_rounding_minutes INT NOT NULL DEFAULT 15 AFTER overtime_min_qualifying_minutes,
  ADD COLUMN IF NOT EXISTS overtime_requires_approval BOOLEAN NOT NULL DEFAULT 1 AFTER overtime_rounding_minutes,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER allow_unscheduled_punch,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER archived_at,
  ADD COLUMN IF NOT EXISTS is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by;

SET @fk_wcpv_pub_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_company_policy_version' AND CONSTRAINT_NAME = 'fk_wcpv_publisher'
);
SET @sql_wcpv_pub = IF(@fk_wcpv_pub_exists = 0,
  'ALTER TABLE workforce_company_policy_version ADD CONSTRAINT fk_wcpv_publisher FOREIGN KEY (published_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wcpv_pub;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_wcpv_arc_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_company_policy_version' AND CONSTRAINT_NAME = 'fk_wcpv_archiver'
);
SET @sql_wcpv_arc = IF(@fk_wcpv_arc_exists = 0,
  'ALTER TABLE workforce_company_policy_version ADD CONSTRAINT fk_wcpv_archiver FOREIGN KEY (archived_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wcpv_arc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uq_wcpv_draft_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_company_policy_version' AND INDEX_NAME = 'uq_wcpv_single_active_draft'
);
SET @sql_wcpv_draft = IF(@uq_wcpv_draft_exists = 0,
  'ALTER TABLE workforce_company_policy_version ADD UNIQUE KEY uq_wcpv_single_active_draft (tenant_id, policy_id, is_draft_active)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wcpv_draft;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 1.3: New Tables: Weekly-Off Policy Framework
CREATE TABLE IF NOT EXISTS workforce_weekly_off_policy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wwop_tenant_code (tenant_id, code),
  UNIQUE KEY uq_wwop_tenant_id (tenant_id, id),
  CONSTRAINT fk_wwop_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_weekly_off_policy_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  policy_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  policy_type ENUM('fixed', 'rotating', 'custom') NOT NULL DEFAULT 'fixed',
  days_of_week JSON NULL,
  rules_config JSON NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  published_at DATETIME NULL,
  published_by BIGINT NULL,
  archived_at DATETIME NULL,
  archived_by BIGINT NULL,
  is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wwopv_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wwopv_tenant_policy_id (tenant_id, policy_id, id),
  UNIQUE KEY uq_wwopv_tenant_policy_version (tenant_id, policy_id, version_number),
  UNIQUE KEY uq_wwopv_single_active_draft (tenant_id, policy_id, is_draft_active),
  CONSTRAINT fk_wwopv_policy
    FOREIGN KEY (tenant_id, policy_id)
    REFERENCES workforce_weekly_off_policy(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wwopv_publisher
    FOREIGN KEY (published_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_wwopv_archiver
    FOREIGN KEY (archived_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_wwopv_effective_dates
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 1.4: Alter workforce_shift_version
ALTER TABLE workforce_shift_version
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER version_number,
  ADD COLUMN IF NOT EXISTS policy_id BIGINT NULL AFTER early_departure_grace_minutes,
  ADD COLUMN IF NOT EXISTS policy_version_id BIGINT NULL AFTER policy_id,
  ADD COLUMN IF NOT EXISTS weekly_off_policy_id BIGINT NULL AFTER policy_version_id,
  ADD COLUMN IF NOT EXISTS weekly_off_policy_version_id BIGINT NULL AFTER weekly_off_policy_id,
  ADD COLUMN IF NOT EXISTS config_snapshot LONGTEXT NULL AFTER weekly_off_policy_version_id,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER effective_to,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER archived_at,
  ADD COLUMN IF NOT EXISTS is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by;

SET @uq_wsv_draft_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift_version' AND INDEX_NAME = 'uq_wsv_single_active_draft'
);
SET @sql_wsv_draft = IF(@uq_wsv_draft_exists = 0,
  'ALTER TABLE workforce_shift_version ADD UNIQUE KEY uq_wsv_single_active_draft (tenant_id, shift_id, is_draft_active)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wsv_draft;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_wsv_pub_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift_version' AND CONSTRAINT_NAME = 'fk_wsv_publisher'
);
SET @sql_wsv_pub = IF(@fk_wsv_pub_exists = 0,
  'ALTER TABLE workforce_shift_version ADD CONSTRAINT fk_wsv_publisher FOREIGN KEY (published_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wsv_pub;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_wsv_arc_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift_version' AND CONSTRAINT_NAME = 'fk_wsv_archiver'
);
SET @sql_wsv_arc = IF(@fk_wsv_arc_exists = 0,
  'ALTER TABLE workforce_shift_version ADD CONSTRAINT fk_wsv_archiver FOREIGN KEY (archived_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wsv_arc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK to workforce_company_policy_version
SET @fk_wsv_policy_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift_version' AND CONSTRAINT_NAME = 'fk_wsv_policy'
);
SET @sql_wsv_policy = IF(@fk_wsv_policy_exists = 0,
  'ALTER TABLE workforce_shift_version ADD CONSTRAINT fk_wsv_policy FOREIGN KEY (tenant_id, policy_id, policy_version_id) REFERENCES workforce_company_policy_version(tenant_id, policy_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wsv_policy;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK to workforce_weekly_off_policy_version
SET @fk_wsv_weekly_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workforce_shift_version' AND CONSTRAINT_NAME = 'fk_wsv_weekly_off_policy'
);
SET @sql_wsv_weekly = IF(@fk_wsv_weekly_exists = 0,
  'ALTER TABLE workforce_shift_version ADD CONSTRAINT fk_wsv_weekly_off_policy FOREIGN KEY (tenant_id, weekly_off_policy_id, weekly_off_policy_version_id) REFERENCES workforce_weekly_off_policy_version(tenant_id, policy_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql_wsv_weekly;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 1.5: New Table: workforce_shift_break (Minute-Offset Model)
CREATE TABLE IF NOT EXISTS workforce_shift_break (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  shift_id BIGINT NOT NULL,
  shift_version_id BIGINT NOT NULL,
  break_name VARCHAR(100) NOT NULL,
  break_type ENUM('paid', 'unpaid') NOT NULL DEFAULT 'unpaid',
  start_offset_minutes INT NOT NULL,
  end_offset_minutes INT NOT NULL,
  duration_minutes INT NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wsb_version (tenant_id, shift_version_id, display_order),
  CONSTRAINT fk_wsb_version
    FOREIGN KEY (tenant_id, shift_id, shift_version_id)
    REFERENCES workforce_shift_version(tenant_id, shift_id, id)
    ON DELETE CASCADE,
  CONSTRAINT chk_wsb_offset_order
    CHECK (start_offset_minutes < end_offset_minutes),
  CONSTRAINT chk_wsb_duration
    CHECK (duration_minutes = (end_offset_minutes - start_offset_minutes))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- PART 2: DATABASE TRIGGERS
-- ============================================================================

-- Drop existing triggers to ensure clean idempotent creation
DROP TRIGGER IF EXISTS trg_wsv_check_published_interval;
DROP TRIGGER IF EXISTS trg_wcpv_check_published_interval;
DROP TRIGGER IF EXISTS trg_wwopv_check_published_interval;
DROP TRIGGER IF EXISTS trg_wsv_prevent_published_update;
DROP TRIGGER IF EXISTS trg_wcpv_prevent_published_update;
DROP TRIGGER IF EXISTS trg_wwopv_prevent_published_update;
DROP TRIGGER IF EXISTS trg_wsb_prevent_mutation_on_published_version;
DROP TRIGGER IF EXISTS trg_wsb_prevent_update_on_published_version;
DROP TRIGGER IF EXISTS trg_wsb_prevent_delete_on_published_version;
DROP TRIGGER IF EXISTS trg_wsb_validate_duration_limit;
DROP TRIGGER IF EXISTS trg_wsb_validate_duration_limit_update;

DELIMITER $$

-- Trigger 2.1: Shift Version Published Interval Overlap Check
CREATE TRIGGER trg_wsv_check_published_interval
BEFORE UPDATE ON workforce_shift_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_shift_version
    WHERE tenant_id = NEW.tenant_id
      AND shift_id = NEW.shift_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published shift version.';
    END IF;
  END IF;
END$$

-- Trigger 2.2: Company Policy Version Published Interval Overlap Check
CREATE TRIGGER trg_wcpv_check_published_interval
BEFORE UPDATE ON workforce_company_policy_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_company_policy_version
    WHERE tenant_id = NEW.tenant_id
      AND policy_id = NEW.policy_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published company policy version.';
    END IF;
  END IF;
END$$

-- Trigger 2.3: Weekly-Off Policy Version Published Interval Overlap Check
CREATE TRIGGER trg_wwopv_check_published_interval
BEFORE UPDATE ON workforce_weekly_off_policy_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_weekly_off_policy_version
    WHERE tenant_id = NEW.tenant_id
      AND policy_id = NEW.policy_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published weekly-off policy version.';
    END IF;
  END IF;
END$$

-- Trigger 2.4: Shift Version Immutability & Closure Trigger
CREATE TRIGGER trg_wsv_prevent_published_update
BEFORE UPDATE ON workforce_shift_version
FOR EACH ROW
BEGIN
  -- 1. Prevent updates to archived versions entirely
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Archived shift versions are permanently immutable and cannot be modified.';
  END IF;

  -- 2. Transitions out of published state
  IF OLD.status = 'published' THEN
    -- Forbid reverting to draft
    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published shift versions cannot revert to draft status.';
    END IF;

    -- Archival validation: must be closed and effective_to <= CURRENT_DATE()
    IF NEW.status = 'archived' THEN
      IF OLD.effective_to IS NULL OR OLD.effective_to > CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published version cannot be archived until its effective_to date has passed.';
      END IF;
      IF NEW.archived_at IS NULL OR NEW.archived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Archival requires archived_at and archived_by audit metadata.';
      END IF;
    END IF;

    -- Enforce immutability on core configuration columns using <=> NULL-safe equality
    IF NOT (NEW.version_number <=> OLD.version_number)
       OR NOT (NEW.start_time <=> OLD.start_time)
       OR NOT (NEW.end_time <=> OLD.end_time)
       OR NOT (NEW.is_overnight <=> OLD.is_overnight)
       OR NOT (NEW.duration_minutes <=> OLD.duration_minutes)
       OR NOT (NEW.late_grace_minutes <=> OLD.late_grace_minutes)
       OR NOT (NEW.early_departure_grace_minutes <=> OLD.early_departure_grace_minutes)
       OR NOT (NEW.policy_id <=> OLD.policy_id)
       OR NOT (NEW.policy_version_id <=> OLD.policy_version_id)
       OR NOT (NEW.weekly_off_policy_id <=> OLD.weekly_off_policy_id)
       OR NOT (NEW.weekly_off_policy_version_id <=> OLD.weekly_off_policy_version_id)
       OR NOT (NEW.config_snapshot <=> OLD.config_snapshot)
       OR NOT (NEW.effective_from <=> OLD.effective_from)
       OR NOT (NEW.published_at <=> OLD.published_at)
       OR NOT (NEW.published_by <=> OLD.published_by)
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published shift configuration parameters and metadata are strictly immutable.';
    END IF;

    -- Controlled closure check: effective_to can only transition from NULL to a valid date
    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed shift version effective_to date cannot be modified or reopened.';
    END IF;

    IF OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL THEN
      IF NEW.effective_to < OLD.effective_from THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closing effective_to date cannot precede effective_from.';
      END IF;
    END IF;
  END IF;
END$$

-- Trigger 2.5: Company Policy Version Immutability Trigger
CREATE TRIGGER trg_wcpv_prevent_published_update
BEFORE UPDATE ON workforce_company_policy_version
FOR EACH ROW
BEGIN
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Archived company policy versions are permanently immutable.';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published company policy versions cannot revert to draft status.';
    END IF;

    IF NEW.status = 'archived' THEN
      IF OLD.effective_to IS NULL OR OLD.effective_to > CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published company policy version cannot be archived until effective_to has passed.';
      END IF;
    END IF;

    IF NOT (NEW.version_number <=> OLD.version_number)
       OR NOT (NEW.min_rest_period_minutes <=> OLD.min_rest_period_minutes)
       OR NOT (NEW.grace_period_in_minutes <=> OLD.grace_period_in_minutes)
       OR NOT (NEW.early_departure_grace_minutes <=> OLD.early_departure_grace_minutes)
       OR NOT (NEW.early_departure_requires_approval <=> OLD.early_departure_requires_approval)
       OR NOT (NEW.allow_unscheduled_punch <=> OLD.allow_unscheduled_punch)
       OR NOT (NEW.overtime_enabled <=> OLD.overtime_enabled)
       OR NOT (NEW.overtime_min_qualifying_minutes <=> OLD.overtime_min_qualifying_minutes)
       OR NOT (NEW.overtime_rounding_minutes <=> OLD.overtime_rounding_minutes)
       OR NOT (NEW.overtime_requires_approval <=> OLD.overtime_requires_approval)
       OR NOT (NEW.effective_from <=> OLD.effective_from)
       OR NOT (NEW.published_at <=> OLD.published_at)
       OR NOT (NEW.published_by <=> OLD.published_by)
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published company policy parameters and metadata are strictly immutable.';
    END IF;

    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed company policy effective_to date cannot be modified or reopened.';
    END IF;
  END IF;
END$$

-- Trigger 2.6: Weekly-Off Policy Version Immutability Trigger
CREATE TRIGGER trg_wwopv_prevent_published_update
BEFORE UPDATE ON workforce_weekly_off_policy_version
FOR EACH ROW
BEGIN
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Archived weekly-off policy versions are permanently immutable.';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published weekly-off policy versions cannot revert to draft status.';
    END IF;

    IF NEW.status = 'archived' THEN
      IF OLD.effective_to IS NULL OR OLD.effective_to > CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'INVALID LIFECYCLE TRANSITION: Published weekly-off policy version cannot be archived until effective_to has passed.';
      END IF;
    END IF;

    IF NOT (NEW.version_number <=> OLD.version_number)
       OR NOT (NEW.policy_type <=> OLD.policy_type)
       OR NOT (NEW.days_of_week <=> OLD.days_of_week)
       OR NOT (NEW.rules_config <=> OLD.rules_config)
       OR NOT (NEW.effective_from <=> OLD.effective_from)
       OR NOT (NEW.published_at <=> OLD.published_at)
       OR NOT (NEW.published_by <=> OLD.published_by)
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published weekly-off policy parameters and metadata are strictly immutable.';
    END IF;

    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed weekly-off policy effective_to date cannot be modified or reopened.';
    END IF;
  END IF;
END$$

-- Trigger 2.7: Break Mutation Guard (INSERT)
CREATE TRIGGER trg_wsb_prevent_mutation_on_published_version
BEFORE INSERT ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  SELECT status INTO v_status
  FROM workforce_shift_version
  WHERE id = NEW.shift_version_id AND tenant_id = NEW.tenant_id;

  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot insert breaks into a published or archived shift version.';
  END IF;
END$$

-- Trigger 2.8: Break Mutation Guard (UPDATE)
CREATE TRIGGER trg_wsb_prevent_update_on_published_version
BEFORE UPDATE ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  SELECT status INTO v_status
  FROM workforce_shift_version
  WHERE id = OLD.shift_version_id AND tenant_id = OLD.tenant_id;

  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot update breaks belonging to a published or archived shift version.';
  END IF;
END$$

-- Trigger 2.9: Break Mutation Guard (DELETE)
CREATE TRIGGER trg_wsb_prevent_delete_on_published_version
BEFORE DELETE ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  SELECT status INTO v_status
  FROM workforce_shift_version
  WHERE id = OLD.shift_version_id AND tenant_id = OLD.tenant_id;

  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot delete breaks belonging to a published or archived shift version.';
  END IF;
END$$

-- Trigger 2.10: Break Duration and Shift Boundary Validation (INSERT)
CREATE TRIGGER trg_wsb_validate_duration_limit
BEFORE INSERT ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_shift_duration INT;
  DECLARE v_total_break_duration INT DEFAULT 0;
  DECLARE v_overlap_count INT DEFAULT 0;

  SELECT duration_minutes INTO v_shift_duration
  FROM workforce_shift_version
  WHERE id = NEW.shift_version_id AND tenant_id = NEW.tenant_id;

  IF NEW.end_offset_minutes > v_shift_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Break end offset exceeds total shift duration.';
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_break_duration
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id AND tenant_id = NEW.tenant_id;

  IF (v_total_break_duration + NEW.duration_minutes) >= v_shift_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Total break duration must be strictly less than total shift duration.';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id
    AND tenant_id = NEW.tenant_id
    AND NEW.start_offset_minutes < end_offset_minutes
    AND NEW.end_offset_minutes > start_offset_minutes;

  IF v_overlap_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Break interval overlaps with an existing sibling break.';
  END IF;
END$$

-- Trigger 2.11: Break Duration and Shift Boundary Validation (UPDATE)
CREATE TRIGGER trg_wsb_validate_duration_limit_update
BEFORE UPDATE ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_shift_duration INT;
  DECLARE v_total_break_duration INT DEFAULT 0;
  DECLARE v_overlap_count INT DEFAULT 0;

  SELECT duration_minutes INTO v_shift_duration
  FROM workforce_shift_version
  WHERE id = NEW.shift_version_id AND tenant_id = NEW.tenant_id;

  IF NEW.end_offset_minutes > v_shift_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Break end offset exceeds total shift duration.';
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_break_duration
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id
    AND tenant_id = NEW.tenant_id
    AND id <> OLD.id;

  IF (v_total_break_duration + NEW.duration_minutes) >= v_shift_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Total break duration must be strictly less than total shift duration.';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id
    AND tenant_id = NEW.tenant_id
    AND id <> OLD.id
    AND NEW.start_offset_minutes < end_offset_minutes
    AND NEW.end_offset_minutes > start_offset_minutes;

  IF v_overlap_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Break interval overlaps with an existing sibling break.';
  END IF;
END$$

DELIMITER ;


-- ============================================================================
-- PART 3: DETERMINISTIC BACKFILL & SEEDING
-- ============================================================================

-- Step 3.1: Seed Default Company Policy for any active tenant lacking one
INSERT INTO workforce_company_policy (tenant_id, name, is_active, created_at, updated_at)
SELECT 
  t.id AS tenant_id,
  'Standard Company Attendance Policy' AS name,
  1 AS is_active,
  NOW() AS created_at,
  NOW() AS updated_at
FROM workforce_tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_company_policy p WHERE p.tenant_id = t.id
);

-- Seed Default Company Policy Version for any tenant lacking one
INSERT INTO workforce_company_policy_version (
  tenant_id, policy_id, version_number, status, effective_from, effective_to,
  min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
  early_departure_requires_approval, allow_unscheduled_punch,
  overtime_enabled, overtime_min_qualifying_minutes, overtime_rounding_minutes, overtime_requires_approval,
  published_at, published_by, created_at
)
SELECT 
  p.tenant_id,
  p.id AS policy_id,
  1 AS version_number,
  'published' AS status,
  '2026-01-01' AS effective_from,
  NULL AS effective_to,
  660 AS min_rest_period_minutes,
  15 AS grace_period_in_minutes,
  15 AS early_departure_grace_minutes,
  1 AS early_departure_requires_approval,
  0 AS allow_unscheduled_punch,
  0 AS overtime_enabled,
  60 AS overtime_min_qualifying_minutes,
  15 AS overtime_rounding_minutes,
  1 AS overtime_requires_approval,
  NOW() AS published_at,
  NULL AS published_by,
  NOW() AS created_at
FROM workforce_company_policy p
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_company_policy_version pv WHERE pv.tenant_id = p.tenant_id AND pv.policy_id = p.id
);

-- Step 3.2: Backfill existing workforce_company_policy_version to published
UPDATE workforce_company_policy_version
SET status = 'published',
    published_at = COALESCE(published_at, created_at),
    published_by = NULL,
    early_departure_requires_approval = COALESCE(early_departure_requires_approval, 1),
    overtime_enabled = COALESCE(overtime_enabled, 0),
    overtime_min_qualifying_minutes = COALESCE(overtime_min_qualifying_minutes, 60),
    overtime_rounding_minutes = COALESCE(overtime_rounding_minutes, 15),
    overtime_requires_approval = COALESCE(overtime_requires_approval, 1)
WHERE status = 'draft';

-- Step 3.3: Seed Default Weekly-Off Policy for all existing tenants dynamically
INSERT INTO workforce_weekly_off_policy (tenant_id, code, name, description, is_active, created_at, updated_at)
SELECT 
  t.id AS tenant_id,
  'SUN_OFF' AS code,
  'Standard Sunday Weekly Off' AS name,
  'Default fixed Sunday weekly-off schedule' AS description,
  1 AS is_active,
  NOW() AS created_at,
  NOW() AS updated_at
FROM workforce_tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_weekly_off_policy w WHERE w.tenant_id = t.id AND w.code = 'SUN_OFF'
);

-- Seed Version for Default Weekly-Off Policy
INSERT INTO workforce_weekly_off_policy_version (
  tenant_id, policy_id, version_number, status, policy_type,
  days_of_week, rules_config, effective_from, effective_to,
  published_at, published_by, created_at
)
SELECT 
  w.tenant_id,
  w.id AS policy_id,
  1 AS version_number,
  'published' AS status,
  'fixed' AS policy_type,
  JSON_ARRAY(0) AS days_of_week,
  NULL AS rules_config,
  '2026-01-01' AS effective_from,
  NULL AS effective_to,
  NOW() AS published_at,
  NULL AS published_by,
  NOW() AS created_at
FROM workforce_weekly_off_policy w
WHERE w.code = 'SUN_OFF'
  AND NOT EXISTS (
    SELECT 1 FROM workforce_weekly_off_policy_version wv WHERE wv.tenant_id = w.tenant_id AND wv.policy_id = w.id AND wv.version_number = 1
  );

-- Step 3.4: Deterministic Backfill of workforce_shift_version using scalar subqueries
-- Scalar subqueries fail-closed: if >1 row matches, error 1242 is raised.
UPDATE workforce_shift_version wsv
SET 
  wsv.status = 'published',
  wsv.published_at = COALESCE(wsv.published_at, wsv.created_at),
  wsv.published_by = NULL,
  wsv.policy_id = (
    SELECT wcpv.policy_id
    FROM workforce_company_policy_version wcpv
    WHERE wcpv.tenant_id = wsv.tenant_id 
      AND wcpv.status = 'published' 
      AND wcpv.effective_from <= wsv.effective_from 
      AND (wcpv.effective_to IS NULL OR wcpv.effective_to >= wsv.effective_from)
  ),
  wsv.policy_version_id = (
    SELECT wcpv.id
    FROM workforce_company_policy_version wcpv
    WHERE wcpv.tenant_id = wsv.tenant_id 
      AND wcpv.status = 'published' 
      AND wcpv.effective_from <= wsv.effective_from 
      AND (wcpv.effective_to IS NULL OR wcpv.effective_to >= wsv.effective_from)
  ),
  wsv.weekly_off_policy_id = (
    SELECT wwop.id 
    FROM workforce_weekly_off_policy wwop
    WHERE wwop.tenant_id = wsv.tenant_id AND wwop.code = 'SUN_OFF'
  ),
  wsv.weekly_off_policy_version_id = (
    SELECT wwopv.id
    FROM workforce_weekly_off_policy_version wwopv
    JOIN workforce_weekly_off_policy wwop ON wwop.id = wwopv.policy_id AND wwop.tenant_id = wwopv.tenant_id
    WHERE wwopv.tenant_id = wsv.tenant_id 
      AND wwop.code = 'SUN_OFF'
      AND wwopv.status = 'published'
      AND wwopv.effective_from <= wsv.effective_from
      AND (wwopv.effective_to IS NULL OR wwopv.effective_to >= wsv.effective_from)
  ),
  wsv.config_snapshot = JSON_OBJECT(
    'snapshot_version', '1.0',
    'shift_code', (SELECT ws.code FROM workforce_shift ws WHERE ws.id = wsv.shift_id AND ws.tenant_id = wsv.tenant_id),
    'duration_minutes', wsv.duration_minutes,
    'start_time', TIME_FORMAT(wsv.start_time, '%H:%i:%s'),
    'end_time', TIME_FORMAT(wsv.end_time, '%H:%i:%s'),
    'is_overnight', wsv.is_overnight,
    'late_grace_minutes', wsv.late_grace_minutes,
    'early_departure_grace_minutes', wsv.early_departure_grace_minutes,
    'breaks', JSON_ARRAY(),
    'provenance', JSON_OBJECT(
      'tier', 'legacy_unrecorded',
      'legacy_backfill', TRUE,
      'migrated_at', NOW(),
      'original_publisher', 'UNKNOWN_LEGACY_IMPORT'
    )
  )
WHERE wsv.status = 'draft';

-- Step 3.5: Seed Canonical Shifts for each active tenant dynamically
INSERT INTO workforce_shift (tenant_id, code, name, description, timezone, is_active, created_by, updated_by, created_at, updated_at)
SELECT 
  t.id AS tenant_id,
  tmpl.code,
  tmpl.name,
  tmpl.description,
  'Asia/Kolkata' AS timezone,
  1 AS is_active,
  (SELECT user_id FROM workforce_user_tenant ut WHERE ut.tenant_id = t.id AND ut.role IN ('admin', 'superadmin') ORDER BY ut.user_id ASC LIMIT 1) AS created_by,
  (SELECT user_id FROM workforce_user_tenant ut WHERE ut.tenant_id = t.id AND ut.role IN ('admin', 'superadmin') ORDER BY ut.user_id ASC LIMIT 1) AS updated_by,
  NOW(), NOW()
FROM workforce_tenant t
CROSS JOIN (
  SELECT 'GEN_SHIFT' AS code, 'General Shift' AS name, 'Standard corporate 9 to 6 shift' AS description UNION ALL
  SELECT 'MORN_SHIFT', 'Morning Shift', 'Early morning production shift' UNION ALL
  SELECT 'EVE_SHIFT', 'Evening Shift', 'Afternoon/evening shift' UNION ALL
  SELECT 'NIGHT_SHIFT', 'Night Shift', 'Overnight production shift crossing midnight'
) AS tmpl
WHERE t.is_active = 1
  AND NOT EXISTS (
    SELECT 1 FROM workforce_shift ws WHERE ws.tenant_id = t.id AND ws.code = tmpl.code
  );

