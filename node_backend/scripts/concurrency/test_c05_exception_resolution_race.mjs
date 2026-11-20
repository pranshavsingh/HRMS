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
  console.log("[CONCURRENCY TEST C-05] Concurrent Attribution Exception Resolution Race");
  console.log("================================================================================");
  console.log("Script: test_c05_exception_resolution_race.mjs");
  console.log("Independent Connections: 2 (Connection 1: Manager 101, Connection 2: Manager 102)");
  console.log("Synchronization Method: Database Row-Lock Serialization on Exception Record (FOR UPDATE)");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 });

  try {
    const setupConn = await pool.getConnection();

    // Prerequisite: Ensure prerequisite attendance record and pending exception exist
    await setupConn.query(`
      INSERT INTO attendance_attendance (id, tenant_id, user_id, date, work_date, punch_in_time, punch_in_status, punch_out_status, status, total_hours)
      VALUES (700, 1, 10, '2026-11-16', '2026-11-16', '2026-11-16 09:00:00', 'approved', 'approved', 'approved', 0.0)
      ON DUPLICATE KEY UPDATE work_date = '2026-11-16';

      DELETE FROM workforce_punch_attribution_history WHERE attendance_id = 700;
      DELETE FROM workforce_punch_attribution_candidate WHERE exception_id = 750;
      DELETE FROM workforce_punch_attribution_exception WHERE id = 750;

      INSERT INTO workforce_punch_attribution_exception (
        id, tenant_id, user_id, attendance_id, punch_type, exception_type, status
      ) VALUES (
        750, 1, 10, 700, 'in', 'ambiguous_shift_match', 'pending'
      );
    `);
    setupConn.release();

    console.log("Prerequisites ready: Exception 750 is 'pending'.");

    const resolveException = async (managerId, delayMs) => {
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        console.log(`[Manager ${managerId}] Starting transaction. Requesting row lock on Exception 750...`);
        await conn.beginTransaction();

        const [rows] = await conn.query(
          "SELECT id, status FROM workforce_punch_attribution_exception WHERE id = 750 AND tenant_id = 1 FOR UPDATE;"
        );

        const lockWaitMs = Date.now() - startTime;
        console.log(`[Manager ${managerId}] Acquired lock after ${lockWaitMs}ms wait. Read status = '${rows[0].status}'.`);

        if (rows[0].status !== 'pending') {
          console.log(`[Manager ${managerId}] Pending check failed (status is '${rows[0].status}'). Aborting with 409 Conflict.`);
          await conn.rollback();
          return { managerId, status: 409, lockWaitMs, message: "Conflict: Exception already resolved" };
        }

        // Simulate resolution processing
        await new Promise(r => setTimeout(r, delayMs));

        await conn.query(`
          UPDATE workforce_punch_attribution_exception
          SET status = 'resolved',
              resolved_at = NOW(),
              resolved_by = ?,
              resolution_notes = 'Approved by manager in concurrency test'
          WHERE id = 750 AND status = 'pending';
        `, [managerId]);

        // Insert audit history entry
        await conn.query(`
          INSERT INTO workforce_punch_attribution_history (
            tenant_id, attendance_id, user_id, action, changed_by, reason
          ) VALUES (
            1, 700, 10, 'manager_resolution', ?, 'Resolved via manager action'
          );
        `, [managerId]);

        await conn.commit();
        console.log(`[Manager ${managerId}] Committed resolution. Released lock.`);
        return { managerId, status: 200, lockWaitMs, message: "Exception resolved successfully" };
      } catch (err) {
        await conn.rollback();
        return { managerId, status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching Manager 101 and Manager 102 concurrently...");
    const [res1, res2] = await Promise.all([
      resolveException(101, 80),
      resolveException(102, 80)
    ]);

    console.log("\n--- Execution Results ---");
    console.log("Manager 101 Outcome:", res1);
    console.log("Manager 102 Outcome:", res2);

    const verifyConn = await pool.getConnection();
    const [finalExc] = await verifyConn.query("SELECT id, status, resolved_by, resolved_at FROM workforce_punch_attribution_exception WHERE id = 750;");
    const [historyRows] = await verifyConn.query("SELECT id, action, changed_by FROM workforce_punch_attribution_history WHERE attendance_id = 700;");
    verifyConn.release();

    console.log("\n--- Final Database State ---");
    console.log("Exception 750 Record:", finalExc[0]);
    console.log("History Entries (count should be 1):", historyRows);

    const successes = [res1, res2].filter(r => r.status === 200).length;
    const conflicts = [res1, res2].filter(r => r.status === 409).length;

    if (successes === 1 && conflicts === 1 && finalExc[0].status === 'resolved' && historyRows.length === 1) {
      console.log("\n>>> ✅ TEST C-05 PASSED: Exactly 1 manager succeeded (200), second rejected with 409 Conflict. History ledger has exactly 1 immutable entry.");
    } else {
      throw new Error(`TEST C-05 FAILED! Unexpected state: ${JSON.stringify({ res1, res2, finalExc, historyRows })}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-05:", err);
  process.exit(1);
});
