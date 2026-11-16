import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config/env.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../e2e/harness/fixtures.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { accountsService } from "../../src/services/accounts.service.js";
import redisService from "../../src/services/redis.service.js";
import { db, closePool } from "../../src/db/index.js";

describe("Milestone 2 — Test Suite 2: RTR & Concurrency CAS", () => {
  let app;
  let server;
  let baseUrl;
  let testUser;

  before(async () => {
    app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    testUser = await createTestUser({
      username: `rtr_cas_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (testUser?.id) {
      await deleteTestUser(testUser.id);
    }
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });

  function mintRefreshToken(familyId = crypto.randomUUID()) {
    const rawToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256", jwtid: crypto.randomUUID() }
    );
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    return { rawToken, tokenHash, familyId };
  }

  it("TC-CAS-01: Serial Token Rotation Tree tracks ancestor replacement in same family", async () => {
    const familyId = crypto.randomUUID();
    const r0 = mintRefreshToken(familyId);
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: r0.tokenHash,
      familyId,
      platform: "android"
    });

    // 1. Rotate R0 -> R1
    const rot1 = await accountsService.refreshSession(r0.rawToken, { platform: "android" });
    assert.ok(rot1.refresh);
    assert.equal(rot1.concurrent_refresh, false);
    const r1Hash = crypto.createHash("sha256").update(rot1.refresh).digest("hex");

    // 2. Rotate R1 -> R2
    const rot2 = await accountsService.refreshSession(rot1.refresh, { platform: "android" });
    assert.ok(rot2.refresh);
    assert.equal(rot2.concurrent_refresh, false);
    const r2Hash = crypto.createHash("sha256").update(rot2.refresh).digest("hex");

    // Verify database lineage: R0 replaced by R1, R1 replaced by R2, all active/revoked correct
    const dbR0 = await accountsRepository.findRefreshTokenByHash(r0.tokenHash);
    const dbR1 = await accountsRepository.findRefreshTokenByHash(r1Hash);
    const dbR2 = await accountsRepository.findRefreshTokenByHash(r2Hash);

    assert.equal(dbR0.is_revoked, 1);
    assert.equal(dbR0.replaced_by_hash, r1Hash);

    assert.equal(dbR1.is_revoked, 1);
    assert.equal(dbR1.replaced_by_hash, r2Hash);

    assert.equal(dbR2.is_revoked, 0);
    assert.equal(dbR2.replaced_by_hash, null);

    assert.equal(dbR0.family_id, familyId);
    assert.equal(dbR1.family_id, familyId);
    assert.equal(dbR2.family_id, familyId);
  });

  it("TC-CAS-02: Concurrent 2-Way Refresh Race guarantees exactly one winner and one grace responder", async () => {
    const familyId = crypto.randomUUID();
    const token = mintRefreshToken(familyId);
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: token.tokenHash,
      familyId,
      platform: "android"
    });

    // Fire 2 concurrent HTTP refresh requests with the same token
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token.rawToken, platform: "android" })
      }),
      fetch(`${baseUrl}/api/v1/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token.rawToken, platform: "android" })
      })
    ]);

    assert.equal(res1.status, 200, "Request 1 must return 200");
    assert.equal(res2.status, 200, "Request 2 must return 200");

    const body1 = await res1.json();
    const body2 = await res2.json();

    const data1 = body1.data || body1;
    const data2 = body2.data || body2;

    const normal = [data1, data2].find((d) => d.concurrent_refresh === false);
    const grace = [data1, data2].find((d) => d.concurrent_refresh === true);

    assert.ok(normal, "Exactly one request must execute normal rotation");
    assert.ok(grace, "Exactly one request must receive concurrent grace response");
    assert.ok(normal.refresh, "Winner must receive new refresh token");
    assert.equal(grace.refresh, null, "Grace response must return refresh: null");
    assert.ok(grace.access, "Grace response must receive valid new access token");
  });

  it("TC-CAS-03: Web Grace Response Suppresses Cookie strictly to prevent clobbering browser storage", async () => {
    const familyId = crypto.randomUUID();
    const token = mintRefreshToken(familyId);
    // Seed token as already rotated 500ms ago within grace window
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: token.tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: "already_replaced_hash_for_web_test",
      lastActivityOffsetMs: 500,
      platform: "web"
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `refreshToken=${token.rawToken}`
      },
      body: JSON.stringify({})
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie");
    assert.ok(!setCookie || !setCookie.includes("refreshToken="), "Grace window response MUST NOT set Set-Cookie");

    const body = await res.json();
    const data = body.data || body;
    assert.equal(data.concurrent_refresh, true);
    assert.equal(data.refresh, null);
    assert.ok(data.access);
  });

  it("TC-CAS-04: Multi-Request Grace Window Storm absorbs 5 concurrent bursts cleanly", async () => {
    const familyId = crypto.randomUUID();
    const token = mintRefreshToken(familyId);
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: token.tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: "replaced_burst_test_hash",
      lastActivityOffsetMs: 1000,
      platform: "android"
    });

    const requests = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/v1/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token.rawToken, platform: "android" })
      })
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.equal(res.status, 200, "All burst requests within grace window must succeed with HTTP 200");
      const body = await res.json();
      const data = body.data || body;
      assert.equal(data.concurrent_refresh, true);
      assert.equal(data.refresh, null);
      assert.ok(data.access);
    }
  });

  it("TC-CAS-05: Grace Window Expiration Replay Attack triggers full family revocation", async () => {
    const familyId = crypto.randomUUID();
    const token = mintRefreshToken(familyId);
    // Seed token rotated 35 seconds ago (exceeds default 30s grace window)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: token.tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: "older_replacement_hash",
      lastActivityOffsetMs: 35000,
      platform: "android"
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token.rawToken, platform: "android" })
    });

    assert.equal(res.status, 401, "Expired grace replay attack must be rejected with HTTP 401");
    const body = await res.json();
    assert.match(body.error || "", /token reuse detected/i);

    // Verify entire family is revoked in MySQL
    const activeTokens = await db.all(
      "SELECT * FROM accounts_refreshtoken WHERE family_id = ? AND is_revoked = 0",
      [familyId]
    );
    assert.equal(activeTokens.length, 0, "No active tokens may remain in compromised family");
  });

  it("TC-CAS-06: Sibling Token Invalidation on Replay destroys siblings in the same family", async () => {
    const familyId = crypto.randomUUID();
    const r0 = mintRefreshToken(familyId);
    const s1 = mintRefreshToken(familyId);

    // Seed R0 as expired revoked token (35s ago)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: r0.tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: "replacement_for_r0",
      lastActivityOffsetMs: 35000,
      platform: "android"
    });

    // Seed sibling S1 as currently active (unrevoked) in the same family
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: s1.tokenHash,
      familyId,
      isRevoked: 0,
      platform: "android"
    });

    // Replay R0
    const replayRes = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: r0.rawToken, platform: "android" })
    });
    assert.equal(replayRes.status, 401);

    // Now attempt to use legitimate sibling S1: must be rejected with 401
    const siblingRes = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s1.rawToken, platform: "android" })
    });
    assert.equal(siblingRes.status, 401, "Sibling token must be revoked following family compromise");
  });

  it("TC-CAS-07: Manually Revoked Token Grace Exclusion rejects token if replaced_by_hash is NULL", async () => {
    const familyId = crypto.randomUUID();
    const token = mintRefreshToken(familyId);
    // Token was manually revoked without being rotated (replaced_by_hash is null)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: token.tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: null,
      lastActivityOffsetMs: 500, // Recent, but unrotated
      platform: "android"
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token.rawToken, platform: "android" })
    });

    assert.equal(res.status, 401, "Unrotated revoked token must NOT receive grace window");
    const body = await res.json();
    assert.match(body.error || "", /token reuse detected/i);
  });
});
