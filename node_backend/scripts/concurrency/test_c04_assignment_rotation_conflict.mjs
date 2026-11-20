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
  console.log("[CONCURRENCY TEST C-04] Fixed Assignment vs Rotation Enrollment Mutual Exclusivity");
  console.log("================================================================================");
  console.log("Script: test_c04_assignment_rotation_conflict.mjs");
  console.log("Independent Connections: 2 (Connection 1: Fixed Assignment Assigner, Connection 2: Rotation Assigner)");
  console.log("Synchronization Method: Parent User Mutex Locking (SELECT ... FROM workforce_user_tenant FOR UPDATE)");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 });

  try {
    const setupConn = await pool.getConnection();

    // Clean up assignments & rotations for User 10
    await setupConn.query(`
      DELETE FROM workforce_employee_fixed_assignment WHERE user_id = 10;
      DELETE FROM workforce_employee_rotation WHERE user_id = 10;
      
      -- Ensure Shift 10 and Rotation 1 exist
      INSERT INTO workforce_shift (id, tenant_id, code, name) VALUES (10, 1, 'DAY', 'Day Shift')
      ON DUPLICATE KEY UPDATE name = 'Day Shift';

      INSERT INTO workforce_shift_version (id, tenant_id, shift_id, version_number, start_time, end_time, duration_minutes, effective_from)
      VALUES (10, 1, 10, 1, '09:00:00', '17:00:00', 480, '2026-01-01')
      ON DUPLICATE KEY UPDATE duration_minutes = 480;

      INSERT INTO workforce_rotation_definition (id, tenant_id, code, name)
      VALUES (1, 1, 'ROT_WEEKLY', 'Weekly Day/Night Rotation')
      ON DUPLICATE KEY UPDATE name = 'Weekly Day/Night Rotation';
    `);
    setupConn.release();

    console.log("Prerequisites ready for User 10.");

    // Connection 1: Assigns Fixed Shift 10 to User 10
    const assignFixedShift = async () => {
      const conn = await pool.getConnection();
      try {
        console.log("[Fixed Assigner] Starting transaction. Acquiring mutex lock on User 10...");
        await conn.beginTransaction();

        await conn.query("SELECT user_id FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = 10 FOR UPDATE;");
        console.log("[Fixed Assigner] Acquired mutex lock on User 10.");

        // Check for active rotation
        const [activeRot] = await conn.query(
          "SELECT id FROM workforce_employee_rotation WHERE tenant_id = 1 AND user_id = 10 AND is_active = 1;"
        );

        if (activeRot.length > 0) {
          await conn.rollback();
          return { op: "FixedAssign", status: 409, message: "User already enrolled in rotation" };
        }

        // Simulate policy check delay
        await new Promise(r => setTimeout(r, 100));

        await conn.query(`
          INSERT INTO workforce_employee_fixed_assignment (tenant_id, user_id, shift_id, effective_from, is_active)
          VALUES (1, 10, 10, '2026-12-01', 1);
        `);

        await conn.commit();
        console.log("[Fixed Assigner] Successfully assigned Fixed Shift 10. Mutex lock released.");
        return { op: "FixedAssign", status: 200, message: "Fixed shift assigned successfully" };
      } catch (err) {
        await conn.rollback();
        return { op: "FixedAssign", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    // Connection 2: Enrolls User 10 in Rotation 1 concurrently
    const enrollInRotation = async () => {
      // Delay slightly so Connection 1 acquires lock first
      await new Promise(r => setTimeout(r, 20));
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        console.log("[Rotation Assigner] Starting transaction. Requesting mutex lock on User 10...");
        await conn.beginTransaction();

        // Will block on user mutex until Connection 1 commits
        await conn.query("SELECT user_id FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = 10 FOR UPDATE;");
        const lockWaitMs = Date.now() - startTime;
        console.log(`[Rotation Assigner] Acquired mutex lock after ${lockWaitMs}ms wait. Checking active fixed assignments...`);

        // Check for active fixed assignment
        const [activeFixed] = await conn.query(
          "SELECT id FROM workforce_employee_fixed_assignment WHERE tenant_id = 1 AND user_id = 10 AND is_active = 1;"
        );

        if (activeFixed.length > 0) {
          console.log("[Rotation Assigner] Mutual exclusivity violation detected: User 10 already has active fixed assignment. Aborting with 409 Conflict.");
          await conn.rollback();
          return { op: "RotationAssign", status: 409, lockWaitMs, message: "Conflict: User already assigned to active fixed shift" };
        }

        await conn.query(`
          INSERT INTO workforce_employee_rotation (tenant_id, user_id, rotation_id, start_date, initial_step_order, is_active)
          VALUES (1, 10, 1, '2026-12-01', 1, 1);
        `);

        await conn.commit();
        return { op: "RotationAssign", status: 200, lockWaitMs, message: "Enrolled in rotation" };
      } catch (err) {
        await conn.rollback();
        return { op: "RotationAssign", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching Fixed Shift Assigner and Rotation Assigner concurrently...");
    const [fixedRes, rotRes] = await Promise.all([
      assignFixedShift(),
      enrollInRotation()
    ]);

    console.log("\n--- Outcomes ---");
    console.log("Fixed Assigner:", fixedRes);
    console.log("Rotation Assigner:", rotRes);

    // Verify DB State
    const verifyConn = await pool.getConnection();
    const [fixedRows] = await verifyConn.query("SELECT id, user_id, shift_id, is_active FROM workforce_employee_fixed_assignment WHERE user_id = 10;");
    const [rotRows] = await verifyConn.query("SELECT id, user_id, rotation_id, is_active FROM workforce_employee_rotation WHERE user_id = 10;");
    verifyConn.release();

    console.log("\n--- Final Database State ---");
    console.log("Active Fixed Assignments:", fixedRows);
    console.log("Active Rotations:", rotRows);

    if (fixedRes.status === 200 && rotRes.status === 409 && fixedRows.length === 1 && rotRows.length === 0) {
      console.log("\n>>> ✅ TEST C-04 PASSED: Parent mutex serialized assignment paths. Mutual exclusivity invariant preserved (1 fixed assignment, 0 rotations, 1 409 Conflict).");
    } else {
      throw new Error(`TEST C-04 FAILED! Unexpected state: ${JSON.stringify({ fixedRes, rotRes, fixedRows, rotRows })}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-04:", err);
  process.exit(1);
});
