/**
 * Tier 4 — Scenario Suite 5: Adversarial Breach & Family Destruction
 * Complete adversarial scenario simulating a stolen refresh token replay attack:
 * 1. Legitimate user authenticates and completes 3 successive token rotations (R1 -> R2 -> R3)
 * 2. 20 seconds elapse (outside the 15-second grace window)
 * 3. Adversary replays stolen token R1 to /api/auth/refresh/
 * 4. Backend identifies token reuse / theft attack:
 *    - Rejects request with HTTP 401
 *    - Revokes and destroys the entire token family
 *    - Purges active user sessions from Redis
 * 5. Legitimate client presenting active token R3 is now rejected (401), neutralizing the compromised session
 * 6. Legitimate client must perform fresh interactive login to recover
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

describe("T4.05 — Adversarial Breach & Family Destruction Scenario", () => {
  let serverInfo;
  let client;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient(serverInfo.baseUrl);
    testUser = await createTestUser({
      username: `t4_breach_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T4-BRC-01: Generates 3-generation token rotation chain (R1 -> R2 -> R3)", async () => {
    const familyId = crypto.randomUUID();

    // R1 (stolen token, rotated 20s ago)
    const token1 = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash1 = crypto.createHash("sha256").update(token1).digest("hex");

    // R2 (intermediate token, rotated 10s ago)
    const token2 = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash2 = crypto.createHash("sha256").update(token2).digest("hex");

    // R3 (currently active token held by legitimate user)
    const token3 = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash3 = crypto.createHash("sha256").update(token3).digest("hex");

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
      isRevoked: 1,
      replacedByHash: hash3,
      lastActivityOffsetMs: 10000
    });

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash3,
      familyId,
      isRevoked: 0
    });

    // Populate Redis session cache
    await redisService.set(`user:session:${testUser.id}`, JSON.stringify({ id: testUser.id, role: "employee" }), 300);

    // Save tokens in context for subsequent steps
    testUser.token1 = token1;
    testUser.token2 = token2;
    testUser.token3 = token3;
    testUser.familyId = familyId;
  });

  it("T4-BRC-02: Adversary submits stolen token R1 outside grace window -> HTTP 401", async () => {
    const attackRes = await client.post("/api/auth/refresh/", {
      refresh_token: testUser.token1
    });

    assert.equal(attackRes.status, 401, "Replay of rotated token outside grace window must return HTTP 401");
  });

  it("T4-BRC-03: Security cascade revokes and deletes entire token family in database", async () => {
    const remainingActiveTokens = await db.all(
      "SELECT * FROM accounts_refreshtoken WHERE family_id = ? AND is_revoked = 0",
      [testUser.familyId]
    );

    assert.equal(remainingActiveTokens.length, 0, "All tokens in compromised family must be revoked or deleted");
  });

  it("T4-BRC-04: Redis session cache is cleared by security cascade", async () => {
    const cachedSession = await redisService.get(`user:session:${testUser.id}`);
    assert.equal(cachedSession, null, "Redis session cache must be purged upon breach detection");
  });

  it("T4-BRC-05: Legitimate user presenting active token R3 is now rejected", async () => {
    const legitRes = await client.post("/api/auth/refresh/", {
      refresh_token: testUser.token3
    });

    assert.equal(legitRes.status, 401, "Legitimate client must be rejected following family neutralization");
  });

  it("T4-BRC-06: Legitimate user recovers cleanly by performing interactive re-login", async () => {
    const loginRes = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!"
    });

    assert.equal(loginRes.status, 200, "User must be able to re-authenticate with legitimate credentials");
    const body = loginRes.body?.data || loginRes.body;
    assert.ok(body.access, "Must receive new access token");
  });
});
