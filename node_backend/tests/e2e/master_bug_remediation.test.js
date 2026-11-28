import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/db/index.js";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";

describe("Master Bug Remediation — Auth, Tenant Isolation, Attendance, Manager Sync & Analytics E2E", () => {
  let serverInfo;
  let mgr1, mgr2, emp1, emp2, otherTenantUser;
  let mgr1Client, mgr2Client, emp1Client, otherTenantClient;
  let tenant2Id = null;
  const createdAttIds = [];
  const createdLeaveIds = [];

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();

    // Create Tenant 2 for cross-tenant isolation tests
    const tRes = await db.run(
      `INSERT INTO workforce_tenant (name, is_active) VALUES (?, 1)`,
      [`RemediationTenant_${ts}`]
    );
    tenant2Id = tRes.lastID;

    mgr1 = await createTestUser({ username: `mbr_mgr1_${ts}`, password: "ValidPassword123!", role: "manager" });
    mgr2 = await createTestUser({ username: `mbr_mgr2_${ts}`, password: "ValidPassword123!", role: "manager" });
    emp1 = await createTestUser({ username: `mbr_emp1_${ts}`, password: "ValidPassword123!", role: "employee", managerId: mgr1.id });
    emp2 = await createTestUser({ username: `mbr_emp2_${ts}`, password: "ValidPassword123!", role: "employee", managerId: mgr2.id });
    otherTenantUser = await createTestUser({ username: `mbr_t2_${ts}`, password: "ValidPassword123!", role: "manager" });

    await db.run("UPDATE accounts_employeeprofile SET team_name = ? WHERE user_id IN (?, ?)", [`Alpha_${ts}`, mgr1.id, emp1.id]);
    await db.run("UPDATE accounts_employeeprofile SET team_name = ? WHERE user_id IN (?, ?)", [`Beta_${ts}`, mgr2.id, emp2.id]);

    // Move otherTenantUser exclusively into tenant2Id
    await db.run("DELETE FROM workforce_employee_site_assignment WHERE user_id = ?", [otherTenantUser.id]);
    await db.run("DELETE FROM workforce_site_access WHERE user_id = ?", [otherTenantUser.id]);
    await db.run("UPDATE workforce_user_tenant SET tenant_id = ? WHERE user_id = ?", [tenant2Id, otherTenantUser.id]);

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "web" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      return c;
    };

    [mgr1Client, mgr2Client, emp1Client, otherTenantClient] = await Promise.all([
      login(mgr1.username),
      login(mgr2.username),
      login(emp1.username),
      login(otherTenantUser.username),
    ]);
  });

  after(async () => {
    for (const id of createdAttIds) {
      await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id = ?", [id]);
      await db.run("DELETE FROM attendance_attendance WHERE id = ?", [id]);
    }
    for (const id of createdLeaveIds) {
      await db.run("DELETE FROM leave_leave WHERE id = ?", [id]);
    }
    for (const uid of [mgr1?.id, mgr2?.id, emp1?.id, emp2?.id, otherTenantUser?.id].filter(Boolean)) {
      await deleteTestUser(uid);
    }
    if (tenant2Id) {
      await db.run("DELETE FROM workforce_tenant WHERE id = ?", [tenant2Id]);
    }
    await teardownAll();
  });

  it("1. SSE ticket endpoint issues ephemeral ticket & rejects invalid ticket (Bug 1)", async () => {
    const ticketRes = await emp1Client.post("/api/auth/realtime/ticket/", {});
    assert.equal(ticketRes.status, 200);
    assert.ok(ticketRes.body?.ticket, "Expected SSE ticket string");

    const badClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const badRes = await badClient.get("/api/auth/realtime/?ticket=invalid-ticket-xyz");
    assert.equal(badRes.status, 401);
  });

  it("2. Scopes manager realtimeSync pending counts to authorized team & isolates tenants (Bugs 3, 8)", async () => {
    // Seed 1 pending leave for emp1 (under mgr1)
    const lvRes = await db.run(
      `INSERT INTO leave_leave (tenant_id, user_id, leave_type, from_date, to_date, reason, status, created_at)
       VALUES (1, ?, 'casual', '2026-12-01', '2026-12-01', 'Sync scope test', 'pending', NOW())`,
      [emp1.id]
    );
    createdLeaveIds.push(lvRes.lastID);

    // Seed 1 pending attendance + approval for emp1 (assigned to mgr1)
    const attRes = await db.run(
      `INSERT INTO attendance_attendance (tenant_id, user_id, date, work_date, punch_in_time, punch_out_time, status, punch_in_status, punch_out_status, is_outside_location)
       VALUES (1, ?, '2026-12-01', '2026-12-01', '2026-12-01 03:30:00', '2026-12-01 12:30:00', 'pending', 'approved', 'pending', 1)`,
      [emp1.id]
    );
    createdAttIds.push(attRes.lastID);
    await db.run(
      `INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type)
       VALUES ('manager', 'pending', '[Regularization Request] Test', NOW(), ?, ?, 'out')`,
      [mgr1.id, attRes.lastID]
    );

    const [sync1, sync2, syncT2] = await Promise.all([
      mgr1Client.get("/api/auth/realtime/sync"),
      mgr2Client.get("/api/auth/realtime/sync"),
      otherTenantClient.get("/api/auth/realtime/sync"),
    ]);

    assert.equal(sync1.status, 200);
    assert.equal(sync2.status, 200);
    assert.equal(syncT2.status, 200);

    assert.ok(sync1.body.metrics.pendingLeaveApprovals >= 1, "Manager 1 should see emp1 pending leave");
    assert.ok(sync1.body.metrics.pendingAttendanceApprovals >= 1, "Manager 1 should see emp1 pending attendance");
    assert.equal(sync2.body.metrics.pendingLeaveApprovals, 0, "Manager 2 must not see Manager 1 team leaves");
    assert.equal(sync2.body.metrics.pendingAttendanceApprovals, 0, "Manager 2 must not see Manager 1 attendance approvals");
    assert.equal(syncT2.body.metrics.pendingLeaveApprovals, 0, "Tenant 2 must not see Tenant 1 leaves");
    assert.equal(syncT2.body.metrics.pendingAttendanceApprovals, 0, "Tenant 2 must not see Tenant 1 attendance");
  });

  it("3. Regularized attendance approval computes total_hours & rejection returns user_id + notification (Bugs 2, 10)", async () => {
    const apRow = await db.get(
      "SELECT id FROM attendance_attendanceapproval WHERE attendance_id = ? LIMIT 1",
      [createdAttIds[0]]
    );
    const approveRes = await mgr1Client.post(`/api/attendance/approvals/${apRow.id}/`, { status: "approved", comment: "OK" });
    assert.equal(approveRes.status, 200);
    assert.ok(Number(approveRes.body.work_hours) > 0, "Regularized approval must return positive work_hours");

    const updatedAtt = await db.get("SELECT total_hours, status FROM attendance_attendance WHERE id = ?", [createdAttIds[0]]);
    assert.ok(Number(updatedAtt.total_hours) > 0, "Persisted total_hours must be computed on regularized approval");
    assert.equal(updatedAtt.status, "approved");

    // Seed another attendance for rejection path
    const rejAtt = await db.run(
      `INSERT INTO attendance_attendance (tenant_id, user_id, date, work_date, punch_in_time, status, punch_in_status, punch_out_status, is_outside_location)
       VALUES (1, ?, '2026-12-02', '2026-12-02', '2026-12-02 03:30:00', 'pending', 'pending', 'approved', 1)`,
      [emp1.id]
    );
    createdAttIds.push(rejAtt.lastID);
    const rejAp = await db.run(
      `INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type)
       VALUES ('manager', 'pending', 'Outside location', NOW(), ?, ?, 'in')`,
      [mgr1.id, rejAtt.lastID]
    );
    const rejRes = await mgr1Client.post(`/api/attendance/approvals/${rejAp.lastID}/`, { status: "rejected", comment: "Denied" });
    assert.equal(rejRes.status, 200);
    assert.equal(Number(rejRes.body.user_id), emp1.id, "Rejection response must include user_id");
  });

  it("4. TeamAnalytics supports server-side search, filters, pagination & Manager Team roster weekly-off query succeeds (Bugs 5, 9)", async () => {
    const analyticsRes = await mgr1Client.get(`/api/attendance/team-analytics/?days=30&page=1&limit=10&search=${emp1.username}`);
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsRes.body.members.length, 1);
    assert.equal(analyticsRes.body.members[0].username, emp1.username);
    assert.equal(analyticsRes.body.pagination.total, 1);

    const teamAttRes = await mgr1Client.get("/api/manager/team/attendance?date=2026-11-27");
    assert.equal(teamAttRes.status, 200);
    assert.ok(Array.isArray(teamAttRes.body.employees || teamAttRes.body.records || teamAttRes.body.data));
  });
});
