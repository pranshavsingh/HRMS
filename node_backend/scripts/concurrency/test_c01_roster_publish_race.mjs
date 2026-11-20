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
  console.log("[CONCURRENCY TEST C-01] Two-Publisher Roster Publishing Race");
  console.log("================================================================================");
  console.log("Script: test_c01_roster_publish_race.mjs");
  console.log("Independent Connections: 2 (Publisher 101, Publisher 102)");
  console.log("Synchronization Method: Database Row-Lock Serialization (SELECT ... FOR UPDATE on header)");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 });

  try {
    const setupConn = await pool.getConnection();

    // Ensure prerequisite tenant and publisher accounts exist
    await setupConn.query(`
      INSERT INTO workforce_tenant (id, code, name) VALUES (1, 'DEFAULT', 'Primary Org')
      ON DUPLICATE KEY UPDATE name = 'Primary Org';

      INSERT INTO accounts_user (id, username, email, role, is_active, is_superuser, password, date_joined, first_name, last_name)
      VALUES
        (101, 'publisher_101', 'pub101@test.com', 'manager', 1, 0, 'hash', NOW(), 'Pub', 'One'),
        (102, 'publisher_102', 'pub102@test.com', 'manager', 1, 0, 'hash', NOW(), 'Pub', 'Two')
      ON DUPLICATE KEY UPDATE is_active = 1;

      INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
      VALUES (1, 101, 'manager', 1), (1, 102, 'manager', 1)
      ON DUPLICATE KEY UPDATE is_active = 1;

      -- Reset Roster Header 1 to 'draft'
      INSERT INTO workforce_roster_header (id, tenant_id, department_id, start_date, end_date, status, version_number)
      VALUES (1, 1, 10, '2026-12-01', '2026-12-31', 'draft', 1)
      ON DUPLICATE KEY UPDATE status = 'draft', published_by = NULL, published_at = NULL;
    `);
    setupConn.release();

    console.log("Prerequisites initialized. Roster header 1 status = 'draft'.");

    const attemptPublish = async (publisherId, delayMs) => {
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        console.log(`[Conn: Pub ${publisherId}] Starting transaction. Requesting row lock on header 1...`);
        await conn.beginTransaction();

        const [rows] = await conn.query(
          "SELECT id, status FROM workforce_roster_header WHERE id = 1 AND tenant_id = 1 FOR UPDATE;"
        );
        const lockAcquiredTime = Date.now();
        const waitTime = lockAcquiredTime - startTime;
        console.log(`[Conn: Pub ${publisherId}] Acquired lock after ${waitTime}ms. Read status = '${rows[0].status}'.`);

        if (rows[0].status !== 'draft') {
          console.log(`[Conn: Pub ${publisherId}] Draft check failed (status is '${rows[0].status}'). Aborting with 409 Conflict.`);
          await conn.rollback();
          return { publisherId, status: 409, waitTime, message: "Conflict: Roster already published" };
        }

        // Simulate publishing payload calculation
        await new Promise(r => setTimeout(r, delayMs));

        await conn.query(
          "UPDATE workforce_roster_header SET status = 'published', published_at = NOW(), published_by = ? WHERE id = 1 AND status = 'draft';",
          [publisherId]
        );
        await conn.commit();
        console.log(`[Conn: Pub ${publisherId}] Committed status='published'. Released row lock.`);
        return { publisherId, status: 200, waitTime, message: "Published successfully" };
      } catch (err) {
        await conn.rollback();
        return { publisherId, status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching Publisher 101 and Publisher 102 concurrently...");
    const [res1, res2] = await Promise.all([
      attemptPublish(101, 80),
      attemptPublish(102, 80)
    ]);

    console.log("\n--- Execution Results ---");
    console.log("Publisher 1 Outcome:", res1);
    console.log("Publisher 2 Outcome:", res2);

    const verifyConn = await pool.getConnection();
    const [finalHeader] = await verifyConn.query(
      "SELECT id, status, published_by, published_at FROM workforce_roster_header WHERE id = 1;"
    );
    verifyConn.release();

    console.log("\n--- Final Database State ---");
    console.log("Header 1 State:", finalHeader[0]);

    const successes = [res1, res2].filter(r => r.status === 200).length;
    const conflicts = [res1, res2].filter(r => r.status === 409).length;

    if (successes === 1 && conflicts === 1 && finalHeader[0].status === 'published') {
      console.log("\n>>> ✅ TEST C-01 PASSED: Exactly 1 publisher succeeded (200), 1 rejected (409 Conflict). Zero double-publish.");
    } else {
      throw new Error(`TEST C-01 FAILED! Outcomes: ${JSON.stringify({ res1, res2, finalHeader })}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-01:", err);
  process.exit(1);
});
