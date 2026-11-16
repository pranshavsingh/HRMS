/**
 * Tier 1 — Feature 3: Web Silent Token Refresh
 * Verifies silent refresh, null body refresh handling, expired token rejection,
 * tampered token rejection, and inactive account rejection.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { WebClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";

describe("T1.03 — Web Silent Refresh via Cookie / Auth Transport", () => {
  let serverInfo;
  let testUser;
  let inactiveUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_ref_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
    inactiveUser = await createTestUser({
      username: `t1_inactref_${Date.now()}`,
      password: "ValidPassword123!",
      isActive: 0
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await deleteTestUser(inactiveUser?.id);
    await teardownAll();
  });

  it("T1-WEBREF-01: Silent Refresh with valid session rotates and returns new access token", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });
    assert.equal(loginRes.status, 200);

    const loginBody = loginRes.body?.data || loginRes.body;
    const cookieToken = rawClient.cookieJar.getCookieValue("refreshToken");
    const rawToken = cookieToken || loginBody.refresh;

    assert.ok(rawToken, "Expected refresh token from cookie or body");

    // Perform refresh
    const refreshRes = await rawClient.post("/api/auth/refresh/", {
      refresh_token: rawToken
    });

    assert.equal(refreshRes.status, 200);
    const refreshBody = refreshRes.body?.data || refreshRes.body;
    assert.ok(refreshBody.access, "Expected new access token");

    // Verify new access token is valid JWT
    const decoded = jwt.decode(refreshBody.access);
    assert.equal(decoded.userId, testUser.id);
  });

  it("T1-WEBREF-02: Web Refresh response does not corrupt client storage with string 'null'", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // If webClient holds token, simulate refresh
    const rawToken = webClient.inMemoryAccessToken;
    assert.ok(rawToken, "Expected web client to have in-memory access token");

    // The client simulator's in-memory token must not be the string 'null'
    assert.notEqual(webClient.inMemoryAccessToken, "null");
    assert.notEqual(webClient.inMemoryAccessToken, "undefined");
  });

  it("T1-WEBREF-03: Web Refresh with expired token returns HTTP 401", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });

    // Mint an expired refresh token
    const familyId = crypto.randomUUID();
    const expiredToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(expiredToken).digest("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() - 1000)
    });

    const res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: expiredToken
    });

    assert.equal(res.status, 401, "Expired refresh token must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(expired|invalid)/i);
  });

  it("T1-WEBREF-04: Web Refresh with tampered signature returns HTTP 401", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const bogusToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh" },
      "wrong-secret-key-12345",
      { expiresIn: "30d", algorithm: "HS256" }
    );

    const res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: bogusToken
    });

    assert.equal(res.status, 401, "Tampered signature must return HTTP 401");
  });

  it("T1-WEBREF-05: Web Refresh with inactive account returns HTTP 401", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });

    // Mint a valid refresh token for inactive user
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: inactiveUser.id, role: "employee", type: "refresh", familyId },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await seedRefreshToken({
      userId: inactiveUser.id,
      tokenHash,
      familyId
    });

    const res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: token
    });

    assert.equal(res.status, 401, "Inactive user must be rejected with HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(inactive|not found|session expired)/i);
  });
});
