/**
 * Tier 3 — Pairwise Suite 2: Mobile Bearer + Token Rotation + AppState Resume
 * Tests the interaction of mobile SecureStore persistence, background/foreground
 * AppState transitions, and automatic token rotation upon resume.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";

describe("T3.02 — Mobile Bearer Rotation & AppState Resume", () => {
  let serverInfo;
  let testUser;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t3_mres_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T3-PAIR-02: Mobile client in background with expired token rotates and recovers on foreground resume", async () => {
    const client = new MobileClient(serverInfo.baseUrl, "dev-pair-02");

    // 1. Mobile login
    const loginRes = await client.login(testUser.username, "ValidPassword123!");
    assert.equal(loginRes.status, 200);

    const initialRefresh = client.getRefreshToken();
    const initialRefreshHash = crypto.createHash("sha256").update(initialRefresh).digest("hex");

    // 2. Simulate Backgrounding and Access Token Expiration
    client.secureStore.set(
      "token",
      jwt.sign(
        { userId: testUser.id, role: "employee", type: "access" },
        config.jwtSecret,
        { expiresIn: "0s", algorithm: "HS256" }
      )
    );

    // 3. User brings app to foreground (AppState change) and performs action
    const resumeRes = await client.get("/api/attendance/status/");
    assert.equal(resumeRes.status, 200, "Foreground resume action must succeed via transparent rotation");

    // 4. Verify tokens were updated in SecureStore
    const newRefresh = client.getRefreshToken();
    assert.notEqual(newRefresh, initialRefresh, "Refresh token must have rotated upon resume");

    // 5. Old token in DB must be revoked
    const oldRow = await db.get("SELECT is_revoked FROM accounts_refreshtoken WHERE token_hash = ?", [initialRefreshHash]);
    assert.equal(oldRow?.is_revoked, 1, "Prior refresh token must be revoked in database");
  });
});
