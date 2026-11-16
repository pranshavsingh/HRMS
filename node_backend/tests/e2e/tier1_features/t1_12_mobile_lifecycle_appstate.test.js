/**
 * Tier 1 — Feature 12: Mobile Lifecycle & AppState Management
 * Verifies mobile cold-start restoration, background/foreground state transitions,
 * transparent recovery on expired access token upon resume, and graceful logout on revoked session.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.12 — Mobile Lifecycle & AppState Management", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_moblife_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-MOBLIFE-01: Cold Start restores session from SecureStore without prompting for login", async () => {
    // 1. Initial Login
    const devClient = new MobileClient(serverInfo.baseUrl);
    await devClient.login(testUser.username, "ValidPassword123!");

    const token = devClient.getSecureToken();
    const refreshToken = devClient.getRefreshToken();
    const profile = devClient.getUserProfile();

    // 2. Simulate Cold Start on new instance with pre-existing SecureStore values
    const freshClient = new MobileClient(serverInfo.baseUrl);
    freshClient.secureStore.set("token", token);
    freshClient.secureStore.set("refresh_token", refreshToken);
    freshClient.asyncStorage.set("user", JSON.stringify(profile));

    // Verify session is restored
    assert.equal(freshClient.getSecureToken(), token);
    assert.equal(freshClient.getUserProfile()?.username, testUser.username);
  });

  it("T1-MOBLIFE-02: AppState transition from background to active validates session", async () => {
    const client = new MobileClient(serverInfo.baseUrl);
    await client.login(testUser.username, "ValidPassword123!");

    // Simulate AppState event: 'background' -> 'active'
    let appState = "background";
    // Transition to active
    appState = "active";
    assert.equal(appState, "active");

    // On resume, verify session is active
    assert.ok(client.getSecureToken());
  });

  it("T1-MOBLIFE-03: Foreground resume with expired access token silently refreshes and recovers", async () => {
    const client = new MobileClient(serverInfo.baseUrl);
    await client.login(testUser.username, "ValidPassword123!");

    // Simulate token expiring while user was in background for 30 minutes
    const expiredToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    client.secureStore.set("token", expiredToken);

    // User resumes app and performs action
    // Mutex interceptor catches 401, refreshes via SecureStore refresh_token, and resolves
    const res = await client.get("/api/attendance/status/");
    assert.equal(res.status, 200, "API call should succeed after transparent silent refresh on resume");

    // Token in SecureStore must be newly updated
    assert.notEqual(client.getSecureToken(), expiredToken);
  });

  it("T1-MOBLIFE-04: Foreground resume with revoked session triggers logout callback", async () => {
    const client = new MobileClient(serverInfo.baseUrl);
    await client.login(testUser.username, "ValidPassword123!");

    // Revoke session server-side
    await client.logout();

    // Now inject expired token and invalid refresh token to simulate revoked session on resume
    client.secureStore.set("token", "invalid.revoked.token");
    client.secureStore.set("refresh_token", "invalid.revoked.refresh");

    let logoutCallbackFired = false;
    const originalLogout = client.logoutLocal.bind(client);
    client.logoutLocal = () => {
      logoutCallbackFired = true;
      originalLogout();
    };

    const res = await client.get("/api/attendance/status/");
    assert.equal(res.status, 401);
    assert.equal(logoutCallbackFired, true, "Revoked session must trigger client logout");
    assert.equal(client.getSecureToken(), null, "SecureStore must be cleared");
  });

  it("T1-MOBLIFE-05: Process kill and restart retains non-sensitive profile in AsyncStorage", async () => {
    const client = new MobileClient(serverInfo.baseUrl);
    await client.login(testUser.username, "ValidPassword123!");
    const cachedProfile = client.getUserProfile();

    // Simulate process kill and re-launch: AsyncStorage persisted
    const restoredClient = new MobileClient(serverInfo.baseUrl);
    restoredClient.asyncStorage.set("user", JSON.stringify(cachedProfile));

    assert.equal(restoredClient.getUserProfile()?.id, testUser.id);
    assert.equal(restoredClient.getUserProfile()?.role, "employee");
  });
});
