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

function waitForSocketEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for socket event '${eventName}'`));
    }, timeoutMs);
    function onEvent(data) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(eventName, onEvent);
  });
}

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

describe("Dynamic Pending Approval Counting Badges — E2E, Security & Realtime", () => {
  let serverInfo;
  const createdUserIds = [];
  const createdTenantIds = [];
  const sockets = [];

  let superadmin, admin, hr, manager1, manager2, emp1, empOfMgr, tenant2Admin;
  let superadminClient, adminClient, hrClient, mgr1Client, mgr2Client, emp1Client, empOfMgrClient, t2AdminClient;

  before(async () => {
    serverInfo = await startTestServer();
    await realtimeService.init(serverInfo.server, { disableRedis: true });
    const ts = Date.now();

    superadmin = await createTestUser({ username: `pc_sa_${ts}`, password: "ValidPassword123!", role: "superadmin", tenantId: 1 });
    admin = await createTestUser({ username: `pc_adm_${ts}`, password: "ValidPassword123!", role: "admin", tenantId: 1 });
    hr = await createTestUser({ username: `pc_hr_${ts}`, password: "ValidPassword123!", role: "hr", tenantId: 1 });
    manager1 = await createTestUser({ username: `pc_m1_${ts}`, password: "ValidPassword123!", role: "manager", tenantId: 1, teamName: `TeamA_${ts}` });
    manager2 = await createTestUser({ username: `pc_m2_${ts}`, password: "ValidPassword123!", role: "manager", tenantId: 1, teamName: `TeamB_${ts}` });
    emp1 = await createTestUser({ username: `pc_e1_${ts}`, password: "ValidPassword123!", role: "employee", tenantId: 1, managerId: manager1.id, teamName: `TeamA_${ts}` });
    empOfMgr = await createTestUser({ username: `pc_e2_${ts}`, password: "ValidPassword123!", role: "employee", tenantId: 1, managerId: manager1.id, teamName: `TeamA_${ts}` });

    createdUserIds.push(superadmin.id, admin.id, hr.id, manager1.id, manager2.id, emp1.id, empOfMgr.id);
    await db.run("UPDATE accounts_employeeprofile SET leave_allotted = 12, team_name = ? WHERE user_id IN (?, ?, ?)", [`TeamA_${ts}`, emp1.id, empOfMgr.id, manager1.id]);
    await db.run("UPDATE accounts_employeeprofile SET team_name = ? WHERE user_id = ?", [`TeamB_${ts}`, manager2.id]);

    // Create isolated Tenant 2 for cross-organization security tests
    const tRes = await db.run(
      "INSERT INTO workforce_tenant (code, name, is_active, created_at) VALUES (?, ?, 1, NOW())",
      [`T2_${ts}`, `Tenant Two ${ts}`]
    );
    const tenant2Id = Number(tRes.lastID || tRes.insertId);
    createdTenantIds.push(tenant2Id);
    tenant2Admin = await createTestUser({ username: `pc_t2a_${ts}`, password: "ValidPassword123!", role: "admin" });
    await db.run("DELETE FROM workforce_employee_site_assignment WHERE user_id = ?", [tenant2Admin.id]);
    await db.run("UPDATE workforce_user_tenant SET tenant_id = ? WHERE user_id = ?", [tenant2Id, tenant2Admin.id]);
    createdUserIds.push(tenant2Admin.id);

    const login = async (username, platform = "web") => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform });
      assert.equal(res.status, 200, `Login failed for ${username}`);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      c.accessToken = token;
      return { client: c, token };
    };

    ({ client: superadminClient } = await login(superadmin.username, "web"));
    ({ client: adminClient } = await login(admin.username, "web"));
    ({ client: hrClient } = await login(hr.username, "mobile"));
    ({ client: mgr1Client } = await login(manager1.username, "web"));
    ({ client: mgr2Client } = await login(manager2.username, "mobile"));
    ({ client: emp1Client } = await login(emp1.username, "mobile"));
    ({ client: empOfMgrClient } = await login(empOfMgr.username, "web"));
    ({ client: t2AdminClient } = await login(tenant2Admin.username, "web"));
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
    for (const tid of createdTenantIds) {
      await db.run("DELETE FROM workforce_tenant WHERE id = ?", [tid]).catch(() => {});
    }
    await realtimeService.close();
    if (serverInfo) await serverInfo.close();
    await teardownAll();
  });

  function connectSocket(token, extraAuth = {}) {
    const s = ioClient(serverInfo.baseUrl, {
      path: "/socket.io",
      auth: { token, ...extraAuth },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(s);
    return new Promise((resolve, reject) => {
      s.once("connect", () => resolve(s));
      s.once("connect_error", reject);
    });
  }

  describe("1. Security & Access Control", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const anon = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const attRes = await anon.get("/api/attendance/approvals/pending-count");
      const leaveRes = await anon.get("/api/leave/approvals/pending-count");
      assert.equal(attRes.status, 401);
      assert.equal(leaveRes.status, 401);
    });

    it("rejects employee role from viewing approval counts with 403", async () => {
      const attRes = await emp1Client.get("/api/attendance/approvals/pending-count");
      const leaveRes = await emp1Client.get("/api/leave/approvals/pending-count");
      assert.equal(attRes.status, 403);
      assert.equal(leaveRes.status, 403);
    });
  });

  describe("2. Leave Approvals Pending Count & Multi-Level Hierarchy", () => {
    it("increases and decreases accurately across submission, approval, rejection, and hierarchy", async () => {
      const initMgr1 = await mgr1Client.get("/api/leave/approvals/pending-count");
      const initMgr2 = await mgr2Client.get("/api/leave/approvals/pending-count");
      const initHr = await hrClient.get("/api/leave/approvals/pending-count");
      const initAdmin = await adminClient.get("/api/leave/approvals/pending-count");
      const initT2 = await t2AdminClient.get("/api/leave/approvals/pending-count");
      assert.equal(initMgr1.status, 200);
      assert.equal(initT2.body.count, 0);

      // Connect Web (mgr1, admin, t2Admin) and Mobile (hr, mgr2, emp1) sockets
      const mgr1Sock = await connectSocket(mgr1Client.accessToken);
      const hrSock = await connectSocket(hrClient.accessToken);
      const empSock = await connectSocket(emp1Client.accessToken);
      const t2Sock = await connectSocket(t2AdminClient.accessToken);

      const mgr1EvtPromise = waitForSocketEvent(mgr1Sock, "approval:leave:count-updated");
      const hrEvtPromise = waitForSocketEvent(hrSock, "approval:leave:count-updated");
      const empNoEvtPromise = assertNoSocketEvent(empSock, "approval:leave:count-updated");
      const t2NoEvtPromise = assertNoSocketEvent(t2Sock, "approval:leave:count-updated");

      // emp1 (mobile) applies for leave -> mgr1, hr, admin, superadmin see +1; mgr2 and tenant2 see +0
      const applyRes = await emp1Client.post("/api/leave/apply/", {
        leave_type: "casual",
        from_date: "2026-12-10",
        to_date: "2026-12-11",
        reason: "Pending count test",
        confirm_insufficient_balance: true,
      });
      assert.equal(applyRes.status, 200);

      const [mgr1Evt, hrEvt] = await Promise.all([mgr1EvtPromise, hrEvtPromise, empNoEvtPromise, t2NoEvtPromise]);
      // Zero PII check on event payload
      assert.equal(mgr1Evt.payload.domain, "leave");
      assert.equal(mgr1Evt.payload.employee_name, undefined);
      assert.equal(hrEvt.payload.domain, "leave");

      const afterApplyMgr1 = await mgr1Client.get("/api/leave/approvals/pending-count");
      const afterApplyMgr2 = await mgr2Client.get("/api/leave/approvals/pending-count");
      const afterApplyHr = await hrClient.get("/api/leave/approvals/pending-count");
      const afterApplyAdmin = await adminClient.get("/api/leave/approvals/pending-count");
      const afterApplyT2 = await t2AdminClient.get("/api/leave/approvals/pending-count");

      assert.equal(afterApplyMgr1.body.count, initMgr1.body.count + 1);
      assert.equal(afterApplyMgr2.body.count, initMgr2.body.count); // Unrelated manager must not count emp1
      assert.equal(afterApplyHr.body.count, initHr.body.count + 1);
      assert.equal(afterApplyAdmin.body.count, initAdmin.body.count + 1);
      assert.equal(afterApplyT2.body.count, 0); // Cross-tenant isolation

      // Find the leave ID and approve it via mgr1 (web) -> counts decrease
      const listRes = await mgr1Client.get("/api/leave/approvals/?status=pending");
      const createdLeave = listRes.body.records.find((r) => Number(r.employee_id) === Number(emp1.id));
      assert.ok(createdLeave, "Created leave must appear in manager approvals");

      const mgr1DecPromise = waitForSocketEvent(mgr1Sock, "approval:leave:count-updated");
      const actionRes = await mgr1Client.post(`/api/leave/action/${createdLeave.id}/`, { status: "approved" });
      assert.equal(actionRes.status, 200);
      await mgr1DecPromise;

      const afterApproveMgr1 = await mgr1Client.get("/api/leave/approvals/pending-count");
      const afterApproveHr = await hrClient.get("/api/leave/approvals/pending-count");
      assert.equal(afterApproveMgr1.body.count, initMgr1.body.count);
      assert.equal(afterApproveHr.body.count, initHr.body.count);

      // Multi-level: Manager1 applies for leave -> HR/Admin/Superadmin +1, Manager1 (self) & Manager2 +0
      const mgrApplyRes = await mgr1Client.post("/api/leave/apply/", {
        leave_type: "casual",
        from_date: "2026-12-15",
        to_date: "2026-12-15",
        reason: "Manager leave hierarchy check",
        confirm_insufficient_balance: true,
      });
      assert.equal(mgrApplyRes.status, 200);

      const mgrSelfCount = await mgr1Client.get("/api/leave/approvals/pending-count");
      const mgr2Count = await mgr2Client.get("/api/leave/approvals/pending-count");
      const hrCount = await hrClient.get("/api/leave/approvals/pending-count");
      assert.equal(mgrSelfCount.body.count, initMgr1.body.count);
      assert.equal(mgr2Count.body.count, initMgr2.body.count);
      assert.equal(hrCount.body.count, initHr.body.count + 1);

      // Reject manager1's leave via HR (mobile) -> HR count returns to baseline
      const hrList = await hrClient.get("/api/leave/approvals/?status=pending");
      const mgrLeave = hrList.body.records.find((r) => Number(r.employee_id) === Number(manager1.id));
      assert.ok(mgrLeave);
      const rejectRes = await hrClient.post(`/api/leave/action/${mgrLeave.id}/`, { status: "rejected" });
      assert.equal(rejectRes.status, 200);

      const finalHrCount = await hrClient.get("/api/leave/approvals/pending-count");
      assert.equal(finalHrCount.body.count, initHr.body.count);
    });
  });

  describe("3. Attendance Approvals Pending Count & Reassignment", () => {
    it("tracks attendance approval submissions, approvals, and manager reassignment in real time", async () => {
      const initMgr1 = await mgr1Client.get("/api/attendance/approvals/pending-count");
      const initMgr2 = await mgr2Client.get("/api/attendance/approvals/pending-count");
      const initHr = await hrClient.get("/api/attendance/approvals/pending-count");

      const mgr1Sock = await connectSocket(mgr1Client.accessToken);
      const mgr2Sock = await connectSocket(mgr2Client.accessToken);

      // Insert a pending attendance punch-in exception for empOfMgr (assigned to manager1)
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const attRes = await db.run(
        `INSERT INTO attendance_attendance
         (date, work_date, tenant_id, punch_in_time, punch_in_status, status, punch_in_outside, is_outside_location, user_id)
         VALUES (?, ?, 1, NOW(), 'pending', 'pending', 1, 1, ?)`,
        [dateStr, dateStr, empOfMgr.id]
      );
      const attId = Number(attRes.lastID || attRes.insertId);
      const apRes = await db.run(
        `INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type)
         VALUES ('manager', 'pending', NULL, NOW(), ?, ?, 'in')`,
        [manager1.id, attId]
      );
      const apId = Number(apRes.lastID || apRes.insertId);

      // Check initial counts: mgr1 +1, mgr2 +0, hr +1
      const cMgr1Before = await mgr1Client.get("/api/attendance/approvals/pending-count");
      const cMgr2Before = await mgr2Client.get("/api/attendance/approvals/pending-count");
      const cHrBefore = await hrClient.get("/api/attendance/approvals/pending-count");
      assert.equal(cMgr1Before.body.count, initMgr1.body.count + 1);
      assert.equal(cMgr2Before.body.count, initMgr2.body.count);
      assert.equal(cHrBefore.body.count, initHr.body.count + 1);

      // Reassign empOfMgr from manager1 -> manager2 via Admin API
      const mgr1ReassignEvt = waitForSocketEvent(mgr1Sock, "approval:attendance:count-updated");
      const mgr2ReassignEvt = waitForSocketEvent(mgr2Sock, "approval:attendance:count-updated");

      const updRes = await adminClient.put(`/api/auth/employees/${empOfMgr.id}/`, {
        manager: manager2.id,
      });
      assert.equal(updRes.status, 200);
      await Promise.all([mgr1ReassignEvt, mgr2ReassignEvt]);

      // Note: aa.approved_by_id still points to manager1 on the existing row,
      // while ep.manager_id is now manager2 so manager2 gains visibility and count increases!
      const cMgr2AfterReassign = await mgr2Client.get("/api/attendance/approvals/pending-count");
      assert.equal(cMgr2AfterReassign.body.count, initMgr2.body.count + 1);

      // Approve the attendance exception via manager2 -> count decreases
      const mgr2ApproveEvt = waitForSocketEvent(mgr2Sock, "approval:attendance:count-updated");
      const actRes = await mgr2Client.post(`/api/attendance/approvals/${apId}/`, {
        status: "approved",
        comment: "Approved after reassignment",
      });
      assert.equal(actRes.status, 200);
      await mgr2ApproveEvt;

      const cMgr1Final = await mgr1Client.get("/api/attendance/approvals/pending-count");
      const cMgr2Final = await mgr2Client.get("/api/attendance/approvals/pending-count");
      const cHrFinal = await hrClient.get("/api/attendance/approvals/pending-count");
      assert.equal(cMgr1Final.body.count, initMgr1.body.count);
      assert.equal(cMgr2Final.body.count, initMgr2.body.count);
      assert.equal(cHrFinal.body.count, initHr.body.count);
    });
  });

  describe("4. Frontend Component & Integration Hygiene", () => {
    it("verifies PendingCountBadge exists and handles 0, 99+, loading, error, and accessibility on Web & Mobile", () => {
      const rootDir = path.resolve(import.meta.dirname, "../../..");
      const webBadge = fs.readFileSync(path.join(rootDir, "hrms_saas/src/components/common/PendingCountBadge.jsx"), "utf8");
      const mobileBadge = fs.readFileSync(path.join(rootDir, "hrms_mobile/src/components/PendingCountBadge.tsx"), "utf8");
      const webSidebar = fs.readFileSync(path.join(rootDir, "hrms_saas/src/components/layout/Sidebar.jsx"), "utf8");
      const mobileApprovals = fs.readFileSync(path.join(rootDir, "hrms_mobile/src/app/(tabs)/approvals.tsx"), "utf8");

      for (const code of [webBadge, mobileBadge]) {
        assert.ok(code.includes("numericCount <= 0"), "Must hide when count <= 0");
        assert.ok(code.includes("99+"), "Must cap display at 99+");
        assert.ok(code.includes("loading") && code.includes("error"), "Must guard loading and error states");
      }
      assert.ok(webBadge.includes("aria-label"), "Web badge must include aria-label");
      assert.ok(mobileBadge.includes("accessibilityLabel"), "Mobile badge must include accessibilityLabel");
      assert.ok(webSidebar.includes("PendingCountBadge"), "Web Sidebar must render PendingCountBadge");
      assert.ok(mobileApprovals.includes("PendingCountBadge"), "Mobile Approvals must render PendingCountBadge");
    });
  });
});
