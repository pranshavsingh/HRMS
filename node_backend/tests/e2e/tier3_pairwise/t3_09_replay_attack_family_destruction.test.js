/**
 * Tier 3 — Pairwise Combination Suite 9: Replay Attack & Family Destruction
 * Cross-feature: RTR Grace Window + Family Revocation + Multi-Device Security Cascades
 * Verifies that when a revoked token is presented outside the 15s grace window,
 * the entire token family is revoked/destroyed, Redis session is cleared, and legitimate client is forced to re-login.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";
import redisService from "../../../src/services/redis.service.js";

describe("T3.09 — Replay Attack & Family Destruction", () => {
  let serverInfo;
  let client;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient(serverInfo.baseUrl);
    testUser = await createTestUser({
      username: `t3_replay_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-REP-01: Replaying token outside grace window returns HTTP 401", async () => {
    const familyId = crypto.randomUUID();
    const stolenToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const stolenHash = crypto.createHash("sha256").update(stolenToken).digest("hex");

    const legitimateToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const legitimateHash = crypto.createHash("sha256").update(legitimateToken).digest("hex");

    // Stolen token was rotated 20 seconds ago (> 15s grace window)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: stolenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: legitimateHash,
      lastActivityOffsetMs: 20000
    });

    // Legitimate token is currently active
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: legitimateHash,
      familyId,
      isRevoked: 0
    });

    // Attacker submits stolen token
    const attackRes = await client.post("/api/auth/refresh/", { refresh_token: stolenToken });
    assert.equal(attackRes.status, 401, "Replay attack outside grace window must return HTTP 401");
  });

  it("T3-REP-02: Legitimate active token in the same family is neutralized after replay attack", async () => {
    const familyId = crypto.randomUUID();
    const token1 = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash1 = crypto.createHash("sha256").update(token1).digest("hex");

    const token2 = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash2 = crypto.createHash("sha256").update(token2).digest("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash1,
      familyId,
      isRevoked: 1,
      replacedByHash: hash2,
      lastActivityOffsetMs: 20000
    });

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash2,
      familyId,
      isRevoked: 0
    });

    // Attack occurs
    await client.post("/api/auth/refresh/", { refresh_token: token1 });

    // Legitimate user now tries to use token2
    const legitRes = await client.post("/api/auth/refresh/", { refresh_token: token2 });
    assert.equal(legitRes.status, 401, "Legitimate token must be rejected because entire family was revoked");
  });

  it("T3-REP-03: User session cache in Redis is purged upon replay attack detection", async () => {
    // Populate Redis session
    await redisService.set(`user:session:${testUser.id}`, JSON.stringify({ id: testUser.id, role: "employee" }), 300);

    const familyId = crypto.randomUUID();
    const replayedToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const replayedHash = crypto.createHash("sha256").update(replayedToken).digest("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: replayedHash,
      familyId,
      isRevoked: 1,
      replacedByHash: "some_replacement_hash",
      lastActivityOffsetMs: 25000
    });

    await client.post("/api/auth/refresh/", { refresh_token: replayedToken });

    // Redis session key should now be removed
    const session = await redisService.get(`user:session:${testUser.id}`);
    assert.equal(session, null, "Redis user session must be cleared upon replay attack");
  });

  it("T3-REP-04: Database records confirm tokens are deleted or revoked for user", async () => {
    const remainingTokens = await db.all("SELECT * FROM accounts_refreshtoken WHERE user_id = ? AND is_revoked = 0", [testUser.id]);
    assert.equal(remainingTokens.length, 0, "No active unrevoked tokens may remain for compromised user");
  });

  it("T3-REP-05: User can recover by performing fresh login with valid credentials", async () => {
    const loginRes = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!"
    });

    assert.equal(loginRes.status, 200, "Fresh login must succeed to re-establish legitimate session");
    const body = loginRes.body?.data || loginRes.body;
    assert.ok(body.access, "Must receive new access token");
  });
});
