/**
 * Tier 1 — Feature 2: Mobile Dual-Mode Bearer Authentication
 * Verifies mobile JSON tokens, device metadata persistence, validation,
 * case-insensitive username handling, and multi-device session isolation.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";

describe("T1.02 — Mobile Bearer Authentication", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_mob_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-MOBAUTH-01: Successful Mobile Login returns JSON tokens without Set-Cookie", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl, "dev-uuid-001");
    const res = await mobileClient.login(testUser.username, "ValidPassword123!");

    assert.equal(res.status, 200);
    const body = res.body?.data || res.body;

    assert.ok(body.access, "Expected access token in JSON body");
    assert.ok(body.refresh, "Expected refresh token in JSON body for mobile");
    assert.ok(body.user, "Expected user profile in response body");

    // Assert tokens stored in mobile SecureStore
    assert.equal(mobileClient.getSecureToken(), body.access);
    assert.equal(mobileClient.getRefreshToken(), body.refresh);

    // Verify no Set-Cookie header issued
    const setCookie = res.headers.get("set-cookie");
    assert.ok(!setCookie || !setCookie.includes("refreshToken"), "Mobile login should not rely on cookies");
  });

  it("T1-MOBAUTH-02: Mobile Login persists device metadata in accounts_refreshtoken", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const deviceId = `device_${crypto.randomBytes(4).toString("hex")}`;
    const deviceName = "Google Pixel 8 Pro";

    const res = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android",
      device_id: deviceId,
      device_name: deviceName
    });

    assert.equal(res.status, 200);
    const body = res.body?.data || res.body;
    const tokenHash = crypto.createHash("sha256").update(body.refresh).digest("hex");

    const row = await db.get(
      "SELECT device_id, device_name, platform FROM accounts_refreshtoken WHERE token_hash = ?",
      [tokenHash]
    );

    assert.ok(row, "Expected refresh token row in database");
    assert.equal(row.device_id, deviceId);
    assert.equal(row.device_name, deviceName);
    assert.equal(row.platform, "android");
  });

  it("T1-MOBAUTH-03: Mobile Login rejects missing required fields with HTTP 400", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const res = await rawClient.post("/api/auth/login/", {
      username: testUser.username,
      platform: "android"
      // password omitted
    });

    assert.equal(res.status, 400, "Missing password must return HTTP 400");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(username and password are required|invalid input|expected string)/i);
  });

  it("T1-MOBAUTH-04: Mobile Login supports case-insensitive username matching", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const upperUsername = testUser.username.toUpperCase();

    const res = await rawClient.post("/api/auth/login/", {
      username: upperUsername,
      password: "ValidPassword123!",
      platform: "android"
    });

    assert.equal(res.status, 200, "Username matching must be case-insensitive");
    const body = res.body?.data || res.body;
    assert.equal(body.user?.id, testUser.id);
  });

  it("T1-MOBAUTH-05: Mobile allows concurrent logins from multiple devices without invalidating each other", async () => {
    const devA = new MobileClient(serverInfo.baseUrl, "phone-device-a");
    const devB = new MobileClient(serverInfo.baseUrl, "tablet-device-b");

    const resA = await devA.login(testUser.username, "ValidPassword123!");
    const resB = await devB.login(testUser.username, "ValidPassword123!");

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);

    const tokenA = devA.getRefreshToken();
    const tokenB = devB.getRefreshToken();
    assert.notEqual(tokenA, tokenB, "Distinct devices must receive unique refresh tokens");

    const hashA = crypto.createHash("sha256").update(tokenA).digest("hex");
    const hashB = crypto.createHash("sha256").update(tokenB).digest("hex");

    const rowA = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [hashA]);
    const rowB = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [hashB]);

    assert.equal(rowA?.is_revoked, 0, "Device A token must remain active");
    assert.equal(rowB?.is_revoked, 0, "Device B token must remain active");
  });
});
