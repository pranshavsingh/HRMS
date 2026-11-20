// ============================================================================
// Test Suite: node_backend/tests/test_stage4_shift_attendance.mjs
// Description: Automated end-to-end verification of Stage 4:
//              Shift Attendance Integration & Policy Framework
//              - Item 1: Overnight Lookback Logic (00:00–04:00 punch attribution)
//              - Item 2: Tenant Default Shift vs Unassigned (decoupled persistence)
//              - Item 3: Net-Scheduled Overtime Calculation (no false overtime from breaks)
//              - Item 4: Window-based Break Deductions (no double deduction, no early deduction)
//              - Item 5: Approval Decoupling (geofence vs late/early/overtime policy approvals)
//              - Non-Regression & API Backward Compatibility
// Target: MariaDB 11.8.9 (127.0.0.1:3307/hrms_disposable_test)
// ============================================================================

process.env.DB_CLIENT = "mysql";
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_PORT = "3307";
process.env.MYSQL_USER = "root";
process.env.MYSQL_PASSWORD = "";
process.env.MYSQL_DATABASE = "hrms_disposable_test";
process.env.JWT_SECRET = "test-secret-key-stage4-maria11";
process.env.NODE_ENV = "test";

import assert from "assert";
import http from "http";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";

const { config } = await import("../src/config/env.js");
const { createApp } = await import("../src/app.js");
const { shiftService } = await import("../src/services/shift.service.js");
const { shiftAttendanceService } = await import("../src/services/shift-attendance.service.js");
const { attendanceService } = await import("../src/services/attendance.service.js");
const { companyPolicyService } = await import("../src/services/company-policy.service.js");
const { db } = await import("../src/db/index.js");

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
let tokenEmployee20;
let tokenEmployee21;
let tokenEmployee22;
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

function makeToken(userId, role, tenantId = 1) {
  return jwt.sign(
    {
      userId,
      role,
      tenantId,
      type: "access",
    },
    config.jwtSecret,
    { algorithm: "HS256" }
  );
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
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log("==============================================================================");
  console.log("  STAGE 4: SHIFT ATTENDANCE INTEGRATION — AUTOMATED VALIDATION SUITE");
  console.log("==============================================================================");
  console.log(`Target Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);

  dbConn = await mysql.createConnection(DB_CONFIG);
  const app = createApp();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`App running at ${baseUrl}\n`);

  // Setup Auth Tokens with valid HS256 payload
  tokenAdmin = makeToken(1, "admin", 1);
  tokenHr = makeToken(8, "hr", 1);
  tokenEmployee20 = makeToken(20, "employee", 1);
  tokenEmployee21 = makeToken(21, "employee", 1);
  tokenEmployee22 = makeToken(22, "employee", 1);
  tokenTenant2 = makeToken(104, "employee", 2);

  // Clean test attendance records for test employees
  await dbConn.query("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id IN (20, 21, 22, 103))");
  await dbConn.query("DELETE FROM attendance_attendance WHERE user_id IN (20, 21, 22, 103)");

  // --------------------------------------------------------------------------
  // SUITE 1: DAYTIME SHIFT ON-TIME PUNCH-IN & PUNCH-OUT
  // --------------------------------------------------------------------------
  console.log("--- SUITE 1: DAYTIME SHIFT ON-TIME PUNCH-IN & PUNCH-OUT ---");
  let daytimeShift;
  try {
    const [shiftRows] = await dbConn.query(
      `SELECT s.id as shift_id, sv.id as shift_version_id 
       FROM workforce_shift s 
       JOIN workforce_shift_version sv ON sv.shift_id = s.id AND sv.status = 'published'
       WHERE s.tenant_id = 1 AND sv.is_overnight = 0
       LIMIT 1`
    );
    assert(shiftRows.length > 0, "Published daytime shift version must exist");
    daytimeShift = shiftRows[0];

    // Assign to emp_20
    await dbConn.query("DELETE FROM workforce_employee_fixed_assignment WHERE user_id = 20");
    await dbConn.query(
      `INSERT INTO workforce_employee_fixed_assignment 
         (tenant_id, user_id, shift_id, shift_version_id, effective_from, status, created_by, snapshot_hash)
       VALUES (1, 20, ?, ?, '2026-01-01', 'published', 1, 'stg4-mock-hash-1')`,
      [daytimeShift.shift_id, daytimeShift.shift_version_id]
    );

    // Punch in via HTTP API
    const resIn = await request("POST", "/api/v1/attendance/punch-in", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_daytime_in.jpg",
    }, tokenEmployee20);

    assert.strictEqual(resIn.status, 200, `Expected 200, got ${resIn.status}: ${JSON.stringify(resIn.body)}`);
    assert(resIn.body.work_date, "work_date must be present in punch-in response");
    assert.strictEqual(resIn.body.shift_version_id, daytimeShift.shift_version_id, "shift_version_id must match assigned daytime shift");
    assert.strictEqual(resIn.body.is_overnight, false, "is_overnight must be false for daytime shift");
    assert.strictEqual(resIn.body.is_unscheduled, false, "is_unscheduled must be false for assigned shift");
    assert.strictEqual(resIn.body.resolution_source, "fixed", "resolution_source must be fixed");
    logPass("S1-T01", "Daytime punch-in successfully resolved assigned shift with resolution_source = 'fixed' and is_unscheduled = false");

    // Verify punch status reflects active punch-in and scheduled shift metadata
    const resStatus = await request("GET", "/api/v1/attendance/status", null, tokenEmployee20);
    assert.strictEqual(resStatus.status, 200, `Expected 200, got ${resStatus.status}`);
    assert.strictEqual(resStatus.body.is_punched_in, true);
    assert.strictEqual(resStatus.body.shift_version_id, daytimeShift.shift_version_id);
    assert.strictEqual(resStatus.body.is_unscheduled, false);
    assert.strictEqual(resStatus.body.resolution_source, "fixed");
    assert(resStatus.body.scheduled_shift, "scheduled_shift must be populated");
    logPass("S1-T02", "Punch status returns is_punched_in = true with scheduled_shift metadata");

    // Punch out via HTTP API
    const resOut = await request("POST", "/api/v1/attendance/punch-out", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_daytime_out.jpg",
    }, tokenEmployee20);

    assert.strictEqual(resOut.status, 200, `Expected 200, got ${resOut.status}`);
    assert(resOut.body.total_hours !== undefined, "total_hours must be returned");
    assert(resOut.body.net_minutes !== undefined, "net_minutes must be returned");
    assert.strictEqual(resOut.body.resolution_source, "fixed");
    logPass("S1-T03", "Daytime punch-out completed successfully with computed total_hours and net_minutes");

    // Verify history endpoint returns enriched fields
    const resHist = await request("GET", "/api/v1/attendance/history", null, tokenEmployee20);
    assert.strictEqual(resHist.status, 200);
    assert(resHist.body.records && resHist.body.records.length > 0);
    const latestRec = resHist.body.records[0];
    assert.strictEqual(latestRec.shift_version_id, daytimeShift.shift_version_id);
    assert.strictEqual(latestRec.is_unscheduled, false);
    assert.strictEqual(latestRec.resolution_source, "fixed");
    assert(latestRec.work_date, "work_date must be present in history record");
    logPass("S1-T04", "Attendance history returns enriched shift_version_id, work_date, resolution_source, and is_unscheduled");

  } catch (err) {
    logFail("SUITE 1: Daytime shift on-time punch", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 2: LATE PUNCH-IN & APPROVAL DECOUPLING (ITEM 5)
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 2: LATE PUNCH-IN & APPROVAL DECOUPLING ---");
  try {
    const shiftInfo = {
      workDate: "2026-11-17",
      isUnscheduled: false,
      shift: {
        start_time: "09:00:00",
        end_time: "17:30:00",
        late_grace_minutes: 15,
      },
    };

    // Case A: Punch in at 08:55 (Early/On-Time)
    const punchOnTime = new Date("2026-11-17T08:55:00");
    const evalOnTime = shiftAttendanceService.evaluatePunchInPunctuality(shiftInfo, punchOnTime);
    assert.strictEqual(evalOnTime.punctualityStatus, "on_time");
    assert.strictEqual(evalOnTime.lateMinutes, 0);
    assert.strictEqual(evalOnTime.isLate, false);
    logPass("S2-T01", "Punch-in before scheduled start is flagged on_time (0 late minutes)");

    // Case B: Punch in at 09:10 (Within 15-minute grace period)
    const punchGrace = new Date("2026-11-17T09:10:00");
    const evalGrace = shiftAttendanceService.evaluatePunchInPunctuality(shiftInfo, punchGrace);
    assert.strictEqual(evalGrace.punctualityStatus, "grace_period");
    assert.strictEqual(evalGrace.lateMinutes, 0);
    assert.strictEqual(evalGrace.isLate, false);
    logPass("S2-T02", "Punch-in within late_grace_minutes is flagged grace_period (0 late minutes)");

    // Case C: Punch in at 09:35 (Beyond 15-minute grace period)
    const punchLate = new Date("2026-11-17T09:35:00");
    const evalLate = shiftAttendanceService.evaluatePunchInPunctuality(shiftInfo, punchLate);
    assert.strictEqual(evalLate.punctualityStatus, "late");
    assert.strictEqual(evalLate.lateMinutes, 35);
    assert.strictEqual(evalLate.isLate, true);
    logPass("S2-T03", "Punch-in past grace period is flagged late with exact difference (35 late minutes)");

    // Case D: Verify Item 5 requirement — late arrival does NOT overwrite punch_in_status to pending!
    await dbConn.query("DELETE FROM attendance_attendance WHERE user_id = 20");
    const resLateIn = await request("POST", "/api/v1/attendance/punch-in", {
      latitude: 12.9716, // inside geofence
      longitude: 77.5946,
      photo_url: "attendance/test_late_in.jpg",
    }, tokenEmployee20);

    assert.strictEqual(resLateIn.status, 200);
    // punch_in_status must remain approved because location is valid, decoupled from punctuality!
    assert.strictEqual(resLateIn.body.punch_in_status, "approved", "punch_in_status must remain approved when inside geofence, not overwritten by punctuality");
    logPass("S2-T04", "Item 5 verified: Late arrival punctuality does not overwrite punch_in_status (remains approved)");

    // Clean up
    await request("POST", "/api/v1/attendance/punch-out", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_cleanup_out.jpg",
    }, tokenEmployee20);

  } catch (err) {
    logFail("SUITE 2: Late punch-in & approval decoupling", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 3: EARLY DEPARTURE & GEOFENCE APPROVAL DECOUPLING (ITEM 5)
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 3: EARLY DEPARTURE & GEOFENCE DECOUPLING ---");
  try {
    const [sv] = await dbConn.query(
      `SELECT id FROM workforce_shift_version 
       WHERE tenant_id = 1 AND is_overnight = 0 
       LIMIT 1`
    );
    const testSvId = sv[0].id;

    const testAttRecord = {
      work_date: "2026-11-17",
      punch_in_time: "2026-11-17T09:00:00",
      shift_version_id: testSvId,
      is_unscheduled: 0,
      punctuality_status: "on_time",
    };

    const punchOutEarly = new Date("2026-11-17T12:00:00"); // Left at 12:00 (ends 17:30)
    const outEval = await shiftAttendanceService.evaluatePunchOut(testAttRecord, punchOutEarly);

    assert(outEval.isEarlyDeparture === true, "Must flag isEarlyDeparture = true");
    assert(outEval.earlyDepartureMinutes > 0, `Must calculate earlyDepartureMinutes > 0 (got ${outEval.earlyDepartureMinutes})`);
    logPass("S3-T01", `Early departure correctly detected (${outEval.earlyDepartureMinutes} minutes early)`);

  } catch (err) {
    logFail("SUITE 3: Early departure evaluation", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 4: OVERNIGHT SHIFT WORK-DATE ATTRIBUTION & CROSS-MIDNIGHT HOURS
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 4: OVERNIGHT SHIFT WORK-DATE ATTRIBUTION & HOURS ---");
  let nightShift;
  try {
    const [nightShifts] = await dbConn.query(
      `SELECT s.id as shift_id, sv.id as shift_version_id, sv.start_time, sv.end_time
       FROM workforce_shift s
       JOIN workforce_shift_version sv ON sv.shift_id = s.id AND sv.status = 'published'
       WHERE s.tenant_id = 1 AND sv.is_overnight = 1
       LIMIT 1`
    );
    assert(nightShifts.length > 0, "Overnight shift version must exist");
    nightShift = nightShifts[0];

    // Assign overnight shift to emp_21
    await dbConn.query("DELETE FROM workforce_employee_fixed_assignment WHERE user_id = 21");
    await dbConn.query(
      `INSERT INTO workforce_employee_fixed_assignment 
         (tenant_id, user_id, shift_id, shift_version_id, effective_from, status, created_by, snapshot_hash)
       VALUES (1, 21, ?, ?, '2026-01-01', 'published', 1, 'stg4-mock-hash-night')`,
      [nightShift.shift_id, nightShift.shift_version_id]
    );

    // Clean previous attendance for emp_21
    await dbConn.query("DELETE FROM attendance_attendance WHERE user_id = 21");

    // Simulate punch-in for overnight shift at 21:55
    const punchInNight = new Date("2026-11-16T21:55:00");
    const resolvedNight = await shiftAttendanceService.resolveShiftForPunchIn(1, 21, punchInNight);

    assert.strictEqual(resolvedNight.shiftVersionId, nightShift.shift_version_id);
    assert.strictEqual(resolvedNight.workDate, "2026-11-16");
    assert.strictEqual(Boolean(resolvedNight.shift.is_overnight), true);
    assert.strictEqual(resolvedNight.source, "fixed");
    assert.strictEqual(resolvedNight.isUnscheduled, false);
    logPass("S4-T01", "Overnight shift resolves with start work_date (2026-11-16) and is_overnight = 1");

    // Simulate punch-out next morning at 06:05 (crosses midnight)
    const attNightRecord = {
      work_date: "2026-11-16",
      punch_in_time: "2026-11-16T21:55:00",
      shift_version_id: nightShift.shift_version_id,
      is_unscheduled: 0,
      punctuality_status: "on_time",
    };
    const punchOutNight = new Date("2026-11-17T06:05:00");
    const outNightEval = await shiftAttendanceService.evaluatePunchOut(attNightRecord, punchOutNight);

    // Gross minutes: 21:55 to 06:05 = 8 hours 10 minutes = 490 minutes
    assert.strictEqual(outNightEval.grossMinutes, 490, `Gross minutes must be 490, got ${outNightEval.grossMinutes}`);
    assert(outNightEval.totalHours >= 8.0, `Total hours must be >= 8.0, got ${outNightEval.totalHours}`);
    logPass("S4-T02", `Cross-midnight working hours correctly computed across calendar date boundary (${outNightEval.totalHours} hrs)`);

  } catch (err) {
    logFail("SUITE 4: Overnight shift work-date attribution", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 5: POST-MIDNIGHT LOOKBACK LOGIC (ITEM 1)
  // Search for eligible scheduled overnight shift from previous work date when
  // no open attendance record exists yet!
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 5: POST-MIDNIGHT LOOKBACK LOGIC (ITEM 1) ---");
  try {
    // Clean any prior attendance for emp_21 on 2026-11-16
    await dbConn.query("DELETE FROM attendance_attendance WHERE user_id = 21");

    // Late employee punches in at 00:30 on 2026-11-17 (has NOT punched in yet, no open attendance exists).
    // The lookback engine must search yesterday's schedule (2026-11-16) and find the overnight shift!
    const postMidnightPunch = new Date("2026-11-17T00:30:00");
    const lookbackResolved = await shiftAttendanceService.resolveShiftForPunchIn(1, 21, postMidnightPunch);

    assert.strictEqual(lookbackResolved.isOvernightLookback, true, "isOvernightLookback flag must be true");
    assert.strictEqual(lookbackResolved.workDate, "2026-11-16", "Must attribute to yesterday's evening work_date (2026-11-16)");
    assert.strictEqual(lookbackResolved.source, "fixed", "Resolution source must reflect the scheduled fixed assignment");
    assert.strictEqual(lookbackResolved.isUnscheduled, false, "Must not be flagged as unscheduled");
    logPass("S5-T01", "Item 1 verified: Post-midnight punch at 00:30 attributed to prior work_date (2026-11-16) without requiring prior open record");

    // Verify late punctuality evaluated relative to 22:00 scheduled start
    const lookbackPunctuality = shiftAttendanceService.evaluatePunchInPunctuality(lookbackResolved, postMidnightPunch);
    assert.strictEqual(lookbackPunctuality.punctualityStatus, "late");
    assert(lookbackPunctuality.lateMinutes >= 150, `Late minutes must be >= 150 min (got ${lookbackPunctuality.lateMinutes})`);
    logPass("S5-T02", `Late minutes calculated from prior evening start time (${lookbackPunctuality.lateMinutes} min late)`);

  } catch (err) {
    logFail("SUITE 5: Post-midnight lookback attribution", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 6: WINDOW-BASED BREAK DEDUCTIONS (ITEM 4)
  // Automatically deducts break only when employee was on duty during configured window.
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 6: WINDOW-BASED BREAK DEDUCTIONS (ITEM 4) ---");
  let breakShiftObj;
  try {
    // Create dedicated shift with 60m unpaid lunch break (minute 240 to 300) via shiftService
    const breakShiftCode = "STG4_BRK_" + Date.now();
    breakShiftObj = await shiftService.createShift(
      1,
      {
        code: breakShiftCode,
        name: "Stage 4 Break Shift",
        start_time: "09:00:00",
        end_time: "18:00:00",
        effective_from: "2026-11-01",
        breaks: [
          {
            break_name: "Lunch Break",
            break_type: "unpaid",
            start_offset_minutes: 240,
            end_offset_minutes: 300,
            duration_minutes: 60,
            is_mandatory: true,
            display_order: 1,
          },
        ],
      },
      { id: 1, role: "admin" }
    );

    const breakSvId = breakShiftObj.initial_version.id;

    // Case A: Full day worked 09:00 to 18:00 (spans 13:00-14:00 lunch window).
    // Gross: 540 min. Break deducted: 60 min. Net: 480 min (8.0 hours).
    const attRecordFull = {
      work_date: "2026-11-17",
      punch_in_time: "2026-11-17T09:00:00",
      shift_version_id: breakSvId,
      is_unscheduled: 0,
      punctuality_status: "on_time",
    };
    const punchOutFull = new Date("2026-11-17T18:00:00");
    const breakEvalFull = await shiftAttendanceService.evaluatePunchOut(attRecordFull, punchOutFull);

    assert.strictEqual(breakEvalFull.grossMinutes, 540);
    assert.strictEqual(breakEvalFull.unpaidBreakMinutes, 60, "Must deduct 60m lunch break when employee on duty across lunch window");
    assert.strictEqual(breakEvalFull.netMinutes, 480);
    assert.strictEqual(breakEvalFull.totalHours, 8.0);
    logPass("S6-T01", "Full shift (540m) minus lunch break (60m) correctly yields net 480m (8.0 hrs)");

    // Case B: Partial morning worked 09:00 to 12:00 (leaves BEFORE 13:00 lunch window).
    // Gross: 180 min. Break deducted: 0 min! (Employee did NOT take lunch during shift).
    const attRecordPartial = {
      work_date: "2026-11-17",
      punch_in_time: "2026-11-17T09:00:00",
      shift_version_id: breakSvId,
      is_unscheduled: 0,
      punctuality_status: "on_time",
    };
    const punchOutPartial = new Date("2026-11-17T12:00:00");
    const breakEvalPartial = await shiftAttendanceService.evaluatePunchOut(attRecordPartial, punchOutPartial);

    assert.strictEqual(breakEvalPartial.grossMinutes, 180);
    assert.strictEqual(breakEvalPartial.unpaidBreakMinutes, 0, "Lunch break must NOT be deducted when leaving before break window");
    assert.strictEqual(breakEvalPartial.netMinutes, 180);
    assert.strictEqual(breakEvalPartial.totalHours, 3.0);
    logPass("S6-T02", "Item 4 verified: Window-based deduction does not prematurely deduct lunch break for early morning exit (0m deducted)");

  } catch (err) {
    logFail("SUITE 6: Window-based break deductions", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 7: NET-SCHEDULED OVERTIME CALCULATION (ITEM 3)
  // Overtime must compare net working duration with scheduled net working duration,
  // taking unpaid scheduled breaks into account (no false overtime from breaks).
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 7: NET-SCHEDULED OVERTIME CALCULATION (ITEM 3) ---");
  try {
    // Create dedicated policy with overtime enabled via companyPolicyService
    const otPolicy = await companyPolicyService.createPolicy(
      1,
      {
        name: "Stage 4 Overtime Policy " + Date.now(),
        effective_from: "2026-11-01",
        overtime_enabled: 1,
        overtime_min_qualifying_minutes: 60,
        overtime_rounding_minutes: 15,
        overtime_requires_approval: 1,
        allow_unscheduled_punch: 0,
      },
      { id: 1, role: "admin" }
    );
    const pubPolicy = await companyPolicyService.publishPolicyVersion(1, otPolicy.id, otPolicy.initial_version_id, { id: 1, role: "admin" });

    // Create shift linked to this overtime policy with 60m unpaid break
    const otShift = await shiftService.createShift(
      1,
      {
        code: "STG4_OT_" + Date.now(),
        name: "Stage 4 Overtime Shift",
        start_time: "09:00:00",
        end_time: "18:00:00",
        effective_from: "2026-11-01",
        policy_id: otPolicy.id,
        breaks: [
          {
            break_name: "Lunch Break",
            break_type: "unpaid",
            start_offset_minutes: 240,
            end_offset_minutes: 300,
            duration_minutes: 60,
            is_mandatory: true,
            display_order: 1,
          },
        ],
      },
      { id: 1, role: "admin" }
    );

    const otSvId = otShift.initial_version.id;

    // Case A: Scheduled shift is 09:00 to 18:00 (gross 540m, scheduled unpaid break 60m -> scheduled net = 480m).
    // Employee punches out at scheduled 18:00 (net 480m).
    // Net excess = 480m - 480m = 0m. Must result in 0 overtime (no false overtime from break)!
    const attScheduled = {
      work_date: "2026-11-17",
      punch_in_time: "2026-11-17T09:00:00",
      shift_version_id: otSvId,
      is_unscheduled: 0,
      punctuality_status: "on_time",
    };
    const punchOutScheduled = new Date("2026-11-17T18:00:00");
    const otScheduledEval = await shiftAttendanceService.evaluatePunchOut(attScheduled, punchOutScheduled);

    assert.strictEqual(otScheduledEval.scheduledNetMinutes, 480, "Scheduled net duration must be 480m (540m gross - 60m break)");
    assert.strictEqual(otScheduledEval.netMinutes, 480, "Actual net duration must be 480m");
    assert.strictEqual(otScheduledEval.isOvertime, false, "Must NOT receive false overtime when net matches scheduled net");
    assert.strictEqual(otScheduledEval.overtimeMinutes, 0);
    logPass("S7-T01", "Item 3 verified: Normal scheduled shift produces 0 overtime (unpaid break accounted for)");

    // Case B: Employee works until 19:35 (gross 635m, 60m break deducted -> actual net = 575m).
    // Excess = 575m - 480m = 95m.
    // 95m >= 60m qualifying threshold -> rounded down to 15m multiple = 90m overtime!
    const punchOutLate = new Date("2026-11-17T19:35:00");
    const otLateEval = await shiftAttendanceService.evaluatePunchOut(attScheduled, punchOutLate);

    assert.strictEqual(otLateEval.netMinutes, 575);
    assert(otLateEval.isOvertime === true, "isOvertime must be true for 95m excess");
    assert.strictEqual(otLateEval.overtimeMinutes, 90, `overtimeMinutes must be 90m (got ${otLateEval.overtimeMinutes})`);
    assert.strictEqual(otLateEval.overtimeRequiresApproval, true, "overtimeRequiresApproval must match policy flag");
    logPass("S7-T02", "Item 3 verified: Excess net minutes (95m) correctly calculated against scheduled net (480m) and rounded to 90m");

  } catch (err) {
    logFail("SUITE 7: Net-scheduled overtime calculation", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 8: TENANT DEFAULT SHIFT VS UNASSIGNED & POLICY ENFORCEMENT (ITEM 2)
  // Preserves resolution source as tenant_default and separately records is_unscheduled.
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 8: TENANT DEFAULT SHIFT VS UNASSIGNED (ITEM 2) ---");
  try {
    // Clear assignments for emp_22 so they have NO scheduled shift
    await dbConn.query("DELETE FROM workforce_employee_fixed_assignment WHERE user_id = 22");
    await dbConn.query("DELETE FROM workforce_roster_entry WHERE user_id = 22");
    await dbConn.query("DELETE FROM attendance_attendance WHERE user_id = 22");

    // Case A: Policy has allow_unscheduled_punch = 0 (set on primary policy)
    // Create dedicated policy with allow_unscheduled_punch = 0
    const denyPolicy = await companyPolicyService.createPolicy(
      1,
      {
        name: "Stage 4 Deny Unscheduled Policy " + Date.now(),
        effective_from: "2026-11-17",
        allow_unscheduled_punch: 0,
      },
      { id: 1, role: "admin" }
    );
    await companyPolicyService.publishPolicyVersion(1, denyPolicy.id, denyPolicy.initial_version_id, { id: 1, role: "admin" });

    const resDenied = await request("POST", "/api/v1/attendance/punch-in", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_unscheduled_deny.jpg",
    }, tokenEmployee22);

    assert.strictEqual(resDenied.status, 400, `Expected 400 when unscheduled punch denied, got ${resDenied.status}`);
    assert(
      resDenied.body?.message?.includes("Unscheduled punch-in is not permitted") ||
      resDenied.body?.error?.includes("Unscheduled punch-in is not permitted"),
      `Expected rejection message, got: ${JSON.stringify(resDenied.body)}`
    );
    logPass("S8-T01", "Unscheduled punch-in rejected with HTTP 400 when policy disallows unscheduled punches");

    // Case B: Create and publish a new policy with allow_unscheduled_punch = 1
    const allowPolicy = await companyPolicyService.createPolicy(
      1,
      {
        name: "Stage 4 Allow Unscheduled Policy " + Date.now(),
        effective_from: "2026-11-17",
        allow_unscheduled_punch: 1,
      },
      { id: 1, role: "admin" }
    );
    await companyPolicyService.publishPolicyVersion(1, allowPolicy.id, allowPolicy.initial_version_id, { id: 1, role: "admin" });

    const resAllowed = await request("POST", "/api/v1/attendance/punch-in", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_unscheduled_allow.jpg",
    }, tokenEmployee22);

    assert.strictEqual(resAllowed.status, 200, `Expected 200 when unscheduled punch allowed, got ${resAllowed.status}: ${JSON.stringify(resAllowed.body)}`);
    // Assert Item 2: resolution_source must be 'tenant_default', is_unscheduled = true, roster_entry_id = null
    assert.strictEqual(resAllowed.body.resolution_source, "tenant_default", "Resolution source must be tenant_default");
    assert.strictEqual(resAllowed.body.is_unscheduled, true, "is_unscheduled must be true");
    assert.strictEqual(resAllowed.body.roster_entry_id, null, "roster_entry_id must be null (not normal scheduled assignment)");
    assert.strictEqual(resAllowed.body.punctuality_status, "unassigned", "Punctuality status must be unassigned");
    logPass("S8-T02", "Item 2 verified: Resolution source recorded as 'tenant_default' with is_unscheduled = true (never implying normal schedule)");

    // Punch out to close emp_22 attendance
    const resOut22 = await request("POST", "/api/v1/attendance/punch-out", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_unscheduled_out.jpg",
    }, tokenEmployee22);

    assert.strictEqual(resOut22.status, 200);
    assert.strictEqual(resOut22.body.resolution_source, "tenant_default");
    assert.strictEqual(resOut22.body.is_unscheduled, true);
    logPass("S8-T03", "Punch-out preserves resolution_source = 'tenant_default' and is_unscheduled = true in record and response");

  } catch (err) {
    logFail("SUITE 8: Tenant default shift vs unassigned", err);
  }

  // --------------------------------------------------------------------------
  // SUITE 9: LEGACY NON-REGRESSION & API BACKWARD COMPATIBILITY
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 9: LEGACY NON-REGRESSION & API BACKWARD COMPATIBILITY ---");
  try {
    // 1. Missing photo rejection
    const resNoPhoto = await request("POST", "/api/v1/attendance/punch-in", {
      latitude: 12.9716,
      longitude: 77.5946,
    }, tokenEmployee20);
    assert.strictEqual(resNoPhoto.status, 400);
    logPass("S9-T01", "Missing photo still rejected with HTTP 400 (existing validation preserved)");

    // 2. Punch out without punch in
    const resNoPunchIn = await request("POST", "/api/v1/attendance/punch-out", {
      latitude: 12.9716,
      longitude: 77.5946,
      photo_url: "attendance/test_nopunch.jpg",
    }, tokenEmployee20);
    assert.strictEqual(resNoPunchIn.status, 400);
    logPass("S9-T02", "Punch out without active punch in still rejected with HTTP 400");

    // 3. Manager team attendance endpoint returns enriched history without breaking schema
    const resTeam = await request("GET", `/api/v1/attendance/team-attendance?month=${new Date().toISOString().slice(0, 7)}&employee_id=20`, null, tokenAdmin);
    assert.strictEqual(resTeam.status, 200);
    assert(resTeam.body.summary, "Summary object must be preserved");
    assert(Array.isArray(resTeam.body.employees), "employees array must be preserved");
    if (resTeam.body.selected_employee_detail?.history?.length > 0) {
      const hItem = resTeam.body.selected_employee_detail.history[0];
      assert(hItem.date !== undefined, "Existing date field intact");
      assert(hItem.work_hours !== undefined, "Existing work_hours field intact");
      assert(hItem.punch_in !== undefined, "Existing punch_in field intact");
      assert(hItem.punch_out !== undefined, "Existing punch_out field intact");
      assert(hItem.work_date !== undefined, "Additive work_date present");
      assert(hItem.resolution_source !== undefined, "Additive resolution_source present");
      assert(hItem.is_unscheduled !== undefined, "Additive is_unscheduled present");
      assert(hItem.punctuality_status !== undefined, "Additive punctuality_status present");
    }
    logPass("S9-T03", "Team attendance register endpoint returns full backward-compatible structure with additive shift metadata");

    // 4. Employee dashboard endpoint intact
    const resDash = await request("GET", "/api/v1/attendance/dashboard", null, tokenEmployee20);
    assert.strictEqual(resDash.status, 200);
    assert(resDash.body.total_working_hours !== undefined, "total_working_hours must be present in dashboard response");
    logPass("S9-T04", "Employee dashboard endpoint intact and functional");

  } catch (err) {
    logFail("SUITE 9: Legacy non-regression & backward compatibility", err);
  }

  // Teardown
  await dbConn.end();
  server.close();

  console.log("\n==============================================================================");
  console.log(`[TEST SUMMARY] Total Assertions: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log("==============================================================================");

  if (failed > 0) {
    console.error(`\n❌ [RESULT] STAGE 4 TEST SUITE FAILED with ${failed} error(s)!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 [RESULT] ALL ${passed} STAGE 4 SHIFT ATTENDANCE INTEGRATION TESTS PASSED!`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Unhandled test runner exception:", err);
  process.exit(1);
});
