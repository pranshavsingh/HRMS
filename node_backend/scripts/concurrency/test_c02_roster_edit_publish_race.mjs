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
  console.log("[CONCURRENCY TEST C-02] Roster Edit vs Publishing In-Flight Collision");
  console.log("================================================================================");
  console.log("Script: test_c02_roster_edit_publish_race.mjs");
  console.log("Independent Connections: 2 (Connection 1: Publisher, Connection 2: Shift Editor)");
  console.log("Synchronization Method: Database Row-Lock Serialization on Header (FOR UPDATE)");

  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 });

  try {
    const setupConn = await pool.getConnection();

    // Ensure prerequisite data exists
    await setupConn.query(`
      INSERT INTO workforce_shift (id, tenant_id, code, name) VALUES (10, 1, 'DAY', 'Day Shift')
      ON DUPLICATE KEY UPDATE name = 'Day Shift';

      INSERT INTO workforce_shift_version (id, tenant_id, shift_id, version_number, start_time, end_time, duration_minutes, effective_from)
      VALUES (10, 1, 10, 1, '09:00:00', '17:00:00', 480, '2026-01-01')
      ON DUPLICATE KEY UPDATE duration_minutes = 480;

      INSERT INTO workforce_shift (id, tenant_id, code, name) VALUES (11, 1, 'EVENING', 'Evening Shift')
      ON DUPLICATE KEY UPDATE name = 'Evening Shift';

      INSERT INTO workforce_shift_version (id, tenant_id, shift_id, version_number, start_time, end_time, duration_minutes, effective_from)
      VALUES (11, 1, 11, 1, '14:00:00', '22:00:00', 480, '2026-01-01')
      ON DUPLICATE KEY UPDATE duration_minutes = 480;

      -- Reset Header 1 to 'draft'
      INSERT INTO workforce_roster_header (id, tenant_id, department_id, start_date, end_date, status, version_number)
      VALUES (1, 1, 10, '2026-12-01', '2026-12-31', 'draft', 1)
      ON DUPLICATE KEY UPDATE status = 'draft', published_by = NULL, published_at = NULL;

      -- Seed an entry under Header 1
      INSERT INTO workforce_roster_entry (id, tenant_id, roster_header_id, user_id, work_date, shift_id, shift_version_id, status)
      VALUES (301, 1, 1, 10, '2026-12-05', 10, 10, 'scheduled')
      ON DUPLICATE KEY UPDATE shift_id = 10, shift_version_id = 10;
    `);
    setupConn.release();

    console.log("Prerequisites ready: Header 1 is 'draft', Entry 301 is Shift 10.");

    // Publisher Function
    const publisherAction = async () => {
      const conn = await pool.getConnection();
      try {
        console.log("[Publisher] Starting transaction, acquiring lock on header 1...");
        await conn.beginTransaction();

        const [h] = await conn.query("SELECT id, status FROM workforce_roster_header WHERE id = 1 AND tenant_id = 1 FOR UPDATE;");
        if (h[0].status !== 'draft') {
          await conn.rollback();
          return { role: "Publisher", status: 409, message: "Not draft" };
        }

        console.log("[Publisher] Acquired lock. Processing publishing payload (holding lock for 120ms)...");
        await new Promise(r => setTimeout(r, 120));

        await conn.query("UPDATE workforce_roster_header SET status = 'published', published_at = NOW(), published_by = 101 WHERE id = 1;");
        await conn.commit();
        console.log("[Publisher] Successfully committed status='published'. Lock released.");
        return { role: "Publisher", status: 200, message: "Published" };
      } catch (err) {
        await conn.rollback();
        return { role: "Publisher", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    // Editor Function (attempts to edit entry 301 shift from 10 to 11 while publish is in-flight)
    const editorAction = async () => {
      // Delay slightly so Publisher acquires lock first
      await new Promise(r => setTimeout(r, 30));
      const conn = await pool.getConnection();
      const startTime = Date.now();
      try {
        console.log("[Editor] Attempting to edit entry 301 to Evening Shift (11). Requesting lock on header 1...");
        await conn.beginTransaction();

        // Must validate header status under exclusive lock
        const [h] = await conn.query("SELECT id, status FROM workforce_roster_header WHERE id = 1 AND tenant_id = 1 FOR UPDATE;");
        const lockWaitMs = Date.now() - startTime;
        console.log(`[Editor] Unblocked and acquired lock after ${lockWaitMs}ms lock wait! Current header status: '${h[0].status}'`);

        if (h[0].status !== 'draft') {
          console.log("[Editor] REJECTED: Header is not draft (status = '" + h[0].status + "'). Aborting edit with 409 Conflict.");
          await conn.rollback();
          return { role: "Editor", status: 409, lockWaitMs, message: "Conflict: Cannot edit published roster" };
        }

        await conn.query("UPDATE workforce_roster_entry SET shift_id = 11, shift_version_id = 11 WHERE id = 301;");
        await conn.commit();
        console.log("[Editor] Committed edit.");
        return { role: "Editor", status: 200, lockWaitMs, message: "Entry updated" };
      } catch (err) {
        await conn.rollback();
        return { role: "Editor", status: 500, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log("Launching Publisher and Editor concurrently...");
    const [pubRes, editRes] = await Promise.all([
      publisherAction(),
      editorAction()
    ]);

    console.log("\n--- Outcomes ---");
    console.log("Publisher:", pubRes);
    console.log("Editor:", editRes);

    // Verify DB State
    const verifyConn = await pool.getConnection();
    const [headerState] = await verifyConn.query("SELECT id, status FROM workforce_roster_header WHERE id = 1;");
    const [entryState] = await verifyConn.query("SELECT id, shift_id, shift_version_id FROM workforce_roster_entry WHERE id = 301;");
    verifyConn.release();

    console.log("\n--- Final Database State ---");
    console.log("Header State:", headerState[0]);
    console.log("Entry 301 State (shift_id should still be 10):", entryState[0]);

    if (pubRes.status === 200 && editRes.status === 409 && entryState[0].shift_id === 10 && headerState[0].status === 'published') {
      console.log("\n>>> ✅ TEST C-02 PASSED: Editor cleanly serialized behind Publisher, blocked on header lock, and was rejected with 409 Conflict. Published roster entry remained intact (shift_id=10).");
    } else {
      throw new Error(`TEST C-02 FAILED! Unexpected state: ${JSON.stringify({ pubRes, editRes, entryState })}`);
    }
  } finally {
    await pool.end();
  }
}

runTest().catch(err => {
  console.error("FATAL ERROR in C-02:", err);
  process.exit(1);
});
