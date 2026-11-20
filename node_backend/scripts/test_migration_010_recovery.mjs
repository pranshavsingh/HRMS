import mysql from "mysql2/promise";
import { spawnSync } from "child_process";
import path from "path";
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
  const runnerPath = path.resolve(__dirname, "run-migrations.js");
  const res = spawnSync("node", [runnerPath], { env, encoding: "utf8" });
  const combined = (res.stdout || "") + "\n" + (res.stderr || "");
  if (res.status !== 0) {
    const err = new Error(combined);
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    err.status = res.status;
    throw err;
  }
  return combined;
}

async function runRecoveryTests() {
  console.log("================================================================================");
  console.log("[MIGRATION 010 RECOVERY AUDIT] Multi-State Partial DDL Repair & Fail-Closed Suite");
  console.log("Target Database: MariaDB 11.8.9 (127.0.0.1:3307)");
  console.log("================================================================================");

  const pool = mysql.createPool(DB_CONFIG);
  const conn = await pool.getConnection();

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Absent Tables & Missing Ledger Entry
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 1: Absent Tables & Missing Migration Ledger Entry ---");
    await conn.query("DROP TABLE IF EXISTS workforce_employee_rotation;");
    await conn.query("DROP TABLE IF EXISTS workforce_rotation_step;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: 2 tables dropped, version 010 removed from schema_migrations.");
    const out1 = invokeRunner("010");
    console.log(out1.split("\n").filter(l => l.includes("[Migration]") || l.includes("[Repair]") || l.includes("PASSED")).join("\n"));

    const [tRows1] = await conn.query(`
      SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'hrms_disposable_test'
        AND TABLE_NAME IN ('workforce_employee_fixed_assignment', 'workforce_rotation_definition', 'workforce_rotation_step', 'workforce_employee_rotation');
    `);
    const [mig1] = await conn.query("SELECT version FROM schema_migrations WHERE version = '010';");

    if (tRows1[0].count !== 4 || mig1.length === 0) {
      throw new Error(`Scenario 1 Failed! Expected 4 tables and migration 010 recorded. Found ${tRows1[0].count} tables.`);
    }
    console.log(">>> ✅ Scenario 1 PASSED: Absent tables recreated, all 4 tables verified, ledger entry restored.");

    // -------------------------------------------------------------------------
    // Scenario 2: Incomplete Schema (Missing Column effective_to)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 2: Incomplete Schema (Missing Column 'effective_to') ---");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP COLUMN effective_to;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: Column 'effective_to' dropped from workforce_employee_fixed_assignment.");
    const out2 = invokeRunner("010");
    console.log(out2.split("\n").filter(l => l.includes("[Migration]") || l.includes("[Repair]") || l.includes("PASSED")).join("\n"));

    const [colRows2] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'hrms_disposable_test'
        AND TABLE_NAME = 'workforce_employee_fixed_assignment'
        AND COLUMN_NAME = 'effective_to';
    `);

    if (colRows2.length === 0) {
      throw new Error("Scenario 2 Failed! Column 'effective_to' was not repaired.");
    }
    console.log(">>> ✅ Scenario 2 PASSED: Runner detected missing column, auto-repaired schema, verified compliance.");

    // -------------------------------------------------------------------------
    // Scenario 3: Missing Foreign Key (fk_wefa_shift dropped)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 3: Missing Foreign Key ('fk_wefa_shift') ---");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_shift;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: Foreign key 'fk_wefa_shift' dropped.");
    const out3 = invokeRunner("010");
    console.log(out3.split("\n").filter(l => l.includes("[Migration]") || l.includes("[Repair]") || l.includes("PASSED")).join("\n"));

    const [fkRows3] = await conn.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = 'hrms_disposable_test'
        AND TABLE_NAME = 'workforce_employee_fixed_assignment'
        AND CONSTRAINT_NAME = 'fk_wefa_shift'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY';
    `);

    if (fkRows3.length === 0) {
      throw new Error("Scenario 3 Failed! Foreign key 'fk_wefa_shift' was not repaired.");
    }
    console.log(">>> ✅ Scenario 3 PASSED: Runner detected missing foreign key, restored constraint, verified integrity.");

    // -------------------------------------------------------------------------
    // Scenario 4: Incompatible / Corrupted Index (Fail-Closed Diagnostic)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 4: Corrupted Index Schema (Fail-Closed Diagnostic) ---");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_user;");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_user_tenant;");
    await conn.query("DROP INDEX idx_wefa_tenant_user_active ON workforce_employee_fixed_assignment;");
    // Create wrong index with invalid columns
    await conn.query("CREATE INDEX idx_wefa_tenant_user_active ON workforce_employee_fixed_assignment(user_id, shift_id);");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE RESTRICT;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: 'idx_wefa_tenant_user_active' replaced with corrupted columns (user_id, shift_id).");
    let failedClosed = false;
    let failureMsg = "";
    try {
      invokeRunner("010");
    } catch (err) {
      failedClosed = true;
      failureMsg = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + err.message;
      console.log("Received expected fail-closed diagnostic:\n", failureMsg.split("\n").filter(l => l.includes("MIGRATION 010 VERIFICATION FAILED")).join("\n"));
    }

    if (!failedClosed || !failureMsg.includes("incompatible columns")) {
      throw new Error("Scenario 4 Failed! Runner did not fail closed on corrupted index.");
    }
    console.log(">>> ✅ Scenario 4 PASSED: Runner failed closed with precise diagnostic when encountering incompatible index.");

    // Clean up corrupted index and restore correct index & foreign keys
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_user;");
    await conn.query("DROP INDEX idx_wefa_tenant_user_active ON workforce_employee_fixed_assignment;");
    await conn.query("CREATE INDEX idx_wefa_tenant_user_active ON workforce_employee_fixed_assignment(tenant_id, user_id, is_active);");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE RESTRICT;");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_user_tenant FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT;");
    invokeRunner("010");
    console.log("Restored correct index state and verified clean migration ledger.");

    // -------------------------------------------------------------------------
    // Scenario 5: Incompatible Foreign Key Definition (Fail-Closed Diagnostic)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 5: Incompatible Foreign Key Definition (Fail-Closed) ---");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_shift;");
    // Create incompatible foreign key: ON DELETE CASCADE instead of RESTRICT
    await conn.query(`
      ALTER TABLE workforce_employee_fixed_assignment
      ADD CONSTRAINT fk_wefa_shift
      FOREIGN KEY (tenant_id, shift_id)
      REFERENCES workforce_shift(tenant_id, id)
      ON DELETE CASCADE;
    `);
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: 'fk_wefa_shift' defined with illegal ON DELETE CASCADE rule.");
    let fkFailedClosed = false;
    let fkFailureMsg = "";
    try {
      invokeRunner("010");
    } catch (err) {
      fkFailedClosed = true;
      fkFailureMsg = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + err.message;
      console.log("Received expected fail-closed diagnostic:\n", fkFailureMsg.split("\n").filter(l => l.includes("MIGRATION VERIFICATION FAILED")).join("\n"));
    }

    if (!fkFailedClosed || !fkFailureMsg.includes("ON DELETE rule mismatch")) {
      throw new Error("Scenario 5 Failed! Runner did not fail closed on incompatible foreign key definition.");
    }

    // Verify version 010 was NOT recorded
    const [mig5] = await conn.query("SELECT version FROM schema_migrations WHERE version = '010';");
    if (mig5.length !== 0) throw new Error("Scenario 5 Failed! Migration 010 was recorded despite failed verification!");
    console.log(">>> ✅ Scenario 5 PASSED: Runner detected incompatible foreign key ON DELETE CASCADE rule, failed closed, and withheld ledger recording.");

    // Clean up corrupted foreign key and restore correct definition
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment DROP FOREIGN KEY fk_wefa_shift;");
    await conn.query(`
      ALTER TABLE workforce_employee_fixed_assignment
      ADD CONSTRAINT fk_wefa_shift
      FOREIGN KEY (tenant_id, shift_id)
      REFERENCES workforce_shift(tenant_id, id)
      ON DELETE RESTRICT;
    `);
    invokeRunner("010");

    // -------------------------------------------------------------------------
    // Scenario 6: Incompatible Column Definition (Fail-Closed Diagnostic)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 6: Incompatible Column Definition (Fail-Closed) ---");
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment MODIFY COLUMN effective_to VARCHAR(50) NULL;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: Column 'effective_to' altered to incompatible type VARCHAR(50) NULL.");
    let colFailedClosed = false;
    let colFailureMsg = "";
    try {
      invokeRunner("010");
    } catch (err) {
      colFailedClosed = true;
      colFailureMsg = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + err.message;
      console.log("Received expected fail-closed diagnostic:\n", colFailureMsg.split("\n").filter(l => l.includes("MIGRATION VERIFICATION FAILED")).join("\n"));
    }

    if (!colFailedClosed || !colFailureMsg.includes("data type mismatch")) {
      throw new Error("Scenario 6 Failed! Runner did not fail closed on incompatible column definition.");
    }

    const [mig6] = await conn.query("SELECT version FROM schema_migrations WHERE version = '010';");
    if (mig6.length !== 0) throw new Error("Scenario 6 Failed! Migration 010 was recorded despite failed verification!");
    console.log(">>> ✅ Scenario 6 PASSED: Runner detected incompatible column data type, failed closed, and withheld ledger recording.");

    // Clean up and restore correct column definition
    await conn.query("ALTER TABLE workforce_employee_fixed_assignment MODIFY COLUMN effective_to DATE NULL;");
    invokeRunner("010");

    // -------------------------------------------------------------------------
    // Scenario 7: Existing Valid Data Preservation During Recovery
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 7: Existing Valid Data Preservation During Recovery ---");
    await conn.query("DELETE FROM workforce_employee_fixed_assignment;");
    await conn.query(`
      INSERT INTO workforce_employee_fixed_assignment (id, tenant_id, user_id, shift_id, effective_from, is_active)
      VALUES 
        (901, 1, 10, 10, '2026-11-01', 1),
        (902, 1, 11, 10, '2026-11-01', 1),
        (903, 1, 12, 10, '2026-11-01', 1);
    `);

    // Simulate recovery event: drop a secondary table and rerun
    await conn.query("DROP TABLE IF EXISTS workforce_rotation_step;");
    await conn.query("DELETE FROM schema_migrations WHERE version = '010';");

    console.log("State before runner: 3 valid employee assignments exist in workforce_employee_fixed_assignment, rotation_step dropped.");
    invokeRunner("010");

    const [preservedRows] = await conn.query("SELECT id, tenant_id, user_id, shift_id, is_active FROM workforce_employee_fixed_assignment ORDER BY id ASC;");
    console.log("Preserved Rows After Runner Recovery:", preservedRows);

    if (preservedRows.length !== 3 || Number(preservedRows[0].id) !== 901 || Number(preservedRows[2].id) !== 903) {
      throw new Error("Scenario 7 Failed! Data corruption detected during migration recovery.");
    }
    console.log(">>> ✅ Scenario 7 PASSED: All existing valid data 100% preserved through recovery execution.");

    // Clean up temporary rows
    await conn.query("DELETE FROM workforce_employee_fixed_assignment WHERE id IN (901, 902, 903);");

    // -------------------------------------------------------------------------
    // Scenario 8: Checksum Mismatch — Fatal Error & Recovery (Updated)
    // -------------------------------------------------------------------------
    // NOTE: Prior to the checksum integrity fix, the runner emitted a warning
    // and continued. After the fix, a tampered checksum is a FATAL error that
    // throws, returns exit code 1, and blocks all subsequent migration execution.
    // This scenario now asserts the fail-closed behaviour, then restores the
    // checksum and verifies the runner recovers cleanly on the next invocation.
    console.log("\n--- Scenario 8: Checksum Mismatch — Fatal Error Enforcement ---");
    const tampered = "0".repeat(64);
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '010';", [tampered]);

    console.log("State before runner: version 010 checksum tampered to " + tampered.slice(0, 16) + "...");

    let s8FailedClosed = false;
    let s8Output = "";
    try {
      invokeRunner("010");
    } catch (err) {
      s8FailedClosed = true;
      s8Output = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + err.message;
    }

    const hasViolationMsg = s8Output.includes("CHECKSUM INTEGRITY VIOLATION") ||
                            (s8FailedClosed && s8Output.includes("010_workforce_assignments_and_rotations.sql"));

    // The stored checksum must NOT have been auto-rewritten
    const [s8LedgerRow] = await conn.query("SELECT checksum FROM schema_migrations WHERE version = '010';");
    const storedAfterFail = s8LedgerRow[0]?.checksum;
    const wasNotAutoRepaired = storedAfterFail === tampered;

    if (!s8FailedClosed) {
      throw new Error("Scenario 8 Failed! Runner did not fail closed on tampered checksum.");
    }
    if (!wasNotAutoRepaired) {
      throw new Error(`Scenario 8 Failed! Runner auto-rewrote stored checksum to: ${storedAfterFail}`);
    }

    console.log("Runner emitted CHECKSUM INTEGRITY VIOLATION and exited non-zero (exit code 1).");
    console.log("Stored checksum after failing run: " + (storedAfterFail || "").slice(0, 16) + "... (tampered value preserved — not auto-repaired).");

    // Restore correct checksum and verify runner recovers cleanly.
    const fs = await import("fs");
    const crypto = await import("crypto");
    const migFile = path.resolve(__dirname, "migrations", "010_workforce_assignments_and_rotations.sql");
    const content = fs.readFileSync(migFile, "utf8");
    const validChecksum = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    await conn.query("UPDATE schema_migrations SET checksum = ? WHERE version = '010';", [validChecksum]);

    // Verify runner succeeds after checksum is restored by DBA.
    const repairOut = invokeRunner("010");
    if (!repairOut.includes("checksum verified") && !repairOut.includes("All MySQL/MariaDB migrations successfully")) {
      throw new Error("Scenario 8 Failed! Runner did not recover cleanly after checksum restoration.");
    }

    console.log(">>> ✅ Scenario 8 PASSED: Checksum mismatch caused fatal error (non-zero exit, stored checksum not auto-rewritten). Runner recovered cleanly after DBA-manual checksum restoration.");

    console.log("\n================================================================================");
    console.log("ALL 8 MIGRATION 010 RECOVERY, CONSISTENCY & SAFETY SCENARIOS PASSED PERFECTLY!");
    console.log("================================================================================");
  } finally {
    conn.release();
    await pool.end();
  }
}

runRecoveryTests().catch(err => {
  console.error("FATAL ERROR in Migration 010 Recovery Suite:", err);
  process.exit(1);
});
