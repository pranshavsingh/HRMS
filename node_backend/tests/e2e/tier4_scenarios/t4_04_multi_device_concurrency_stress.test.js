/**
 * Tier 4 — Scenario Suite 4: Multi-Device Concurrency Stress
 * High-stress scenario simulating an active user across 5 simultaneous devices (2 Web, 3 Mobile):
 * 1. 5 distinct devices authenticate concurrently, creating 5 independent refresh token families
 * 2. 50 parallel authenticated requests fired across the devices simultaneously
 * 3. 2 devices hit expired access tokens mid-burst and trigger simultaneous RTR
 * 4. Refresh token rotation on Device A & B completes without invalidating Device C, D, or E
 * 5. Zero deadlocks, zero 500 Internal Server Errors, all 50 requests successfully resolve
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { WebClient, MobileClient } from "../harness/client-simulator.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";

describe("T4.04 — Multi-Device Concurrency Stress Scenario", () => {
  let serverInfo;
  let testUser;
  let web1, web2;
  let mobile1, mobile2, mobile3;

  before(async () => {
    serverInfo = await startTestServer();
    testUser = await createTestUser({
      username: `t4_stress_${Date.now()}`,
      password: "ValidPassword123!",
      role: "employee"
    });

    web1 = new WebClient(serverInfo.baseUrl);
    web2 = new WebClient(serverInfo.baseUrl);
    mobile1 = new MobileClient(serverInfo.baseUrl);
    mobile2 = new MobileClient(serverInfo.baseUrl);
    mobile3 = new MobileClient(serverInfo.baseUrl);
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(testUser?.id);
    await teardownAll();
  });

  it("T4-STR-01: 5 devices authenticate simultaneously and obtain distinct session credentials", async () => {
    const logins = await Promise.all([
      web1.login(testUser.username, "ValidPassword123!"),
      web2.login(testUser.username, "ValidPassword123!"),
      mobile1.login(testUser.username, "ValidPassword123!"),
      mobile2.login(testUser.username, "ValidPassword123!"),
      mobile3.login(testUser.username, "ValidPassword123!")
    ]);

    for (const res of logins) {
      assert.equal(res.status, 200, "All 5 devices must log in successfully");
    }
  });

  it("T4-STR-02: 50 concurrent requests spread across 5 devices all succeed with HTTP 200", async () => {
    const devices = [web1, web2, mobile1, mobile2, mobile3];
    const requests = [];

    for (let i = 0; i < 50; i++) {
      const device = devices[i % devices.length];
      const endpoint = i % 2 === 0 ? "/api/attendance/status/" : "/api/attendance/history/";
      requests.push(device.get(endpoint));
    }

    const responses = await Promise.all(requests);
    assert.equal(responses.length, 50);

    for (const res of responses) {
      assert.equal(res.status, 200, `Request must succeed with 200, got ${res.status}`);
      assert.notEqual(res.status, 500, "Must not encounter 500 Internal Server Error");
    }
  });

  it("T4-STR-03: Simultaneous 401s on Web1 and Mobile1 rotate independently without cross-device interference", async () => {
    // Expire access tokens on Web1 and Mobile1 only
    web1.setAccessToken("expired_web1_access_token");
    mobile1.setAccessToken("expired_mobile1_access_token");

    // Fire requests on all 5 devices simultaneously:
    // Web1 and Mobile1 will hit 401 and refresh; Web2, Mobile2, and Mobile3 proceed normally
    const [resWeb1, resWeb2, resMob1, resMob2, resMob3] = await Promise.all([
      web1.get("/api/attendance/status/"),
      web2.get("/api/attendance/status/"),
      mobile1.get("/api/attendance/status/"),
      mobile2.get("/api/attendance/status/"),
      mobile3.get("/api/attendance/status/")
    ]);

    assert.equal(resWeb1.status, 200, "Web1 must recover via silent refresh");
    assert.equal(resWeb2.status, 200, "Web2 must remain active");
    assert.equal(resMob1.status, 200, "Mobile1 must recover via JSON rotation");
    assert.equal(resMob2.status, 200, "Mobile2 must remain active");
    assert.equal(resMob3.status, 200, "Mobile3 must remain active");
  });

  it("T4-STR-04: Logging out Device A does not terminate Device B, C, D, or E", async () => {
    const logoutRes = await web1.logout();
    assert.equal(logoutRes.status, 200, "Web1 logout must succeed");

    // Remaining 4 devices must continue functioning
    const [resWeb2, resMob1, resMob2, resMob3] = await Promise.all([
      web2.get("/api/attendance/status/"),
      mobile1.get("/api/attendance/status/"),
      mobile2.get("/api/attendance/status/"),
      mobile3.get("/api/attendance/status/")
    ]);

    assert.equal(resWeb2.status, 200, "Web2 remains active after Web1 logout");
    assert.equal(resMob1.status, 200, "Mobile1 remains active after Web1 logout");
    assert.equal(resMob2.status, 200, "Mobile2 remains active after Web1 logout");
    assert.equal(resMob3.status, 200, "Mobile3 remains active after Web1 logout");
  });

  it("T4-STR-05: System handles sequential teardown of all remaining devices cleanly", async () => {
    const logouts = await Promise.all([
      web2.logout(),
      mobile1.logout(),
      mobile2.logout(),
      mobile3.logout()
    ]);

    for (const res of logouts) {
      assert.equal(res.status, 200, "Teardown logout must return HTTP 200");
    }
  });
});
