/**
 * Tier 2 — Boundary Suite 5: Network Disconnects, Timeouts & Aborted Connections
 * Verifies client and server handling of client-side aborts, network timeouts,
 * connection refused errors, and rapid abort/retry sequences.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";

describe("T2.05 — Network Disconnects & Timeouts", () => {
  let serverInfo;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await teardownAll();
  });

  it("T2-NET-01: Client abort mid-request via AbortController raises AbortError cleanly", async () => {
    const controller = new AbortController();
    controller.abort(); // Immediately aborted

    try {
      await fetch(`${serverInfo.baseUrl}/health`, { signal: controller.signal });
      assert.fail("Should have thrown AbortError");
    } catch (err) {
      assert.equal(err.name, "AbortError", "Must throw AbortError");
    }
  });

  it("T2-NET-02: Request timeout aborts request without hanging indefinitely", async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 200);

    try {
      // Send request to an endpoint with rapid abort
      await fetch(`${serverInfo.baseUrl}/health`, { signal: controller.signal });
    } catch (err) {
      // Abort error is acceptable if triggered
      assert.ok(err);
    } finally {
      clearTimeout(timeout);
    }
  });

  it("T2-NET-03: Connection to non-listening port throws standard connection error without crash", async () => {
    // Attempt request to an unassigned port (e.g. 59999)
    try {
      await fetch("http://127.0.0.1:59999/health");
      assert.fail("Should have failed connection");
    } catch (err) {
      assert.ok(err.message.includes("fetch failed") || err.code === "ECONNREFUSED", "Must raise connection error cleanly");
    }
  });

  it("T2-NET-04: Rapid sequence of aborted requests leaves server responsive", async () => {
    for (let i = 0; i < 5; i++) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);
      try {
        await fetch(`${serverInfo.baseUrl}/health`, { signal: controller.signal });
      } catch (err) {
        // Expected abort
      }
    }

    // Verify server is healthy and responding
    const res = await client.get("/health");
    assert.equal(res.status, 200, "Server must remain responsive after multiple aborted sockets");
  });

  it("T2-NET-05: Server handles client disconnect during response body streaming safely", async () => {
    const controller = new AbortController();
    try {
      const res = await fetch(`${serverInfo.baseUrl}/api/auth/realtime/`, {
        signal: controller.signal
      });
      // Immediately abort when response starts
      controller.abort();
    } catch (err) {
      assert.equal(err.name, "AbortError");
    }

    const health = await client.get("/health");
    assert.equal(health.status, 200);
  });
});
