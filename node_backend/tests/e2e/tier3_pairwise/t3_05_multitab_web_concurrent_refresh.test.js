/**
 * Tier 3 — Pairwise Suite 5: Multi-Tab Web Browsing & Concurrency Grace Window
 * Tests simulated multi-tab browser synchronization: Tab 1 rotates token,
 * Tab 2 presents prior token within 15-second grace window, both resolve cleanly.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T3.05 — Multi-Tab Web Browsing & Grace Window", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_mtab_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-PAIR-05: Tab 1 rotates token and Tab 2 benefits from concurrency grace window without false replay alarm", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });

    // 1. Initial Login
    const loginRes = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });
    assert.equal(loginRes.status, 200);

    const initialToken = rawClient.cookieJar.getCookieValue("refreshToken") || loginRes.body?.data?.refresh || loginRes.body?.refresh;
    assert.ok(initialToken);

    // 2. Tab 1 executes refresh first
    const tab1Res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: initialToken
    });
    assert.equal(tab1Res.status, 200);
    const tab1Body = tab1Res.body?.data || tab1Res.body;
    assert.ok(tab1Body.access);

    // 3. Tab 2 executes refresh with initialToken 200ms later (within 15s grace window)
    const tab2Res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: initialToken
    });
    assert.equal(tab2Res.status, 200, "Tab 2 request must be accepted under concurrency grace window");
    const tab2Body = tab2Res.body?.data || tab2Res.body;

    assert.ok(tab2Body.access, "Tab 2 must receive a valid access token");
    assert.equal(tab2Body.concurrent_refresh, true, "Tab 2 must be flagged as concurrent_refresh");
  });
});
