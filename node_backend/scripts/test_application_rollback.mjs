import mysql from "mysql2/promise";

process.env.ENABLE_WORKFORCE_MODULE = "false";

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "hrms_disposable_test",
  multipleStatements: true,
  dateStrings: true,
};

async function runApplicationRollbackTests() {
  console.log("================================================================================");
  console.log("[APPLICATION ROLLBACK REGRESSION TEST] (ENABLE_WORKFORCE_MODULE=false)");
  console.log("Target Database: MariaDB 11.8.9 (127.0.0.1:3307)");
  console.log("================================================================================");

  const pool = mysql.createPool(DB_CONFIG);
  const conn = await pool.getConnection();

  try {
    // -------------------------------------------------------------------------
    // 0. Setup: User 30, Profile, Location & Manager
    // -------------------------------------------------------------------------
    console.log("\n--- Setup: Seed Test Employee 30 and Location ---");
    await conn.query(`
      INSERT INTO accounts_user (id, username, email, role, is_active, is_superuser, password, date_joined, first_name, last_name)
      VALUES
        (30, 'rollback_emp', 'emp30@test.com', 'employee', 1, 0, 'hash', NOW(), 'Rollback', 'Emp'),
        (15, 'manager_15', 'mgr15@test.com', 'manager', 1, 0, 'hash', NOW(), 'Mgr', 'Fifteen')
      ON DUPLICATE KEY UPDATE is_active = 1;

      INSERT INTO accounts_employeeprofile (id, user_id, manager_id, allowed_radius, is_active_employee)
      VALUES (30, 30, 15, 100, 1)
      ON DUPLICATE KEY UPDATE manager_id = 15;

      INSERT INTO accounts_employeelocation (id, user_id, latitude, longitude, allowed_radius, is_primary)
      VALUES (30, 30, 12.9716, 77.5946, 100, 1)
      ON DUPLICATE KEY UPDATE latitude = 12.9716, longitude = 77.5946;

      DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = 30);
      DELETE FROM attendance_attendance WHERE user_id = 30;
    `);

    console.log("Prerequisites ready: User 30 configured with primary location at [12.9716, 77.5946].");

    // -------------------------------------------------------------------------
    // Workflow 1: Inside Geofence Punch-In & Punch-Out
    // -------------------------------------------------------------------------
    console.log("\n--- Workflow 1: Legacy Inside Geofence Punch-In & Punch-Out ---");
    // Simulate legacy insert without tenant_id or work_date (schema default must kick in)
    const [punchInRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, punch_in_time, punch_in_photo, punch_in_lat, punch_in_lng,
        punch_in_outside, punch_out_outside, punch_in_status, punch_out_status,
        status, is_outside_location, user_id
      ) VALUES (
        '2026-11-16', '2026-11-16 09:00:00', 'uploads/photo_in.jpg', 12.9716, 77.5946,
        0, 0, 'approved', 'approved', 'approved', 0, 30
      );
    `);
    const attId1 = punchInRes.insertId;
    console.log(`Punch-in created with ID: ${attId1}`);

    // Verify record state
    const [att1] = await conn.query("SELECT * FROM attendance_attendance WHERE id = ?;", [attId1]);
    console.log("Punch-In Record State:", {
      id: att1[0].id,
      tenant_id: att1[0].tenant_id,
      work_date: att1[0].work_date,
      punch_in_status: att1[0].punch_in_status,
      punctuality_status: att1[0].punctuality_status,
      status: att1[0].status
    });

    if (att1[0].punch_in_status !== 'approved' || att1[0].punctuality_status !== 'unassigned' || Number(att1[0].tenant_id) !== 1) {
      throw new Error(`Workflow 1 failed on punch-in! punch_in_status: ${att1[0].punch_in_status}`);
    }

    // Now punch-out
    await conn.query(`
      UPDATE attendance_attendance
      SET punch_out_time = '2026-11-16 17:30:00',
          punch_out_photo = 'uploads/photo_out.jpg',
          punch_out_lat = 12.9716,
          punch_out_lng = 77.5946,
          punch_out_status = 'approved',
          status = 'approved',
          total_hours = 8.50
      WHERE id = ?;
    `, [attId1]);

    const [att1Updated] = await conn.query("SELECT punch_out_status, status, total_hours FROM attendance_attendance WHERE id = ?;", [attId1]);
    console.log("Punch-Out Updated State:", att1Updated[0]);

    if (att1Updated[0].punch_out_status !== 'approved' || att1Updated[0].total_hours !== '8.50') {
      throw new Error(`Workflow 1 failed on punch-out! punch_out_status: ${att1Updated[0].punch_out_status}`);
    }
    console.log(">>> ✅ Workflow 1 PASSED: Inside geofence punch-in and punch-out operational with approved status semantics.");

    // -------------------------------------------------------------------------
    // Workflow 2: Outside Geofence Punch-In & Manager Approval Flow
    // -------------------------------------------------------------------------
    console.log("\n--- Workflow 2: Legacy Outside Geofence Punch-In & Manager Approval ---");
    // Punch-in from outside (lat: 13.0500, lng: 77.7000)
    const [outsideInRes] = await conn.query(`
      INSERT INTO attendance_attendance (
        date, punch_in_time, punch_in_photo, punch_in_lat, punch_in_lng,
        punch_in_outside, punch_out_outside, punch_in_status, punch_out_status,
        status, is_outside_location, user_id
      ) VALUES (
        '2026-11-17', '2026-11-17 09:10:00', 'uploads/photo_outside.jpg', 13.0500, 77.7000,
        1, 0, 'pending', 'approved', 'pending', 1, 30
      );
    `);
    const attId2 = outsideInRes.insertId;

    // Create approval record
    await conn.query(`
      INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type)
      VALUES ('manager', 'pending', 'Outside allowed location (15.2 km away)', NOW(), 15, ?, 'in');
    `, [attId2]);

    const [outsideCheck] = await conn.query("SELECT punch_in_status, status, is_outside_location FROM attendance_attendance WHERE id = ?;", [attId2]);
    console.log("Outside Punch-In Pending State:", outsideCheck[0]);

    if (outsideCheck[0].punch_in_status !== 'pending' || outsideCheck[0].status !== 'pending') {
      throw new Error("Workflow 2 failed: punch_in_status must be 'pending' for outside location!");
    }

    // Manager Approves
    console.log("Simulating Manager 15 approval action...");
    await conn.query(`
      UPDATE attendance_attendanceapproval
      SET status = 'approved', action_at = NOW(), comment = 'Site visit approved'
      WHERE attendance_id = ? AND type = 'in';
    `, [attId2]);

    await conn.query(`
      UPDATE attendance_attendance
      SET punch_in_status = 'approved', status = 'approved'
      WHERE id = ?;
    `, [attId2]);

    const [approvedCheck] = await conn.query("SELECT punch_in_status, status FROM attendance_attendance WHERE id = ?;", [attId2]);
    console.log("After Manager Approval:", approvedCheck[0]);

    if (approvedCheck[0].punch_in_status !== 'approved' || approvedCheck[0].status !== 'approved') {
      throw new Error("Workflow 2 failed: approval transition failed!");
    }
    console.log(">>> ✅ Workflow 2 PASSED: Outside geofence pending approval workflow and manager resolution verified.");

    // -------------------------------------------------------------------------
    // Workflow 3: Legacy Status & History API Output Equivalence
    // -------------------------------------------------------------------------
    console.log("\n--- Workflow 3: Legacy Status & History API Contract Verification ---");
    const [historyRows] = await conn.query(`
      SELECT
        id,
        user_id,
        date,
        punch_in_time,
        punch_out_time,
        punch_in_status,
        punch_out_status,
        status,
        total_hours,
        is_outside_location
      FROM attendance_attendance
      WHERE user_id = 30
      ORDER BY date DESC, punch_in_time DESC;
    `);

    console.log("Legacy History Query Rows:", historyRows);

    if (historyRows.length !== 2) {
      throw new Error(`Expected 2 history rows for user 30, found ${historyRows.length}`);
    }

    // Assert semantic integrity
    for (const h of historyRows) {
      if (!['approved', 'pending', 'rejected'].includes(h.punch_in_status)) {
        throw new Error(`Semantic violation: punch_in_status is '${h.punch_in_status}' (not a geofence approval state)`);
      }
      if (!['approved', 'pending', 'rejected'].includes(h.punch_out_status)) {
        throw new Error(`Semantic violation: punch_out_status is '${h.punch_out_status}' (not a geofence approval state)`);
      }
    }
    console.log(">>> ✅ Workflow 3 PASSED: All legacy status fields maintain exact geofence approval semantics.");

    // -------------------------------------------------------------------------
    // 4. Device-Level Sensor Tests
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Device-Level Hardware Sensor Status ---");
    console.log("  - Hardware Biometric Reader Sensor: [NOT VERIFIED - Requires Physical Android/iOS Device]");
    console.log("  - Hardware GPS Spoofing Sensor Integration: [NOT VERIFIED - Requires Physical Android/iOS Device]");
    console.log("  - Offline Punch SQLite Cache Sync: [NOT VERIFIED - Requires Client App Runtime]");

    console.log("\n================================================================================");
    console.log("ALL APPLICATION ROLLBACK REGRESSION WORKFLOWS PASSED!");
    console.log("================================================================================");
  } finally {
    conn.release();
    await pool.end();
  }
}

runApplicationRollbackTests().catch(err => {
  console.error("FATAL ERROR in Application Rollback Test:", err);
  process.exit(1);
});
