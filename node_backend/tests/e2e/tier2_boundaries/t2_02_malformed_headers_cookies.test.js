/**
 * Tier 2 — Boundary Suite 2: Malformed Headers, Cookies & Payloads
 * Verifies server robustness against malformed Authorization headers,
 * corrupted cookie values, insecure algorithm switching ('none'),
 * and oversized payloads.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";

describe("T2.02 — Malformed Headers, Cookies & Payloads Boundary Suite", () => {
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

  it("T2-MAL-01: Malformed Authorization header syntax returns HTTP 401", async () => {
    const malformedHeaders = [
      "Bearer",
      "Bearer ",
      "Basic dXNlcjpwYXNz",
      "Token abcdef12345",
      "Bearer eyJhbGciOi.truncated.invalid",
      "Bearer !!!@@@###$$$%%%"
    ];

    for (const h of malformedHeaders) {
      const res = await client.get("/api/attendance/status/", {
        headers: { Authorization: h }
      });
      assert.equal(res.status, 401, `Header '${h}' must receive HTTP 401`);
    }
  });

  it("T2-MAL-02: Malformed cookie values are handled safely without unhandled exception", async () => {
    const badCookies = [
      "refreshToken=",
      "refreshToken=;",
      "refreshToken=null",
      "refreshToken=@@@malformed%%%",
      "refreshToken=undefined"
    ];

    for (const c of badCookies) {
      const res = await client.post("/api/auth/refresh/", {}, {
        headers: { Cookie: c }
      });
      assert.ok([400, 401].includes(res.status), `Malformed cookie '${c}' must be rejected with 400 or 401`);
      assert.notEqual(res.status, 500, "Must never crash with HTTP 500");
    }
  });

  it("T2-MAL-03: Insecure algorithm switching ('none' or non-HS256) is strictly rejected", async () => {
    // Construct unsigned JWT with alg: 'none'
    const unsignedHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const unsignedPayload = Buffer.from(JSON.stringify({ userId: 1, role: "employee", type: "access" })).toString("base64url");
    const noneToken = `${unsignedHeader}.${unsignedPayload}.`;

    const res = await client.get("/api/attendance/status/", {
      headers: { Authorization: `Bearer ${noneToken}` }
    });

    assert.equal(res.status, 401, "Token with alg: none must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(invalid|token|authentication)/i);
  });

  it("T2-MAL-04: Non-JSON and oversized payloads are rejected safely", async () => {
    // 5MB payload to endpoint expecting small JSON
    const hugeString = "A".repeat(5 * 1024 * 1024);

    try {
      const res = await fetch(`${serverInfo.baseUrl}/api/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: hugeString })
      });

      assert.ok([400, 413].includes(res.status), "Huge payload must return 400 or 413 Payload Too Large");
      assert.notEqual(res.status, 500);
    } catch (err) {
      // Connection reset / aborted by body parser is also acceptable
      assert.ok(err);
    }
  });

  it("T2-MAL-05: Missing Content-Type on POST endpoints handles without crash", async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/auth/login/`, {
      method: "POST",
      body: "not-json-content"
    });

    assert.ok([400, 415].includes(res.status), "Malformed content should return 400 or 415");
    assert.notEqual(res.status, 500);
  });
});
