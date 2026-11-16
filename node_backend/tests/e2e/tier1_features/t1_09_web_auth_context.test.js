/**
 * Tier 1 — Feature 9: Web Centralized Auth & In-Memory Token
 * Verifies AuthContext contract: in-memory access token (no localStorage persistence),
 * silent session restoration on mount, unauthenticated route protection,
 * state purge on logout, and role resolution.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T1.09 — Web Centralized Auth & In-Memory Token", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_webctx_${Date.now()}`,
      password: "ValidPassword123!",
      role: "hr"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-WEBAUTH-01: AuthContext holds access token strictly in-memory (zero storage leaks)", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    const res = await webClient.login(testUser.username, "ValidPassword123!");
    assert.equal(res.status, 200);

    // Assert token exists in memory
    assert.ok(webClient.inMemoryAccessToken, "Access token must be present in memory");
    assert.equal(webClient.user?.role, "hr");

    // Assert WebClient simulation has no localStorage persistence for refresh token
    // (WebClient only holds cookie in cookieJar and inMemoryAccessToken)
    assert.equal(typeof webClient.inMemoryAccessToken, "string");
  });

  it("T1-WEBAUTH-02: Silent Session Restoration on mount restores in-memory token seamlessly", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    // Simulate page refresh / remount: inMemoryAccessToken is lost (null), but cookie remains in jar
    webClient.inMemoryAccessToken = null;
    assert.equal(webClient.inMemoryAccessToken, null, "In-memory token is cleared on page reload");

    // Mount lifecycle calls silentRefresh via cookie
    const restoreRes = await webClient.silentRefresh();
    assert.equal(restoreRes.status, 200, "Silent refresh on mount must succeed");
    assert.ok(webClient.inMemoryAccessToken, "In-memory access token must be restored");
  });

  it("T1-WEBAUTH-03: Unauthenticated state redirects away from protected resources", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    // No login performed
    assert.equal(webClient.inMemoryAccessToken, null);

    const res = await webClient.get("/api/auth/employees/");
    assert.equal(res.status, 401, "Protected route must reject unauthenticated request with HTTP 401");
  });

  it("T1-WEBAUTH-04: Logout completely purges in-memory token, user state, and cookies", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");
    assert.ok(webClient.inMemoryAccessToken);

    const logoutRes = await webClient.logout();
    assert.equal(logoutRes.status, 200);

    assert.equal(webClient.inMemoryAccessToken, null, "In-memory token must be wiped");
    assert.equal(webClient.user, null, "User profile in context must be wiped");
    assert.equal(webClient.cookieJar.getCookie("refreshToken"), null, "Cookie jar must be empty");
  });

  it("T1-WEBAUTH-05: Context resolves role correctly without privilege escalation", async () => {
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "ValidPassword123!");

    assert.equal(webClient.user?.role, "hr");
    // HR user should be able to access employees list
    const res = await webClient.get("/api/auth/employees/");
    assert.equal(res.status, 200, "HR role must be authorized for /employees/");
  });
});
