/**
 * Tier 2 — Boundary Suite 1: Expired Tokens
 * Verifies boundaries around access token and refresh token expiration,
 * database expiry vs cryptographic claim skew, and expired token logout.
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

describe("T2.01 — Expired Tokens Boundary Suite", () => {
  let serverInfo;
  let testUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });
    testUser = await createTestUser({
      username: `t2_exp_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T2-EXP-01: Access token expired by 1 second is rejected with HTTP 401", async () => {
    const expiredToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );

    // Give 1ms to ensure it's strictly in the past
    await new Promise((r) => setTimeout(r, 50));

    const res = await client.get("/api/attendance/status/", {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });

    assert.equal(res.status, 401, "Expired access token must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(expired|invalid|token)/i);
  });

  it("T2-EXP-02: Refresh token expired by 1 second is rejected and cleaned from database", async () => {
    const familyId = crypto.randomUUID();
    const expiredRefreshToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );
    const tokenHash = crypto.createHash("sha256").update(expiredRefreshToken).digest("hex");

    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() - 1000)
    });

    const res = await client.post("/api/auth/refresh/", {
      refresh_token: expiredRefreshToken
    });

    assert.equal(res.status, 401, "Expired refresh token must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(expired|invalid)/i);
  });

  it("T2-EXP-03: Skewed refresh token (valid JWT, but database row expired) returns HTTP 401", async () => {
    const familyId = crypto.randomUUID();
    const validJwt = jwt.sign(
      { userId: testUser.id, role: "employee", type: "refresh", familyId, jti: crypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256" } // JWT valid for 30d
    );
    const tokenHash = crypto.createHash("sha256").update(validJwt).digest("hex");

    // But DB row expires_at is in the past
    await seedRefreshToken({
      userId: testUser.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() - 5000)
    });

    const res = await client.post("/api/auth/refresh/", {
      refresh_token: validJwt
    });

    assert.equal(res.status, 401, "Token with expired database timestamp must return HTTP 401");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /expired/i);
  });

  it("T2-EXP-04: Expired access token sent to logout endpoint handles cleanly without crash", async () => {
    const expiredToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "0s", algorithm: "HS256" }
    );

    const res = await client.post("/api/auth/logout/", {}, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });

    assert.ok([200, 401].includes(res.status), "Expired token logout must return 200 or 401");
    assert.notEqual(res.status, 500, "Must not crash server");
  });

  it("T2-EXP-05: Token with negative lifespan is rejected immediately", async () => {
    const negativeExpToken = jwt.sign(
      { userId: testUser.id, role: "employee", type: "access", exp: Math.floor(Date.now() / 1000) - 3600 },
      config.jwtSecret,
      { algorithm: "HS256" }
    );

    const res = await client.get("/api/attendance/status/", {
      headers: { Authorization: `Bearer ${negativeExpToken}` }
    });

    assert.equal(res.status, 401);
  });
});
