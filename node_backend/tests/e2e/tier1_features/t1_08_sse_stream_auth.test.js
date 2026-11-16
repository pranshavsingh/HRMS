/**
 * Tier 1 — Feature 8: Real-Time SSE Stream Authentication
 * Verifies Bearer authentication, rejection of unauthenticated/invalid connections,
 * stream response headers (text/event-stream, keep-alive), and graceful client abort.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.08 — SSE Stream Authentication", () => {
  let serverInfo;
  let testUser;
  let validToken;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_sse_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });

    validToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-SSE-01: SSE Stream establishes connection with valid Bearer token", async () => {
    const controller = new AbortController();

    try {
      const res = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          Accept: "text/event-stream"
        },
        signal: controller.signal
      });

      assert.equal(res.status, 200, "SSE connection must return HTTP 200");
      assert.match(res.headers.get("content-type") || "", /text\/event-stream/);
      controller.abort();
    } catch (err) {
      if (err.name !== "AbortError") throw err;
    }
  });

  it("T1-SSE-02: SSE Stream rejects unauthenticated requests with HTTP 401", async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
      headers: {
        Accept: "text/event-stream"
      }
    });

    assert.equal(res.status, 401, "Unauthenticated SSE stream must return HTTP 401");
  });

  it("T1-SSE-03: SSE Stream rejects tampered or expired tokens with HTTP 401", async () => {
    const bogusToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      "wrong-secret-key-12345",
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
      headers: {
        Authorization: `Bearer ${bogusToken}`,
        Accept: "text/event-stream"
      }
    });

    assert.equal(res.status, 401, "Invalid token must return HTTP 401");
  });

  it("T1-SSE-04: SSE Stream response sets standard keep-alive and cache headers", async () => {
    const controller = new AbortController();

    try {
      const res = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          Accept: "text/event-stream"
        },
        signal: controller.signal
      });

      assert.equal(res.headers.get("cache-control"), "no-cache");
      assert.equal(res.headers.get("connection"), "keep-alive");
      controller.abort();
    } catch (err) {
      if (err.name !== "AbortError") throw err;
    }
  });

  it("T1-SSE-05: Server handles SSE client abort gracefully without throwing unhandled exceptions", async () => {
    const controller = new AbortController();

    // Start connection and immediately abort after 100ms
    setTimeout(() => controller.abort(), 100);

    try {
      await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
        headers: { Authorization: `Bearer ${validToken}` },
        signal: controller.signal
      });
    } catch (err) {
      assert.equal(err.name, "AbortError");
    }

    // Verify server is still alive and accepting requests
    const health = await fetch(`${serverInfo.baseUrl}/health`);
    assert.equal(health.status, 200, "Server must remain responsive after client stream abort");
  });
});
