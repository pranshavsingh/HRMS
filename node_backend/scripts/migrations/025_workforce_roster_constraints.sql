-- Migration 025: Scope workforce_roster_entry uniqueness to (roster_header_id, user_id, work_date)
-- so generating a new draft roster does not silently drop entries when another draft/archived roster exists.

SET @has_old_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workforce_roster_entry'
    AND INDEX_NAME = 'uq_wre_employee_date'
);

SET @drop_sql := IF(
  @has_old_idx > 0,
  'ALTER TABLE workforce_roster_entry DROP INDEX uq_wre_employee_date',
  'SELECT 1'
);
PREPARE stmt_drop FROM @drop_sql;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

SET @has_new_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workforce_roster_entry'
    AND INDEX_NAME = 'uq_wre_roster_employee_date'
);

SET @add_sql := IF(
  @has_new_idx = 0,
  'ALTER TABLE workforce_roster_entry ADD UNIQUE KEY uq_wre_roster_employee_date (roster_header_id, user_id, work_date)',
  'SELECT 1'
);
PREPARE stmt_add FROM @add_sql;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SET @has_lookup_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workforce_roster_entry'
    AND INDEX_NAME = 'idx_wre_tenant_user_date'
);

SET @add_lookup_sql := IF(
  @has_lookup_idx = 0,
  'CREATE INDEX idx_wre_tenant_user_date ON workforce_roster_entry (tenant_id, user_id, work_date)',
  'SELECT 1'
);
PREPARE stmt_lookup FROM @add_lookup_sql;
EXECUTE stmt_lookup;
DEALLOCATE PREPARE stmt_lookup;
