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
  console.log("[CONCURRENCY TEST C-06] Multi-Client Monotonic Ascending Deadlock Avoidance");
  console.log("================================================================================");
  console.log("Script: test_c06_deadlock_avoidance_ordering.mjs");
  console.log("Independent Connections: 4 (Competing concurrent swap & multi-row operations)");
  console.log("Synchronization Method: Canonical Ascending ID Sorting ([u1, u2].sort((a,b) => a - b))");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 10 });

  try {
    const setupConn = await pool.getConnection();

    // Ensure users 5, 10, 15, 20 exist in accounts_user and workforce_user_tenant
    await setupConn.query(`
      INSERT INTO accounts_user (id, username, email, role, is_active, is_superuser, password, date_joined, first_name, last_name)
      VALUES
        (5, 'emp_5', 'emp5@test.com', 'employee', 1, 0, 'hash', NOW(), 'Five', 'User'),
        (10, 'emp_10', 'emp10@test.com', 'employee', 1, 0, 'hash', NOW(), 'Ten', 'User'),
        (15, 'emp_15', 'emp15@test.com', 'employee', 1, 0, 'hash', NOW(), 'Fifteen', 'User'),
        (20, 'emp_20', 'emp20@test.com', 'employee', 1, 0, 'hash', NOW(), 'Twenty', 'User')
      ON DUPLICATE KEY UPDATE is_active = 1;

      INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
      VALUES
        (1, 5, 'employee', 1),
        (1, 10, 'employee', 1),
        (1, 15, 'employee', 1),
        (1, 20, 'employee', 1)
      ON DUPLICATE KEY UPDATE is_active = 1;
    `);
    setupConn.release();

    console.log("Prerequisites ready: Users 5, 10, 15, 20 seeded.");

    const executeOrderedMultiLock = async (clientName, requestedUserA, requestedUserB) => {
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        await conn.beginTransaction();

        // Monotonic Canonical Ordering: always acquire locks in ascending order
        const [firstId, secondId] = [requestedUserA, requestedUserB].sort((a, b) => a - b);

        console.log(`[${clientName}] Requested (${requestedUserA}, ${requestedUserB}). Sorted -> Locking ${firstId} first, then ${secondId}...`);
        
        await conn.query("SELECT user_id FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = ? FOR UPDATE;", [firstId]);
        
        // Introduce small jitter to maximize potential deadlock window if ordering were not enforced
        await new Promise(r => setTimeout(r, 40));

        await conn.query("SELECT user_id FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = ? FOR UPDATE;", [secondId]);

        // Simulate multi-row update payload
        await new Promise(r => setTimeout(r, 30));

        await conn.commit();
        const durationMs = Date.now() - startTime;
        console.log(`[${clientName}] SUCCESS: Committed both locks in ${durationMs}ms with zero deadlocks.`);
        return { clientName, success: true, durationMs };
      } catch (err) {
        await conn.rollback();
        console.error(`[${clientName}] ERROR: ${err.code} - ${err.message}`);
        return { clientName, success: false, error: err.code, message: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching 4 concurrent clients with intentionally inverted pairwise user requests:");
    console.log("  - Client 1: [10, 20]");
    console.log("  - Client 2: [20, 10] (Inverted pair of Client 1)");
    console.log("  - Client 3: [5, 15]");
    console.log("  - Client 4: [15, 5] (Inverted pair of Client 3)");

    const [res1, res2, res3, res4] = await Promise.all([
      executeOrderedMultiLock("Client 1", 10, 20),
      executeOrderedMultiLock("Client 2", 20, 10),
      executeOrderedMultiLock("Client 3", 5, 15),
      executeOrderedMultiLock("Client 4", 15, 5)
    ]);

    console.log("\n--- Execution Results ---");
    console.log("Client 1:", res1);
    console.log("Client 2:", res2);
    console.log("Client 3:", res3);
    console.log("Client 4:", res4);

    const allSuccessful = [res1, res2, res3, res4].every(r => r.success);
    const deadlockCount = [res1, res2, res3, res4].filter(r => r.error === 'ER_LOCK_DEADLOCK' || (r.message && r.message.includes('Deadlock'))).length;

    console.log(`\nDeadlocks Encountered: ${deadlockCount}`);

    if (allSuccessful && deadlockCount === 0) {
      console.log("\n>>> ✅ TEST C-06 PASSED: All 4 concurrent transactions committed cleanly without deadlocks. Deterministic ascending ID sorting eliminated cycle conditions.");
    } else {
      throw new Error(`TEST C-06 FAILED! Deadlock or error occurred: ${JSON.stringify([res1, res2, res3, res4])}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-06:", err);
  process.exit(1);
});
