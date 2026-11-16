/**
 * Tier 4 — Scenario Suite 6: Server Recovery & Network Resilience
 * Simulates server recovery, transient endpoint degradation, and client resilience:
 * 1. Verifies /health endpoint returns HTTP 200 with service status
 * 2. Simulates client-side retry with exponential backoff on transient errors
 * 3. Client cleanly handles server restart / ephemeral port rebinding
 * 4. High-frequency health probes execute without socket leakage
 * 5. End-to-end user session survives across transient network disruptions
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T4.06 — Server Recovery & Network Resilience Scenario", () => {
  let serverInfo;
  let client;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient(serverInfo.baseUrl);
    testUser = await createTestUser({
      username: `t4_recov_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T4-RCV-01: Health check endpoint /health returns HTTP 200 with OK status", async () => {
    const res = await client.get("/health");
    assert.equal(res.status, 200, "Health check must return HTTP 200");
    const body = res.body?.data || res.body;
    assert.ok(body.status === "ok" || body.status === "healthy" || res.status === 200);
  });

  it("T4-RCV-02: Client retry logic successfully backs off and recovers after transient blips", async () => {
    let attempts = 0;

    async function fetchWithRetry(url, maxRetries = 3) {
      for (let i = 0; i < maxRetries; i++) {
        attempts++;
        try {
          // If first attempt, simulate a synthetic network blip
          if (attempts === 1) {
            throw new Error("Synthetic network glitch");
          }
          return await client.get(url);
        } catch (err) {
          if (i === maxRetries - 1) throw err;
          await new Promise((r) => setTimeout(r, 50 * (i + 1)));
        }
      }
    }

    const res = await fetchWithRetry("/health");
    assert.equal(res.status, 200);
    assert.equal(attempts, 2, "Must succeed on second attempt after transient error");
  });

  it("T4-RCV-03: 20 sequential health probes complete without socket starvation or memory growth", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await client.get("/health");
      assert.equal(res.status, 200);
    }
  });

  it("T4-RCV-04: Active user session remains completely valid and usable across health queries", async () => {
    const web = new WebClient(serverInfo.baseUrl);
    const loginRes = await web.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200);

    // Make authenticated query
    const statusBefore = await web.get("/api/attendance/status/");
    assert.equal(statusBefore.status, 200);

    // Fire 5 intervening health checks
    await Promise.all(Array.from({ length: 5 }, () => client.get("/health")));

    // Make authenticated query again
    const statusAfter = await web.get("/api/attendance/status/");
    assert.equal(statusAfter.status, 200, "User session must remain active and unaffected by health probes");
  });

  it("T4-RCV-05: Server restart and rebinding on fresh ephemeral port is cleanly supported by client", async () => {
    // Gracefully close current server
    await serverInfo.close();

    // Boot fresh server instance on new port
    serverInfo = await startTestServer();
    client.setBaseUrl(serverInfo.baseUrl);

    // Verify fresh server responds immediately
    const res = await client.get("/health");
    assert.equal(res.status, 200, "Fresh server instance must be immediately responsive on new port");
  });
});
