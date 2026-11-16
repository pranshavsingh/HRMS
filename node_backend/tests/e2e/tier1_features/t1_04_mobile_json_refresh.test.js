/**
 * Tier 1 — Feature 4: Mobile JSON Token Refresh
 * Verifies mobile body token rotation, family ID preservation,
 * missing body validation, rejection of access tokens as refresh tokens,
 * and activity timestamp updates.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";

describe("T1.04 — Mobile JSON Token Refresh", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t1_mobref_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-MOBREF-01: Mobile Refresh rotates and returns both new access and refresh tokens in body", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl, "dev-uuid-004");
    const loginRes = await mobileClient.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200);

    const oldAccess = mobileClient.getSecureToken();
    const oldRefresh = mobileClient.getRefreshToken();
    assert.ok(oldAccess && oldRefresh);

    const refreshRes = await mobileClient.silentRefresh();
    assert.equal(refreshRes.status, 200);

    const newAccess = mobileClient.getSecureToken();
    const newRefresh = mobileClient.getRefreshToken();

    assert.notEqual(newAccess, oldAccess, "New access token must be minted");
    assert.notEqual(newRefresh, oldRefresh, "New refresh token must be rotated");

    // Old token must be revoked in DB
    const oldHash = crypto.createHash("sha256").update(oldRefresh).digest("hex");
    const oldRow = await db.get("SELECT is_revoked, replaced_by_hash FROM accounts_refreshtoken WHERE token_hash = ?", [oldHash]);
    assert.equal(oldRow?.is_revoked, 1, "Old refresh token must be revoked in database");

    // New token must be active in DB
    const newHash = crypto.createHash("sha256").update(newRefresh).digest("hex");
    const newRow = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [newHash]);
    assert.equal(newRow?.is_revoked, 0, "New refresh token must be active in database");
  });

  it("T1-MOBREF-02: Mobile Refresh preserves cryptographic familyId across rotations", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl, "dev-uuid-004-fam");
    await mobileClient.login(testUser.username, "ValidPassword123!");

    const token1 = mobileClient.getRefreshToken();
    const decoded1 = jwt.decode(token1);
    const familyId1 = decoded1.familyId;
    assert.ok(familyId1, "Initial token must contain familyId claim");

    await mobileClient.silentRefresh();
    const token2 = mobileClient.getRefreshToken();
    const decoded2 = jwt.decode(token2);
    assert.equal(decoded2.familyId, familyId1, "Rotated token must retain identical familyId");

    await mobileClient.silentRefresh();
    const token3 = mobileClient.getRefreshToken();
    const decoded3 = jwt.decode(token3);
    assert.equal(decoded3.familyId, familyId1, "Subsequent rotation must retain identical familyId");
  });

  it("T1-MOBREF-03: Mobile Refresh with missing body returns HTTP 400", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const res = await rawClient.post("/api/auth/refresh/", {});

    assert.equal(res.status, 400, "Missing refresh token must return HTTP 400");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /refresh token is required/i);
  });

  it("T1-MOBREF-04: Mobile Refresh strictly rejects access tokens in body", async () => {
    const rawClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    // Mint a valid access token
    const accessJwt = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await rawClient.post("/api/auth/refresh/", {
      refresh_token: accessJwt
    });

    assert.equal(res.status, 401, "Access token presented as refresh token must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /invalid refresh token/i);
  });

  it("T1-MOBREF-05: Mobile Refresh updates activity timestamp on old token record", async () => {
    const mobileClient = new MobileClient(serverInfo.baseUrl, "dev-uuid-004-time");
    await mobileClient.login(testUser.username, "ValidPassword123!");

    const initialToken = mobileClient.getRefreshToken();
    const initialHash = crypto.createHash("sha256").update(initialToken).digest("hex");

    // Artificially age the last_activity by 5 seconds
    const agedTime = new Date(Date.now() - 5000);
    await db.run("UPDATE accounts_refreshtoken SET last_activity = ? WHERE token_hash = ?", [agedTime, initialHash]);

    await mobileClient.silentRefresh();

    const updatedRow = await db.get("SELECT last_activity FROM accounts_refreshtoken WHERE token_hash = ?", [initialHash]);
    const updatedTime = new Date(updatedRow.last_activity).getTime();

    // Verify last_activity was updated to current time during rotation
    assert.ok(updatedTime > agedTime.getTime(), "last_activity must be updated upon rotation");
  });
});
