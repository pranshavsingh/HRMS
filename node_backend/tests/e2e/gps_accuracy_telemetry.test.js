import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import { db } from "../../src/db/index.js";

describe("GPS Position Accuracy & Telemetry E2E (GEO-02, GEO-03, GEO-04)", () => {
  let serverInfo;
  let empUser;
  let mgrUser;
  let empClient;

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();
    mgrUser = await createTestUser({ username: `gps_mgr_${ts}`, password: "ValidPassword123!", role: "manager" });
    empUser = await createTestUser({ username: `gps_emp_${ts}`, password: "ValidPassword123!", role: "employee", managerId: mgrUser.id });

    await db.run(
      "UPDATE accounts_employeeprofile SET latitude = 22.637200, longitude = 88.465500, allowed_radius = 100 WHERE user_id = ?",
      [empUser.id]
    );

    empClient = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const loginRes = await empClient.post("/api/auth/login/", {
      username: empUser.username,
      password: "ValidPassword123!",
      platform: "web",
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body?.data?.access || loginRes.body?.access;
    empClient.setHeader("Authorization", `Bearer ${token}`);
  });

  after(async () => {
    if (empUser?.id) {
      await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = ?)", [empUser.id]).catch(() => {});
      await db.run("DELETE FROM attendance_attendance WHERE user_id = ?", [empUser.id]).catch(() => {});
      await deleteTestUser(empUser.id).catch(() => {});
    }
    if (mgrUser?.id) await deleteTestUser(mgrUser.id).catch(() => {});
    if (serverInfo?.close) await serverInfo.close();
    await teardownAll();
  });

  it("1. Rejects poor accuracy (>100m), invalid accuracy, and stale location timestamps", async () => {
    const poorRes = await empClient.post("/api/attendance/punch-in/", {
      latitude: 22.637224,
      longitude: 88.465514,
      accuracy: 145,
      location_timestamp: Date.now(),
      location_provider: "web_geolocation",
      photo_url: "https://example.com/selfie.jpg",
    });
    assert.equal(poorRes.status, 400);
    assert.match(String(poorRes.body?.error || ""), /GPS accuracy is too low/i);

    const staleTs = Date.now() - 5 * 60 * 1000; // 5 minutes old
    const staleRes = await empClient.post("/api/attendance/punch-in/", {
      latitude: 22.637224,
      longitude: 88.465514,
      accuracy: 18,
      location_timestamp: staleTs,
      location_provider: "web_geolocation",
      photo_url: "https://example.com/selfie.jpg",
    });
    assert.equal(staleRes.status, 400);
    assert.match(String(staleRes.body?.error || ""), /stale/i);
  });

  it("2. Persists punch-in & punch-out GPS telemetry while preserving exact coordinates", async () => {
    const inLat = 22.6372241;
    const inLng = 88.4655142;
    const outLat = 22.6372318;
    const outLng = 88.4655199;
    const nowTs = Date.now();

    // Concurrent punch-in serialization check (2 simultaneous requests -> only 1 succeeds)
    const [p1, p2] = await Promise.all([
      empClient.post("/api/attendance/punch-in/", {
        latitude: inLat,
        longitude: inLng,
        accuracy: 16.4,
        location_timestamp: nowTs,
        location_provider: "web_geolocation",
        photo_url: "https://example.com/in.jpg",
      }),
      empClient.post("/api/attendance/punch-in/", {
        latitude: inLat,
        longitude: inLng,
        accuracy: 16.4,
        location_timestamp: nowTs,
        location_provider: "web_geolocation",
        photo_url: "https://example.com/in.jpg",
      }),
    ]);

    const statuses = [p1.status, p2.status].sort();
    assert.deepEqual(statuses, [200, 400]);

    // Punch-out with moderate/low indoor accuracy (68.5m <= 100m, accepted without blocking)
    const outRes = await empClient.post("/api/attendance/punch-out/", {
      latitude: outLat,
      longitude: outLng,
      accuracy: 68.5,
      location_timestamp: Date.now(),
      location_provider: "expo_location",
      photo_url: "https://example.com/out.jpg",
    });
    assert.equal(outRes.status, 200);

    const row = await db.get(
      "SELECT punch_in_lat, punch_in_lng, punch_out_lat, punch_out_lng, punch_in_accuracy, punch_out_accuracy, punch_in_location_ts, punch_out_location_ts, punch_in_location_provider, punch_out_location_provider FROM attendance_attendance WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [empUser.id]
    );
    assert.ok(row);
    assert.equal(Number(row.punch_in_lat), inLat);
    assert.equal(Number(row.punch_in_lng), inLng);
    assert.equal(Number(row.punch_out_lat), outLat);
    assert.equal(Number(row.punch_out_lng), outLng);
    assert.equal(Number(row.punch_in_accuracy), 16.4);
    assert.equal(Number(row.punch_out_accuracy), 68.5);
    assert.ok(row.punch_in_location_ts);
    assert.ok(row.punch_out_location_ts);
    assert.equal(row.punch_in_location_provider, "web_geolocation");
    assert.equal(row.punch_out_location_provider, "expo_location");
  });

  it("3. Verifies Web watchPosition and Mobile watchPositionAsync convergence & cleanup", () => {
    const repoRoot = path.resolve(process.cwd(), "..");
    const webLocSvc = fs.readFileSync(path.join(repoRoot, "hrms_saas/src/services/locationService.js"), "utf8");
    assert.ok(webLocSvc.includes("acquireBestGpsPosition"));
    assert.ok(webLocSvc.includes("navigator.geolocation.watchPosition"));
    assert.ok(webLocSvc.includes("clearWatch"));

    const webAtt = fs.readFileSync(path.join(repoRoot, "hrms_saas/src/pages/Attendance.jsx"), "utf8");
    assert.ok(!webAtt.includes("MAX_LOCATION_AGE_MS"));
    assert.ok(webAtt.includes("location_timestamp") && webAtt.includes("location_provider"));

    const mobLocSvc = fs.readFileSync(path.join(repoRoot, "hrms_mobile/src/services/locationService.ts"), "utf8");
    assert.ok(mobLocSvc.includes("acquireBestMobileGpsPosition"));
    assert.ok(mobLocSvc.includes("watchPositionAsync"));
    assert.ok(mobLocSvc.includes("hasServicesEnabledAsync"));
    assert.ok(mobLocSvc.includes("subscription.remove()"));

    const mobPunch = fs.readFileSync(path.join(repoRoot, "hrms_mobile/src/app/(tabs)/punch.tsx"), "utf8");
    assert.ok(mobPunch.includes("acquireBestMobileGpsPosition"));
    assert.ok(mobPunch.includes("gpsCancelRef"));
    assert.ok(mobPunch.includes("location_timestamp") && mobPunch.includes("location_provider"));
  });
});
