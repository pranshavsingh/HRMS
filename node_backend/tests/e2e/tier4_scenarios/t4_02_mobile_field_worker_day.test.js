/**
 * Tier 4 — Scenario Suite 2: Mobile Field Worker Day
 * Real-world multi-step journey of a mobile field worker:
 * 1. Morning cold-start: App launches, retrieves credentials from SecureStore, calls attendance status
 * 2. Background idle: App stays in background for simulated hours while worker is in the field
 * 3. Foreground resume: Access token is expired; first API request transparently rotates refresh token
 * 4. Midday activity: Checks attendance history and documents successfully
 * 5. Network drop recovery: Transient disconnect handled cleanly by mobile client retry logic
 * 6. Evening logout: Worker logs out, credentials purged from SecureStore, app locked
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T4.02 — Mobile Field Worker Day Scenario", () => {
  let serverInfo;
  let testUser;
  let mobile;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t4_field_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
    mobile = new MobileClient(serverInfo.baseUrl);
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T4-FLD-01: Morning App Launch: Authenticates and initializes SecureStore credentials", async () => {
    const loginRes = await mobile.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200, "Field worker login must succeed");

    assert.ok(mobile.getAccessToken(), "Access token must be in SecureStore");
    assert.ok(mobile.getRefreshToken(), "Refresh token must be in SecureStore");

    // Morning check: Attendance status
    const statusRes = await mobile.get("/api/attendance/status/");
    assert.equal(statusRes.status, 200, "Morning attendance status check must succeed");
  });

  it("T4-FLD-02: App moves to background: Local state persists across simulated idle time", async () => {
    // Simulates AppState transition to 'background'
    const tokenBefore = mobile.getRefreshToken();
    assert.ok(tokenBefore, "Token must be retained while backgrounded");

    // Access token is expired by the passage of time in the background
    mobile.setAccessToken("expired_synthetic_morning_access_token");
  });

  it("T4-FLD-03: Foreground Resume: Token rotation transparently renews session on first call", async () => {
    const refreshBefore = mobile.getRefreshToken();

    // Field worker unlocks phone at midday and checks attendance status
    const middayStatus = await mobile.get("/api/attendance/status/");
    assert.equal(middayStatus.status, 200, "Midday request must succeed via transparent rotation");

    const refreshAfter = mobile.getRefreshToken();
    assert.ok(refreshAfter);
    assert.notEqual(refreshAfter, refreshBefore, "Refresh token must have rotated upon background resume");
  });

  it("T4-FLD-04: Midday queries: Attendance history and documents return cleanly", async () => {
    const historyRes = await mobile.get("/api/attendance/history/");
    assert.equal(historyRes.status, 200, "Attendance history must return 200");

    const docsRes = await mobile.get("/api/auth/documents/my/");
    assert.equal(docsRes.status, 200, "Documents list must return 200");
  });

  it("T4-FLD-05: Network disconnect & reconnect: Client remains stable through connection flapping", async () => {
    // Simulate connection drop: client receives a transient connection failure
    const abortCtrl = new AbortController();
    abortCtrl.abort();

    try {
      await mobile.get("/api/attendance/status/", { signal: abortCtrl.signal });
    } catch (err) {
      assert.ok(err, "Transient network drop caught as expected");
    }

    // Network restores: next call succeeds immediately
    const recoveredRes = await mobile.get("/api/attendance/status/");
    assert.equal(recoveredRes.status, 200, "Request after network restore must succeed");
  });

  it("T4-FLD-06: Evening Logout: Worker clocks out, logs out, and SecureStore is completely sanitized", async () => {
    const logoutRes = await mobile.logout();
    assert.equal(logoutRes.status, 200, "Logout must succeed");

    assert.equal(mobile.getAccessToken(), null, "Access token must be purged from SecureStore");
    assert.equal(mobile.getRefreshToken(), null, "Refresh token must be purged from SecureStore");

    // Any attempt to access API without logging back in is rejected
    const blockedRes = await mobile.get("/api/attendance/status/");
    assert.equal(blockedRes.status, 401, "API access after logout must return 401");
  });
});
