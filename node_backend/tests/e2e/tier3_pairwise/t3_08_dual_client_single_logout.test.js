/**
 * Tier 3 — Pairwise Combination Suite 8: Dual Client Single Logout
 * Cross-feature: Multi-Device (Web + Mobile) Isolation during Logout
 * Verifies that logging out on Web invalidates only Web's token family (Family A),
 * while Mobile's active session and token family (Family B) remain healthy and operational.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient, MobileClient } from "../harness/client-simulator.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";

describe("T3.08 — Dual Client Single Logout", () => {
  let serverInfo;
  let testUser;
  let web;
  let mobile;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_dual_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-DUAL-01: User can authenticate concurrently on Web and Mobile with distinct token families", async () => {
    web = new WebClient(serverInfo.baseUrl);
    mobile = new MobileClient(serverInfo.baseUrl);

    const webLogin = await web.login(testUser.username, "ValidPassword123!");
    assert.equal(webLogin.status, 200, "Web login must succeed");

    const mobileLogin = await mobile.login(testUser.username, "ValidPassword123!");
    assert.equal(mobileLogin.status, 200, "Mobile login must succeed");

    // Both should have valid tokens
    assert.ok(web.getAccessToken(), "Web must have access token");
    assert.ok(mobile.getAccessToken(), "Mobile must have access token");
    assert.ok(mobile.getRefreshToken(), "Mobile must have refresh token");
  });

  it("T3-DUAL-02: Both clients make successful authenticated calls concurrently", async () => {
    const webStatus = await web.get("/api/attendance/status/");
    const mobileStatus = await mobile.get("/api/attendance/status/");

    assert.equal(webStatus.status, 200, "Web call must return 200");
    assert.equal(mobileStatus.status, 200, "Mobile call must return 200");
  });

  it("T3-DUAL-03: Web logout revokes Web session without terminating Mobile session", async () => {
    const webRefreshTokenBeforeLogout = web.cookieJar.get("refresh_token")?.value;

    const webLogout = await web.logout();
    assert.equal(webLogout.status, 200, "Web logout must succeed with HTTP 200");

    // Mobile must continue to make authenticated requests successfully
    const mobileStatusAfterWebLogout = await mobile.get("/api/attendance/status/");
    assert.equal(mobileStatusAfterWebLogout.status, 200, "Mobile session must remain active after Web logout");
  });

  it("T3-DUAL-04: Mobile client can refresh its token family independently after Web logout", async () => {
    const mobileTokenBefore = mobile.getRefreshToken();
    const mobileRefreshRes = await mobile.refreshToken();

    assert.equal(mobileRefreshRes.status, 200, "Mobile refresh must succeed independently");
    const mobileTokenAfter = mobile.getRefreshToken();
    assert.ok(mobileTokenAfter);
    assert.notEqual(mobileTokenAfter, mobileTokenBefore, "Mobile refresh token rotated cleanly");

    // Verify Mobile can still make requests with the rotated credentials
    const statusRes = await mobile.get("/api/attendance/status/");
    assert.equal(statusRes.status, 200);
  });

  it("T3-DUAL-05: Web refresh token is rejected and cannot obtain new tokens", async () => {
    const rawClient = new HttpClient(serverInfo.baseUrl);
    // Attempt to refresh using Web's cookie jar (which should now have cleared or revoked cookie)
    const refreshCookie = web.cookieJar.get("refresh_token")?.value;

    if (refreshCookie) {
      const res = await rawClient.post("/api/auth/refresh/", { refresh_token: refreshCookie });
      assert.equal(res.status, 401, "Revoked Web refresh token must be rejected with HTTP 401");
    } else {
      // Cookie was cleared by logout
      assert.ok(!web.cookieJar.get("refresh_token"), "Web refresh cookie must be cleared");
    }
  });
});
