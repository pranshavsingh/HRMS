import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { db, closePool } from "../../src/db/index.js";
import { attendanceService } from "../../src/services/attendance.service.js";
import { leaveService } from "../../src/services/leave.service.js";
import redisService from "../../src/services/redis.service.js";

describe("P2.1 — Attendance & Transactional Concurrency Test Suite", () => {
  let testUserId;
  let testManagerId;
  let testUsername;
  let mgrUsername;
  const mockActor = { id: 1, role: "superadmin", username: "superadmin" };

  before(async () => {
    // Create isolated test employee for concurrency tests
    const unique = crypto.randomBytes(4).toString("hex");
    testUsername = `concur_${unique}`;
    const testEmail = `concur_${unique}@example.com`;

    const userRes = await db.run(
      "INSERT INTO accounts_user (username, password, first_name, last_name, email, role, is_active, is_staff, is_superuser, date_joined) VALUES (?, 'hash', 'Test', 'Concurrency', ?, 'employee', 1, 0, 0, NOW())",
      [testUsername, testEmail]
    );
    testUserId = userRes.lastID;

    // Create manager
    mgrUsername = `mgr_${unique}`;
    const mgrRes = await db.run(
      "INSERT INTO accounts_user (username, password, first_name, last_name, email, role, is_active, is_staff, is_superuser, date_joined) VALUES (?, 'hash', 'Test', 'Manager', ?, 'manager', 1, 0, 0, NOW())",
      [mgrUsername, `mgr_${testEmail}`]
    );
    testManagerId = mgrRes.lastID;

    // Create employee profile linked to manager and office location
    await db.run(
      "INSERT INTO accounts_employeeprofile (user_id, manager_id, is_active_employee, allowed_radius, latitude, longitude) VALUES (?, ?, 1, 500, 28.6139, 77.2090)",
      [testUserId, testManagerId]
    );

    // Register test users in default tenant for workforce relational constraints
    await db.run(
      "INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active) VALUES (1, ?, 'employee', 1), (1, ?, 'manager', 1)",
      [testUserId, testManagerId]
    );

    // Ensure test sites exist
    await db.run(
      "INSERT INTO workforce_site (id, tenant_id, code, name, address, is_active) VALUES (2, 1, 'SITE_2', 'Secondary Site', 'Branch Office', 1) ON DUPLICATE KEY UPDATE is_active = 1"
    );

    // Assign site 2 to employee and site access to manager for site-scoped authorization
    await db.run(
      "INSERT INTO workforce_employee_site_assignment (tenant_id, user_id, site_id, effective_from) VALUES (1, ?, 2, '2020-01-01')",
      [testUserId]
    );
    await db.run(
      "INSERT INTO workforce_site_access (tenant_id, user_id, site_id) VALUES (1, ?, 2)",
      [testManagerId]
    );
  });

  after(async () => {
    // Clean up test data
    if (testUserId) {
      await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = ?)", [testUserId]);
      await db.run("DELETE FROM attendance_attendance WHERE user_id = ?", [testUserId]);
      await db.run("DELETE FROM workforce_leave_ledger_transaction WHERE user_id = ?", [testUserId]);
      await db.run("DELETE FROM workforce_employee_leave_entitlement WHERE user_id = ?", [testUserId]);
      await db.run("DELETE FROM leave_leave WHERE user_id = ?", [testUserId]);
      await db.run("DELETE FROM workforce_employee_site_assignment WHERE user_id = ?", [testUserId]);
      await db.run("DELETE FROM workforce_site_access WHERE user_id = ?", [testManagerId]);
      await db.run("DELETE FROM accounts_employeeprofile WHERE user_id IN (?, ?)", [testUserId, testManagerId]);
      await db.run("DELETE FROM workforce_user_tenant WHERE user_id IN (?, ?)", [testUserId, testManagerId]);
      await db.run("DELETE FROM accounts_user WHERE id IN (?, ?)", [testUserId, testManagerId]);
    }
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });

  it("should safely handle 10 simultaneous punch-in requests for the same employee, allowing exactly 1 to succeed", async () => {
    const lat = 28.6139;
    const lng = 77.2090;
    const directPath = "test/mock_punch_in.jpg";
    const actor = { id: testUserId, role: "employee" };

    // Fire 10 simultaneous punch-in requests
    const promises = Array.from({ length: 10 }).map(() =>
      attendanceService.punchIn(testUserId, lat, lng, null, actor, directPath)
        .then((res) => ({ success: true, res }))
        .catch((err) => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 1, `Expected exactly 1 punch-in to succeed, got ${successes.length}`);
    assert.equal(failures.length, 9, `Expected exactly 9 punch-ins to fail, got ${failures.length}`);
    assert.ok(failures.every((f) => f.error.includes("Already punched in")), "All failures must report 'Already punched in'");

    // Verify database row count: exactly 1 open attendance record
    const openRecords = await db.all(
      "SELECT id, user_id, punch_out_time FROM attendance_attendance WHERE user_id = ? AND punch_out_time IS NULL",
      [testUserId]
    );
    assert.equal(openRecords.length, 1, "Exactly one open attendance record must exist in database");
  });

  it("should safely handle 10 simultaneous punch-out requests for the same employee, allowing exactly 1 to succeed", async () => {
    const lat = 28.6139;
    const lng = 77.2090;
    const directPath = "test/mock_punch_out.jpg";
    const actor = { id: testUserId, role: "employee" };

    // Fire 10 simultaneous punch-out requests
    const promises = Array.from({ length: 10 }).map(() =>
      attendanceService.punchOut(testUserId, lat, lng, null, actor, directPath)
        .then((res) => ({ success: true, res }))
        .catch((err) => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 1, `Expected exactly 1 punch-out to succeed, got ${successes.length}`);
    assert.equal(failures.length, 9, `Expected exactly 9 punch-outs to fail, got ${failures.length}`);
    assert.ok(failures.every((f) => f.error.includes("Punch in first")), "All failures must report 'Punch in first'");

    // Verify database record: punch_out_time must be populated
    const openRecords = await db.all(
      "SELECT id, punch_out_time FROM attendance_attendance WHERE user_id = ? AND punch_out_time IS NULL",
      [testUserId]
    );
    assert.equal(openRecords.length, 0, "Zero open attendance records must remain");
  });

  it("should support multiple distinct punch sessions per day for the same employee without constraint violation", async () => {
    const lat = 28.6139;
    const lng = 77.2090;
    const actor = { id: testUserId, role: "employee" };

    // Punch in session 2
    const inRes = await attendanceService.punchIn(testUserId, lat, lng, null, actor, "test/session2_in.jpg");
    assert.ok(inRes, "Second punch-in on same day should succeed");

    // Punch out session 2
    const outRes = await attendanceService.punchOut(testUserId, lat, lng, null, actor, "test/session2_out.jpg");
    assert.ok(outRes, "Second punch-out on same day should succeed");

    // Verify 2 completed attendance records exist for this user today
    const totalRecords = await db.all(
      "SELECT id, date, punch_in_time, punch_out_time FROM attendance_attendance WHERE user_id = ?",
      [testUserId]
    );
    assert.equal(totalRecords.length, 2, "Expected exactly 2 completed attendance sessions on the same date");
  });

  it("should safely handle concurrent leave approval actions, allowing exactly 1 reviewer decision to succeed", async () => {
    // Create a pending leave request
    const leaveRes = await db.run(
      "INSERT INTO leave_leave (user_id, leave_type, from_date, to_date, reason, status, created_at, site_id) VALUES (?, 'casual', '2027-01-01', '2027-01-02', 'Vacation', 'pending', NOW(), 2)",
      [testUserId]
    );
    const leaveId = leaveRes.lastID;

    // Simulate 5 concurrent approval attempts by manager
    const reviewer = { id: testManagerId, role: "manager", username: mgrUsername };
    const promises = Array.from({ length: 5 }).map(() =>
      leaveService.action(leaveId, "approved", reviewer)
        .then((res) => ({ success: true, res }))
        .catch((err) => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 1, `Expected exactly 1 leave approval to succeed, got ${successes.length}`);
    assert.equal(failures.length, 4, `Expected exactly 4 leave approvals to be rejected, got ${failures.length}`);

    // Verify leave status in database is approved
    const leaveRow = await db.get("SELECT status FROM leave_leave WHERE id = ?", [leaveId]);
    assert.equal(leaveRow.status, "approved");
  });

  it("should safely handle concurrent attendance exception approval actions", async () => {
    // Create out-of-location punch requiring approval
    const outsideLat = 10.0000;
    const outsideLng = 10.0000;
    const actor = { id: testUserId, role: "employee" };

    const inRes = await attendanceService.punchIn(testUserId, outsideLat, outsideLng, null, actor, "test/outside.jpg");
    assert.equal(inRes.requires_approval, true);

    const approval = await db.get(
      "SELECT id FROM attendance_attendanceapproval WHERE approved_by_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [testManagerId]
    );
    assert.ok(approval, "Pending approval must exist");

    // Fire 5 concurrent approval actions for this exception
    const reviewer = { id: testManagerId, role: "manager", username: mgrUsername };
    const promises = Array.from({ length: 5 }).map(() =>
      attendanceService.approvalAction(approval.id, "approved", "Approved by manager", reviewer)
        .then((res) => ({ success: true, res }))
        .catch((err) => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 1, `Expected exactly 1 attendance approval to succeed, got ${successes.length}`);
    assert.equal(failures.length, 4, `Expected exactly 4 to be rejected, got ${failures.length}`);
    assert.ok(failures.every((f) => f.error.includes("already closed")), "Failures must report item is already closed");
  });
});
