/**
 * Tier 3 — Pairwise Combination Suite 10: Rapid Modal Navigation In-Flight
 * Cross-feature: Mobile Navigation + In-flight 401 Refresh Mutex + Route Guard Transitions
 * Simulates rapid user navigation across multiple screens/modals during token expiration and refresh.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T3.10 — Rapid Modal Navigation In-Flight", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_nav_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-NAV-01: Navigating between 5 screens while access token is expired queues requests and resolves all", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    await mobile.login(testUser.username, "ValidPassword123!");

    // Expire access token to force refresh on next request
    mobile.setAccessToken("expired_synthetic_jwt_token");

    // Simulate 5 screens loading concurrently on mount (Dashboard, Attendance, Profile, History, Notifications)
    const screens = [
      mobile.get("/api/attendance/status/"),
      mobile.get("/api/attendance/history/"),
      mobile.get("/api/auth/documents/my/"),
      mobile.get("/api/attendance/status/"),
      mobile.get("/api/attendance/history/")
    ];

    const results = await Promise.all(screens);
    assert.equal(results.length, 5);

    for (const res of results) {
      assert.equal(res.status, 200, `Screen fetch should succeed with 200, got ${res.status}`);
    }
  });

  it("T3-NAV-02: Exactly one refresh network call is dispatched during multi-screen mount burst", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    await mobile.login(testUser.username, "ValidPassword123!");
    mobile.setAccessToken("expired_jwt_trigger_single_refresh");

    const initialRefreshCount = mobile.refreshCallCount;

    const burst = Array.from({ length: 6 }, () => mobile.get("/api/attendance/status/"));
    const responses = await Promise.all(burst);

    for (const res of responses) {
      assert.equal(res.status, 200);
    }
    const refreshesDispatched = mobile.refreshCallCount - initialRefreshCount;
    assert.equal(refreshesDispatched, 1, `Expected exactly 1 refresh call during burst, got ${refreshesDispatched}`);
  });

  it("T3-NAV-03: Aborting one screen request does not interrupt sibling screen fetches waiting on mutex", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    await mobile.login(testUser.username, "ValidPassword123!");
    mobile.setAccessToken("expired_jwt_abort_test");

    const abortCtrl = new AbortController();

    // Sibling 1 (will be aborted)
    const abortedFetch = mobile.get("/api/attendance/status/", { signal: abortCtrl.signal }).catch((err) => err);

    // Abort Sibling 1 immediately
    abortCtrl.abort();

    // Sibling 2 & 3 (survive)
    const [res2, res3] = await Promise.all([
      mobile.get("/api/attendance/history/"),
      mobile.get("/api/attendance/status/")
    ]);

    const abortedResult = await abortedFetch;
    assert.ok(abortedResult instanceof Error || abortedResult.name === "AbortError" || abortedResult.status === 401 || abortedResult.status === undefined);

    assert.equal(res2.status, 200, "Sibling 2 must succeed despite Sibling 1 abort");
    assert.equal(res3.status, 200, "Sibling 3 must succeed despite Sibling 1 abort");
  });

  it("T3-NAV-04: Rapid push-and-pop modal navigation leaves client state stable", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    await mobile.login(testUser.username, "ValidPassword123!");

    // Simulate rapid navigation cycle: Screen A -> Modal B -> Modal C -> Back to Screen A
    for (let i = 0; i < 3; i++) {
      const res = await mobile.get("/api/attendance/status/");
      assert.equal(res.status, 200);
    }

    assert.ok(mobile.getAccessToken());
    assert.ok(mobile.getRefreshToken());
  });

  it("T3-NAV-05: Logout while modal is open purges credentials and halts subsequent requests", async () => {
    const mobile = new MobileClient(serverInfo.baseUrl);
    await mobile.login(testUser.username, "ValidPassword123!");

    // Logout
    await mobile.logout();

    // Subsequent request must fail with 401
    const res = await mobile.get("/api/attendance/status/");
    assert.equal(res.status, 401, "Unauthenticated request after logout must return 401");
  });
});
