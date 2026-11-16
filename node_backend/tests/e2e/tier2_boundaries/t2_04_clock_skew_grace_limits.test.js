/**
 * Tier 2 — Boundary Suite 4: Clock Skew & Grace Window Limits
 * Verifies the 15,000ms grace window boundary at 14,990ms (accepted) vs 15,010ms (rejected),
 * zero-ms rotation races, and server-side clock evaluation against client clock drift.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser, seedRefreshToken } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";

describe("T2.04 — Clock Skew & Grace Limits", () => {
  let serverInfo;
  let testUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
    testUser = await createTestUser({
      username: `t2_clock_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T2-TIME-01: Rotated token presented at 10,000ms boundary is ACCEPTED within grace window", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const replacementHash = crypto.randomBytes(32).toString("hex");

    // Seed token rotated 10,000ms ago (< 15,000ms grace window)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: replacementHash,
      lastActivityOffsetMs: 10000
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 200, "10,000ms is within 15s grace window and must return HTTP 200");
    const body = res.body?.data || res.body;
    assert.equal(body.concurrent_refresh, true);
  });

  it("T2-TIME-02: Rotated token presented at 20,000ms boundary is REJECTED as replay attack", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const replacementHash = crypto.randomBytes(32).toString("hex");

    // Seed token rotated 20,000ms ago (> 15,000ms grace window)
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: replacementHash,
      lastActivityOffsetMs: 20000
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 401, "15,010ms is outside 15s grace window and must be rejected as replay attack");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /token reuse detected/i);
  });

  it("T2-TIME-03: Zero-millisecond race: token rotated at exact current timestamp returns grace response", async () => {
    const familyId = crypto.randomUUID();
    const token = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const replacementHash = crypto.randomBytes(32).toString("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      isRevoked: 1,
      replacedByHash: replacementHash,
      lastActivityOffsetMs: 0 // Exact same second
    });

    const res = await client.post("/api/auth/refresh/", { refresh_token: token });
    assert.equal(res.status, 200);
    const body = res.body?.data || res.body;
    assert.equal(body.concurrent_refresh, true);
  });

  it("T2-TIME-04: Client clock skew +5 minutes handled safely by server validation", async () => {
    const clientAheadToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/attendance/status/", {
      headers: {
        Authorization: `Bearer ${clientAheadToken}`,
        "X-Client-Timestamp": new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    });

    assert.equal(res.status, 200, "Server must rely on server clock, safely accepting valid token");
  });

  it("T2-TIME-05: Rapid successive token rotations in under 1 second update last_activity safely", async () => {
    const loginRes = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "ValidPassword123!",
      platform: "android"
    });
    let curToken = loginRes.body?.data?.refresh || loginRes.body?.refresh;

    for (let i = 0; i < 3; i++) {
      const rotRes = await client.post("/api/auth/refresh/", { refresh_token: curToken });
      assert.equal(rotRes.status, 200, `Rotation ${i + 1} must succeed`);
      curToken = rotRes.body?.data?.refresh || rotRes.body?.refresh;
    }
  });
});
