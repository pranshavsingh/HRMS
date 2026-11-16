/**
 * Tier 1 — Feature 6: Concurrency Grace Window Handling
 * Verifies 15-second grace window, concurrent_refresh flag, multiple concurrent
 * grace requests, expired grace window (>15s), and non-rotated revocation exclusion.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T1.06 — RTR Concurrency Grace Window", () => {
  let serverInfo;
  let testUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
    testUser = await createTestUser({
      username: `t1_grace_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T1-GRACE-01: Concurrent Refresh within 5 seconds returns valid access token with refresh null", async () => {
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

    // Seed old token with last_activity = 3 seconds ago, replaced_by_hash = activeHash
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: oldHash,
      familyId,
      isRevoked: 1,
      replacedByHash: activeHash,
      lastActivityOffsetMs: 3000
    });

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: activeHash,
      familyId,
      isRevoked: 0
    });

    const res = await client.post("/api/auth/refresh/", {
      refresh_token: oldToken
    });

    assert.equal(res.status, 200, "Within 15s grace window, rotated token must return HTTP 200");
    const body = res.body?.data || res.body;

    assert.ok(body.access, "Expected valid access token in grace window response");
    assert.equal(body.refresh, null, "Expected refresh to be null so client does not overwrite active token");
    assert.equal(body.concurrent_refresh, true, "Expected concurrent_refresh flag to be true");

    const decoded = jwt.decode(body.access);
    assert.equal(decoded.userId, testUser.id);
  });

  it("T1-GRACE-02: Concurrency flag is explicitly true during grace response", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const repHash = crypto.randomBytes(32).toString("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash,
      familyId,
      isRevoked: 1,
      replacedByHash: repHash,
      lastActivityOffsetMs: 1000
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 200);
    const body = res.body?.data || res.body;
    assert.equal(body.concurrent_refresh, true);
  });

  it("T1-GRACE-03: Multiple concurrent grace requests (<15s) all succeed without replay attack", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const repHash = crypto.randomBytes(32).toString("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash,
      familyId,
      isRevoked: 1,
      replacedByHash: repHash,
      lastActivityOffsetMs: 2000
    });

    // Fire 3 simultaneous grace refresh requests
    const p1 = client.post("/api/auth/refresh/", { refresh_token: token });
    const p2 = client.post("/api/auth/refresh/", { refresh_token: token });
    const p3 = client.post("/api/auth/refresh/", { refresh_token: token });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);

    const b1 = r1.body?.data || r1.body;
    const b2 = r2.body?.data || r2.body;
    const b3 = r3.body?.data || r3.body;

    assert.equal(b1.concurrent_refresh, true);
    assert.equal(b2.concurrent_refresh, true);
    assert.equal(b3.concurrent_refresh, true);
  });

  it("T1-GRACE-04: Grace window expires at 16 seconds, triggering replay revocation", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const repHash = crypto.randomBytes(32).toString("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash,
      familyId,
      isRevoked: 1,
      replacedByHash: repHash,
      lastActivityOffsetMs: 16000 // 16s ago > 15000ms
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 401, "At 16s, token must be rejected as replay attack");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /token reuse detected/i);
  });

  it("T1-GRACE-05: Rotated token missing replaced_by_hash is excluded from grace window", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    // Manually revoked token: is_revoked = 1, but replaced_by_hash = NULL
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash: hash,
      familyId,
      isRevoked: 1,
      replacedByHash: null,
      lastActivityOffsetMs: 1000 // recent, but not rotated
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 401, "Token without replacement hash must not be granted grace window");
  });
});
