-- ============================================================================
-- Migration: 019_seed_default_workforce_sites.sql
-- Description: Seed baseline default sites for tenant 1
-- ============================================================================

INSERT INTO workforce_site (id, tenant_id, code, name, address, is_active)
VALUES 
  (1, 1, 'HQ', 'Headquarters', 'Main Office', 1),
  (2, 1, 'SITE_2', 'Secondary Site', 'Branch Office', 1)
ON DUPLICATE KEY UPDATE is_active = 1;
