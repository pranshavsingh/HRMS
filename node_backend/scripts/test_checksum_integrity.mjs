/**
 * test_checksum_integrity.mjs
 *
 * STAGE 1 — CHECKSUM INTEGRITY ENFORCEMENT TEST SUITE
 *
 * Verifies that run-migrations.js treats a checksum mismatch on an
 * already-applied migration as a FATAL error that:
 *   1. Emits a [CHECKSUM INTEGRITY VIOLATION] error.
 *   2. Stops migration execution immediately.
 *   3. Does NOT execute subsequent pending migrations.
 *   4. Does NOT modify the existing schema_migrations ledger entry.
 *   5. Does NOT auto-rewrite the stored checksum.
 *   6. Preserves all existing application data.
 *   7. Returns a non-zero process exit code.
 *
 * Also verifies the happy path: a matching checksum still permits the
 * normal lifecycle (skip-with-verification, run new migrations).
 *
 * Target: MariaDB 11.8.9 (127.0.0.1:3307, hrms_disposable_test)
 */

import mysql from "mysql2/promise";
import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "hrms_disposable_test",
  multipleStatements: true,
  dateStrings: true,
};

const RUNNER_PATH = path.resolve(__dirname, "run-migrations.js");
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

function computeChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function invokeRunner(maxVersion = "010") {
  const env = {
    ...process.env,
    DB_CLIENT: "mysql",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3307",
    MYSQL_USER: "root",
    MYSQL_PASSWORD: "",
    MYSQL_DATABASE: "hrms_disposable_test",
    MAX_MIGRATION_VERSION: maxVersion,
  };
  const res = spawnSync("node", [RUNNER_PATH], { env, encoding: "utf8" });
  return {
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    combined: (res.stdout || "") + "\n" + (res.stderr || ""),
    exitCode: res.status,
  };
}

function getFileChecksum(migrationFile) {
  const filePath = path.join(MIGRATIONS_DIR, migrationFile);
  const content = fs.readFileSync(filePath, "utf8");
  return computeChecksum(content);
}

async function runChecksumIntegrityTests() {
  console.log("================================================================================");
  console.log("[CHECKSUM INTEGRITY TEST SUITE] Stage 1 — Fatal Mismatch Enforcement");
  console.log("Target Database: MariaDB 11.8.9 (127.0.0.1:3307)");
  console.log("================================================================================\n");

  const pool = mysql.createPool(DB_CONFIG);
  const conn = await pool.getConnection();

  let passed = 0;
  let failed = 0;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // BASELINE: Ensure clean state — all migrations 001-010 applied, database
    // is consistent from the previous recovery suite run.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── BASELINE SETUP ──────────────────────────────────────────────────────────");
    const baselineRun = invokeRunner("010");
    if (baselineRun.exitCode !== 0) {
      throw new Error(`Baseline runner failed unexpectedly!\nOutput: ${baselineRun.combined}`);
    }
    console.log("Baseline: migrations 001–010 applied and verified.\n");

    // Record the genuine checksum for migration 006 and 007 before any tampering.
    const real006Checksum = getFileChecksum("006_workforce_tenant_and_users.sql");
    const real007Checksum = getFileChecksum("007_workforce_company_policy.sql");

    // Seed a sentinel application data row to prove preservation later.
    await conn.query("DELETE FROM workforce_employee_fixed_assignment WHERE id = 999;");
    await conn.query(`
      INSERT INTO workforce_employee_fixed_assignment (id, tenant_id, user_id, shift_id, effective_from, is_active)
      VALUES (999, 1, 10, 10, '2026-11-01', 1);
    `);
    console.log("Seeded sentinel row id=999 in workforce_employee_fixed_assignment.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-01: Tampered checksum → fatal error, non-zero exit code
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-01: Tampered checksum causes fatal error & non-zero exit code ─────");
    const TAMPERED = "0".repeat(64);
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [TAMPERED]);
    console.log(`State: version 006 checksum tampered to ${TAMPERED.slice(0, 16)}...`);

    const c01 = invokeRunner("010");

    // Restore immediately to prevent cascade failures in later tests.
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [real006Checksum]);

    const hasViolationMsg = c01.combined.includes("CHECKSUM INTEGRITY VIOLATION");
    const isNonZeroExit = c01.exitCode !== 0;

    if (!hasViolationMsg) {
      console.error("FAIL: Expected [CHECKSUM INTEGRITY VIOLATION] in output.");
      console.error("Actual combined output:", c01.combined.slice(0, 500));
      failed++;
    } else if (!isNonZeroExit) {
      console.error(`FAIL: Expected non-zero exit code but got: ${c01.exitCode}`);
      failed++;
    } else {
      console.log(">>> ✅ C-01 PASSED: Checksum mismatch emitted CHECKSUM INTEGRITY VIOLATION and exited non-zero.");
      console.log(`     Exit code: ${c01.exitCode}`);
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-02: Later migrations are NOT executed after a mismatch
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-02: Later migrations are blocked after a mismatch ─────────────────");
    // Remove migration 010 from ledger so the runner would want to apply it.
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");
    // Drop the tables migration 010 creates so runner can legitimately re-apply it.
    await conn.query("DROP TABLE IF EXISTS workforce_employee_rotation;");
    await conn.query("DROP TABLE IF EXISTS workforce_rotation_step;");
    // Tamper checksum for 006 (earlier than 010).
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [TAMPERED]);
    console.log("State: version 006 tampered; version 010 removed from ledger; workforce_employee_rotation dropped.");

    const c02 = invokeRunner("010");

    // Restore 006 checksum.
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [real006Checksum]);

    const blockedMsg = c02.combined.includes("CHECKSUM INTEGRITY VIOLATION");
    // Migration 010 should NOT have been applied (ledger entry still absent).
    const [ledger010] = await conn.query("SELECT version FROM schema_migrations WHERE version = '010';");
    const did010NotRun = ledger010.length === 0;
    // The 2 dropped tables should still be absent.
    const [tableCheck] = await conn.query(`
      SELECT COUNT(*) AS cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'hrms_disposable_test'
        AND TABLE_NAME = 'workforce_employee_rotation';
    `);
    const tableNotRecreated = Number(tableCheck[0].cnt) === 0;

    if (!blockedMsg) {
      console.error("FAIL: CHECKSUM INTEGRITY VIOLATION message not found in output.");
      failed++;
    } else if (!did010NotRun) {
      console.error("FAIL: Migration 010 was recorded in ledger despite earlier mismatch — later migrations were NOT blocked!");
      failed++;
    } else if (!tableNotRecreated) {
      console.error("FAIL: workforce_employee_rotation was recreated despite earlier mismatch — later migrations were NOT blocked!");
      failed++;
    } else {
      console.log(">>> ✅ C-02 PASSED: Later migration 010 was NOT executed after checksum violation on 006.");
      console.log(`     Ledger 010 row count: ${ledger010.length} (expected 0).`);
      console.log(`     workforce_employee_rotation present: ${Number(tableCheck[0].cnt) === 1 ? "YES" : "NO"} (expected NO).`);
      passed++;
    }
    console.log();

    // Repair state: re-apply 010 for subsequent tests.
    const repairRun = invokeRunner("010");
    if (repairRun.exitCode !== 0) throw new Error(`Repair run failed: ${repairRun.combined}`);
    console.log("State repaired: migration 010 re-applied successfully.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-03: Stored checksum is NOT rewritten after a mismatch
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-03: Stored checksum is NOT rewritten after a mismatch ─────────────");
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '007';", [TAMPERED]);
    console.log(`State: version 007 checksum tampered to ${TAMPERED.slice(0, 16)}...`);

    invokeRunner("010"); // Will fail with non-zero; we don't assert exit code here.

    // Restore 007 and check the checksum in ledger remains TAMPERED (not auto-fixed).
    const [ledger007] = await conn.query("SELECT checksum FROM schema_migrations WHERE version = '007';");
    const storedChecksum = ledger007[0]?.checksum;
    const wasNotAutoRepaired = storedChecksum === TAMPERED;

    // Restore to real checksum.
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '007';", [real007Checksum]);

    if (!wasNotAutoRepaired) {
      console.error(`FAIL: Runner auto-rewrote the stored checksum. Found: ${storedChecksum}`);
      failed++;
    } else {
      console.log(">>> ✅ C-03 PASSED: Runner did NOT auto-rewrite the stored checksum.");
      console.log(`     Stored checksum after failed run: ${storedChecksum.slice(0, 16)}... (tampered value preserved)`);
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-04: Existing application data is preserved after a mismatch
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-04: Existing application data is preserved after a mismatch ────────");
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [TAMPERED]);
    console.log("State: version 006 checksum tampered.");

    invokeRunner("010"); // Will fail.

    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [real006Checksum]);

    const [sentinelRows] = await conn.query(
      "SELECT id, tenant_id, user_id, shift_id, is_active FROM workforce_employee_fixed_assignment WHERE id = 999;"
    );
    const sentinelPreserved = sentinelRows.length === 1 && Number(sentinelRows[0].id) === 999;

    if (!sentinelPreserved) {
      console.error("FAIL: Sentinel row id=999 was destroyed during failed run. Data was NOT preserved.");
      failed++;
    } else {
      console.log(">>> ✅ C-04 PASSED: Sentinel application data row id=999 fully preserved after checksum violation.");
      console.log(`     Row: ${JSON.stringify(sentinelRows[0])}`);
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-05: Ledger entry for the tampered migration is NOT changed
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-05: Ledger entry for tampered migration is NOT modified ─────────────");
    const TAMPERED_2 = "f".repeat(64);
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '007';", [TAMPERED_2]);
    // Record the applied_at before the failing run.
    const [before007] = await conn.query("SELECT applied_at, checksum FROM schema_migrations WHERE version = '007';");
    const appliedAtBefore = before007[0].applied_at;
    console.log(`State: version 007 checksum tampered to ${TAMPERED_2.slice(0, 16)}...`);

    invokeRunner("010"); // Will fail.

    const [after007] = await conn.query("SELECT applied_at, checksum FROM schema_migrations WHERE version = '007';");
    const appliedAtAfter = after007[0].applied_at;
    const checksumAfter = after007[0].checksum;

    // Restore.
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '007';", [real007Checksum]);

    const ledgerUnchanged = checksumAfter === TAMPERED_2 && appliedAtAfter === appliedAtBefore;

    if (!ledgerUnchanged) {
      console.error(`FAIL: Ledger was modified! checksum: ${checksumAfter}, applied_at: ${appliedAtAfter}`);
      failed++;
    } else {
      console.log(">>> ✅ C-05 PASSED: Ledger entry checksum and applied_at remain unchanged after failing run.");
      console.log(`     checksum stored: ${checksumAfter.slice(0, 16)}... (tampered value unchanged)`);
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-06: Normal matching checksum permits correct lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-06: Matching checksum permits correct skip-and-continue lifecycle ───");
    // All 010 migrations in correct state; run should succeed immediately.
    const c06 = invokeRunner("010");

    const isAllVerified = c06.combined.includes("checksum verified") &&
                          c06.combined.includes("All MySQL/MariaDB migrations successfully executed");
    const isZeroExit = c06.exitCode === 0;
    const hasNoViolation = !c06.combined.includes("CHECKSUM INTEGRITY VIOLATION");

    if (!isAllVerified || !isZeroExit || !hasNoViolation) {
      console.error(`FAIL: Normal lifecycle with matching checksums failed!`);
      console.error(`  exitCode=${c06.exitCode}, hasViolation=${!hasNoViolation}`);
      failed++;
    } else {
      console.log(">>> ✅ C-06 PASSED: Matching checksums accepted; runner completed normally with exit code 0.");
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-07: Exit code is non-zero — no ambiguity for CI/CD scripts
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-07: Exact non-zero exit code (1) is returned on mismatch ──────────");
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [TAMPERED]);

    const c07 = invokeRunner("010");

    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [real006Checksum]);

    if (c07.exitCode !== 1) {
      console.error(`FAIL: Expected exit code 1, got: ${c07.exitCode}`);
      failed++;
    } else {
      console.log(`>>> ✅ C-07 PASSED: Process exited with code 1 — unambiguous failure for CI/CD pipelines.`);
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C-08: Error message contains DBA investigation guidance
    // ─────────────────────────────────────────────────────────────────────────
    console.log("── TEST C-08: Error message contains DBA guidance text ───────────────────────");
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [TAMPERED]);

    const c08 = invokeRunner("010");

    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '006';", [real006Checksum]);

    const hasGuidance = c08.combined.includes("Manual DBA investigation and recovery are required");
    const hasBlockedMsg = c08.combined.includes("All subsequent migrations have been blocked");
    const hasNoAutoRepairMsg = c08.combined.includes("Do NOT rewrite the stored checksum automatically");

    if (!hasGuidance || !hasBlockedMsg || !hasNoAutoRepairMsg) {
      console.error("FAIL: DBA guidance messages not found in error output.");
      console.error("Output excerpt:", c08.combined.slice(0, 800));
      failed++;
    } else {
      console.log(">>> ✅ C-08 PASSED: Error output contains all required DBA guidance messages.");
      passed++;
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // CLEANUP: Remove sentinel row
    // ─────────────────────────────────────────────────────────────────────────
    await conn.query("DELETE FROM workforce_employee_fixed_assignment WHERE id = 999;");
    console.log("Cleanup: Sentinel row id=999 removed.\n");

  } finally {
    conn.release();
    await pool.end();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("================================================================================");
  console.log(`CHECKSUM INTEGRITY TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n${failed} test(s) FAILED. Stage 1 checksum integrity enforcement is NOT complete.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} checksum integrity tests PASSED.`);
    console.log("Stage 1 checksum integrity enforcement is fully certified on MariaDB 11.8.9.");
  }
}

runChecksumIntegrityTests().catch((err) => {
  console.error("FATAL ERROR in Checksum Integrity Test Suite:", err);
  process.exit(1);
});
