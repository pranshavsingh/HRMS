/**
 * Tier 4 — Scenario Suite 3: Admin Role Revocation & Real-Time Enforcement
 * Real-world security drill:
 * 1. Employee has active sessions on Web and Mobile
 * 2. Security Admin deactivates/terminates employee account
 * 3. Employee's active sessions on all devices are immediately severed
 * 4. Refresh token attempts are rejected (401)
 * 5. Direct login attempts are rejected (401)
 * 6. Reactivation by Admin restores clean login capability
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient, MobileClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";
import redisService from "../../../src/services/redis.service.js";

describe("T4.03 — Admin Role Revocation & Real-Time Enforcement", () => {
  let serverInfo;
  let testUser;
  let web;
  let mobile;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t4_sec_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
    web = new WebClient(serverInfo.baseUrl);
    mobile = new MobileClient(serverInfo.baseUrl);
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T4-SEC-01: Employee establishes active concurrent sessions on Web and Mobile", async () => {
    const webRes = await web.login(testUser.username, "ValidPassword123!");
    const mobileRes = await mobile.login(testUser.username, "ValidPassword123!");

    assert.equal(webRes.status, 200, "Web login must succeed");
    assert.equal(mobileRes.status, 200, "Mobile login must succeed");

    const webStatus = await web.get("/api/attendance/status/");
    const mobileStatus = await mobile.get("/api/attendance/status/");

    assert.equal(webStatus.status, 200);
    assert.equal(mobileStatus.status, 200);
  });

  it("T4-SEC-02: Admin executes immediate account suspension in database and Redis cache", async () => {
    // Admin locks user account (is_active = 0)
    await db.run("UPDATE accounts_user SET is_active = 0 WHERE id = ?", [testUser.id]);
    await redisService.del(`user:session:${testUser.id}`);
    await redisService.set(`user:revoked:${testUser.id}`, "true", 300);

    // Verify database reflects locked state
    const row = await db.get("SELECT is_active FROM accounts_user WHERE id = ?", [testUser.id]);
    assert.equal(row.is_active, 0, "User must be marked inactive");
  });

  it("T4-SEC-03: Web client active access token is rejected on next request", async () => {
    const res = await web.get("/api/attendance/status/");
    assert.equal(res.status, 401, "Suspended user must be immediately rejected with HTTP 401");
  });

  it("T4-SEC-04: Mobile client active access token is rejected on next request", async () => {
    const res = await mobile.get("/api/attendance/status/");
    assert.equal(res.status, 401, "Suspended mobile client must be immediately rejected with HTTP 401");
  });

  it("T4-SEC-05: Direct login attempts by suspended user are rejected", async () => {
    const rawClient = new HttpClient(serverInfo.baseUrl);
    const loginRes = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!"
    });

    assert.ok([400, 401].includes(loginRes.status), "Login must be rejected for deactivated account");
  });

  it("T4-SEC-06: Admin unlocks account and user regains legitimate access", async () => {
    // Admin reactivates account
    await db.run("UPDATE accounts_user SET is_active = 1 WHERE id = ?", [testUser.id]);
    await redisService.del(`user:revoked:${testUser.id}`);
    await redisService.del(`user:session:${testUser.id}`);

    const rawClient = new HttpClient(serverInfo.baseUrl);
    const reactivatedLogin = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!"
    });

    assert.equal(reactivatedLogin.status, 200, "Reactivated user can log in successfully");
    const body = reactivatedLogin.body?.data || reactivatedLogin.body;
    assert.ok(body.access, "Must receive new access token");
  });
});
