import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { io as ioClient } from "socket.io-client";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import { db } from "../../src/db/index.js";
import { realtimeService } from "../../src/services/realtime.service.js";

describe("Manager Workspace — My Team Attendance Register E2E, RBAC & Realtime", () => {
  let serverInfo;
  const createdUserIds = [];
  const sockets = [];
  let manager1, manager2, emp1, emp2;
  let mgr1Client, mgr2Client, emp1Client;

  before(async () => {
    serverInfo = await startTestServer();
    await realtimeService.init(serverInfo.server, { disableRedis: true });
    const ts = Date.now();

    manager1 = await createTestUser({ username: `mt_m1_${ts}`, password: "ValidPassword123!", role: "manager" });
    manager2 = await createTestUser({ username: `mt_m2_${ts}`, password: "ValidPassword123!", role: "manager" });
    emp1 = await createTestUser({ username: `mt_e1_${ts}`, password: "ValidPassword123!", role: "employee", managerId: manager1.id });
    emp2 = await createTestUser({ username: `mt_e2_${ts}`, password: "ValidPassword123!", role: "employee", managerId: manager2.id });
    createdUserIds.push(manager1.id, manager2.id, emp1.id, emp2.id);

    await db.run("UPDATE accounts_employeeprofile SET team_name = ?, designation = 'Field Engineer' WHERE user_id IN (?, ?)", [`DeptA_${ts}`, manager1.id, emp1.id]);
    await db.run("UPDATE accounts_employeeprofile SET team_name = ?, designation = 'Support Analyst' WHERE user_id IN (?, ?)", [`DeptB_${ts}`, manager2.id, emp2.id]);

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "mobile" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      c.accessToken = token;
      return c;
    };

    mgr1Client = await login(manager1.username);
    mgr2Client = await login(manager2.username);
    emp1Client = await login(emp1.username);
  });

  after(async () => {
    for (const s of sockets) {
      try { s.disconnect(); } catch {}
    }
    for (const uid of createdUserIds) {
      await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = ?)", [uid]).catch(() => {});
      await db.run("DELETE FROM attendance_attendance WHERE user_id = ?", [uid]).catch(() => {});
      await db.run("DELETE FROM leave_leave WHERE user_id = ?", [uid]).catch(() => {});
      await deleteTestUser(uid);
    }
    await realtimeService.close();
    if (serverInfo) await serverInfo.close();
    await teardownAll();
  });

  it("1. Enforces strict RBAC & manager team isolation", async () => {
    const anon = new HttpClient({ baseUrl: serverInfo.baseUrl });
    assert.equal((await anon.get("/api/manager/team")).status, 401);

    assert.equal((await emp1Client.get("/api/manager/team")).status, 403);
    assert.equal((await emp1Client.get("/api/manager/team/attendance")).status, 403);
    assert.equal((await emp1Client.get(`/api/manager/team/${emp1.id}/attendance`)).status, 403);
    assert.equal((await emp1Client.get(`/api/manager/team/${emp1.id}/attendance/2026-11-26`)).status, 403);

    // Manager 1 CANNOT view Manager 2's employee (emp2)
    assert.equal((await mgr1Client.get(`/api/manager/team/${emp2.id}/attendance`)).status, 403);
    assert.equal((await mgr1Client.get(`/api/manager/team/${emp2.id}/attendance/2026-11-26`)).status, 403);

    // Manager 1 CAN view their own employee (emp1)
    const teamRes = await mgr1Client.get("/api/manager/team");
    assert.equal(teamRes.status, 200);
    assert.ok(teamRes.body.records.some((r) => r.id === emp1.id));
    assert.equal(teamRes.body.records.some((r) => r.id === emp2.id), false);
  });

  it("2. Returns accurate date summary, search, status filters, monthly register, daily details & realtime sync", async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const monthStr = todayStr.slice(0, 7);

    // Before punch-in: emp1 is not_checked_in (or holiday/weekly_off if today is a non-working day)
    const beforeRes = await mgr1Client.get(`/api/manager/team/attendance?date=${todayStr}`);
    assert.equal(beforeRes.status, 200);
    assert.equal(beforeRes.body.summary.total_team_members, 1);
    assert.ok(["not_checked_in", "holiday", "weekly_off"].includes(beforeRes.body.records[0].status));
    if (beforeRes.body.records[0].status === "not_checked_in") {
      assert.equal(beforeRes.body.summary.not_checked_in, 1);
    }
    assert.equal(beforeRes.body.summary.present, 0);

    // Connect Manager 1 Socket.IO client
    const mgrSock = ioClient(serverInfo.baseUrl, {
      path: "/socket.io",
      auth: { token: mgr1Client.accessToken },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(mgrSock);
    await new Promise((resolve, reject) => {
      mgrSock.once("connect", resolve);
      mgrSock.once("connect_error", reject);
    });

    const attEvtPromise = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timed out waiting for attendance_update")), 4000);
      mgrSock.once("attendance_update", (d) => {
        clearTimeout(t);
        resolve(d);
      });
    });

    // emp1 punches in inside geofence
    const punchInRes = await emp1Client.post("/api/attendance/punch-in/", {
      latitude: 28.6139,
      longitude: 77.209,
      photo_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });
    assert.equal(punchInRes.status, 200);
    await attEvtPromise;

    // After punch-in: summary updates to present = 1, not_checked_in = 0
    const afterInRes = await mgr1Client.get(`/api/manager/team/attendance?date=${todayStr}&search=${emp1.username}`);
    assert.equal(afterInRes.status, 200);
    assert.equal(afterInRes.body.summary.present, 1);
    assert.equal(afterInRes.body.summary.not_checked_in, 0);
    assert.equal(afterInRes.body.records[0].employee_id, emp1.id);

    // Individual monthly register
    const regRes = await mgr1Client.get(`/api/manager/team/${emp1.id}/attendance?month=${monthStr}`);
    assert.equal(regRes.status, 200);
    assert.equal(regRes.body.employee.id, emp1.id);
    assert.ok(Array.isArray(regRes.body.days) && regRes.body.days.length >= 28);

    // Daily detail
    const dayRes = await mgr1Client.get(`/api/manager/team/${emp1.id}/attendance/${todayStr}`);
    assert.equal(dayRes.status, 200);
    assert.equal(dayRes.body.employee.id, emp1.id);
    assert.ok(dayRes.body.attendance?.punch_in_time);
    assert.ok(dayRes.body.attendance?.punch_in_location);
  });
});
