/**
 * Tier 1 — Feature 15: Error Resilience & RBAC Controls
 * Verifies that server does not leak internal stack traces or file paths,
 * and enforces RBAC boundaries across superadmin, admin, hr, manager, and employee.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.15 — Error Resilience & RBAC Controls", () => {
  let serverInfo;
  let superadminUser;
  let hrUser;
  let employeeUser1;
  let employeeUser2;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });

    superadminUser = await createTestUser({
      username: `t1_sa_${Date.now()}`,
      role: "superadmin",
      isSuperuser: 1
    });

    hrUser = await createTestUser({
      username: `t1_hr_${Date.now()}`,
      role: "hr"
    });

    employeeUser1 = await createTestUser({
      username: `t1_emp1_${Date.now()}`,
      role: "employee"
    });

    employeeUser2 = await createTestUser({
      username: `t1_emp2_${Date.now()}`,
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(superadminUser?.id);
    await deleteTestUser(hrUser?.id);
    await deleteTestUser(employeeUser1?.id);
    await deleteTestUser(employeeUser2?.id);
    await teardownAll();
  });

  it("T1-RESIL-01: API error responses never expose internal stack traces or file paths", async () => {
    // Dispatch malformed request to trigger 400 Bad Request
    const res = await client.post("/api/auth/login/", {
      username: "",
      password: ""
    });

    assert.equal(res.status, 400);
    const bodyStr = JSON.stringify(res.body);

    // Assert zero internal paths or stack traces leaked
    assert.doesNotMatch(bodyStr, /at\s+[\w\d_.]+\s+\(/i, "Response body must not contain JS stack trace");
    assert.doesNotMatch(bodyStr, /[A-Za-z]:\\[\w\d_\\/.-]+\.js/, "Response body must not contain Windows absolute file paths");
    assert.doesNotMatch(bodyStr, /\/Users\/[\w\d_/.-]+\.js/, "Response body must not contain POSIX file paths");
  });

  it("T1-RESIL-02: Superadmin role successfully accesses administrative summary", async () => {
    const token = jwt.sign(
      { userId: superadminUser.id, role: "superadmin", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/auth/admin-summary/", {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200, "Superadmin must be permitted to access admin summary");
  });

  it("T1-RESIL-03: Employee role is rejected from admin summary with HTTP 403 Forbidden", async () => {
    const token = jwt.sign(
      { userId: employeeUser1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/auth/admin-summary/", {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 403, "Employee must receive HTTP 403 when accessing admin summary");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(not allowed|forbidden|permission)/i);
  });

  it("T1-RESIL-04: HR role is authorized to list employees, but employee role is forbidden", async () => {
    const hrToken = jwt.sign(
      { userId: hrUser.id, role: "hr", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );
    const empToken = jwt.sign(
      { userId: employeeUser1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const hrRes = await client.get("/api/auth/employees/", {
      headers: { Authorization: `Bearer ${hrToken}` }
    });
    assert.equal(hrRes.status, 200, "HR must be authorized to view employees");

    const empRes = await client.get("/api/auth/employees/", {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    assert.equal(empRes.status, 403, "Employee must be rejected from viewing all employees");
  });

  it("T1-RESIL-05: Non-privileged users cannot delete employee records", async () => {
    const empToken = jwt.sign(
      { userId: employeeUser1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const deleteRes = await client.delete(`/api/auth/employees/${employeeUser2.id}/`, null, {
      headers: { Authorization: `Bearer ${empToken}` }
    });

    assert.equal(deleteRes.status, 403, "Employee must not be able to delete other employee records");
  });
});
