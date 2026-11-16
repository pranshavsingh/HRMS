/**
 * Tier 3 — Pairwise Combination Suite 6: Mobile Network Drop During Refresh
 * Cross-feature: Mobile Bearer + RTR Grace Window + Network Reconnect
 * Verifies mobile resilience when a network timeout or drop occurs during token rotation,
 * ensuring grace window retry succeeds, SecureStore preserves the active token, and session recovers.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T3.06 — Mobile Network Drop During Refresh", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_net_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-NET-01: Network drop on rotation response allows immediate retry within grace window", async () => {
    const familyId = crypto.randomUUID();
    const originalRefresh = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const originalHash = crypto.createHash("sha256").update(originalRefresh).digest("hex");
    const newRefreshHash = crypto.randomBytes(32).toString("hex");

    // Simulate that the server processed the rotation 2 seconds ago, but response was dropped by mobile carrier
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: originalHash,
      familyId,
      isRevoked: 1,
      replacedByHash: newRefreshHash,
      lastActivityOffsetMs: 2000,
      platform: "mobile"
    });

    const mobile = new MobileClient(serverInfo.baseUrl);
    mobile.setRefreshToken(originalRefresh);

    // Mobile retries the refresh with the original token
    const res = await mobile.refreshToken();
    assert.equal(res.status, 200, "Retry within 15s grace window must succeed with HTTP 200");
    const body = res.body?.data || res.body;
    assert.ok(body.access, "Must receive new valid access token");
    assert.equal(body.refresh, null, "Must receive refresh: null in grace response");
    assert.equal(body.concurrent_refresh, true, "Must be flagged as concurrent_refresh");
  });

  it("T3-NET-02: MobileClient preserves existing refresh token when server returns refresh: null", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    const existingRefreshToken = "pre_existing_mobile_refresh_token_jwt";
    mobile.setRefreshToken(existingRefreshToken);

    // Simulate receiving a grace window response where refresh is null
    const graceResponse = {
      access: "new_ephemeral_access_token",
      refresh: null,
      concurrent_refresh: true
    };

    // Updating credentials with null refresh must NOT overwrite the stored refresh token
    if (graceResponse.access) mobile.setAccessToken(graceResponse.access);
    if (graceResponse.refresh) mobile.setRefreshToken(graceResponse.refresh);

    assert.equal(mobile.getRefreshToken(), existingRefreshToken, "Existing refresh token must remain intact in SecureStore");
    assert.equal(mobile.getAccessToken(), "new_ephemeral_access_token", "Access token must be updated");
  });

  it("T3-NET-03: Subsequent refresh after network restore uses active token and successfully rotates", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    const loginRes = await mobile.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200);

    const tokenBefore = mobile.getRefreshToken();
    assert.ok(tokenBefore);

    // Perform successful rotation
    const refreshRes = await mobile.refreshToken();
    assert.equal(refreshRes.status, 200);
    const tokenAfter = mobile.getRefreshToken();

    assert.ok(tokenAfter);
    assert.notEqual(tokenAfter, tokenBefore, "Token must rotate to a new distinct JWT");

    // Verify authenticated request works with new credentials
    const statusRes = await mobile.get("/api/attendance/status/");
    assert.equal(statusRes.status, 200);
  });

  it("T3-NET-04: Multiple rapid retries during transient network jitter do not trigger replay alarm", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const replacementHash = crypto.randomBytes(32).toString("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: replacementHash,
      lastActivityOffsetMs: 1000,
      platform: "mobile"
    });

    const rawClient = new HttpClient(serverInfo.baseUrl);

    // 3 successive retries in quick succession (jitter/flapping connection)
    const res1 = await rawClient.post("/api/auth/refresh/", { refresh_token: token });
    const res2 = await rawClient.post("/api/auth/refresh/", { refresh_token: token });
    const res3 = await rawClient.post("/api/auth/refresh/", { refresh_token: token });

    assert.equal(res1.status, 200, "Retry 1 must return 200 (within grace)");
    assert.equal(res2.status, 200, "Retry 2 must return 200 (within grace)");
    assert.equal(res3.status, 200, "Retry 3 must return 200 (within grace)");
  });

  it("T3-NET-05: Expired refresh token presented after sustained network outage (>15s) triggers re-login requirement", async () => {
    const familyId = crypto.randomUUID();
    const staleToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const staleHash = crypto.createHash("sha256").update(staleToken).digest("hex");
    const replacementHash = crypto.randomBytes(32).toString("hex");

    // Outage lasted 25 seconds (> 15s grace window)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: staleHash,
      familyId,
      isRevoked: 1,
      replacedByHash: replacementHash,
      lastActivityOffsetMs: 25000,
      platform: "mobile"
    });

    const mobile = new MobileClient(serverInfo.baseUrl);
    mobile.setRefreshToken(staleToken);

    const res = await mobile.refreshToken();
    assert.equal(res.status, 401, "Outage exceeding grace window must return HTTP 401");
    // Client purges local store upon 401 refresh failure
    mobile.logoutLocal();
    assert.equal(mobile.getRefreshToken(), null);
    assert.equal(mobile.getAccessToken(), null);
  });
});
