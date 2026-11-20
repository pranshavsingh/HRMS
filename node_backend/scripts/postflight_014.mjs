// ============================================================================
// Script: node_backend/scripts/postflight_014.mjs
// Description: Automated postflight validation suite for Migration 014.
// Target: MariaDB 11.8.9 (127.0.0.1:3307 / hrms_disposable_test)
// ============================================================================

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3307', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hrms_disposable_test'
};

const results = [];

function recordResult(id, name, passed, details = '') {
  results.push({ id, name, passed, details });
  const statusStr = passed ? 'PASS' : 'FAIL';
  console.log(`[${statusStr}] ${id}: ${name} ${details ? ' - ' + details : ''}`);
}

async function runPostflight() {
  console.log('===============================================================');
  console.log('STARTING POSTFLIGHT VALIDATION FOR MIGRATION 014');
  console.log('Target:', `${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('===============================================================');

  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    // PO-01: Migration 014 recorded in schema_migrations
    const [migRows] = await connection.query(`
      SELECT version, name, checksum, applied_at 
      FROM schema_migrations 
      WHERE version = '014'
    `);
    recordResult('PO-01', 'Migration 014 Ledger Record Verification', migRows.length === 1, `Checksum: ${migRows[0]?.checksum}`);

    // PO-02: Zero NULL Company Policy References in Published Shift Versions
    const [nullPolicyRows] = await connection.query(`
      SELECT COUNT(*) as cnt
      FROM workforce_shift_version
      WHERE status = 'published' AND (policy_id IS NULL OR policy_version_id IS NULL)
    `);
    recordResult('PO-02', 'Zero NULL Company Policy Foreign Keys', nullPolicyRows[0].cnt === 0, `Unresolved: ${nullPolicyRows[0].cnt}`);

    // PO-03: Zero NULL Weekly-Off Policy References in Published Shift Versions
    const [nullWeeklyRows] = await connection.query(`
      SELECT COUNT(*) as cnt
      FROM workforce_shift_version
      WHERE status = 'published' AND (weekly_off_policy_id IS NULL OR weekly_off_policy_version_id IS NULL)
    `);
    recordResult('PO-03', 'Zero NULL Weekly-Off Policy Foreign Keys', nullWeeklyRows[0].cnt === 0, `Unresolved: ${nullWeeklyRows[0].cnt}`);

    // PO-04: Non-null Valid JSON Config Snapshot in Published Shift Versions
    const [snapshotRows] = await connection.query(`
      SELECT id, config_snapshot
      FROM workforce_shift_version
      WHERE status = 'published'
    `);
    let validSnapshots = 0;
    for (const row of snapshotRows) {
      if (row.config_snapshot) {
        try {
          const parsed = typeof row.config_snapshot === 'string' ? JSON.parse(row.config_snapshot) : row.config_snapshot;
          if (parsed.snapshot_version && parsed.shift_code) {
            validSnapshots++;
          }
        } catch (e) {}
      }
    }
    recordResult('PO-04', 'Configuration Snapshot Integrity', validSnapshots === snapshotRows.length && snapshotRows.length > 0, `${validSnapshots}/${snapshotRows.length} valid snapshots`);

    // PO-05: Weekly-Off Policy & Version Seeding Across All Active Tenants
    const [tenantsWithoutWeeklyOff] = await connection.query(`
      SELECT t.id
      FROM workforce_tenant t
      LEFT JOIN workforce_weekly_off_policy w ON w.tenant_id = t.id AND w.code = 'SUN_OFF'
      LEFT JOIN workforce_weekly_off_policy_version wv ON wv.tenant_id = t.id AND wv.policy_id = w.id
      WHERE t.is_active = 1 AND (w.id IS NULL OR wv.id IS NULL)
    `);
    recordResult('PO-05', 'Weekly-Off Policy Active Tenant Coverage', tenantsWithoutWeeklyOff.length === 0, `Missing: ${tenantsWithoutWeeklyOff.length}`);

    // PO-06: Canonical Shift Seeding for Active Tenants
    const [canonicalCounts] = await connection.query(`
      SELECT COUNT(DISTINCT code) as cnt
      FROM workforce_shift
      WHERE code IN ('GEN_SHIFT', 'MORN_SHIFT', 'EVE_SHIFT', 'NIGHT_SHIFT')
    `);
    recordResult('PO-06', 'Canonical Shifts Existence Check', canonicalCounts[0].cnt === 4, `Found ${canonicalCounts[0].cnt}/4 canonical shift types`);

    // PO-07: Trigger Existence Verification (11 triggers)
    const [triggers] = await connection.query(`
      SELECT TRIGGER_NAME
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME IN (
          'trg_wsv_check_published_interval',
          'trg_wcpv_check_published_interval',
          'trg_wwopv_check_published_interval',
          'trg_wsv_prevent_published_update',
          'trg_wcpv_prevent_published_update',
          'trg_wwopv_prevent_published_update',
          'trg_wsb_prevent_mutation_on_published_version',
          'trg_wsb_prevent_update_on_published_version',
          'trg_wsb_prevent_delete_on_published_version',
          'trg_wsb_validate_duration_limit',
          'trg_wsb_validate_duration_limit_update'
        )
    `);
    recordResult('PO-07', 'Database Trigger Suite Verification', triggers.length === 11, `Found ${triggers.length}/11 triggers`);

    // PO-08: workforce_shift_break Table Structure and Constraints
    const [breakCols] = await connection.query(`DESCRIBE workforce_shift_break`);
    const hasOffsets = breakCols.some(c => c.Field === 'start_offset_minutes') && breakCols.some(c => c.Field === 'end_offset_minutes');
    recordResult('PO-08', 'Minute-Offset Break Table Verification', hasOffsets, `Columns: ${breakCols.length}`);

    // PO-09: Single Active Draft Virtual Column and Index Check
    const [draftIndexes] = await connection.query(`
      SELECT INDEX_NAME 
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND INDEX_NAME IN ('uq_wsv_single_active_draft', 'uq_wcpv_single_active_draft', 'uq_wwopv_single_active_draft')
    `);
    recordResult('PO-09', 'Single Active Draft Unique Constraints', draftIndexes.length >= 3, `Indexes: ${draftIndexes.length}`);

    // PO-10: Immutability Trigger Operational Verification
    // Test that direct SQL update on published version is rejected
    let immutabilityTriggerFired = false;
    try {
      await connection.query(`
        UPDATE workforce_shift_version 
        SET duration_minutes = 999 
        WHERE id = 10 AND status = 'published'
      `);
    } catch (err) {
      if (err.message && err.message.includes('DATA INTEGRITY VIOLATION')) {
        immutabilityTriggerFired = true;
      }
    }
    recordResult('PO-10', 'Published Shift Immutability Trigger Test', immutabilityTriggerFired, 'Trigger cleanly rejected illegal duration modification');

    console.log('===============================================================');
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
      console.log('ALL POSTFLIGHT ASSERTIONS PASSED (10/10)');
      console.log('Migration 014 is verified complete and healthy.');
      return true;
    } else {
      console.error('POSTFLIGHT ASSERTIONS FAILED!');
      process.exitCode = 1;
      return false;
    }
  } finally {
    await connection.end();
  }
}

runPostflight().catch(err => {
  console.error('Postflight execution error:', err);
  process.exit(1);
});
