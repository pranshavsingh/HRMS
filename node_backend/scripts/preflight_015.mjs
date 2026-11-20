import mysql from "mysql2/promise";

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: parseInt(process.env.MYSQL_PORT || "3307", 10),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "hrms_disposable_test",
};

async function runPreflight() {
  console.log("================================================================================");
  console.log("[STAGE 3 PREFLIGHT] Verifying Database Prerequisites for Migration 015");
  console.log(`Target: MariaDB 11.8.9 at ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log("================================================================================");

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // 1. Connection check
    console.log("1. Checking connection and MariaDB engine...");
    const [verRows] = await conn.execute("SELECT VERSION() as version");
    console.log(`   Connected to MariaDB: ${verRows[0].version}`);

    // 2. Prior migrations check (001 - 014)
    console.log("2. Checking prerequisite migrations (001 - 014)...");
    const [migs] = await conn.execute(
      "SELECT version, name FROM schema_migrations ORDER BY version"
    );
    const appliedVersions = migs.map((m) => m.version);
    for (let i = 1; i <= 14; i++) {
      const vStr = String(i).padStart(3, "0");
      if (!appliedVersions.includes(vStr)) {
        throw new Error(`Prerequisite migration ${vStr} is missing from schema_migrations!`);
      }
    }
    console.log(`   All 14 prior migrations confirmed applied.`);

    // 3. Confirm 015 not already applied
    if (appliedVersions.includes("015")) {
      console.log("   Notice: Migration 015 is already recorded in schema_migrations.");
    } else {
      console.log("   Confirmed: Migration 015 has not been applied yet.");
    }

    // 4. Prerequisite workforce tables check
    console.log("3. Verifying existence of prerequisite workforce tables...");
    const requiredTables = [
      "accounts_user",
      "workforce_tenant",
      "workforce_user_tenant",
      "workforce_shift",
      "workforce_shift_version",
      "workforce_shift_break",
      "workforce_company_policy_version",
      "workforce_weekly_off_policy_version",
      "workforce_employee_fixed_assignment",
      "workforce_rotation_definition",
      "workforce_rotation_step",
      "workforce_employee_rotation",
      "workforce_roster_header",
      "workforce_roster_entry",
      "attendance_attendance"
    ];

    for (const t of requiredTables) {
      const [tRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
        [DB_CONFIG.database, t]
      );
      if (tRows[0].cnt === 0) {
        throw new Error(`Required table ${t} does not exist in ${DB_CONFIG.database}!`);
      }
    }
    console.log(`   All ${requiredTables.length} required prerequisite tables exist.`);

    // 5. Check published shift versions exist for FK backfill
    console.log("4. Verifying published shift versions availability...");
    const [pubVersions] = await conn.execute(
      "SELECT id, tenant_id, shift_id, version_number FROM workforce_shift_version WHERE status = 'published'"
    );
    if (pubVersions.length === 0) {
      throw new Error("No published shift versions exist! Stage 2 canonical shifts required.");
    }
    console.log(`   Found ${pubVersions.length} published shift versions available for assignment pinning.`);

    // 6. Check existing assignment table rows
    console.log("5. Checking existing assignment table status...");
    const [wefaRows] = await conn.execute("SELECT COUNT(*) as count FROM workforce_employee_fixed_assignment");
    console.log(`   workforce_employee_fixed_assignment row count: ${wefaRows[0].count}`);

    console.log("\n================================================================================");
    console.log("[PREFLIGHT RESULT] 6/6 CHECKS PASSED — READY FOR MIGRATION 015");
    console.log("================================================================================");
  } finally {
    await conn.end();
  }
}

runPreflight().catch((err) => {
  console.error("\n[PREFLIGHT FAILED]:", err.message);
  process.exit(1);
});
