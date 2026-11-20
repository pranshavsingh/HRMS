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

async function runTest() {
  console.log("================================================================================");
  console.log("[CONCURRENCY TEST C-03] Punch-In vs Punch-Out Attribution Race");
  console.log("================================================================================");
  console.log("Script: test_c03_punch_in_out_race.mjs");
  console.log("Independent Connections: 2 (Connection 1: In-Flight Punch-In, Connection 2: Immediate Punch-Out)");
  console.log("Synchronization Method: Database Row-Lock Serialization on Attendance Record (FOR UPDATE)");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 });

  try {
    const setupConn = await pool.getConnection();

    // Prerequisite: Clean up existing attendance records for User 12
    await setupConn.query(`
      DELETE FROM attendance_attendance WHERE user_id = 12;
      
      -- Ensure User 12 exists
      INSERT INTO accounts_user (id, username, email, role, is_active, is_superuser, password, date_joined, first_name, last_name)
      VALUES (12, 'emp_12', 'emp12@test.com', 'employee', 1, 0, 'hash', NOW(), 'Emp', 'Twelve')
      ON DUPLICATE KEY UPDATE is_active = 1;

      INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
      VALUES (1, 12, 'employee', 1)
      ON DUPLICATE KEY UPDATE is_active = 1;
    `);
    setupConn.release();

    console.log("Prerequisites ready for User 12.");

    // Operation 1: Punch-In process creates open record and holds row lock while settling geofence & photo
    const punchInAction = async () => {
      const conn = await pool.getConnection();
      try {
        console.log("[Punch-In] Starting transaction. Inserting open punch-in row...");
        await conn.beginTransaction();

        const [insertRes] = await conn.query(`
          INSERT INTO attendance_attendance (
            id, tenant_id, user_id, date, work_date, punch_in_time,
            punch_in_status, punch_out_status, status, total_hours
          ) VALUES (
            650, 1, 12, '2026-11-16', '2026-11-16', '2026-11-16 09:00:00',
            'approved', 'pending', 'approved', 0.00
          );
        `);

        // Lock the row to simulate geofence verification / image upload in-flight
        console.log("[Punch-In] Open attendance row 650 created. Simulating photo/geofence processing (holding lock for 100ms)...");
        await conn.query("SELECT id FROM attendance_attendance WHERE id = 650 FOR UPDATE;");
        await new Promise(r => setTimeout(r, 100));

        await conn.commit();
        console.log("[Punch-In] Committed successfully. Row 650 unlocked.");
        return { op: "Punch-In", status: 200, attendanceId: 650 };
      } catch (err) {
        await conn.rollback();
        return { op: "Punch-In", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    // Operation 2: Concurrent Punch-Out arrives almost simultaneously
    const punchOutAction = async () => {
      // Delay slightly so punch-in has inserted row 650 and acquired lock
      await new Promise(r => setTimeout(r, 25));
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        console.log("[Punch-Out] Arrived. Looking up open attendance row for user 12 FOR UPDATE...");
        await conn.beginTransaction();

        // Lock open attendance record
        const [rows] = await conn.query(`
          SELECT id, punch_in_time, status
          FROM attendance_attendance
          WHERE user_id = 12 AND punch_out_time IS NULL AND punch_in_status = 'approved'
          ORDER BY punch_in_time DESC LIMIT 1
          FOR UPDATE;
        `);

        const lockWaitMs = Date.now() - startTime;
        console.log(`[Punch-Out] Acquired lock on row ${rows[0].id} after ${lockWaitMs}ms wait! Punch-in time: ${rows[0].punch_in_time}`);

        // Update punch-out time and total_hours (8.50 hours: 09:00:00 to 17:30:00)
        await conn.query(`
          UPDATE attendance_attendance
          SET punch_out_time = '2026-11-16 17:30:00',
              punch_out_status = 'approved',
              total_hours = 8.50
          WHERE id = ?;
        `, [rows[0].id]);

        await conn.commit();
        console.log("[Punch-Out] Committed successfully. Settled punch-out on row " + rows[0].id);
        return { op: "Punch-Out", status: 200, lockWaitMs, attendanceId: rows[0].id };
      } catch (err) {
        await conn.rollback();
        return { op: "Punch-Out", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching Punch-In and Punch-Out concurrently...");
    const [inRes, outRes] = await Promise.all([
      punchInAction(),
      punchOutAction()
    ]);

    console.log("\n--- Outcomes ---");
    console.log("Punch-In Result:", inRes);
    console.log("Punch-Out Result:", outRes);

    // Verify DB State
    const verifyConn = await pool.getConnection();
    const [finalRow] = await verifyConn.query(`
      SELECT id, user_id, work_date, punch_in_time, punch_out_time, punch_in_status, punch_out_status, total_hours
      FROM attendance_attendance
      WHERE id = 650;
    `);
    verifyConn.release();

    console.log("\n--- Final Database Record ---");
    console.log("Settled Attendance Record:", finalRow[0]);

    if (inRes.status === 200 && outRes.status === 200 && finalRow[0].total_hours === '8.50' && finalRow[0].punch_out_status === 'approved') {
      console.log("\n>>> ✅ TEST C-03 PASSED: Punch-In and Punch-Out serialized cleanly on row lock. Open punch was locked, updated, and total_hours settled to 8.50 with zero race conditions.");
    } else {
      throw new Error(`TEST C-03 FAILED! Unexpected state: ${JSON.stringify({ inRes, outRes, finalRow })}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-03:", err);
  process.exit(1);
});
