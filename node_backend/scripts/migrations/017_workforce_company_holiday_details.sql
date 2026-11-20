-- ============================================================================
-- Migration: 017_workforce_company_holiday_details.sql
-- Description: Add holiday reason and creator/update metadata to the existing
--              tenant-scoped company holiday table.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

ALTER TABLE workforce_company_holiday
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER updated_at,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by;

SET @fk_wch_created_by_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workforce_company_holiday'
    AND CONSTRAINT_NAME = 'fk_wch_created_by'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_wch_created_by_sql = IF(
  @fk_wch_created_by_exists = 0,
  'ALTER TABLE workforce_company_holiday ADD CONSTRAINT fk_wch_created_by FOREIGN KEY (created_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE fk_wch_created_by_stmt FROM @fk_wch_created_by_sql;
EXECUTE fk_wch_created_by_stmt;
DEALLOCATE PREPARE fk_wch_created_by_stmt;

SET @fk_wch_updated_by_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workforce_company_holiday'
    AND CONSTRAINT_NAME = 'fk_wch_updated_by'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_wch_updated_by_sql = IF(
  @fk_wch_updated_by_exists = 0,
  'ALTER TABLE workforce_company_holiday ADD CONSTRAINT fk_wch_updated_by FOREIGN KEY (updated_by) REFERENCES accounts_user(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE fk_wch_updated_by_stmt FROM @fk_wch_updated_by_sql;
EXECUTE fk_wch_updated_by_stmt;
DEALLOCATE PREPARE fk_wch_updated_by_stmt;
