import mysql from "mysql2/promise";

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "hrms_disposable_test",
  multipleStatements: true,
  dateStrings: true,
};

function toHoursLegacy(inTime, outTime, status) {
  if (status !== 'approved' || !inTime || !outTime) return '0.00';
  const start = new Date(inTime);
  const end = new Date(outTime);
  const diffMs = end - start;
  if (diffMs <= 0) return '0.00';
  return (diffMs / (1000 * 60 * 60)).toFixed(2);
}

async function runHistoricalBackfillAudit() {
  console.log("================================================================================");
  console.log("[HISTORICAL BACKFILL RIGOROUS AUDIT]");
  console.log("Target Database: MariaDB 11.8.9 (127.0.0.1:3307)");
  console.log("================================================================================");

  const pool = mysql.createPool(DB_CONFIG);
  const conn = await pool.getConnection();

  try {
    // -------------------------------------------------------------------------
    // 1. Create a dedicated test table representing pre-migration attendance_attendance
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Creating Isolated Pre-Migration Attendance Table ---");
    await conn.query("DROP TABLE IF EXISTS test_legacy_attendance;");
    await conn.query(`
      CREATE TABLE test_legacy_attendance (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        punch_in_time DATETIME NULL,
        punch_out_time DATETIME NULL,
        punch_in_photo VARCHAR(255) NULL,
        punch_out_photo VARCHAR(255) NULL,
        punch_in_lat DOUBLE NULL,
        punch_in_lng DOUBLE NULL,
        punch_out_lat DOUBLE NULL,
        punch_out_lng DOUBLE NULL,
        punch_in_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
        punch_out_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
        is_outside_location BOOLEAN NOT NULL DEFAULT 0,
        punch_in_outside BOOLEAN NOT NULL DEFAULT 0,
        punch_out_outside BOOLEAN NOT NULL DEFAULT 0,
        user_id INT NOT NULL
      ) ENGINE=InnoDB;
    `);

    // -------------------------------------------------------------------------
    // 2. Seed 1,000 Realistic Pre-Migration Attendance Records
    // -------------------------------------------------------------------------
    console.log("Seeding 1,000 diverse pre-migration legacy records...");
    const mockRows = [];
    const baseDate = new Date("2023-01-01T00:00:00Z");

    for (let i = 1; i <= 1000; i++) {
      const curDate = new Date(baseDate.getTime() + i * 24 * 3600 * 1000);
      const dateStr = curDate.toISOString().slice(0, 10);
      const userId = (i % 65) + 1; // Distributed across 65 employees

      let inTime = null;
      let outTime = null;
      let status = 'approved';
      let inStatus = 'approved';
      let outStatus = 'approved';

      if (i % 20 === 0) {
        // Pending approval record
        status = 'pending';
        inStatus = 'pending';
        inTime = `${dateStr} 09:12:00`;
        outTime = null;
      } else if (i % 15 === 0) {
        // Rejected punch
        status = 'rejected';
        inStatus = 'rejected';
        inTime = `${dateStr} 09:30:00`;
        outTime = `${dateStr} 18:00:00`;
      } else if (i % 10 === 0) {
        // Open punch (in progress)
        inTime = `${dateStr} 08:50:00`;
        outTime = null;
      } else {
        // Normal completed day (varying hours: 7.5h to 9.5h)
        const durationMinutes = 450 + (i % 120); // 7.5h to 9.5h
        inTime = `${dateStr} 09:00:00`;
        const outDate = new Date(new Date(`${dateStr}T09:00:00Z`).getTime() + durationMinutes * 60 * 1000);
        outTime = outDate.toISOString().replace('T', ' ').slice(0, 19);
      }

      mockRows.push([
        dateStr, inTime, outTime, inStatus, outStatus, status, userId
      ]);
    }

    for (const r of mockRows) {
      await conn.query(`
        INSERT INTO test_legacy_attendance (
          date, punch_in_time, punch_out_time, punch_in_status, punch_out_status, status, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
      `, r);
    }

    const [preCount] = await conn.query("SELECT COUNT(*) AS count FROM test_legacy_attendance;");
    console.log(`Pre-migration table seeded with exactly ${preCount[0].count} rows.`);

    // -------------------------------------------------------------------------
    // 3. Apply Schema Expansion (Columns Added as NULL / Default)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Applying Schema Expansion DDL ---");
    await conn.query(`
      ALTER TABLE test_legacy_attendance
        ADD COLUMN tenant_id BIGINT NULL AFTER id,
        ADD COLUMN roster_entry_id BIGINT NULL AFTER user_id,
        ADD COLUMN shift_version_id BIGINT NULL AFTER roster_entry_id,
        ADD COLUMN work_date DATE NULL AFTER shift_version_id,
        ADD COLUMN is_date_provisional BOOLEAN NOT NULL DEFAULT 0 AFTER work_date,
        ADD COLUMN total_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER punch_out_status,
        ADD COLUMN late_minutes INT NOT NULL DEFAULT 0 AFTER total_hours,
        ADD COLUMN early_departure_minutes INT NOT NULL DEFAULT 0 AFTER late_minutes,
        ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0 AFTER early_departure_minutes,
        ADD COLUMN punctuality_status ENUM('on_time', 'grace_period', 'late', 'early_departure', 'unassigned') NOT NULL DEFAULT 'unassigned' AFTER overtime_minutes,
        ADD COLUMN geofence_status ENUM('inside', 'outside', 'exempt', 'unverified') NOT NULL DEFAULT 'unverified' AFTER punctuality_status,
        ADD COLUMN regularization_status ENUM('none', 'requested', 'approved', 'rejected') NOT NULL DEFAULT 'none' AFTER geofence_status;
    `);

    // -------------------------------------------------------------------------
    // 4. Execute Exact Migration 012 Deterministic Backfill
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Executing Migration 012 Deterministic Historical Backfill ---");
    const [updateRes] = await conn.query(`
      UPDATE test_legacy_attendance
      SET tenant_id = 1,
          work_date = date,
          total_hours = CASE
            WHEN status = 'approved' AND punch_in_time IS NOT NULL AND punch_out_time IS NOT NULL AND punch_out_time >= punch_in_time
            THEN ROUND(TIMESTAMPDIFF(SECOND, punch_in_time, punch_out_time) / 3600, 2)
            ELSE 0.00
          END
      WHERE tenant_id IS NULL;
    `);
    console.log(`Backfill updated ${updateRes.affectedRows} rows.`);

    // Apply column default and NOT NULL constraints
    await conn.query(`
      ALTER TABLE test_legacy_attendance
        MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1,
        MODIFY COLUMN work_date DATE NOT NULL DEFAULT (date);
    `);

    // -------------------------------------------------------------------------
    // 5. Rigorous Post-Backfill Assertions
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Executing Exact SQL Audit Queries ---");
    const [audit] = await conn.query(`
      SELECT
        COUNT(*) AS total_rows,
        SUM(CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END) AS null_tenant_id_count,
        SUM(CASE WHEN work_date IS NULL THEN 1 ELSE 0 END) AS null_work_date_count,
        SUM(CASE WHEN work_date <> date THEN 1 ELSE 0 END) AS date_mismatch_count,
        SUM(CASE WHEN tenant_id <> 1 THEN 1 ELSE 0 END) AS non_tenant_1_count,
        SUM(CASE WHEN total_hours IS NULL THEN 1 ELSE 0 END) AS null_total_hours_count,
        SUM(CASE WHEN punctuality_status <> 'unassigned' THEN 1 ELSE 0 END) AS non_unassigned_punctuality_count
      FROM test_legacy_attendance;
    `);

    console.log("Post-Backfill SQL Assertion Results:", audit[0]);

    if (Number(audit[0].total_rows) !== 1000) throw new Error(`Row count changed! ${audit[0].total_rows}`);
    if (Number(audit[0].null_tenant_id_count) !== 0) throw new Error("Found NULL tenant_id rows!");
    if (Number(audit[0].null_work_date_count) !== 0) throw new Error("Found NULL work_date rows!");
    if (Number(audit[0].date_mismatch_count) !== 0) throw new Error("Found date/work_date mismatch rows!");
    if (Number(audit[0].non_tenant_1_count) !== 0) throw new Error("Found non-Tenant 1 rows!");
    if (Number(audit[0].null_total_hours_count) !== 0) throw new Error("Found NULL total_hours rows!");
    if (Number(audit[0].non_unassigned_punctuality_count) !== 0) throw new Error("Found modified punctuality status!");

    // -------------------------------------------------------------------------
    // 6. Complete Mathematical Equivalence Verification (SQL vs JS toHours())
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Verifying 1,000 Rows for Exact Mathematical Equivalence (SQL vs JS) ---");
    const [allRows] = await conn.query("SELECT id, date, work_date, punch_in_time, punch_out_time, status, total_hours FROM test_legacy_attendance;");
    let equivalenceMismatches = 0;

    for (const row of allRows) {
      const jsVal = toHoursLegacy(row.punch_in_time, row.punch_out_time, row.status);
      const sqlVal = parseFloat(row.total_hours).toFixed(2);
      if (jsVal !== sqlVal) {
        console.error(`Mismatch on row ${row.id}: JS=${jsVal}, SQL=${sqlVal}, in=${row.punch_in_time}, out=${row.punch_out_time}, status=${row.status}`);
        equivalenceMismatches++;
      }
    }

    console.log(`Equivalence check across 1,000 rows: ${equivalenceMismatches} mismatches.`);
    if (equivalenceMismatches > 0) throw new Error(`Found ${equivalenceMismatches} total_hours mathematical discrepancies!`);

    // Clean up test table
    await conn.query("DROP TABLE test_legacy_attendance;");

    console.log("\n================================================================================");
    console.log("HISTORICAL BACKFILL AUDIT PASSED WITH ZERO DISCREPANCIES!");
    console.log("================================================================================");
  } finally {
    conn.release();
    await pool.end();
  }
}

runHistoricalBackfillAudit().catch(err => {
  console.error("FATAL ERROR in backfill audit:", err);
  process.exit(1);
});
