-- ============================================================================
-- Migration: 008_workforce_company_holiday.sql
-- Description: Creates workforce_company_holiday table for organizational holiday schedules.
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_company_holiday (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wch_tenant_date (tenant_id, holiday_date),
  CONSTRAINT fk_wch_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES workforce_tenant(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
