-- ============================================================================
-- Migration: 022_default_company_policy_allow_unscheduled_punch.sql
-- Description: Align default company policy version to allow unscheduled punches by default for tenant 1
-- Target: MariaDB 11.8+ / MySQL 8.0+
-- ============================================================================

-- If tenant 1 policy 1 version 1 has allow_unscheduled_punch = 0, close it and publish version 2
UPDATE workforce_company_policy_version
SET effective_to = '2026-01-01'
WHERE tenant_id = 1 AND policy_id = 1 AND version_number = 1 AND allow_unscheduled_punch = 0;

INSERT INTO workforce_company_policy_version (
  tenant_id, policy_id, version_number, status, effective_from, effective_to,
  min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
  early_departure_requires_approval, allow_unscheduled_punch,
  overtime_enabled, overtime_min_qualifying_minutes, overtime_rounding_minutes, overtime_requires_approval,
  published_at, published_by, created_at
)
SELECT 
  1, 1, 2, 'published', '2026-01-02', NULL,
  min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
  early_departure_requires_approval, 1,
  overtime_enabled, overtime_min_qualifying_minutes, overtime_rounding_minutes, overtime_requires_approval,
  NOW(), NULL, NOW()
FROM workforce_company_policy_version
WHERE tenant_id = 1 AND policy_id = 1 AND version_number = 1 AND allow_unscheduled_punch = 0
  AND NOT EXISTS (
    SELECT 1 FROM workforce_company_policy_version v2 WHERE v2.tenant_id = 1 AND v2.policy_id = 1 AND v2.version_number = 2
  )
LIMIT 1;
