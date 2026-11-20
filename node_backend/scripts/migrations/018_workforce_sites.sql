-- ============================================================================
-- Migration: 018_workforce_sites.sql
-- Description: Named work sites, effective-dated employee site assignments,
--              site access grants, and site snapshots for workforce records.
-- Target: MariaDB 10.6+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_site (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workforce_site_tenant_id (tenant_id, id),
  UNIQUE KEY uq_workforce_site_tenant_code (tenant_id, code),
  CONSTRAINT fk_workforce_site_tenant FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT fk_workforce_site_created_by FOREIGN KEY (created_by)
    REFERENCES accounts_user(id) ON DELETE SET NULL,
  CONSTRAINT fk_workforce_site_updated_by FOREIGN KEY (updated_by)
    REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_employee_site_assignment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  site_id BIGINT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_site_tenant_user_id (tenant_id, user_id, id),
  INDEX idx_employee_site_current (tenant_id, user_id, effective_from, effective_to),
  INDEX idx_site_employee_dates (tenant_id, site_id, effective_from, effective_to),
  CONSTRAINT fk_employee_site_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_site_site FOREIGN KEY (tenant_id, site_id)
    REFERENCES workforce_site(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_site_creator FOREIGN KEY (created_by)
    REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_site_access (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  site_id BIGINT NOT NULL,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workforce_site_access (tenant_id, user_id, site_id),
  INDEX idx_site_access_user (tenant_id, user_id),
  CONSTRAINT fk_site_access_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_site_access_site FOREIGN KEY (tenant_id, site_id)
    REFERENCES workforce_site(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_site_access_creator FOREIGN KEY (created_by)
    REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE attendance_attendance
  ADD COLUMN IF NOT EXISTS site_id BIGINT NULL AFTER tenant_id,
  ADD INDEX IF NOT EXISTS idx_attendance_tenant_site_date (tenant_id, site_id, work_date);

SET @fk_sites_attendance_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_attendance' AND CONSTRAINT_NAME='fk_attendance_site' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_attendance_sql = IF(@fk_sites_attendance_exists=0, 'ALTER TABLE attendance_attendance ADD CONSTRAINT fk_attendance_site FOREIGN KEY (tenant_id, site_id) REFERENCES workforce_site(tenant_id, id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_attendance_stmt FROM @fk_sites_attendance_sql;
EXECUTE fk_sites_attendance_stmt;
DEALLOCATE PREPARE fk_sites_attendance_stmt;

ALTER TABLE leave_leave
  ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 1 AFTER user_id,
  ADD COLUMN IF NOT EXISTS site_id BIGINT NULL AFTER tenant_id,
  ADD INDEX IF NOT EXISTS idx_leave_site_created (site_id, created_at),
  ADD INDEX IF NOT EXISTS idx_leave_tenant_user_created (tenant_id, user_id, created_at);

SET @fk_sites_leave_tenant_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_leave' AND CONSTRAINT_NAME='fk_leave_tenant' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_leave_tenant_sql = IF(@fk_sites_leave_tenant_exists=0, 'ALTER TABLE leave_leave ADD CONSTRAINT fk_leave_tenant FOREIGN KEY (tenant_id) REFERENCES workforce_tenant(id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_leave_tenant_stmt FROM @fk_sites_leave_tenant_sql;
EXECUTE fk_sites_leave_tenant_stmt;
DEALLOCATE PREPARE fk_sites_leave_tenant_stmt;

SET @fk_sites_leave_user_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_leave' AND CONSTRAINT_NAME='fk_leave_user_tenant' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_leave_user_sql = IF(@fk_sites_leave_user_exists=0, 'ALTER TABLE leave_leave ADD CONSTRAINT fk_leave_user_tenant FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_leave_user_stmt FROM @fk_sites_leave_user_sql;
EXECUTE fk_sites_leave_user_stmt;
DEALLOCATE PREPARE fk_sites_leave_user_stmt;

SET @fk_sites_leave_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_leave' AND CONSTRAINT_NAME='fk_leave_site' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_leave_sql = IF(@fk_sites_leave_exists=0, 'ALTER TABLE leave_leave ADD CONSTRAINT fk_leave_site FOREIGN KEY (site_id) REFERENCES workforce_site(id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_leave_stmt FROM @fk_sites_leave_sql;
EXECUTE fk_sites_leave_stmt;
DEALLOCATE PREPARE fk_sites_leave_stmt;

ALTER TABLE workforce_roster_header
  ADD COLUMN IF NOT EXISTS site_id BIGINT NULL AFTER tenant_id,
  ADD INDEX IF NOT EXISTS idx_roster_header_site_dates (tenant_id, site_id, start_date, end_date);

SET @fk_sites_roster_header_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workforce_roster_header' AND CONSTRAINT_NAME='fk_roster_header_site' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_roster_header_sql = IF(@fk_sites_roster_header_exists=0, 'ALTER TABLE workforce_roster_header ADD CONSTRAINT fk_roster_header_site FOREIGN KEY (tenant_id, site_id) REFERENCES workforce_site(tenant_id, id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_roster_header_stmt FROM @fk_sites_roster_header_sql;
EXECUTE fk_sites_roster_header_stmt;
DEALLOCATE PREPARE fk_sites_roster_header_stmt;

ALTER TABLE workforce_roster_entry
  ADD COLUMN IF NOT EXISTS site_id BIGINT NULL AFTER user_id,
  ADD INDEX IF NOT EXISTS idx_roster_entry_site_date (tenant_id, site_id, work_date);

SET @fk_sites_roster_entry_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workforce_roster_entry' AND CONSTRAINT_NAME='fk_roster_entry_site' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @fk_sites_roster_entry_sql = IF(@fk_sites_roster_entry_exists=0, 'ALTER TABLE workforce_roster_entry ADD CONSTRAINT fk_roster_entry_site FOREIGN KEY (tenant_id, site_id) REFERENCES workforce_site(tenant_id, id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE fk_sites_roster_entry_stmt FROM @fk_sites_roster_entry_sql;
EXECUTE fk_sites_roster_entry_stmt;
DEALLOCATE PREPARE fk_sites_roster_entry_stmt;
