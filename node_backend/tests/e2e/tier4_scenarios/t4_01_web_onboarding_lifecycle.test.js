/**
 * Tier 4 — Scenario Suite 1: Web Onboarding Lifecycle
 * End-to-end multi-step workflow for a newly onboarded employee on Web:
 * 1. HR admin provisions new employee account
 * 2. Employee logs in with initial credentials
 * 3. Changes password to personal secret
 * 4. Logs in with new password and verifies profile
 * 5. Accesses attendance status
 * 6. Access token expires -> WebClient transparently silent refreshes
 * 7. Logout invalidates session -> back button navigation strictly forbidden (401)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";

describe("T4.01 — Web Onboarding Lifecycle Scenario", () => {
  let serverInfo;
  let hrAdmin;
  let employeeUsername;
  const initialPassword = "TemporaryPassword123!";
  const permanentPassword = "MySecurePermanentPassword123!";
  let createdUserId = null;

  before(async () => {
    serverInfo = await startTestServer();
    hrAdmin = await createTestUser({
      username: `t4_hr_${Date.now()}`,
      password: "ValidPassword123!",
      role: "hr"
    });
    employeeUsername = `t4_onboard_${Date.now()}`;
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(hrAdmin?.id);
    if (createdUserId) await deleteTestUser(createdUserId);
    await teardownAll();
  });

  it("T4-ONB-01: HR provision creates new employee account via /api/auth/create-employee/", async () => {
    const hrClient = new WebClient(serverInfo.baseUrl);
    const hrLogin = await hrClient.login(hrAdmin.username, "ValidPassword123!");
    assert.equal(hrLogin.status, 200, "HR login must succeed");

    const createRes = await hrClient.post("/api/auth/create-employee/", {
      username: employeeUsername,
      first_name: "Jane",
      last_name: "Doe",
      email: `${employeeUsername}@example.com`,
      password: initialPassword,
      role: "employee",
      department: "Engineering",
      designation: "Software Engineer"
    });

    assert.equal(createRes.status, 201, `Expected HTTP 201 Created, got ${createRes.status}`);
    const body = createRes.body?.data || createRes.body;
    assert.ok(body.id, "Created employee must have an id");
    createdUserId = body.id;
  });

  it("T4-ONB-02: Employee logs in with initial temporary password", async () => {
    const empClient = new WebClient(serverInfo.baseUrl);
    const loginRes = await empClient.login(employeeUsername, initialPassword);
    assert.equal(loginRes.status, 200, "Employee must authenticate successfully with initial credentials");

    const body = loginRes.body?.data || loginRes.body;
    assert.ok(body.access, "Must receive initial access token");
  });

  it("T4-ONB-03: Employee changes password to permanent secret", async () => {
    const empClient = new WebClient(serverInfo.baseUrl);
    await empClient.login(employeeUsername, initialPassword);

    const changeRes = await empClient.post("/api/auth/change-password/", {
      current_password: initialPassword,
      new_password: permanentPassword
    });

    assert.equal(changeRes.status, 200, "Password change must succeed with HTTP 200");
  });

  it("T4-ONB-04: Old password is immediately rejected, new password authenticates cleanly", async () => {
    const rawClient = new HttpClient(serverInfo.baseUrl);

    const oldLogin = await rawClient.post("/api/auth/login/", {
      username: employeeUsername,
      password: initialPassword
    });
    assert.ok([400, 401].includes(oldLogin.status), "Old password must be rejected after change");

    const newLogin = await rawClient.post("/api/auth/login/", {
      username: employeeUsername,
      password: permanentPassword
    });
    assert.equal(newLogin.status, 200, "New password must authenticate successfully");
  });

  it("T4-ONB-05: Authenticated employee checks attendance status and documents", async () => {
    const empClient = new WebClient(serverInfo.baseUrl);
    await empClient.login(employeeUsername, permanentPassword);

    const statusRes = await empClient.get("/api/attendance/status/");
    assert.equal(statusRes.status, 200, "Attendance status must return HTTP 200");

    const docsRes = await empClient.get("/api/auth/documents/my/");
    assert.equal(docsRes.status, 200, "Documents list must return HTTP 200");
  });

  it("T4-ONB-06: Expired access token triggers silent refresh, then logout strictly seals the session", async () => {
    const empClient = new WebClient(serverInfo.baseUrl);
    await empClient.login(employeeUsername, permanentPassword);

    // Invalidate access token to simulate idle timeout
    empClient.setAccessToken("expired_synthetic_token_onboarding");

    // Next request must trigger silent refresh and succeed
    const refreshRes = await empClient.get("/api/attendance/status/");
    assert.equal(refreshRes.status, 200, "Silent refresh must transparently recover expired session");

    // Perform logout
    const logoutRes = await empClient.logout();
    assert.equal(logoutRes.status, 200, "Logout must succeed");

    // Back button simulation: any subsequent request must return 401
    const backButtonRes = await empClient.get("/api/attendance/status/");
    assert.equal(backButtonRes.status, 401, "Protected route must reject terminated session");
  });
});
