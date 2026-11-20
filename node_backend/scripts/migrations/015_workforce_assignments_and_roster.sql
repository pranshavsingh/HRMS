-- ============================================================================
-- Migration: 015_workforce_assignments_and_roster.sql
-- Description: Evolve fixed assignments, rotations, and rosters for Stage 3:
--              - Exact published shift_version_id pinning
--              - Lifecycle status ('draft', 'published', 'superseded', 'cancelled')
--              - Single active draft constraints via virtual columns
--              - RFC 8785 snapshot hash integrity columns
--              - Fail-closed immutability and overlap prevention triggers
-- Target: MariaDB 11.8+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Evolve workforce_employee_fixed_assignment
-- ----------------------------------------------------------------------------
ALTER TABLE workforce_employee_fixed_assignment
  ADD COLUMN IF NOT EXISTS shift_version_id BIGINT NULL AFTER shift_id,
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'superseded', 'cancelled') NOT NULL DEFAULT 'draft' AFTER shift_version_id,
  ADD COLUMN IF NOT EXISTS assignment_snapshot LONGTEXT NULL AFTER effective_to,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER assignment_snapshot,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER updated_by,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL AFTER cancelled_at,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER cancellation_reason;

-- Backfill any existing assignments with published shift version if missing
UPDATE workforce_employee_fixed_assignment wefa
JOIN workforce_shift_version wsv 
  ON wsv.shift_id = wefa.shift_id 
 AND wsv.tenant_id = wefa.tenant_id 
 AND wsv.status = 'published'
SET wefa.shift_version_id = wsv.id,
    wefa.status = 'published',
    wefa.published_at = CURRENT_TIMESTAMP
WHERE wefa.shift_version_id IS NULL;

-- If rows exist without published versions, assign the earliest version
UPDATE workforce_employee_fixed_assignment wefa
JOIN workforce_shift_version wsv 
  ON wsv.shift_id = wefa.shift_id 
 AND wsv.tenant_id = wefa.tenant_id
SET wefa.shift_version_id = wsv.id
WHERE wefa.shift_version_id IS NULL;

-- Enforce NOT NULL on shift_version_id
ALTER TABLE workforce_employee_fixed_assignment
  MODIFY COLUMN shift_version_id BIGINT NOT NULL;

-- Add composite foreign key to published shift version
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'workforce_employee_fixed_assignment'
    AND constraint_name = 'fk_wefa_shift_version'
);

SET @stmt = IF(@fk_exists = 0,
  'ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_shift_version FOREIGN KEY (tenant_id, shift_id, shift_version_id) REFERENCES workforce_shift_version(tenant_id, shift_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- Add single active draft unique key
SET @uq_draft_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'workforce_employee_fixed_assignment'
    AND constraint_name = 'uq_wefa_single_active_draft'
);

SET @stmt = IF(@uq_draft_exists = 0,
  'ALTER TABLE workforce_employee_fixed_assignment ADD UNIQUE KEY uq_wefa_single_active_draft (tenant_id, user_id, is_active_draft)',
  'SELECT 1'
);
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- Add index on dates and status
SET @idx_dates_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'workforce_employee_fixed_assignment'
    AND index_name = 'idx_wefa_tenant_user_dates'
);

SET @stmt = IF(@idx_dates_exists = 0,
  'CREATE INDEX idx_wefa_tenant_user_dates ON workforce_employee_fixed_assignment (tenant_id, user_id, status, effective_from, effective_to)',
  'SELECT 1'
);
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- ----------------------------------------------------------------------------
-- 2. Evolve workforce_rotation_definition & workforce_rotation_step
-- ----------------------------------------------------------------------------
ALTER TABLE workforce_rotation_definition
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS cycle_length_days INT NOT NULL DEFAULT 7 AFTER description,
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER cycle_length_days,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER updated_by,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER archived_by,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by;

ALTER TABLE workforce_rotation_step
  MODIFY COLUMN shift_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS is_off_day BOOLEAN NOT NULL DEFAULT 0 AFTER duration_days,
  ADD COLUMN IF NOT EXISTS shift_version_id BIGINT NULL AFTER is_off_day;

ALTER TABLE workforce_employee_rotation
  ADD COLUMN IF NOT EXISTS effective_to DATE NULL AFTER start_date,
  ADD COLUMN IF NOT EXISTS offset_days INT NOT NULL DEFAULT 0 AFTER initial_step_order,
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'superseded', 'cancelled') NOT NULL DEFAULT 'published' AFTER offset_days,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER updated_by,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER cancelled_at;

-- Add single active draft unique key on rotation definitions
SET @uq_wrd_draft = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'workforce_rotation_definition'
    AND constraint_name = 'uq_wrd_single_active_draft'
);

SET @stmt = IF(@uq_wrd_draft = 0,
  'ALTER TABLE workforce_rotation_definition ADD UNIQUE KEY uq_wrd_single_active_draft (tenant_id, code, is_active_draft)',
  'SELECT 1'
);
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- Add single active draft unique key on employee rotation enrollment
SET @uq_wer_draft = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'workforce_employee_rotation'
    AND constraint_name = 'uq_wer_single_active_draft'
);

SET @stmt = IF(@uq_wer_draft = 0,
  'ALTER TABLE workforce_employee_rotation ADD UNIQUE KEY uq_wer_single_active_draft (tenant_id, user_id, is_active_draft)',
  'SELECT 1'
);
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- ----------------------------------------------------------------------------
-- 3. Evolve workforce_roster_header & workforce_roster_entry
-- ----------------------------------------------------------------------------
ALTER TABLE workforce_roster_header
  ADD COLUMN IF NOT EXISTS team_name VARCHAR(120) NULL AFTER department_id,
  ADD COLUMN IF NOT EXISTS name VARCHAR(255) NULL AFTER team_name,
  ADD COLUMN IF NOT EXISTS scope_type ENUM('all', 'team', 'custom') NOT NULL DEFAULT 'all' AFTER name,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER version_number,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER archived_by,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER archived_at,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER snapshot_hash;

ALTER TABLE workforce_roster_entry
  ADD COLUMN IF NOT EXISTS source_type ENUM('fixed_assignment', 'rotation', 'manual', 'swap') NOT NULL DEFAULT 'manual' AFTER status,
  ADD COLUMN IF NOT EXISTS source_id BIGINT NULL AFTER source_type,
  ADD COLUMN IF NOT EXISTS note VARCHAR(255) NULL AFTER source_id,
  ADD COLUMN IF NOT EXISTS shift_snapshot LONGTEXT NULL AFTER note,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER shift_snapshot;

-- ----------------------------------------------------------------------------
-- 4. Triggers: Fixed Assignment Immutability & Overlap Checks
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_wefa_prevent_update_on_published;
DROP TRIGGER IF EXISTS trg_wefa_check_overlap_on_publish;
DROP TRIGGER IF EXISTS trg_wre_prevent_mutation_on_published_header;
DROP TRIGGER IF EXISTS trg_wre_prevent_delete_on_published_header;

DELIMITER $$

CREATE TRIGGER trg_wefa_prevent_update_on_published
BEFORE UPDATE ON workforce_employee_fixed_assignment
FOR EACH ROW
BEGIN
    IF OLD.status IN ('published', 'superseded', 'cancelled') THEN
        -- Allow state transitions: published -> superseded or published -> cancelled
        -- Allow setting effective_to when superseded
        IF NOT (
            OLD.status = 'published' AND
            NEW.status IN ('published', 'superseded', 'cancelled') AND
            NEW.user_id = OLD.user_id AND
            NEW.shift_id = OLD.shift_id AND
            NEW.shift_version_id = OLD.shift_version_id AND
            NEW.effective_from = OLD.effective_from AND
            (OLD.effective_to IS NULL OR OLD.effective_to = NEW.effective_to) AND
            NEW.assignment_snapshot <=> OLD.assignment_snapshot AND
            NEW.snapshot_hash <=> OLD.snapshot_hash
        ) THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Immutability violation: Published fixed assignments cannot be modified';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_wefa_check_overlap_on_publish
BEFORE UPDATE ON workforce_employee_fixed_assignment
FOR EACH ROW
BEGIN
    DECLARE overlap_count INT DEFAULT 0;
    -- When publishing an assignment, verify no other published assignment overlaps
    IF NEW.status = 'published' AND (OLD.status != 'published' OR OLD.effective_to != NEW.effective_to) THEN
        SELECT COUNT(*) INTO overlap_count
        FROM workforce_employee_fixed_assignment
        WHERE tenant_id = NEW.tenant_id
          AND user_id = NEW.user_id
          AND id != NEW.id
          AND status = 'published'
          AND effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
          AND COALESCE(effective_to, '9999-12-31') >= NEW.effective_from;
          
        IF overlap_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Overlap violation: Employee already has an active published assignment for this period';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_wre_prevent_mutation_on_published_header
BEFORE UPDATE ON workforce_roster_entry
FOR EACH ROW
BEGIN
    DECLARE header_status VARCHAR(20);
    SELECT status INTO header_status FROM workforce_roster_header WHERE id = OLD.roster_header_id;
    IF header_status IN ('published', 'archived') THEN
        IF NOT (
            -- Only allow runtime operational status updates (e.g., completed, absent, swapped)
            NEW.roster_header_id = OLD.roster_header_id AND
            NEW.user_id = OLD.user_id AND
            NEW.work_date = OLD.work_date AND
            NEW.shift_id = OLD.shift_id AND
            NEW.shift_version_id = OLD.shift_version_id AND
            NEW.shift_snapshot <=> OLD.shift_snapshot AND
            NEW.snapshot_hash <=> OLD.snapshot_hash
        ) THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Immutability violation: Roster entries in published headers cannot be modified';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_wre_prevent_delete_on_published_header
BEFORE DELETE ON workforce_roster_entry
FOR EACH ROW
BEGIN
    DECLARE header_status VARCHAR(20);
    SELECT status INTO header_status FROM workforce_roster_header WHERE id = OLD.roster_header_id;
    IF header_status IN ('published', 'archived') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Immutability violation: Roster entries in published headers cannot be deleted';
    END IF;
END$$

DELIMITER ;
