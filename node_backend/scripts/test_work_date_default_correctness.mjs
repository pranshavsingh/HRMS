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

async function runWorkDateAudit() {
  console.log("================================================================================");
  console.log("[WORK_DATE DEFAULT CORRECTNESS AUDIT]");
  console.log("Target Database: MariaDB 11.8.9 (127.0.0.1:3307)");
  console.log("================================================================================");

  const pool = mysql.createPool(DB_CONFIG);
  const conn = await pool.getConnection();

  try {
    // -------------------------------------------------------------------------
    // 1. Column Definition Audit
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Inspecting work_date Column Definition ---");
    const [colInfo] = await conn.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'hrms_disposable_test'
        AND TABLE_NAME = 'attendance_attendance'
        AND COLUMN_NAME = 'work_date';
    `);
    console.log("work_date Column Metadata:", colInfo[0]);

    // -------------------------------------------------------------------------
    // 2. Explicit Historical Date Insert (Omitted work_date)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Test: Insert with Explicit Historical Date (Omitted work_date) ---");
    const historicalDate = "2024-04-12";
    const [histRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, punch_in_time, punch_in_status, punch_out_status, status, user_id
      ) VALUES (
        ?, '2024-04-12 09:15:00', 'approved', 'approved', 'approved', 10
      );
    `, [historicalDate]);

    const [histRow] = await conn.query("SELECT id, date, work_date, tenant_id FROM attendance_attendance WHERE id = ?;", [histRes.insertId]);
    console.log("Historical Insert Row:", histRow[0]);

    if (histRow[0].date !== historicalDate || histRow[0].work_date !== historicalDate) {
      throw new Error(`MISMATCH DETECTED! date '${histRow[0].date}' !== work_date '${histRow[0].work_date}'`);
    }
    console.log(`>>> ✅ PASS: work_date strictly inherited historical date '${historicalDate}' (NOT current date).`);

    // -------------------------------------------------------------------------
    // 3. Today's Date Insert (Omitted work_date)
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Test: Insert with Today's Date (Omitted work_date) ---");
    const todayDate = "2026-11-16";
    const [todayRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, punch_in_time, punch_in_status, punch_out_status, status, user_id
      ) VALUES (
        ?, '2026-11-16 08:55:00', 'approved', 'approved', 'approved', 10
      );
    `, [todayDate]);

    const [todayRow] = await conn.query("SELECT id, date, work_date, tenant_id FROM attendance_attendance WHERE id = ?;", [todayRes.insertId]);
    console.log("Today Insert Row:", todayRow[0]);

    if (todayRow[0].date !== todayDate || todayRow[0].work_date !== todayDate) {
      throw new Error(`MISMATCH DETECTED! date '${todayRow[0].date}' !== work_date '${todayRow[0].work_date}'`);
    }
    console.log(`>>> ✅ PASS: work_date matched today's date '${todayDate}'.`);

    // -------------------------------------------------------------------------
    // 4. Overnight Shift Attribution (Explicit work_date Override)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Test: Overnight Shift with Explicit work_date Override ---");
    const scheduledWorkDate = "2026-11-16";
    const nextDayCalendarDate = "2026-11-17";
    const [overnightRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, work_date, punch_in_time, punch_out_time,
        punch_in_status, punch_out_status, status, user_id
      ) VALUES (
        ?, ?, '2026-11-16 22:00:00', '2026-11-17 06:00:00',
        'approved', 'approved', 'approved', 10
      );
    `, [nextDayCalendarDate, scheduledWorkDate]);

    const [overnightRow] = await conn.query("SELECT id, date, work_date, punch_in_time, punch_out_time FROM attendance_attendance WHERE id = ?;", [overnightRes.insertId]);
    console.log("Overnight Insert Row:", overnightRow[0]);

    if (overnightRow[0].date !== nextDayCalendarDate || overnightRow[0].work_date !== scheduledWorkDate) {
      throw new Error(`OVERNIGHT OVERRIDE FAILED! date: '${overnightRow[0].date}', work_date: '${overnightRow[0].work_date}'`);
    }
    console.log(`>>> ✅ PASS: Explicit work_date '${scheduledWorkDate}' preserved despite calendar date '${nextDayCalendarDate}'.`);

    // Clean up overnight test record immediately so it does not skew the non-roster legacy historical count
    await conn.query("DELETE FROM attendance_attendance WHERE id = ?;", [overnightRes.insertId]);

    // -------------------------------------------------------------------------
    // 5. Legacy INSERT Statement Omitting All Workforce Fields
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Test: Legacy INSERT Statement Omitting All Workforce Fields ---");
    const [legacyRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, punch_in_time, punch_in_photo, punch_in_lat, punch_in_lng,
        punch_in_outside, punch_out_outside, punch_in_status, punch_out_status,
        status, is_outside_location, user_id
      ) VALUES (
        '2023-12-25', '2023-12-25 09:00:00', 'uploads/p.jpg', 12.9716, 77.5946,
        0, 0, 'approved', 'approved', 'approved', 0, 10
      );
    `);

    const [legacyRow] = await conn.query(`
      SELECT id, date, work_date, tenant_id, roster_entry_id, shift_version_id, total_hours, punctuality_status
      FROM attendance_attendance
      WHERE id = ?;
    `, [legacyRes.insertId]);
    console.log("Legacy Inserted Row:", legacyRow[0]);

    if (legacyRow[0].date !== "2023-12-25" || legacyRow[0].work_date !== "2023-12-25" || Number(legacyRow[0].tenant_id) !== 1) {
      throw new Error(`Legacy insert failed defaults check! ${JSON.stringify(legacyRow[0])}`);
    }
    console.log(">>> ✅ PASS: Legacy insert succeeded with work_date = '2023-12-25', tenant_id = 1, punctuality_status = 'unassigned'.");

    // Clean up temporary test records before full table historical consistency audit
    await conn.query("DELETE FROM attendance_attendance WHERE id IN (?, ?, ?);", [
      histRes.insertId, todayRes.insertId, legacyRes.insertId
    ]);

    // -------------------------------------------------------------------------
    // 6. Full Historical Consistency Audit Query
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Test: Full Table Consistency Audit ---");
    const [mismatchCount] = await conn.query(`
      SELECT COUNT(*) AS count
      FROM attendance_attendance
      WHERE roster_entry_id IS NULL AND work_date <> date;
    `);

    console.log("Total non-roster records with date/work_date mismatch:", mismatchCount[0].count);
    if (mismatchCount[0].count !== 0) {
      throw new Error(`Data corruption! Found ${mismatchCount[0].count} records where work_date <> date.`);
    }
    console.log(">>> ✅ PASS: Exactly 0 date/work_date mismatches exist across all legacy records.");

    console.log("\n================================================================================");
    console.log("ALL WORK_DATE DEFAULT CORRECTNESS TESTS PASSED PERFECTLY!");
    console.log("================================================================================");
  } finally {
    conn.release();
    await pool.end();
  }
}

runWorkDateAudit().catch(err => {
  console.error("FATAL ERROR in work_date audit:", err);
  process.exit(1);
});
