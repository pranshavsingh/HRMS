/**
 * Tier 1 — Feature 5: Atomic Token Rotation & Replay Revocation
 * Verifies normal rotation chain, replay detection outside grace window (>15s),
 * cascading family revocation, unknown token revocation, and atomic replacement state.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";

describe("T1.05 — RTR Atomic Rotation & Replay Revocation", () => {
  let serverInfo;
  let testUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
    testUser = await createTestUser({
      username: `t1_rtr_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-RTR-01: Normal single token rotation chain builds replacement tree (R0 -> R1 -> R2)", async () => {
    // 1. Initial Login (R0)
    const loginRes = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    const r0 = loginRes.body.refresh;
    const h0 = crypto.createHash("sha256").update(r0).digest("hex");

    // 2. Rotate R0 -> R1
    const rot1Res = await client.post("/api/auth/refresh/", { refresh_token: r0 });
    const r1 = rot1Res.body.refresh;
    const h1 = crypto.createHash("sha256").update(r1).digest("hex");

    // 3. Rotate R1 -> R2
    const rot2Res = await client.post("/api/auth/refresh/", { refresh_token: r1 });
    const r2 = rot2Res.body.refresh;
    const h2 = crypto.createHash("sha256").update(r2).digest("hex");

    // Verify DB replacement chain
    const row0 = await db.get("SELECT is_revoked, replaced_by_hash FROM accounts_refreshtoken WHERE token_hash = ?", [h0]);
    const row1 = await db.get("SELECT is_revoked, replaced_by_hash FROM accounts_refreshtoken WHERE token_hash = ?", [h1]);
    const row2 = await db.get("SELECT is_revoked, replaced_by_hash FROM accounts_refreshtoken WHERE token_hash = ?", [h2]);

    assert.equal(row0.is_revoked, 1);
    assert.equal(row0.replaced_by_hash, h1);

    assert.equal(row1.is_revoked, 1);
    assert.equal(row1.replaced_by_hash, h2);

    assert.equal(row2.is_revoked, 0);
    assert.equal(row2.replaced_by_hash, null);
  });

  it("T1-RTR-02: Replay attack outside grace window (>15s) returns HTTP 401 with Token reuse message", async () => {
    // Mint token R_old and active replacement R_active
    const familyId = crypto.randomUUID();
    const oldToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const activeToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );

    const oldHash = crypto.createHash("sha256").update(oldToken).digest("hex");
    const activeHash = crypto.createHash("sha256").update(activeToken).digest("hex");

    // Seed old token with last_activity = 25 seconds ago
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: oldHash,
      familyId,
      isRevoked: 1,
      replacedByHash: activeHash,
      lastActivityOffsetMs: 25000
    });

    // Seed active replacement token
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: activeHash,
      familyId,
      isRevoked: 0,
      replacedByHash: null
    });

    // Replay the old token after grace window
    const replayRes = await client.post("/api/auth/refresh/", {
      refresh_token: oldToken
    });

    assert.equal(replayRes.status, 401, "Replaying expired rotated token must return HTTP 401");
    const errorMsg = replayRes.body?.error || replayRes.body?.message || "";
    assert.match(errorMsg, /token reuse detected/i);
  });

  it("T1-RTR-03: Replay attack revokes all sibling tokens within the same family", async () => {
    const familyId = crypto.randomUUID();
    const tokenA = jwt.sign({ userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: "30d", algorithm: "HS256" });
    const tokenB = jwt.sign({ userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: "30d", algorithm: "HS256" });

    const hashA = crypto.createHash("sha256").update(tokenA).digest("hex");
    const hashB = crypto.createHash("sha256").update(tokenB).digest("hex");

    // Seed token A as rotated 30s ago
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hashA,
      familyId,
      isRevoked: 1,
      replacedByHash: hashB,
      lastActivityOffsetMs: 30000
    });

    // Seed token B as currently active
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hashB,
      familyId,
      isRevoked: 0
    });

    // Trigger replay on A
    await client.post("/api/auth/refresh/", { refresh_token: tokenA });

    // Verify token B is either revoked or deleted from database
    const rowB = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [hashB]);
    assert.ok(!rowB || rowB.is_revoked === 1, "Sibling active token must be revoked or deleted upon replay attack");
  });

  it("T1-RTR-04: Presenting unknown refresh token revokes familyId if present in claim", async () => {
    const victimFamily = crypto.randomUUID();
    const victimToken = jwt.sign({ userId: testUser.id, role: "employee", type: "refresh", familyId: victimFamily, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: "30d", algorithm: "HS256" });
    const victimHash = crypto.createHash("sha256").update(victimToken).digest("hex");

    // Seed active token for victimFamily
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: victimHash,
      familyId: victimFamily,
      isRevoked: 0
    });

    // Mint a synthetic token with the same familyId that does NOT exist in DB
    const syntheticToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId: victimFamily, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );

    const res = await client.post("/api/auth/refresh/", {
      refresh_token: syntheticToken
    });

    assert.equal(res.status, 401);
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(session expired|token reused)/i);

    // Victim family must be revoked or deleted from DB
    const victimRow = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [victimHash]);
    assert.ok(!victimRow || victimRow.is_revoked === 1, "Victim token family must be revoked or deleted on unknown token replay");
  });

  it("T1-RTR-05: Subsequent refresh on revoked token continues to be rejected", async () => {
    const familyId = crypto.randomUUID();
    const deadToken = jwt.sign({ userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: "30d", algorithm: "HS256" });
    const deadHash = crypto.createHash("sha256").update(deadToken).digest("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: deadHash,
      familyId,
      isRevoked: 1,
      lastActivityOffsetMs: 60000
    });

    const res1 = await client.post("/api/auth/refresh/", { refresh_token: deadToken });
    const res2 = await client.post("/api/auth/refresh/", { refresh_token: deadToken });

    assert.equal(res1.status, 401);
    assert.equal(res2.status, 401);
  });
});
