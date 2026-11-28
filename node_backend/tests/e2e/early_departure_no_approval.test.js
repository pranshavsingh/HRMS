import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { io as ioClient } from "socket.io-client";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import { db } from "../../src/db/index.js";
import { realtimeService } from "../../src/services/realtime.service.js";
import { shiftAttendanceService } from "../../src/services/shift-attendance.service.js";

function assertNoSocketEvent(socket, eventName, waitMs = 600) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      resolve(true);
    }, waitMs);
    function onEvent(data) {
      clearTimeout(timer);
      reject(new Error(`Unexpected socket event '${eventName}' received: ${JSON.stringify(data)}`));
    }
    socket.once(eventName, onEvent);
  });
}

describe("Early Departure Removal from Approval Workflow", () => {
  let serverInfo;
  const createdUserIds = [];
  const sockets = [];
  let manager, employee, mgrClient, empClient;
  let testShiftId, testShiftVersionId, testPolicyVersionId;

  before(async () => {
    serverInfo = await startTestServer();
    await realtimeService.init(serverInfo.server, { disableRedis: true });
    const ts = Date.now();

    manager = await createTestUser({ username: `ed_mgr_${ts}`, password: "ValidPassword123!", role: "manager" });
    employee = await createTestUser({ username: `ed_emp_${ts}`, password: "ValidPassword123!", role: "employee", managerId: manager.id });
    createdUserIds.push(manager.id, employee.id);

    await db.run("UPDATE accounts_employeeprofile SET team_name = ?, leave_allotted = 12 WHERE user_id IN (?, ?)", [`TeamED_${ts}`, manager.id, employee.id]);

    // Ensure a company policy version with early_departure_requires_approval=1 exists to prove backend ignores it
    const policyRow = await db.get("SELECT id FROM workforce_company_policy WHERE tenant_id = 1 LIMIT 1");
    let policyId = policyRow?.id;
    if (!policyId) {
      const pIns = await db.run("INSERT INTO workforce_company_policy (tenant_id, name, created_at) VALUES (1, 'Test Policy', NOW())");
      policyId = Number(pIns.lastID || pIns.insertId);
    }
    const pvIns = await db.run(
      `INSERT INTO workforce_company_policy_version
       (tenant_id, policy_id, version_number, effective_from, early_departure_grace_minutes, early_departure_requires_approval, overtime_enabled, overtime_requires_approval)
       VALUES (1, ?, ?, '2020-01-01', 15, 1, 0, 0)`,
      [policyId, Math.floor(ts / 1000) % 1000000]
    );
    testPolicyVersionId = Number(pvIns.lastID || pvIns.insertId);

    const sIns = await db.run(
      "INSERT INTO workforce_shift (tenant_id, code, name, is_active, created_at) VALUES (1, ?, 'Early Dep Test Shift', 1, NOW())",
      [`ED_${ts % 100000}`]
    );
    testShiftId = Number(sIns.lastID || sIns.insertId);

    const svIns = await db.run(
      `INSERT INTO workforce_shift_version
       (tenant_id, shift_id, policy_version_id, version_number, start_time, end_time, is_overnight, duration_minutes, late_grace_minutes, early_departure_grace_minutes, effective_from)
       VALUES (1, ?, ?, 1, '00:01:00', '23:55:00', 0, 1434, 15, 15, '2020-01-01')`,
      [testShiftId, testPolicyVersionId]
    );
    testShiftVersionId = Number(svIns.lastID || svIns.insertId);

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "web" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      c.accessToken = token;
      return c;
    };

    mgrClient = await login(manager.username);
    empClient = await login(employee.username);
  });

  after(async () => {
    for (const s of sockets) {
      try { s.disconnect(); } catch {}
    }
    for (const uid of createdUserIds) {
      await db.run("DELETE FROM notifications WHERE recipient_id = ? OR actor_id = ?", [uid, uid]).catch(() => {});
      await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = ?)", [uid]).catch(() => {});
      await db.run("DELETE FROM attendance_attendance WHERE user_id = ?", [uid]).catch(() => {});
      await db.run("DELETE FROM leave_leave WHERE user_id = ?", [uid]).catch(() => {});
      await deleteTestUser(uid);
    }
    if (testShiftVersionId) await db.run("DELETE FROM workforce_shift_version WHERE id = ?", [testShiftVersionId]).catch(() => {});
    if (testShiftId) await db.run("DELETE FROM workforce_shift WHERE id = ?", [testShiftId]).catch(() => {});
    if (testPolicyVersionId) await db.run("DELETE FROM workforce_company_policy_version WHERE id = ?", [testPolicyVersionId]).catch(() => {});
    await realtimeService.close();
    if (serverInfo) await serverInfo.close();
    await teardownAll();
  });

  it("1. shiftAttendanceService retains earlyDepartureMinutes calculation but never requires approval", async () => {
    const punchInTime = new Date("2026-11-26T00:05:00.000Z");
    const punchOutTime = new Date("2026-11-26T10:00:00.000Z"); // Well before 23:55 IST

    const evalRes = await shiftAttendanceService.evaluatePunchOut(
      {
        tenant_id: 1,
        work_date: "2026-11-26",
        date: "2026-11-26",
        punch_in_time: punchInTime,
        shift_version_id: testShiftVersionId,
        is_unscheduled: 0,
      },
      punchOutTime
    );

    assert.equal(evalRes.isEarlyDeparture, true, "Early departure flag must still be calculated");
    assert.ok(evalRes.earlyDepartureMinutes > 0, "Early departure minutes must still be calculated");
    assert.equal(evalRes.earlyDepartureRequiresApproval, false, "Early departure must NEVER require approval");
  });

  it("2. Early punch-out records attendance normally without approval row, notification, or badge increment", async () => {
    const mgrSock = ioClient(serverInfo.baseUrl, {
      path: "/socket.io",
      auth: { token: mgrClient.accessToken },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(mgrSock);
    await new Promise((resolve, reject) => {
      mgrSock.once("connect", resolve);
      mgrSock.once("connect_error", reject);
    });

    const beforeCount = await mgrClient.get("/api/attendance/approvals/pending-count");
    assert.equal(beforeCount.status, 200);

    // Seed an open scheduled attendance record for employee today
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const punchInUtc = new Date(now.getTime() - 3600 * 1000); // 1 hour ago

    const ins = await db.run(
      `INSERT INTO attendance_attendance
       (date, work_date, tenant_id, punch_in_time, punch_in_status, status, punch_in_outside, is_outside_location, user_id, shift_version_id, is_unscheduled)
       VALUES (?, ?, 1, ?, 'approved', 'approved', 0, 0, ?, ?, 0)`,
      [todayStr, todayStr, punchInUtc, employee.id, testShiftVersionId]
    );
    const attId = Number(ins.lastID || ins.insertId);

    const noBadgeEvtPromise = assertNoSocketEvent(mgrSock, "approval:attendance:count-updated");

    // Employee punches out inside geofence (28.6139, 77.2090) -> should succeed with NO approval request
    const outRes = await empClient.post("/api/attendance/punch-out/", {
      latitude: 28.6139,
      longitude: 77.2090,
      photo_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });
    assert.equal(outRes.status, 200);
    assert.equal(outRes.body.requires_approval, false);
    assert.equal(outRes.body.requires_manager_approval, false);
    assert.equal(outRes.body.punch_out_status, "approved");

    await noBadgeEvtPromise;

    const approvalRows = await db.all("SELECT * FROM attendance_attendanceapproval WHERE attendance_id = ?", [attId]);
    assert.equal(approvalRows.length, 0, "Zero approval rows may be created for early departure");

    const notifs = await db.all("SELECT * FROM notifications WHERE recipient_id = ? AND type = 'attendance:punch_out_review'", [manager.id]);
    assert.equal(notifs.length, 0, "Zero punch_out_review notifications may be created for early departure");

    const afterCount = await mgrClient.get("/api/attendance/approvals/pending-count");
    assert.equal(afterCount.body.count, beforeCount.body.count);
  });

  it("3. Historical early departure approval rows are excluded from queues, summaries, and pending count", async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const ins = await db.run(
      `INSERT INTO attendance_attendance
       (date, work_date, tenant_id, punch_in_time, punch_out_time, punch_in_status, punch_out_status, status, user_id)
       VALUES (?, ?, 1, NOW(), NOW(), 'approved', 'approved', 'approved', ?)`,
      [todayStr, todayStr, employee.id]
    );
    const attId = Number(ins.lastID || ins.insertId);
    await db.run(
      `INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type)
       VALUES ('manager', 'pending', 'Early departure by 45 minutes', NOW(), ?, ?, 'out')`,
      [manager.id, attId]
    );

    const listRes = await mgrClient.get("/api/attendance/approvals/");
    assert.equal(listRes.status, 200);
    const hasEarly = (listRes.body.records || []).some((r) => r.exception_category === "early_departure");
    assert.equal(hasEarly, false, "Attendance Approvals list must exclude early_departure items");

    const countRes = await mgrClient.get("/api/attendance/approvals/pending-count");
    assert.equal(countRes.status, 200);
    assert.equal(countRes.body.count, 0, "Pending count badge must exclude historical early_departure items");
  });

  it("4. Web AttendanceApprovals and Shifts pages exclude early departure approval options", () => {
    const rootDir = path.resolve(import.meta.dirname, "../../..");
    const approvalsPage = fs.readFileSync(path.join(rootDir, "hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
    const shiftsPage = fs.readFileSync(path.join(rootDir, "hrms_saas/src/pages/Shifts.jsx"), "utf8");
    assert.equal(approvalsPage.includes('value="early_departure"'), false);
    assert.equal(shiftsPage.includes("Early departure requires approval"), false);
  });
});
