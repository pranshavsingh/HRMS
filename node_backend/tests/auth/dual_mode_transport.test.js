import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app.js";
import { createTestUser, deleteTestUser } from "../e2e/harness/fixtures.js";
import redisService from "../../src/services/redis.service.js";
import { closePool } from "../../src/db/index.js";

describe("Milestone 2 — Test Suite 1: Dual-Mode Token Transport & CORS", () => {
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
      username: `dual_user_${Date.now()}`,
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

  it("TC-DUAL-01: Web Login Cookie Issuance sets HttpOnly cookie and nullifies body refresh", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.rawPassword,
        platform: "web"
      })
    });

    assert.equal(res.status, 200, "Web login must succeed with HTTP 200");
    const setCookie = res.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("refreshToken="), "Set-Cookie header must issue refreshToken");
    assert.ok(setCookie.includes("Path=/api"), "Cookie Path must be /api");
    assert.ok(setCookie.toLowerCase().includes("httponly"), "Cookie must be HttpOnly");
    assert.ok(setCookie.toLowerCase().includes("samesite=lax"), "Cookie must specify SameSite=Lax");
    assert.ok(setCookie.toLowerCase().includes("max-age=2592000"), "Cookie must specify Max-Age=2592000");

    const body = await res.json();
    const data = body.data || body;
    assert.ok(data.access, "Access token must be present in body");
    assert.equal(data.refresh, null, "Refresh token must be null in JSON body for web clients");
    assert.equal(data.user.username, testUser.username);
  });

  it("TC-DUAL-02: Mobile Login JSON Issuance returns token in JSON body and omits cookie", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Platform": "android"
      },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.rawPassword,
        platform: "android"
      })
    });

    assert.equal(res.status, 200, "Mobile login must succeed with HTTP 200");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(!setCookie || !setCookie.includes("refreshToken="), "Mobile login must NOT set refreshToken cookie");

    const body = await res.json();
    const data = body.data || body;
    assert.ok(data.access, "Access token must be present");
    assert.ok(data.refresh, "Refresh token must be present in JSON body for mobile clients");
    assert.equal(typeof data.refresh, "string");
  });

  it("TC-DUAL-03: Web Silent Refresh via Cookie rotates token, updates cookie, and returns refresh: null", async () => {
    // 1. Web login to get initial cookie
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.rawPassword,
        platform: "web"
      })
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/refreshToken=([^;]+)/);
    assert.ok(cookieMatch, "Must extract refreshToken cookie from login");
    const initialCookie = cookieMatch[1];

    // 2. Refresh call using cookie and empty body
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `refreshToken=${initialCookie}`
      },
      body: JSON.stringify({})
    });

    assert.equal(refreshRes.status, 200, "Silent refresh via cookie must succeed with HTTP 200");
    const newSetCookie = refreshRes.headers.get("set-cookie") || "";
    assert.ok(newSetCookie.includes("refreshToken="), "Refresh must set rotated refreshToken cookie");
    assert.ok(!newSetCookie.includes(initialCookie), "New cookie must differ from previous cookie");

    const body = await refreshRes.json();
    const data = body.data || body;
    assert.ok(data.access, "Must return fresh access token");
    assert.equal(data.refresh, null, "Web refresh response must have refresh: null in body");
    assert.equal(data.concurrent_refresh, false);
  });

  it("TC-DUAL-04: Mobile Refresh via JSON Body rotates refresh token without emitting Set-Cookie", async () => {
    // 1. Mobile login
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.rawPassword,
        platform: "android"
      })
    });
    const loginBody = await loginRes.json();
    const initialRefresh = loginBody.data?.refresh || loginBody.refresh;

    // 2. Mobile refresh
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform": "android"
      },
      body: JSON.stringify({
        refresh_token: initialRefresh,
        platform: "android"
      })
    });

    assert.equal(refreshRes.status, 200);
    const setCookie = refreshRes.headers.get("set-cookie");
    assert.ok(!setCookie || !setCookie.includes("refreshToken="), "Mobile refresh must NOT emit Set-Cookie");

    const refreshBody = await refreshRes.json();
    const data = refreshBody.data || refreshBody;
    assert.ok(data.access, "Must return new access token");
    assert.ok(data.refresh, "Must return new rotated refresh token in JSON");
    assert.notEqual(data.refresh, initialRefresh, "Rotated refresh token must differ from old one");
    assert.equal(data.concurrent_refresh, false);
  });

  it("TC-DUAL-05: Missing Refresh Token Rejection returns HTTP 400 with descriptive error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    assert.equal(res.status, 400, "Missing token must be rejected with HTTP 400");
    const body = await res.json();
    assert.match(body.error || "", /refresh token is required/i);
  });

  it("TC-DUAL-06: Cookie Path /api satisfies both /api/auth/* and /api/v1/auth/* endpoints", async () => {
    // 1. Login to get cookie
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.rawPassword,
        platform: "web"
      })
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/refreshToken=([^;]+)/);
    assert.ok(cookieMatch);
    const cookieVal = cookieMatch[1];

    // 2. Test legacy /api/auth/refresh/
    const resLegacy = await fetch(`${baseUrl}/api/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `refreshToken=${cookieVal}`
      },
      body: JSON.stringify({})
    });
    assert.equal(resLegacy.status, 200, "Legacy endpoint /api/auth/refresh/ must accept cookie");

    const rotatedCookieMatch = (resLegacy.headers.get("set-cookie") || "").match(/refreshToken=([^;]+)/);
    assert.ok(rotatedCookieMatch);
    const rotatedCookie = rotatedCookieMatch[1];

    // 3. Test versioned /api/v1/auth/refresh/
    const resV1 = await fetch(`${baseUrl}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `refreshToken=${rotatedCookie}`
      },
      body: JSON.stringify({})
    });
    assert.equal(resV1.status, 200, "Versioned endpoint /api/v1/auth/refresh/ must accept cookie");
  });

  it("TC-DUAL-07: CORS Preflight with X-Platform succeeds with 200/204 and allow-credentials", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "X-Platform, Content-Type, Authorization"
      }
    });

    assert.ok([200, 204].includes(res.status), `Preflight must succeed, got ${res.status}`);
    const allowHeaders = (res.headers.get("access-control-allow-headers") || "").toLowerCase();
    assert.ok(allowHeaders.includes("x-platform"), "Access-Control-Allow-Headers must include X-Platform");
    const allowCreds = res.headers.get("access-control-allow-credentials");
    assert.equal(allowCreds, "true", "Access-Control-Allow-Credentials must be true");
  });
});
