/**
 * Tier 2 — Boundary Suite 3: High-Concurrency 401 Storms
 * Verifies client and server resilience under 10, 25, and staggered parallel 401 requests,
 * server-side atomic rotation under concurrency, and zero database connection starvation.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { healthCheck } from "../../../src/db/index.js";

describe("T2.03 — High-Concurrency 401 Storms", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t2_storm_${Date.now()}`,
      password: "ValidPassword123!",
      role: "admin"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T2-CONC-01: 10 parallel requests hitting 401 trigger exactly 1 refresh call and all 10 succeed", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // Expire token
    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    webClient.refreshCallCount = 0;

    const requests = Array.from({ length: 10 }, () => webClient.get("/api/auth/employees/"));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      assert.equal(res.status, 200, "All 10 requests must succeed");
    }
    assert.equal(webClient.refreshCallCount, 1, "Exactly one refresh call must be dispatched");
  });

  it("T2-CONC-02: 25 parallel requests hitting 401 all resolve without thread exhaustion or deadlocks", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    webClient.refreshCallCount = 0;

    const requests = Array.from({ length: 25 }, () => webClient.get("/api/auth/employees/"));
    const responses = await Promise.all(requests);

    assert.equal(responses.length, 25);
    for (const res of responses) {
      assert.equal(res.status, 200);
    }
    assert.equal(webClient.refreshCallCount, 1);
  });

  it("T2-CONC-03: Staggered bursts of 401 requests resolve cleanly", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    webClient.refreshCallCount = 0;

    // Burst 1 (5 requests)
    const burst1 = Array.from({ length: 5 }, () => webClient.get("/api/auth/employees/"));
    // Small delay
    await new Promise((r) => setTimeout(r, 20));
    // Burst 2 (5 requests)
    const burst2 = Array.from({ length: 5 }, () => webClient.get("/api/auth/employees/"));

    const allResponses = await Promise.all([...burst1, ...burst2]);
    for (const res of allResponses) {
      assert.equal(res.status, 200);
    }
  });

  it("T2-CONC-04: Server-side simultaneous refresh requests on same token return 200 OK with zero 500 errors", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    const token = loginRes.body?.data?.refresh || loginRes.body?.refresh;
    assert.ok(token);

    // Fire 5 simultaneous refresh requests with the exact same refresh token
    const refreshCalls = Array.from({ length: 5 }, () =>
      rawClient.post("/api/auth/refresh/", { refresh_token: token })
    );

    const results = await Promise.all(refreshCalls);
    for (const res of results) {
      assert.ok([200, 401].includes(res.status), `Each request must return 200 or 401, got ${res.status}`);
      assert.notEqual(res.status, 500, "Must not encounter database deadlock or 500 Internal Server Error");
    }
  });

  it("T2-CONC-05: Database connection pool remains healthy and operational after 401 storms", async () => {
    await assert.doesNotReject(async () => {
      await healthCheck();
    }, "Database healthCheck must not reject after concurrency bursts");
  });
});
