/**
 * Tier 2 — Boundary Suite 6: Payload Boundary Credentials
 * Verifies empty credentials rejection, 10,000 character username ReDoS/buffer probe,
 * SQL injection prevention, whitespace password handling, and Unicode/emoji password support.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T2.06 — Payload Boundary Credentials", () => {
  let serverInfo;
  let testUser;
  let emojiUser;
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });

    testUser = await createTestUser({
      username: `t2_pay_${Date.now()}`,
      password: "StandardPassword123!",
      role: "employee"
    });

    emojiUser = await createTestUser({
      username: `t2_emoji_${Date.now()}`,
      password: "SecureP@ss🔑2026!✨🌟",
      role: "employee"
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await deleteTestUser(emojiUser?.id);
    await teardownAll();
  });

  it("T2-PAY-01: Empty string credentials return HTTP 400 Bad Request", async () => {
    const res = await client.post("/api/auth/login/", {
      username: "",
      password: ""
    });

    assert.equal(res.status, 400, "Empty credentials must return HTTP 400");
    const errorMsg = res.body?.error || res.body?.message || "";
    assert.match(errorMsg, /(required|invalid|string)/i);
  });

  it("T2-PAY-02: 10,000 character username string is rejected without server stall", async () => {
    const massiveUsername = "x".repeat(10000);
    const start = Date.now();

    const res = await client.post("/api/auth/login/", {
      username: massiveUsername,
      password: "ValidPassword123!"
    });

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, "Request must not cause catastrophic ReDoS or thread lock");
    assert.ok([400, 401].includes(res.status), "Must be rejected with 400 or 401");
  });

  it("T2-PAY-03: SQL injection string in username is safely treated as literal parameter", async () => {
    const sqliAttempts = [
      "admin' OR '1'='1",
      "admin' OR 1=1 --",
      "' UNION SELECT * FROM accounts_user --",
      "admin'/*",
      "'; DROP TABLE accounts_user; --"
    ];

    for (const injection of sqliAttempts) {
      const res = await client.post("/api/auth/login/", {
        username: injection,
        password: "any"
      });

      assert.ok([400, 401].includes(res.status), `Injection '${injection}' must return 400 or 401`);
      assert.notEqual(res.status, 500, "SQL injection must never cause a syntax error / 500 in parameterized queries");
    }
  });

  it("T2-PAY-04: Whitespace-only password fails authentication", async () => {
    const res = await client.post("/api/auth/login/", {
      username: testUser.username,
      password: "            "
    });

    assert.ok([400, 401].includes(res.status), "Whitespace-only password must fail authentication");
  });

  it("T2-PAY-05: Unicode and emoji password authenticates successfully without character corruption", async () => {
    const res = await client.post("/api/auth/login/", {
      username: emojiUser.username,
      password: "SecureP@ss🔑2026!✨🌟"
    });

    assert.equal(res.status, 200, "Multi-byte Unicode / emoji password must authenticate correctly");
    const body = res.body?.data || res.body;
    assert.ok(body.access, "Expected access token on successful emoji password login");
  });
});
