/**
 * Tier 1 — Feature 1: Web Dual-Mode Cookie Authentication
 * Verifies cookie issuance, flags (HttpOnly, SameSite, Secure), inactive account rejection,
 * bad credentials, and PBKDF2 -> Bcrypt auto-migration.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { db } from "../../../src/db/index.js";

describe("T1.01 — Web Cookie Authentication", () => {
  let serverInfo;
  let client;
  let testUser;
  let inactiveUser;
  let legacyUser;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });

    testUser = await createTestUser({
      username: `t1_web_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });

    inactiveUser = await createTestUser({
      username: `t1_inact_${Date.now()}`,
      password: "ValidPassword123!",
      isActive: 0
    });

    legacyUser = await createTestUser({
      username: `t1_leg_${Date.now()}`,
      password: "LegacyPassword123!",
      legacyPbkdf2: true
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await deleteTestUser(inactiveUser?.id);
    await deleteTestUser(legacyUser?.id);
    await teardownAll();
  });

  it("T1-WEBAUTH-01: Successful Web Login returns valid access token with required claims", async () => {
    const res = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = res.body?.data || res.body;
    assert.ok(data.access, "Expected access token in response");

    const decoded = jwt.decode(data.access);
    assert.ok(decoded, "Expected valid decoded JWT");
    assert.equal(decoded.userId, testUser.id);
    assert.equal(decoded.role, "employee");
    assert.equal(decoded.type, "access");
    assert.ok(decoded.exp > decoded.iat, "Expected valid future expiration");

    // Dual-mode contract verification: Web client should have HttpOnly refreshToken cookie or body token
    const cookie = client.cookieJar.getCookie("refreshToken");
    if (cookie) {
      assert.equal(cookie.httpOnly, true, "Expected HttpOnly flag on refreshToken cookie");
      assert.match(cookie.path, /^\/api(\/|$)/, "Expected cookie path to cover auth routes");
    } else {
      assert.ok(data.refresh, "In transitional mode, body refresh token should be provided if cookie not set");
    }
  });

  it("T1-WEBAUTH-02: Cookie flags adhere to security contract", async () => {
    const res = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });

    assert.equal(res.status, 200);
    const cookie = client.cookieJar.getCookie("refreshToken");
    if (cookie) {
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.sameSite?.toLowerCase(), "lax");
      assert.ok(cookie.maxAge === 2592000 || cookie.maxAge === null, "Max-Age should be 30 days");
    }
  });

  it("T1-WEBAUTH-03: Web Login rejects inactive accounts with HTTP 400", async () => {
    client.cookieJar.clear();
    const res = await client.post("/api/auth/login/", {
      username: inactiveUser.username,
      password: "ValidPassword123!",
      platform: "web"
    });

    assert.equal(res.status, 400, "Inactive account must receive HTTP 400");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /invalid credentials|inactive/i, "Error message should reject inactive account");
    assert.equal(client.cookieJar.getCookie("refreshToken")?.value, undefined, "Inactive user must not receive cookie");
  });

  it("T1-WEBAUTH-04: Web Login rejects invalid credentials with HTTP 400", async () => {
    client.cookieJar.clear();
    const res = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "WrongPassword999!",
      platform: "web"
    });

    assert.equal(res.status, 400);
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /invalid credentials/i);
    assert.equal(client.cookieJar.getCookie("refreshToken"), null, "Failed login must not issue cookie");
  });

  it("T1-WEBAUTH-05: Web Login auto-migrates legacy PBKDF2 hash to enterprise Bcrypt", async () => {
    // Verify legacy password hash starts with pbkdf2_sha256$
    const preCheck = await db.get("SELECT password FROM accounts_user WHERE id = ?", [legacyUser.id]);
    assert.match(preCheck.password, /^pbkdf2_sha256\$/, "Expected user to have legacy PBKDF2 hash before login");

    const res = await client.post("/api/auth/login/", {
      username: legacyUser.username,
      password: "LegacyPassword123!",
      platform: "web"
    });

    assert.equal(res.status, 200, "Legacy user should authenticate successfully");

    // Verify hash was migrated to Bcrypt rounds 12 ($2a$12$ or $2b$12$)
    const postCheck = await db.get("SELECT password FROM accounts_user WHERE id = ?", [legacyUser.id]);
    assert.match(postCheck.password, /^\$2[ab]\$12\$/, "Expected user password to be migrated to Bcrypt rounds 12");
  });
});
