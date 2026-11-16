/**
 * Tier 3 — Pairwise Suite 4: SSE Stream + Access Token Expiry + Silent Refresh Reconnect
 * Tests real-time SSE stream lifecycle when access token expires, verifying that
 * the client silently refreshes its token and reconnects seamlessly.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T3.04 — SSE Stream Token Expiry & Reconnect", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_sserec_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-PAIR-04: Client refreshes expired access token and reconnects to SSE stream", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // 1. Initial SSE connect with valid token
    const c1 = new AbortController();
    const res1 = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
      headers: {
        Authorization: `Bearer ${webClient.inMemoryAccessToken}`,
        Accept: "text/event-stream"
      },
      signal: c1.signal
    });
    assert.equal(res1.status, 200);
    c1.abort();

    // 2. Simulate Token Expiration
    webClient.inMemoryAccessToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );

    // 3. Attempting SSE with expired token fails with 401
    const resExpired = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
      headers: {
        Authorization: `Bearer ${webClient.inMemoryAccessToken}`,
        Accept: "text/event-stream"
      }
    });
    assert.equal(resExpired.status, 401);

    // 4. Client triggers silent refresh
    const refreshRes = await webClient.silentRefresh();
    assert.equal(refreshRes.status, 200);

    // 5. Reconnects to SSE with new access token
    const c2 = new AbortController();
    const res2 = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
      headers: {
        Authorization: `Bearer ${webClient.inMemoryAccessToken}`,
        Accept: "text/event-stream"
      },
      signal: c2.signal
    });
    assert.equal(res2.status, 200, "SSE reconnection must succeed with rotated access token");
    c2.abort();
  });
});
