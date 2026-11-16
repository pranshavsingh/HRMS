/**
 * Tier 2 — Boundary Suite 7: Permission Boundary Roles & Escalation
 * Verifies privilege escalation prevention, role enforcement on restricted routes,
 * active token rejection on account deactivation, and forged role claim rejection.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";
import redisService from "../../../src/services/redis.service.js";

describe("T2.07 — Permission Boundary Roles & Escalation", () => {
  let serverInfo;
  let managerUser;
  let employeeUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });

    managerUser = await createTestUser({
      username: `t2_mgr_${Date.now()}`,
      role: "manager"
    });

    employeeUser = await createTestUser({
      username: `t2_perm_emp_${Date.now()}`,
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(managerUser?.id);
    await deleteTestUser(employeeUser?.id);
    await teardownAll();
  });

  it("T2-PERM-01: Manager cannot create employees (restricted to HR and Admin)", async () => {
    const mgrToken = jwt.sign(
      { userId: managerUser.id, role: "manager", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.post("/api/auth/create-employee/", {
      username: "new_emp_attempt",
      email: "new_emp_attempt@example.com"
    }, {
      headers: { Authorization: `Bearer ${mgrToken}` }
    });

    assert.equal(res.status, 403, "Manager must be denied from employee creation");
  });

  it("T2-PERM-02: Deactivated user with unexpired access token is rejected upon session check", async () => {
    // 1. User is active, holds valid access token
    const token = jwt.sign(
      { userId: employeeUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    // 2. Deactivate user in database and purge Redis session cache
    await db.run("UPDATE accounts_user SET is_active = 0 WHERE id = ?", [employeeUser.id]);
    try {
      await redisService.del(`user:session:${employeeUser.id}`);
      await redisService.set(`user:revoked:${employeeUser.id}`, Date.now(), 86400);
    } catch (e) {
      // Redis optional fallback
    }

    // 3. Dispatch request with unexpired token
    const res = await client.get("/api/attendance/status/", {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 401, "Deactivated user must be rejected with HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(inactive|disabled|session revoked|authentication|invalid token)/i);

    // Restore user active status
    await db.run("UPDATE accounts_user SET is_active = 1 WHERE id = ?", [employeeUser.id]);
  });

  it("T2-PERM-03: Access token with forged superadmin role claim is rejected (invalid signature)", async () => {
    // Forged token signed with attacker key
    const forgedToken = jwt.sign(
      { userId: employeeUser.id, role: "superadmin", type: "access" },
      "attacker-private-key-999",
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/auth/admin-summary/", {
      headers: { Authorization: `Bearer ${forgedToken}` }
    });

    assert.equal(res.status, 401, "Forged token signature must return HTTP 401");
  });

  it("T2-PERM-04: Unauthenticated user is rejected from protected endpoints", async () => {
    const res = await client.get("/api/auth/employees/");
    assert.equal(res.status, 401, "Protected endpoint without token must return HTTP 401");
  });

  it("T2-PERM-05: Non-superadmin cannot access superadmin audit logs", async () => {
    const mgrToken = jwt.sign(
      { userId: managerUser.id, role: "manager", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/auth/audit-logs/", {
      headers: { Authorization: `Bearer ${mgrToken}` }
    });

    assert.ok([403, 404].includes(res.status), "Audit logs must not be accessible to managers");
  });
});
