-- ============================================================================
-- Migration: 012_attendance_schema_expansion.sql
-- Description: Expands attendance_attendance table with tenant, roster,
--              shift version, punctuality, and composite foreign key relationships.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

-- Step 1: Execute Database-Level Orphan Safety Assertion (No internal semicolons)
SET @orphan_count = (
  SELECT COUNT(*)
  FROM attendance_attendance a
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts_user u WHERE u.id = a.user_id
  )
);

SET @sql = IF(
  @orphan_count > 0,
  'SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'MIGRATION 012 ABORTED: Orphan user_id values exist in attendance_attendance\'',
  'SELECT 1 AS orphan_check_passed'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add Tenant & Workforce Shift Columns
ALTER TABLE attendance_attendance
  ADD COLUMN tenant_id BIGINT NULL AFTER id,
  ADD COLUMN roster_entry_id BIGINT NULL AFTER user_id,
  ADD COLUMN shift_version_id BIGINT NULL AFTER roster_entry_id,
  ADD COLUMN work_date DATE NULL AFTER shift_version_id,
  ADD COLUMN is_date_provisional BOOLEAN NOT NULL DEFAULT 0 AFTER work_date,
  ADD COLUMN total_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER punch_out_status,
  ADD COLUMN late_minutes INT NOT NULL DEFAULT 0 AFTER total_hours,
  ADD COLUMN early_departure_minutes INT NOT NULL DEFAULT 0 AFTER late_minutes,
  ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0 AFTER early_departure_minutes,
  ADD COLUMN punctuality_status ENUM('on_time', 'grace_period', 'late', 'early_departure', 'unassigned') NOT NULL DEFAULT 'unassigned' AFTER overtime_minutes,
  ADD COLUMN geofence_status ENUM('inside', 'outside', 'exempt', 'unverified') NOT NULL DEFAULT 'unverified' AFTER punctuality_status,
  ADD COLUMN regularization_status ENUM('none', 'requested', 'approved', 'rejected') NOT NULL DEFAULT 'none' AFTER geofence_status;

-- Step 3: Deterministic Historical Backfill (Default Tenant 1, Existing Date & Total Hours)
UPDATE attendance_attendance
SET tenant_id = 1,
    work_date = date,
    total_hours = CASE
      WHEN status = 'approved' AND punch_in_time IS NOT NULL AND punch_out_time IS NOT NULL AND punch_out_time >= punch_in_time
      THEN ROUND(TIMESTAMPDIFF(SECOND, punch_in_time, punch_out_time) / 3600, 2)
      ELSE 0.00
    END
WHERE tenant_id IS NULL;

-- Step 4: Enforce NOT NULL on tenant_id and work_date with date-preserving default
ALTER TABLE attendance_attendance
  MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1,
  MODIFY COLUMN work_date DATE NOT NULL DEFAULT (date);

-- Step 5: Composite Unique Index for Parent References
ALTER TABLE attendance_attendance
  ADD UNIQUE KEY uq_att_tenant_user_id (tenant_id, user_id, id);

-- Step 6: Performance & Attribution Indexes
ALTER TABLE attendance_attendance
  ADD INDEX idx_att_tenant_work_date (tenant_id, work_date, user_id),
  ADD INDEX idx_att_tenant_roster_entry (tenant_id, roster_entry_id),
  ADD INDEX idx_att_user_provisional (tenant_id, user_id, is_date_provisional);

-- Step 7: Referential Integrity Foreign Keys (Zero Destructive Cascades)
ALTER TABLE attendance_attendance
  ADD CONSTRAINT fk_att_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_att_user_tenant
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_att_roster_entry_composite
    FOREIGN KEY (tenant_id, user_id, roster_entry_id)
    REFERENCES workforce_roster_entry(tenant_id, user_id, id)
    ON DELETE RESTRICT;
