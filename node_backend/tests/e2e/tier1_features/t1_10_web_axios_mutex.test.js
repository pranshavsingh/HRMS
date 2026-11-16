/**
 * Tier 1 — Feature 10: Web Axios Client Mutex & Queue
 * Verifies single refresh call during concurrent 401 bursts, _retry infinite loop guard,
 * safe handling of null refresh token during grace window, clean queue rejection on failure,
 * and automatic Bearer header injection.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.10 — Web Axios Mutex & Concurrency Queue", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_mutex_${Date.now()}`,
      password: "ValidPassword123!",
      role: "admin"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-WEBMUTEX-01: Exactly ONE refresh call is dispatched for multiple simultaneous 401s", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // Inject an expired access token
    const expiredToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    webClient.inMemoryAccessToken = expiredToken;
    webClient.refreshCallCount = 0;

    // Fire 4 simultaneous requests hitting 401
    const p1 = webClient.get("/api/auth/employees/");
    const p2 = webClient.get("/api/auth/managers/");
    const p3 = webClient.get("/api/auth/admin-summary/");
    const p4 = webClient.get("/api/auth/employees/");

    const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(r4.status, 200);

    // Assert mutex locked and executed exactly 1 refresh operation
    assert.equal(webClient.refreshCallCount, 1, "Exactly one refresh call must be made during 401 burst");
  });

  it("T1-WEBMUTEX-02: _retry guard prevents infinite 401 loops when refresh fails", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // Sabotage refresh token in cookieJar
    webClient.cookieJar.setCookies(["refreshToken=invalid_garbage_token; Path=/api/auth"]);
    // Inject expired access token
    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );

    webClient.refreshCallCount = 0;
    const res = await webClient.get("/api/auth/employees/");

    assert.equal(res.status, 401, "Request must fail with HTTP 401 when refresh is impossible");
    // Refresh was attempted once, failed, and aborted without loop
    assert.equal(webClient.refreshCallCount, 1);
    assert.equal(webClient.inMemoryAccessToken, null, "Failed refresh must clear auth state");
  });

  it("T1-WEBMUTEX-03: Grace window refresh:null does not corrupt token state and resolves queue", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // Mock silentRefresh to return grace window response ({ access, refresh: null, concurrent_refresh: true })
    const originalSilentRefresh = webClient.silentRefresh.bind(webClient);
    webClient.silentRefresh = async () => {
      webClient.refreshCallCount++;
      const validAccess = jwt.sign(
        { userId: testUser.id, role: "admin", type: "access" },
        config.jwtSecret,
        { expiresIn: "15m", algorithm: "HS256" }
      );
      webClient.inMemoryAccessToken = validAccess;
      return { ok: true, status: 200, body: { access: validAccess, refresh: null, concurrent_refresh: true } };
    };

    // Set expired token to trigger 401 interceptor
    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );

    const res = await webClient.get("/api/auth/employees/");
    assert.equal(res.status, 200, "Request should resolve after grace window refresh");
    assert.notEqual(webClient.inMemoryAccessToken, "null");

    // Restore
    webClient.silentRefresh = originalSilentRefresh;
  });

  it("T1-WEBMUTEX-04: Failed refresh rejects all queued promises cleanly", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    let rejectedCount = 0;

    // Simulate 3 pending promises in failedQueue
    webClient.failedQueue.push({
      resolve: () => {},
      reject: () => { rejectedCount++; }
    });
    webClient.failedQueue.push({
      resolve: () => {},
      reject: () => { rejectedCount++; }
    });
    webClient.failedQueue.push({
      resolve: () => {},
      reject: () => { rejectedCount++; }
    });

    webClient.processQueue(new Error("Refresh failed"), null);

    assert.equal(rejectedCount, 3, "All 3 queued requests must be rejected upon refresh error");
    assert.equal(webClient.failedQueue.length, 0, "Queue must be empty after processing");
  });

  it("T1-WEBMUTEX-05: Request interceptor automatically injects Authorization Bearer header", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    const res = await webClient.get("/api/auth/employees/");
    assert.equal(res.status, 200);
    // Request succeeded proving Authorization header was sent
  });
});
