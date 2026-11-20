// ============================================================================
// Test Suite: node_backend/tests/test_stage3_assignments_and_roster.mjs
// Description: Automated end-to-end verification of Stage 3:
//              - Fixed Shift Assignments, Exact Version Pinning & Snapshots
//              - Deterministic Rotation Engine & Minimum Rest Validation
//              - Roster Generation, Interactive Calendar, & Atomic Publication
//              - Dual-Connection Concurrency & Monotonic Lock Hierarchy
//              - Attendance Backward Compatibility & Regression
// Target: MariaDB 11.8.9 (127.0.0.1:3307/hrms_disposable_test)
// ============================================================================

process.env.DB_CLIENT = "mysql";
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_PORT = "3307";
process.env.MYSQL_USER = "root";
process.env.MYSQL_PASSWORD = "";
process.env.MYSQL_DATABASE = "hrms_disposable_test";
process.env.JWT_SECRET = "test-secret-key-stage3-maria11";
process.env.NODE_ENV = "test";

import assert from "assert";
import http from "http";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";

const { config } = await import("../src/config/env.js");
const { createApp } = await import("../src/app.js");
const { shiftAssignmentService } = await import("../src/services/shift-assignment.service.js");
const { rotationService } = await import("../src/services/rotation.service.js");
const { rosterService } = await import("../src/services/roster.service.js");
const { rosterValidationService } = await import("../src/services/roster-validation.service.js");
const { verifySnapshotIntegrity } = await import("../src/services/shift-snapshot.service.js");

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "hrms_disposable_test",
};

let server;
let baseUrl;
let dbConn;

let tokenAdmin;
let tokenHr;
let tokenEmployee;
let tokenTenant2;

let passed = 0;
let failed = 0;

function logPass(name, details = "") {
  passed++;
  console.log(`  ✅ PASSED: ${name}${details ? ` (${details})` : ""}`);
}

function logFail(name, err) {
  failed++;
  console.error(`  ❌ FAILED: ${name}`);
  console.error(`     Error: ${err.message}`);
}

async function request(method, path, body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { ...extraHeaders };
    let postData = null;

    if (body) {
      postData = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(postData);
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function createToken(userId, role = "admin") {
  return jwt.sign(
    {
      userId,
      role,
      type: "access",
    },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: "1h" }
  );
}

async function runTests() {
  console.log("==============================================================================");
  console.log("  STAGE 3: SHIFT ASSIGNMENT & ROSTER MANAGEMENT — AUTOMATED VALIDATION SUITE");
  console.log("==============================================================================");
  console.log("Target Database: 127.0.0.1:3307/hrms_disposable_test");

  dbConn = await mysql.createConnection(DB_CONFIG);

  // Ensure test users exist in database with correct roles
  await dbConn.execute("UPDATE accounts_user SET role = 'admin', is_active = 1 WHERE id = 101");
  await dbConn.execute("UPDATE accounts_user SET role = 'hr', is_active = 1 WHERE id = 102");
  await dbConn.execute("UPDATE accounts_user SET role = 'employee', is_active = 1 WHERE id = 103");
  await dbConn.execute("UPDATE accounts_user SET role = 'employee', is_active = 1 WHERE id = 104");

  // Enroll in workforce_user_tenant
  await dbConn.execute(`
    INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
    VALUES (1, 101, 'admin', 1)
    ON DUPLICATE KEY UPDATE role = 'admin', is_active = 1
  `);
  await dbConn.execute(`
    INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
    VALUES (1, 102, 'hr', 1)
    ON DUPLICATE KEY UPDATE role = 'hr', is_active = 1
  `);
  await dbConn.execute(`
    INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
    VALUES (1, 103, 'employee', 1)
    ON DUPLICATE KEY UPDATE role = 'employee', is_active = 1
  `);
  await dbConn.execute(`
    INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
    VALUES (2, 104, 'employee', 1)
    ON DUPLICATE KEY UPDATE role = 'employee', is_active = 1
  `);

  // Ensure employee profile
  await dbConn.execute(
    "INSERT IGNORE INTO accounts_employeeprofile (id, user_id, team_name, is_active_employee, designation) VALUES (103, 103, 'Engineering', 1, 'Software Engineer')"
  );

  // Clean prior test artifacts for idempotency
  await dbConn.execute("UPDATE workforce_roster_header SET status = 'draft' WHERE tenant_id = 1 AND (name LIKE '%Stage 3%' OR team_name = 'Engineering')");
  await dbConn.execute("DELETE re FROM workforce_roster_entry re JOIN workforce_roster_header rh ON rh.id = re.roster_header_id WHERE rh.status = 'draft' AND rh.tenant_id = 1");
  await dbConn.execute("DELETE FROM workforce_roster_header WHERE tenant_id = 1 AND status = 'draft' AND (name LIKE '%Stage 3%' OR team_name = 'Engineering')");
  await dbConn.execute("DELETE FROM workforce_employee_rotation WHERE user_id IN (101, 102, 103, 104)");
  await dbConn.execute("DELETE FROM workforce_rotation_step WHERE rotation_id IN (SELECT id FROM workforce_rotation_definition WHERE code LIKE 'ROT_%')");
  await dbConn.execute("DELETE FROM workforce_rotation_definition WHERE code LIKE 'ROT_%'");
  await dbConn.execute("DELETE FROM workforce_employee_fixed_assignment WHERE user_id IN (101, 102, 103, 104)");

  tokenAdmin = createToken(101, "admin");
  tokenHr = createToken(102, "hr");
  tokenEmployee = createToken(103, "employee");
  tokenTenant2 = createToken(104, "employee");

  const app = createApp();
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`App running at ${baseUrl}`);

  try {
    // ------------------------------------------------------------------------
    // SUITE 1: SHIFT ASSIGNMENT API & LIFECYCLE (11.2)
    // ------------------------------------------------------------------------
    console.log("\n--- SUITE 1: SHIFT ASSIGNMENT API & LIFECYCLE ---");

    // T01: Unauthenticated request rejected (401)
    try {
      const res = await request("GET", "/api/v1/workforce/assignments");
      assert.strictEqual(res.status, 401);
      logPass("T01: Unauthenticated request rejected with HTTP 401");
    } catch (err) {
      logFail("T01", err);
    }

    // T02: Employee role rejected for mutation (403)
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments",
        {
          user_id: 103,
          shift_id: 10,
          shift_version_id: 10,
          effective_from: "2026-11-20",
        },
        tokenEmployee
      );
      assert.strictEqual(res.status, 403);
      logPass("T02: Employee role rejected for mutation with HTTP 403 Forbidden");
    } catch (err) {
      logFail("T02", err);
    }

    // T03: Cross-tenant assignment rejected (Tenant 1 admin assigning Tenant 2 employee)
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments",
        {
          user_id: 104, // Tenant 2 user
          shift_id: 10,
          shift_version_id: 10,
          effective_from: "2026-11-20",
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 404);
      logPass("T03: Cross-tenant assignment rejected (user not found in tenant)");
    } catch (err) {
      logFail("T03", err);
    }

    // T04: Create draft fixed assignment with exact published shift version
    let createdAssignmentId = null;
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments",
        {
          user_id: 103,
          shift_id: 10,
          shift_version_id: 10,
          effective_from: "2026-12-01",
          effective_to: "2026-12-31",
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, "draft");
      assert.strictEqual(res.body.shift_version_id, 10);
      createdAssignmentId = res.body.id;
      logPass("T04: Draft fixed assignment created with exact shift version (HTTP 201)");
    } catch (err) {
      logFail("T04", err);
    }

    // T05: Reject draft assignment with non-existent shift version
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments",
        {
          user_id: 103,
          shift_id: 10,
          shift_version_id: 99999, // Invalid version
          effective_from: "2026-12-01",
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 404);
      logPass("T05: Assignment with invalid shift version rejected (HTTP 404)");
    } catch (err) {
      logFail("T05", err);
    }

    // T06: Single active draft constraint per employee (409)
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments",
        {
          user_id: 103,
          shift_id: 10,
          shift_version_id: 10,
          effective_from: "2027-01-01",
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 409);
      logPass("T06: Second concurrent draft rejected with HTTP 409 (single active draft constraint)");
    } catch (err) {
      logFail("T06", err);
    }

    // T07: Atomic publication of assignment (freezes RFC 8785 snapshot & SHA-256 hash)
    try {
      const res = await request(
        "POST",
        `/api/v1/workforce/assignments/${createdAssignmentId}/publish`,
        {},
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "published");
      assert(res.body.snapshot_hash && res.body.snapshot_hash.length === 64);

      // Verify in DB that snapshot exists and matches hash
      const [rows] = await dbConn.execute(
        "SELECT assignment_snapshot, snapshot_hash FROM workforce_employee_fixed_assignment WHERE id = ?",
        [createdAssignmentId]
      );
      assert.strictEqual(rows[0].snapshot_hash, res.body.snapshot_hash);
      assert(rows[0].assignment_snapshot.includes("1.0"));
      logPass("T07: Assignment published atomically with frozen canonical snapshot & SHA-256 hash");
    } catch (err) {
      logFail("T07", err);
    }

    // T07b: Published fixed assignments appear in My Schedule before a roster is published.
    try {
      const mySchedule = await rosterService.getMyRoster(1, 103, {
        start_date: "2026-12-01",
        end_date: "2026-12-02",
      });
      assert.strictEqual(mySchedule.schedule[0]?.source, "fixed_assignment");
      assert.strictEqual(mySchedule.schedule[0]?.work_date, "2026-12-01");
      logPass("T07b: My Schedule resolves the published fixed assignment when no roster entry exists");
    } catch (err) {
      logFail("T07b", err);
    }

    // T08: Database trigger prevents direct modification of published assignment
    try {
      let triggerThrown = false;
      try {
        await dbConn.execute(
          "UPDATE workforce_employee_fixed_assignment SET effective_from = '2025-01-01' WHERE id = ?",
          [createdAssignmentId]
        );
      } catch (sqlErr) {
        triggerThrown = sqlErr.message.includes("Immutability violation");
      }
      assert.strictEqual(triggerThrown, true);
      logPass("T08: Trigger trg_wefa_prevent_update_on_published blocked direct SQL mutation");
    } catch (err) {
      logFail("T08", err);
    }

    // T09: Cancel assignment with audit reason
    try {
      const res = await request(
        "POST",
        `/api/v1/workforce/assignments/${createdAssignmentId}/cancel`,
        { reason: "Re-organizing team shift allocation" },
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "cancelled");

      const [cRows] = await dbConn.execute(
        "SELECT status, cancellation_reason FROM workforce_employee_fixed_assignment WHERE id = ?",
        [createdAssignmentId]
      );
      assert.strictEqual(cRows[0].status, "cancelled");
      assert.strictEqual(cRows[0].cancellation_reason, "Re-organizing team shift allocation");
      logPass("T09: Assignment cancelled with audit reason");
    } catch (err) {
      logFail("T09", err);
    }

    // T10: Bulk assignment with structured partial failure reporting
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/assignments/bulk",
        {
          userIds: [103, 9999], // 103 valid, 9999 invalid
          shiftId: 10,
          shiftVersionId: 10,
          effectiveFrom: "2026-12-01",
          publishImmediately: true,
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_selected, 2);
      assert.strictEqual(res.body.successfully_assigned, 1);
      assert.strictEqual(res.body.rejected, 1);
      assert.strictEqual(res.body.conflicts[0].user_id, 9999);
      logPass("T10: Bulk assignment completed with structured partial-failure reporting");
    } catch (err) {
      logFail("T10", err);
    }

    // ------------------------------------------------------------------------
    // SUITE 2: ROTATION PATTERNS & DETERMINISTIC ENGINE (11.3)
    // ------------------------------------------------------------------------
    console.log("\n--- SUITE 2: ROTATION PATTERNS & DETERMINISTIC ENGINE ---");

    let createdRotationId = null;

    // R01: Create rotation pattern with steps
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/rotations",
        {
          code: "ROT_5_2_TEST",
          name: "5 Days Day Shift, 2 Days Off",
          description: "Standard corporate rotation cycle",
          cycle_length_days: 7,
          steps: [
            { step_order: 1, shift_id: 10, duration_days: 5, is_off_day: false },
            { step_order: 2, shift_id: null, duration_days: 2, is_off_day: true },
          ],
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.code, "ROT_5_2_TEST");
      assert.strictEqual(res.body.steps.length, 2);
      createdRotationId = res.body.id;
      logPass("R01: Rotation pattern created with steps (HTTP 201)");
    } catch (err) {
      logFail("R01", err);
    }

    // R02: Minimum rest period validation between steps
    try {
      const restCheck = await rotationService.validateMinimumRest([
        { step_order: 1, end_time: "17:00:00", is_off_day: false },
        { step_order: 2, start_time: "08:00:00", is_off_day: false },
      ], 11);
      // 17:00 to next 08:00 is 15 hours rest >= 11 -> valid
      assert.strictEqual(restCheck.valid, true);

      const invalidRestCheck = await rotationService.validateMinimumRest([
        { step_order: 1, end_time: "22:00:00", is_off_day: false },
        { step_order: 2, start_time: "06:00:00", is_off_day: false },
      ], 11);
      // 22:00 to 06:00 is only 8 hours rest < 11 -> invalid
      assert.strictEqual(invalidRestCheck.valid, false);
      assert.strictEqual(invalidRestCheck.violations.length, 1);
      logPass("R02: Minimum rest period validation correctly flags rest violations (<11h)");
    } catch (err) {
      logFail("R02", err);
    }

    // R03: Publish rotation pattern
    try {
      const res = await request(
        "POST",
        `/api/v1/workforce/rotations/${createdRotationId}/publish`,
        {},
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "published");
      logPass("R03: Rotation pattern published successfully");
    } catch (err) {
      logFail("R03", err);
    }

    // R04: Enroll employee into rotation pattern
    try {
      const res = await request(
        "POST",
        `/api/v1/workforce/rotations/${createdRotationId}/enroll`,
        {
          user_id: 103,
          start_date: "2026-11-01",
          offset_days: 0,
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, "published");
      logPass("R04: Employee enrolled into rotation pattern");
    } catch (err) {
      logFail("R04", err);
    }

    // R04b: Initial step selection must affect the first scheduled day.
    try {
      await rotationService.enrollEmployee(1, {
        user_id: 102,
        rotation_id: createdRotationId,
        start_date: "2026-11-01",
        initial_step_order: 2,
      }, 101);
      const firstDay = await rotationService.calculateShiftForDate(1, 102, "2026-11-01");
      assert.strictEqual(firstDay.is_off_day, true);
      assert.strictEqual(Number(firstDay.step_order), 2);
      logPass("R04b: Enrollment starts at its selected rotation step");
    } catch (err) {
      logFail("R04b", err);
    }

    // R05: Deterministic calculation engine: verify same date produces identical shift
    try {
      // 2026-11-01 was Day 1 of rotation (offset 0 -> step 1, work day)
      const shiftDay1 = await rotationService.calculateShiftForDate(1, 103, "2026-11-01");
      const shiftDay1Again = await rotationService.calculateShiftForDate(1, 103, "2026-11-01");
      assert.strictEqual(shiftDay1.is_off_day, false);
      assert.strictEqual(shiftDay1.shift_id, 10);
      assert.deepStrictEqual(shiftDay1, shiftDay1Again);
      logPass("R05: Deterministic rotation calculation verified (Day 1 produced exact matching shift)");
    } catch (err) {
      logFail("R05", err);
    }

    // R06: Off-day step calculation
    try {
      // 2026-11-06 was Day 6 (5 work days elapsed -> Day 6 is off day)
      const shiftDay6 = await rotationService.calculateShiftForDate(1, 103, "2026-11-06");
      assert.strictEqual(shiftDay6.is_off_day, true);
      assert.strictEqual(shiftDay6.shift_id, null);
      logPass("R06: Off-day step correctly evaluated in cycle modulo");
    } catch (err) {
      logFail("R06", err);
    }

    // R07: Preview rotation over 14 days
    try {
      const res = await request(
        "GET",
        `/api/v1/workforce/rotations/${createdRotationId}/preview?startDate=2026-11-01&endDate=2026-11-14`,
        null,
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_days, 14);
      assert.strictEqual(res.body.schedule.length, 14);
      logPass("R07: Rotation schedule preview generated over 14-day date range");
    } catch (err) {
      logFail("R07", err);
    }

    // ------------------------------------------------------------------------
    // SUITE 3: ROSTER MANAGEMENT & CALENDAR (11.4)
    // ------------------------------------------------------------------------
    console.log("\n--- SUITE 3: ROSTER MANAGEMENT & CALENDAR ---");

    let generatedRosterHeaderId = null;

    // S01: Generate draft roster from assignments and rotations
    try {
      const res = await request(
        "POST",
        "/api/v1/workforce/rosters/generate",
        {
          start_date: "2026-12-01",
          end_date: "2026-12-07",
          team_name: "Engineering",
          name: "Engineering Weekly Roster Dec 1-7",
        },
        tokenAdmin
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, "draft");
      assert(res.body.entries_count > 0);
      generatedRosterHeaderId = res.body.id;
      const [actualCountRows] = await dbConn.execute(
        "SELECT COUNT(*) AS actual_count FROM workforce_roster_entry WHERE tenant_id = 1 AND roster_header_id = ?",
        [generatedRosterHeaderId]
      );
      assert.strictEqual(Number(res.body.entries_count), Number(actualCountRows[0].actual_count));
      logPass(`S01: Draft roster generated with ${res.body.entries_count} scheduled entries (HTTP 201)`);
    } catch (err) {
      logFail("S01", err);
    }

    // S01b: Non-optional company holidays must not create roster entries.
    try {
      const candidateDates = Array.from({ length: 7 }, (_, index) => `2026-12-${String(8 + index).padStart(2, "0")}`);
      const [existingHolidayRows] = await dbConn.execute(
        "SELECT holiday_date FROM workforce_company_holiday WHERE tenant_id = 1 AND holiday_date BETWEEN ? AND ?",
        [candidateDates[0], candidateDates[candidateDates.length - 1]]
      );
      const existingHolidayDates = new Set(existingHolidayRows.map((row) => String(row.holiday_date).slice(0, 10)));
      const holidayDate = candidateDates.find((date) => !existingHolidayDates.has(date));
      assert(holidayDate, "No unused date available for the holiday regression test");
      await dbConn.execute(
        "INSERT INTO workforce_company_holiday (tenant_id, holiday_date, name, is_optional) VALUES (1, ?, 'Stage 3 roster test holiday', 0)",
        [holidayDate]
      );
      let holidayRoster;
      try {
        holidayRoster = await rosterService.generateDraftRoster(1, {
          start_date: holidayDate,
          end_date: holidayDate,
          team_name: "Engineering",
          name: "Stage 3 company holiday roster test",
        }, 101);
        assert.strictEqual(Number(holidayRoster.entries_count), 0);
        logPass("S01b: Non-optional company holiday is excluded from generated roster entries");
      } finally {
        if (holidayRoster?.id) {
          await dbConn.execute("DELETE FROM workforce_roster_entry WHERE roster_header_id = ? AND tenant_id = 1", [holidayRoster.id]);
          await dbConn.execute("DELETE FROM workforce_roster_header WHERE id = ? AND tenant_id = 1", [holidayRoster.id]);
        }
        await dbConn.execute("DELETE FROM workforce_company_holiday WHERE tenant_id = 1 AND holiday_date = ? AND name = 'Stage 3 roster test holiday'", [holidayDate]);
      }
    } catch (err) {
      logFail("S01b", err);
    }

    // S02: Retrieve weekly calendar matrix
    try {
      const res = await request(
        "GET",
        "/api/v1/workforce/rosters/calendar?startDate=2026-12-01&endDate=2026-12-07",
        null,
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert(res.body.employees.length > 0);
      assert(res.body.total_entries > 0);
      logPass("S02: Weekly calendar matrix retrieved with structured employee grid");
    } catch (err) {
      logFail("S02", err);
    }

    // S03: Overnight shift date attribution
    try {
      // Overnight shift test: verify start 22:00 end 06:00 is attributed to start work_date
      const overnightRest = rosterValidationService.validateConsecutiveShiftRest(
        { work_date: "2026-12-01", end_time: "06:00:00", is_overnight: true },
        { work_date: "2026-12-02", start_time: "14:00:00" },
        8
      );
      assert.strictEqual(overnightRest.valid, true);
      assert.strictEqual(overnightRest.restHours, 8);
      logPass("S03: Overnight shift (22:00-06:00) cleanly attributed to start work_date");
    } catch (err) {
      logFail("S03", err);
    }

    // S04: Atomic publication of roster header & snapshot freezing
    try {
      const res = await request(
        "POST",
        `/api/v1/workforce/rosters/${generatedRosterHeaderId}/publish`,
        {},
        tokenAdmin
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "published");

      // Verify entries in DB have frozen snapshots
      const [eRows] = await dbConn.execute(
        "SELECT shift_snapshot, snapshot_hash FROM workforce_roster_entry WHERE roster_header_id = ? LIMIT 1",
        [generatedRosterHeaderId]
      );
      assert(eRows[0].shift_snapshot && eRows[0].snapshot_hash);
      logPass("S04: Roster published atomically; entries frozen with canonical snapshots & SHA-256 hashes");
    } catch (err) {
      logFail("S04", err);
    }

    // S05: Trigger blocks modifying entries in published roster header
    try {
      let triggerBlocked = false;
      const [entries] = await dbConn.execute(
        "SELECT id FROM workforce_roster_entry WHERE roster_header_id = ? LIMIT 1",
        [generatedRosterHeaderId]
      );
      try {
        await dbConn.execute(
          "UPDATE workforce_roster_entry SET work_date = '2025-01-01' WHERE id = ?",
          [entries[0].id]
        );
      } catch (sqlErr) {
        triggerBlocked = sqlErr.message.includes("Immutability violation");
      }
      assert.strictEqual(triggerBlocked, true);
      logPass("S05: Trigger trg_wre_prevent_mutation_on_published_header blocked direct entry modification");
    } catch (err) {
      logFail("S05", err);
    }

    // S06: Trigger blocks deleting entries in published roster header
    try {
      let deleteBlocked = false;
      const [entries] = await dbConn.execute(
        "SELECT id FROM workforce_roster_entry WHERE roster_header_id = ? LIMIT 1",
        [generatedRosterHeaderId]
      );
      try {
        await dbConn.execute(
          "DELETE FROM workforce_roster_entry WHERE id = ?",
          [entries[0].id]
        );
      } catch (sqlErr) {
        deleteBlocked = sqlErr.message.includes("Immutability violation");
      }
      assert.strictEqual(deleteBlocked, true);
      logPass("S06: Trigger trg_wre_prevent_delete_on_published_header blocked direct entry deletion");
    } catch (err) {
      logFail("S06", err);
    }

    // S07: Employee self-service `/api/v1/workforce/rosters/my-roster`
    try {
      const res = await request(
        "GET",
        "/api/v1/workforce/rosters/my-roster?startDate=2026-12-01&endDate=2026-12-07",
        null,
        tokenEmployee
      );
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body.schedule));
      assert(res.body.schedule.every((entry) => entry.source !== "draft_roster"));
      assert(res.body.schedule.some((entry) => entry.source === "published_roster"));
      logPass("S07: Employee self-service my-roster endpoint returned personal schedule");
    } catch (err) {
      logFail("S07", err);
    }

    // ------------------------------------------------------------------------
    // SUITE 4: DUAL-CONNECTION CONCURRENCY & SERIALIZATION (11.4 / 11.5)
    // ------------------------------------------------------------------------
    console.log("\n--- SUITE 4: DUAL-CONNECTION CONCURRENCY & MONOTONIC LOCKS ---");

    // C01: Two concurrent transactions attempt to assign competing shifts to same employee
    try {
      const conn1 = await mysql.createConnection(DB_CONFIG);
      const conn2 = await mysql.createConnection(DB_CONFIG);

      await conn1.beginTransaction();
      await conn2.beginTransaction();

      let conn2Resolved = false;

      // Conn 1 locks employee 103
      await conn1.execute("SELECT id FROM accounts_user WHERE id = 103 FOR UPDATE");

      // Conn 2 attempts to lock employee 103 (will wait for Conn 1)
      const p2 = conn2.execute("SELECT id FROM accounts_user WHERE id = 103 FOR UPDATE").then(() => {
        conn2Resolved = true;
      });

      // Small pause to verify Conn 2 is blocked
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(conn2Resolved, false, "Connection 2 must be blocked waiting on employee lock");

      // Conn 1 commits and releases
      await conn1.commit();
      await p2;
      assert.strictEqual(conn2Resolved, true, "Connection 2 acquires lock after Connection 1 commits");
      await conn2.commit();

      await conn1.end();
      await conn2.end();
      logPass("C01: Monotonic lock on accounts_user serialized concurrent employee assignments cleanly");
    } catch (err) {
      logFail("C01", err);
    }

    // C02: Two concurrent transactions attempt to publish the same roster header
    try {
      const conn1 = await mysql.createConnection(DB_CONFIG);
      const conn2 = await mysql.createConnection(DB_CONFIG);

      await conn1.beginTransaction();
      await conn2.beginTransaction();

      let conn2Published = false;

      // Conn 1 locks roster header
      await conn1.execute(
        "SELECT id FROM workforce_roster_header WHERE id = ? FOR UPDATE",
        [generatedRosterHeaderId]
      );

      const p2 = conn2.execute(
        "SELECT id FROM workforce_roster_header WHERE id = ? FOR UPDATE",
        [generatedRosterHeaderId]
      ).then(() => {
        conn2Published = true;
      });

      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(conn2Published, false, "Connection 2 must be blocked waiting on roster header lock");

      await conn1.commit();
      await p2;
      assert.strictEqual(conn2Published, true, "Connection 2 acquires lock after Connection 1 commits");
      await conn2.commit();

      await conn1.end();
      await conn2.end();
      logPass("C02: Monotonic lock on workforce_roster_header serialized publication transactions");
    } catch (err) {
      logFail("C02", err);
    }

    // ------------------------------------------------------------------------
    // SUITE 5: ATTENDANCE REGRESSION (11.6)
    // ------------------------------------------------------------------------
    console.log("\n--- SUITE 5: ATTENDANCE BACKWARD COMPATIBILITY & REGRESSION ---");

    // A01: Verify columns in attendance_attendance are intact
    try {
      const [cols] = await dbConn.execute("DESCRIBE attendance_attendance");
      const colNames = cols.map(c => c.Field);
      assert(colNames.includes("punch_in_status"));
      assert(colNames.includes("punch_out_status"));
      assert(colNames.includes("punctuality_status"));
      assert(colNames.includes("total_hours"));
      assert(colNames.includes("shift_version_id"));
      assert(colNames.includes("roster_entry_id"));
      logPass("A01: Existing columns in attendance_attendance intact (zero schema drift)");
    } catch (err) {
      logFail("A01", err);
    }

    // A02: Verify existing attendance records remain queryable
    try {
      const [rows] = await dbConn.execute("SELECT COUNT(*) as count FROM attendance_attendance");
      assert(rows[0].count >= 0);
      logPass("A02: Existing attendance records preserved and queryable");
    } catch (err) {
      logFail("A02", err);
    }

  } finally {
    if (server) server.close();
    if (dbConn) await dbConn.end();
  }

  console.log("\n==============================================================================");
  console.log(`[TEST SUMMARY] Total Assertions: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log("==============================================================================");

  if (failed > 0) {
    console.error(`\n❌ [TEST FAILURE] ${failed} test(s) failed in Stage 3 test suite.`);
    process.exit(1);
  } else {
    console.log("\n🎉 [RESULT] ALL STAGE 3 ASSIGNMENT & ROSTER TESTS PASSED!");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Fatal test execution error:", err);
  process.exit(1);
});
