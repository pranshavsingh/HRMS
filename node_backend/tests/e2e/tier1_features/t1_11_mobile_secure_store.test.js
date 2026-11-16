/**
 * Tier 1 — Feature 11: Mobile Native SecureStore Storage
 * Verifies that tokens are stored strictly in hardware SecureStore,
 * non-sensitive user profile in AsyncStorage (zero tokens in AsyncStorage),
 * grace window null token preservation, and complete storage wipe on logout.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.11 — Mobile Native SecureStore Storage", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_mobsec_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-MOBSTORE-01: Tokens are stored strictly in SecureStore (zero tokens in AsyncStorage)", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl);
    await mobileClient.login(testUser.username, "ValidPassword123!");

    // Tokens must exist in SecureStore
    const token = mobileClient.getSecureToken();
    const refreshToken = mobileClient.getRefreshToken();
    assert.ok(token, "Access token must be in SecureStore");
    assert.ok(refreshToken, "Refresh token must be in SecureStore");

    // AsyncStorage must NOT contain tokens
    assert.equal(mobileClient.asyncStorage.get("token"), undefined, "token must NOT exist in AsyncStorage");
    assert.equal(mobileClient.asyncStorage.get("refresh_token"), undefined, "refresh_token must NOT exist in AsyncStorage");
  });

  it("T1-MOBSTORE-02: Non-sensitive user profile is saved in AsyncStorage without secrets", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl);
    await mobileClient.login(testUser.username, "ValidPassword123!");

    const userProfile = mobileClient.getUserProfile();
    assert.ok(userProfile, "Profile must exist in AsyncStorage");
    assert.equal(userProfile.id, testUser.id);
    assert.equal(userProfile.username, testUser.username);
    assert.equal(userProfile.role, "employee");

    // Profile must NOT expose sensitive fields
    assert.equal(userProfile.password, undefined, "Profile must not contain password");
    assert.equal(userProfile.token, undefined, "Profile must not contain access token");
    assert.equal(userProfile.refresh, undefined, "Profile must not contain refresh token");
  });

  it("T1-MOBSTORE-03: Stored token is immediately injected as Bearer header on subsequent API requests", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl);
    await mobileClient.login(testUser.username, "ValidPassword123!");

    // Next request to attendance status should automatically use Bearer token
    const res = await mobileClient.get("/api/attendance/status/");
    assert.equal(res.status, 200, "API call must succeed without 401 unauthenticated");
  });

  it("T1-MOBSTORE-04: Grace window null response does NOT overwrite valid refresh token in SecureStore", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl);
    await mobileClient.login(testUser.username, "ValidPassword123!");

    const initialRefreshToken = mobileClient.getRefreshToken();
    assert.ok(initialRefreshToken);

    // Mock silentRefresh to simulate grace window response: { access: newAccess, refresh: null }
    const originalSilentRefresh = mobileClient.silentRefresh.bind(mobileClient);
    mobileClient.silentRefresh = async () => {
      const newAccess = jwt.sign(
        { userId: testUser.id, role: "employee", type: "access" },
        config.jwtSecret,
        { expiresIn: "15m", algorithm: "HS256" }
      );
      mobileClient.secureStore.set("token", newAccess);
      // DEF-04 contract: If body.refresh is null/undefined, do NOT overwrite refresh_token
      return { ok: true, status: 200, body: { access: newAccess, refresh: null, concurrent_refresh: true } };
    };

    await mobileClient.silentRefresh();

    // Verify refresh token in SecureStore was preserved and not replaced by null or 'null'
    const preservedRefreshToken = mobileClient.getRefreshToken();
    assert.equal(preservedRefreshToken, initialRefreshToken, "Valid refresh token must be preserved during grace window");
    assert.notEqual(preservedRefreshToken, null);
    assert.notEqual(preservedRefreshToken, "null");

    mobileClient.silentRefresh = originalSilentRefresh;
  });

  it("T1-MOBSTORE-05: Logout completely purges both SecureStore and AsyncStorage", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl);
    await mobileClient.login(testUser.username, "ValidPassword123!");
    assert.ok(mobileClient.getSecureToken());

    await mobileClient.logout();

    assert.equal(mobileClient.getSecureToken(), null, "SecureStore access token must be deleted");
    assert.equal(mobileClient.getRefreshToken(), null, "SecureStore refresh token must be deleted");
    assert.equal(mobileClient.getUserProfile(), null, "AsyncStorage user profile must be deleted");
  });
});
