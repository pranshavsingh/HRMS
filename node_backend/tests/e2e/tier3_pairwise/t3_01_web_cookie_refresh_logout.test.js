/**
 * Tier 3 — Pairwise Suite 1: Web Cookie Auth + Concurrent Refresh Mutex + Simultaneous Logout
 * Tests the interaction of Web cookie transport, 401 concurrency mutex queue,
 * and session invalidation via logout.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T3.01 — Web Cookie Refresh & Logout Interaction", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_wrl_${Date.now()}`,
      password: "ValidPassword123!",
      role: "admin"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-PAIR-01: Web client seamlessly refreshes concurrent requests, then terminates cleanly on logout", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);

    // 1. Initial Login
    const loginRes = await webClient.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200);
    assert.ok(webClient.inMemoryAccessToken);

    // 2. Simulate Access Token Expiration
    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    webClient.refreshCallCount = 0;

    // 3. Fire 3 concurrent API requests requiring refresh
    const [res1, res2, res3] = await Promise.all([
      webClient.get("/api/auth/employees/"),
      webClient.get("/api/auth/managers/"),
      webClient.get("/api/auth/admin-summary/")
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(res3.status, 200);
    assert.equal(webClient.refreshCallCount, 1, "Exactly one refresh call was dispatched for all 3 concurrent requests");

    // 4. User logs out
    const logoutRes = await webClient.logout();
    assert.equal(logoutRes.status, 200);

    // 5. Assert state is completely wiped
    assert.equal(webClient.inMemoryAccessToken, null);
    assert.equal(webClient.cookieJar.getCookie("refreshToken"), null);

    // 6. Subsequent request must receive 401
    const postLogoutRes = await webClient.get("/api/auth/employees/");
    assert.equal(postLogoutRes.status, 401, "Post-logout request must be rejected with HTTP 401");
  });
});
