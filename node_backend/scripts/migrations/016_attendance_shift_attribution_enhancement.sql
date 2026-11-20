-- ============================================================================
-- Migration: 016_attendance_shift_attribution_enhancement.sql
-- Description: Adds is_unscheduled and resolution_source columns to attendance_attendance
--              to cleanly decouple shift resolution source from punctuality status.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

ALTER TABLE attendance_attendance
  ADD COLUMN IF NOT EXISTS is_unscheduled BOOLEAN NOT NULL DEFAULT 0 AFTER shift_version_id,
  ADD COLUMN IF NOT EXISTS resolution_source VARCHAR(30) NULL DEFAULT NULL AFTER is_unscheduled;

-- Performance index for unscheduled punches and resolution source queries
ALTER TABLE attendance_attendance
  ADD INDEX IF NOT EXISTS idx_att_tenant_resolution (tenant_id, resolution_source, is_unscheduled);
