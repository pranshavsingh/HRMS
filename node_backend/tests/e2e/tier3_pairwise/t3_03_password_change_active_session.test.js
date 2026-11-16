/**
 * Tier 3 — Pairwise Suite 3: Password Change + Active Cross-Device Session Invalidation
 * Verifies that changing password on one client immediately revokes active sessions
 * and refresh tokens across all other devices.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient, MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T3.03 — Password Change & Multi-Device Session Invalidation", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_pwd_${Date.now()}`,
      password: "OldPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-PAIR-03: Password change on Web invalidates active Mobile session across devices", async () => {
    // 1. Login on Web
    const webClient = new WebClient(serverInfo.baseUrl);
    await webClient.login(testUser.username, "OldPassword123!");
    assert.ok(webClient.inMemoryAccessToken);

    // 2. Login on Mobile
    const mobileClient = new MobileClient(serverInfo.baseUrl, "phone-pwd-03");
    await mobileClient.login(testUser.username, "OldPassword123!");
    assert.ok(mobileClient.getSecureToken());

    // 3. User changes password on Web
    const changeRes = await webClient.post("/api/auth/change-password/", {
      current_password: "OldPassword123!",
      new_password: "BrandNewPassword123!#"
    });
    assert.equal(changeRes.status, 200, "Password change must succeed with HTTP 200");

    // 4. Mobile client attempts to refresh or perform authenticated action
    const mobileRefreshRes = await mobileClient.silentRefresh();
    assert.equal(mobileRefreshRes.status, 401, "Old mobile session must be rejected with HTTP 401 after password change");

    // 5. Login with new password succeeds
    const newLoginRes = await mobileClient.login(testUser.username, "BrandNewPassword123!#");
    assert.equal(newLoginRes.status, 200, "Login with new password must succeed");
  });
});
