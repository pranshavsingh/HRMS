/**
 * STAGE 2 — SHIFT CONFIGURATION MANAGEMENT TEST SUITE
 * 
 * Target: MariaDB 11.8.9 Disposable Database (127.0.0.1:3307)
 * Scope: CRUD APIs, Immutable Versioning, RBAC, Multi-tenancy, and Roster Integrity
 */

// 1. Configure environment variables BEFORE importing application modules
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_PORT = "3307";
process.env.MYSQL_USER = "root";
process.env.MYSQL_PASSWORD = "";
process.env.MYSQL_DATABASE = "hrms_disposable_test";
process.env.JWT_SECRET = "test-secret-key-stage2-maria11";
process.env.NODE_ENV = "test";

import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

// 2. Dynamic import ensures config reads the overrides above
const { config } = await import("../src/config/env.js");
const { createApp } = await import("../src/app.js");
const { closePool } = await import("../src/db/index.js");

function generateToken(userId, role) {
  return jwt.sign(
    { userId, role, type: "access" },
    config.jwtSecret,
    { expiresIn: "1h", algorithm: "HS256" }
  );
}

// User tokens
const superadminToken = generateToken(1, "superadmin");
const adminToken = generateToken(4, "admin");
const hrToken = generateToken(8, "hr");
const managerToken = generateToken(15, "manager");
const employeeToken = generateToken(20, "employee");

let server;
let baseUrl;
let dbConn;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    testsFailed++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    testsPassed++;
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function api(path, { method = "GET", token, body, headers = {} } = {}) {
  const reqHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

async function runTests() {
  console.log("==============================================================================");
  console.log("  STAGE 2: SHIFT CONFIGURATION MANAGEMENT — AUTOMATED VALIDATION SUITE");
  console.log("==============================================================================");
  console.log(`Database Target: ${config.mysqlHost}:${config.mysqlPort}/${config.mysqlDatabase}`);

  // 1. Establish direct database connection for assertions
  dbConn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3307,
    user: "root",
    password: "",
    database: "hrms_disposable_test",
  });
  console.log("Connected to disposable MariaDB 11.8.9 at 127.0.0.1:3307");

  // Clean up any previous test shifts if left over
  await dbConn.query("DELETE FROM workforce_shift_version WHERE shift_id IN (SELECT id FROM workforce_shift WHERE code LIKE 'STG2_%')");
  await dbConn.query("DELETE FROM workforce_shift WHERE code LIKE 'STG2_%'");

  // 2. Start Express app on ephemeral port
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`App running for test execution at ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: ROLE-BASED ACCESS CONTROL (RBAC)
    // -------------------------------------------------------------------------
    console.log("--- TEST GROUP 1: ROLE-BASED ACCESS CONTROL (RBAC) ---");

    // T01: Unauthenticated request rejected
    const t01 = await api("/api/v1/shifts");
    assert(t01.status === 401, "T01: Unauthenticated request rejected with HTTP 401");

    // T02: Employee role rejected
    const t02 = await api("/api/v1/shifts", { token: employeeToken });
    assert(t02.status === 403, `T02: Employee role rejected with HTTP 403 Forbidden (got ${t02.status})`);

    // T03: Manager role rejected
    const t03 = await api("/api/v1/shifts", { token: managerToken });
    assert(t03.status === 403, `T03: Manager role rejected with HTTP 403 Forbidden (got ${t03.status})`);

    // T04: HR role permitted
    const t04 = await api("/api/v1/shifts", { token: hrToken });
    assert(t04.status === 200, "T04: HR role permitted with HTTP 200 OK");

    // T05: Admin role permitted
    const t05 = await api("/api/v1/shifts", { token: adminToken });
    assert(t05.status === 200, "T05: Admin role permitted with HTTP 200 OK");

    // T06: Superadmin role permitted
    const t06 = await api("/api/v1/shifts", { token: superadminToken });
    assert(t06.status === 200, "T06: Superadmin role permitted with HTTP 200 OK");

    // -------------------------------------------------------------------------
    // TEST GROUP 2: MULTI-TENANT ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: MULTI-TENANT ISOLATION ---");

    // T07: Tenant 1 user sees only Tenant 1 shifts
    const t07 = await api("/api/v1/shifts", { token: hrToken });
    assert(t07.status === 200, "T07: Tenant 1 HR retrieves shifts");
    const t1Codes = t07.data.items.map((s) => s.code);
    assert(t1Codes.includes("DAY_SHIFT") && !t1Codes.includes("T2_MORNING"), "T07: Tenant 1 cannot see Tenant 2 shifts ('T2_MORNING' not in results)");

    // T08: Superadmin can inspect Tenant 2 with X-Tenant-ID
    const t08 = await api("/api/v1/shifts", { token: superadminToken, headers: { "X-Tenant-ID": "2" } });
    assert(t08.status === 200, "T08: Superadmin can inspect Tenant 2 shifts");
    const t2Codes = t08.data.items.map((s) => s.code);
    assert(t2Codes.includes("T2_MORNING") && !t2Codes.includes("DAY_SHIFT"), "T08: Superadmin sees Tenant 2 shift 'T2_MORNING'");

    // T09: Tenant 1 HR cannot spoof X-Tenant-ID to access Tenant 2
    const t09 = await api("/api/v1/shifts", { token: hrToken, headers: { "X-Tenant-ID": "2" } });
    assert(t09.status === 403, "T09: Tenant 1 HR attempting to spoof X-Tenant-ID: 2 rejected with HTTP 403");

    // -------------------------------------------------------------------------
    // TEST GROUP 3: SHIFT CREATION & DURATION / OVERNIGHT CALCULATION
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: SHIFT CREATION & DURATION / OVERNIGHT CALCULATION ---");

    // T10: Create Daytime Shift (08:30 to 17:00 -> 510 minutes, is_overnight = 0)
    const t10 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_DAY",
        name: "Stage 2 Daytime Shift",
        start_time: "08:30:00",
        end_time: "17:00:00",
        late_grace_minutes: 15,
        early_departure_grace_minutes: 10,
        effective_from: "2026-11-16",
      },
    });
    assert(t10.status === 201, `T10: Daytime shift created with HTTP 201 (got ${t10.status}: ${JSON.stringify(t10.data)})`);
    assert(t10.data.code === "STG2_DAY", "T10: Shift code stored as STG2_DAY");
    assert(t10.data.duration_minutes === 510, "T10: Duration correctly calculated as 510 min (8.5 hrs)");
    assert(t10.data.is_overnight === 0 || t10.data.is_overnight === false, "T10: Daytime shift marked is_overnight = 0");
    assert(t10.data.version_number === 1, "T10: Initial version number is 1");
    assert(t10.data.effective_to === null, "T10: Active version has effective_to = NULL");

    const stg2DayId = t10.data.id;

    // T11: Create Overnight Shift (21:30 to 05:30 -> 480 minutes, is_overnight = 1)
    const t11 = await api("/api/v1/shifts", {
      method: "POST",
      token: adminToken,
      body: {
        code: "STG2_NIGHT",
        name: "Stage 2 Overnight Shift",
        start_time: "21:30",
        end_time: "05:30",
        late_grace_minutes: 20,
        early_departure_grace_minutes: 15,
        effective_from: "2026-11-16",
      },
    });
    assert(t11.status === 201, "T11: Overnight shift created with HTTP 201");
    assert(t11.data.duration_minutes === 480, "T11: Overnight duration correctly calculated across midnight (480 min / 8 hrs)");
    assert(t11.data.is_overnight === 1 || t11.data.is_overnight === true, "T11: Overnight shift marked is_overnight = 1");
    assert(t11.data.version_number === 1, "T11: Overnight shift initial version number is 1");

    const stg2NightId = t11.data.id;

    // -------------------------------------------------------------------------
    // TEST GROUP 4: VALIDATION RULES & EDGE CASES
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: VALIDATION RULES & EDGE CASES ---");

    // T12: Duplicate shift code in same tenant rejected
    const t12 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_DAY",
        name: "Duplicate Shift",
        start_time: "09:00",
        end_time: "17:00",
      },
    });
    assert(t12.status === 409, "T12: Duplicate shift code in same tenant rejected with HTTP 409 Conflict");

    // T13: Same code allowed in DIFFERENT tenant (Tenant-scoped uniqueness)
    const t13 = await api("/api/v1/shifts", {
      method: "POST",
      token: superadminToken,
      headers: { "X-Tenant-ID": "2" },
      body: {
        code: "STG2_DAY", // same code in Tenant 2
        name: "Tenant 2 Daytime Shift",
        start_time: "09:00",
        end_time: "17:00",
      },
    });
    assert(t13.status === 201, "T13: Same code STG2_DAY permitted in different tenant (Tenant 2)");

    // Clean up Tenant 2 test shift
    await dbConn.query("DELETE FROM workforce_shift_version WHERE shift_id = ?", [t13.data.id]);
    await dbConn.query("DELETE FROM workforce_shift WHERE id = ?", [t13.data.id]);

    // T14: Identical start and end time (duration 0) rejected
    const t14 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_ZERO",
        name: "Zero Duration Shift",
        start_time: "09:00",
        end_time: "09:00",
      },
    });
    assert(t14.status === 400, "T14: Identical start and end time rejected with HTTP 400");

    // T15: Invalid time format rejected
    const t15 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_INVALID_TIME",
        name: "Invalid Time Shift",
        start_time: "25:99",
        end_time: "17:00",
      },
    });
    assert(t15.status === 400, "T15: Invalid time format (25:99) rejected with HTTP 400");

    // T16: Mismatched duration rejected
    const t16 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_DUR_MISMATCH",
        name: "Mismatched Duration Shift",
        start_time: "09:00",
        end_time: "17:00",
        duration_minutes: 200, // actual is 480
      },
    });
    assert(t16.status === 400, "T16: Duration mismatch between supplied and calculated rejected with HTTP 400");

    // T17: Excessive grace period rejected (> 240 min)
    const t17 = await api("/api/v1/shifts", {
      method: "POST",
      token: hrToken,
      body: {
        code: "STG2_GRACE_ERR",
        name: "Excessive Grace Shift",
        start_time: "09:00",
        end_time: "17:00",
        late_grace_minutes: 300,
      },
    });
    assert(t17.status === 400, "T17: Excessive late grace period (>240m) rejected with HTTP 400");

    // -------------------------------------------------------------------------
    // TEST GROUP 5: IMMUTABLE SHIFT VERSIONING
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: IMMUTABLE SHIFT VERSIONING ---");

    // T18: Update timings generates immutable Version 2 and closes Version 1
    const t18 = await api(`/api/v1/shifts/${stg2DayId}`, {
      method: "PUT",
      token: hrToken,
      body: {
        start_time: "09:00:00",
        end_time: "18:00:00", // changed from 08:30-17:00 (510m) to 09:00-18:00 (540m)
        effective_from: "2026-12-01",
      },
    });
    assert(t18.status === 200, "T18: Shift timings update returned HTTP 200");
    assert(t18.data.version_generated === true, "T18: version_generated flag is true");
    assert(t18.data.version_number === 2, "T18: Current active version is now Version 2");
    assert(t18.data.duration_minutes === 540, "T18: New version has duration 540 min");
    assert(t18.data.effective_from.startsWith("2026-12-01"), "T18: Version 2 effective_from is 2026-12-01");
    assert(t18.data.effective_to === null, "T18: Version 2 effective_to is NULL (active)");

    // Query DB directly to verify Version 1 closing date
    const [v1Rows] = await dbConn.query(
      "SELECT *, CAST(effective_to AS CHAR) AS str_effective_to FROM workforce_shift_version WHERE shift_id = ? AND version_number = 1",
      [stg2DayId]
    );
    assert(v1Rows.length === 1, "T18: Version 1 record persists in database");
    const v1EffectiveTo = v1Rows[0].str_effective_to;
    assert(v1EffectiveTo === "2026-11-30", `T18: Version 1 effective_to properly closed on 2026-11-30 (day before v2), got ${v1EffectiveTo}`);

    // T19: Updating ONLY header info (name/is_active) DOES NOT create a new version
    const t19 = await api(`/api/v1/shifts/${stg2DayId}`, {
      method: "PUT",
      token: hrToken,
      body: {
        name: "Stage 2 Daytime Shift — Revised Title",
      },
    });
    assert(t19.status === 200, "T19: Non-timing update returned HTTP 200");
    assert(t19.data.version_generated === false, "T19: Non-timing update did NOT generate a new version");
    assert(t19.data.version_number === 2, "T19: Version number remains 2");
    assert(t19.data.name === "Stage 2 Daytime Shift — Revised Title", "T19: Header name updated successfully");

    const [allVRows] = await dbConn.query(
      "SELECT COUNT(*) AS total FROM workforce_shift_version WHERE shift_id = ?",
      [stg2DayId]
    );
    assert(allVRows[0].total === 2, "T19: Exact version count remains 2 (no spurious versions generated)");

    // -------------------------------------------------------------------------
    // TEST GROUP 6: HISTORICAL ROSTER ENTRY SNAPSHOT INTEGRITY
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 6: HISTORICAL ROSTER ENTRY SNAPSHOT INTEGRITY ---");

    // T20: Existing roster entry 100 points to Shift 10 Version 10
    const [beforeRoster] = await dbConn.query(
      "SELECT id, shift_id, shift_version_id FROM workforce_roster_entry WHERE id = 100"
    );
    assert(beforeRoster.length === 1, "T20: Roster entry 100 exists");
    const origShiftId = beforeRoster[0].shift_id;
    const origVersionId = beforeRoster[0].shift_version_id;

    // Now update Shift 10 timings
    const t20 = await api(`/api/v1/shifts/${origShiftId}`, {
      method: "PUT",
      token: adminToken,
      body: {
        start_time: "10:00:00",
        end_time: "18:00:00",
        effective_from: "2026-12-15",
      },
    });
    assert(t20.status === 200, "T20: Shift 10 timings updated with HTTP 200");
    assert(t20.data.version_number === 2, "T20: Shift 10 now has Version 2");

    // Verify roster entry 100 STILL points to the original shift_version_id!
    const [afterRoster] = await dbConn.query(
      "SELECT id, shift_id, shift_version_id FROM workforce_roster_entry WHERE id = 100"
    );
    assert(
      afterRoster[0].shift_version_id === origVersionId,
      `T20: Historical roster entry 100 preserved snapshot version ${origVersionId} (NOT mutated to new version)`
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 7: SHIFT STATUS TOGGLE (ACTIVATE / DEACTIVATE)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 7: SHIFT STATUS TOGGLE (ACTIVATE / DEACTIVATE) ---");

    // T21: Deactivate shift
    const t21 = await api(`/api/v1/shifts/${stg2NightId}/status`, {
      method: "PATCH",
      token: hrToken,
      body: { is_active: false },
    });
    assert(t21.status === 200, "T21: Deactivate status request returned HTTP 200");
    assert(t21.data.is_active === 0 || t21.data.is_active === false, "T21: Shift is_active is now false");

    // T22: Reactivate shift
    const t22 = await api(`/api/v1/shifts/${stg2NightId}/status`, {
      method: "PATCH",
      token: hrToken,
      body: { is_active: true },
    });
    assert(t22.status === 200, "T22: Reactivate status request returned HTTP 200");
    assert(t22.data.is_active === 1 || t22.data.is_active === true, "T22: Shift is_active is now true");

    // -------------------------------------------------------------------------
    // TEST GROUP 8: SHIFT VERSION HISTORY API
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 8: SHIFT VERSION HISTORY API ---");

    // T23: Retrieve version history for STG2_DAY (has 2 versions)
    const t23 = await api(`/api/v1/shifts/${stg2DayId}/versions`, { token: hrToken });
    assert(t23.status === 200, "T23: Retrieved shift version history with HTTP 200");
    assert(t23.data.versions.length === 2, "T23: Exactly 2 versions returned in history");
    assert(t23.data.versions[0].version_number === 2, "T23: Most recent version (v2) is first");
    assert(t23.data.versions[1].version_number === 1, "T23: Historical version (v1) is second");
    assert(t23.data.versions[1].effective_to !== null, "T23: Historical version v1 has non-null effective_to");

    // -------------------------------------------------------------------------
    // TEST GROUP 9: SHIFT DELETION & INTEGRITY PROTECTION
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 9: SHIFT DELETION & INTEGRITY PROTECTION ---");

    // T24: Deletion blocked for shift referenced by roster entries (Shift 10)
    const t24 = await api(`/api/v1/shifts/${origShiftId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert(t24.status === 409, "T24: Deleting referenced Shift 10 blocked with HTTP 409 Conflict");
    assert(t24.data.error.includes("referenced"), "T24: Error explicitly states shift is referenced by roster entries");

    // T25: Deletion succeeds for unreferenced shift (STG2_NIGHT)
    const t25 = await api(`/api/v1/shifts/${stg2NightId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert(t25.status === 200, "T25: Unreferenced shift STG2_NIGHT successfully deleted with HTTP 200");

    const [deletedShift] = await dbConn.query("SELECT * FROM workforce_shift WHERE id = ?", [stg2NightId]);
    assert(deletedShift.length === 0, "T25: Shift row purged from workforce_shift");

    const [deletedVersions] = await dbConn.query("SELECT * FROM workforce_shift_version WHERE shift_id = ?", [stg2NightId]);
    assert(deletedVersions.length === 0, "T25: Shift versions purged from workforce_shift_version");

    // Clean up STG2_DAY test shift
    await dbConn.query("DELETE FROM workforce_shift_version WHERE shift_id = ?", [stg2DayId]);
    await dbConn.query("DELETE FROM workforce_shift WHERE id = ?", [stg2DayId]);

    // Restore Shift 10 back to single version for clean disposable state
    await dbConn.query("DELETE FROM workforce_shift_version WHERE shift_id = ? AND version_number = 2", [origShiftId]);
    try {
      await dbConn.query("UPDATE workforce_shift_version SET effective_to = NULL WHERE id = ?", [origVersionId]);
    } catch (err) {
      // Immutability trigger trg_wsv_prevent_published_update strictly prevents reopening closed versions
      assert(err.message.includes("DATA INTEGRITY VIOLATION"), "Teardown assertion: Trigger prevented illegal reopening of closed version");
    }

    console.log("\n==============================================================================");
    console.log(`  ALL ${testsPassed} TESTS COMPLETED SUCCESSFULLY! (${testsFailed} failures)`);
    console.log("==============================================================================");
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (dbConn) {
      await dbConn.end();
    }
    await closePool();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
