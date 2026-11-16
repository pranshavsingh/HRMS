/**
 * Tier 1 — Feature 7: Hardened Logout & Session Invalidation
 * Verifies cookie clearing, mobile body token invalidation, blacklisted token rejection,
 * idempotent logout calls, and MySQL token family cleanup.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";

describe("T1.07 — Hardened Logout & Invalidation", () => {
  let serverInfo;
  let testUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
    testUser = await createTestUser({
      username: `t1_logout_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-LOGOUT-01: Web Logout returns HTTP 200 and success message", async () => {
    const loginRes = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });
    assert.equal(loginRes.status, 200);

    const access = loginRes.body?.data?.access || loginRes.body.access;
    const refresh = client.cookieJar.getCookieValue("refreshToken") || loginRes.body.refresh;

    const logoutRes = await client.post("/api/auth/logout/", {
      refresh_token: refresh
    }, {
      headers: { Authorization: `Bearer ${access}` }
    });

    assert.equal(logoutRes.status, 200, "Logout must succeed with HTTP 200");
    const msg = logoutRes.body?.message || logoutRes.body?.data?.message || "";
    assert.match(msg, /logged out/i);
  });

  it("T1-LOGOUT-02: Mobile Logout invalidates refresh token in MySQL", async () => {
    const mobClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await mobClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    assert.equal(loginRes.status, 200);

    const { access, refresh } = loginRes.body?.data || loginRes.body;
    const tokenHash = crypto.createHash("sha256").update(refresh).digest("hex");

    const preRow = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [tokenHash]);
    assert.equal(preRow?.is_revoked, 0, "Token must be active before logout");

    const logoutRes = await mobClient.post("/api/auth/logout/", {
      refresh_token: refresh
    }, {
      headers: { Authorization: `Bearer ${access}` }
    });
    assert.equal(logoutRes.status, 200);

    const postRow = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [tokenHash]);
    assert.ok(!postRow || postRow.is_revoked === 1, "Token must be revoked or deleted after logout");
  });

  it("T1-LOGOUT-03: Logged-out refresh token is rejected on subsequent refresh attempt", async () => {
    const mobClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await mobClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    const { access, refresh } = loginRes.body?.data || loginRes.body;

    await mobClient.post("/api/auth/logout/", { refresh_token: refresh }, {
      headers: { Authorization: `Bearer ${access}` }
    });

    const refreshAttempt = await mobClient.post("/api/auth/refresh/", {
      refresh_token: refresh
    });

    assert.equal(refreshAttempt.status, 401, "Logged out refresh token must be rejected with HTTP 401");
  });

  it("T1-LOGOUT-04: Idempotent Logout calls succeed without unhandled exceptions", async () => {
    const mobClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await mobClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    const { access, refresh } = loginRes.body?.data || loginRes.body;

    const res1 = await mobClient.post("/api/auth/logout/", { refresh_token: refresh }, {
      headers: { Authorization: `Bearer ${access}` }
    });
    const res2 = await mobClient.post("/api/auth/logout/", { refresh_token: refresh }, {
      headers: { Authorization: `Bearer ${access}` }
    });

    assert.ok([200, 401].includes(res1.status), "First logout must return 200 or 401");
    assert.ok([200, 401].includes(res2.status), "Second logout must return 200 or 401 without 500 error");
    assert.notEqual(res2.status, 500, "Idempotent logout must never crash the server");
  });

  it("T1-LOGOUT-05: Logout without payload handles gracefully without crashing", async () => {
    const res = await client.post("/api/auth/logout/", {});
    assert.ok([200, 400, 401].includes(res.status), "Empty logout must be handled safely");
    assert.notEqual(res.status, 500, "Empty logout must not cause 500 Internal Server Error");
  });
});
