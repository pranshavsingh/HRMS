import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import { db } from "../../src/db/index.js";
import { normalizeNominatimAddress } from "../../src/services/location.service.js";
import { formatPlusCodeLocation } from "../../src/utils/plusCode.js";

describe("Global GPS Reverse Geocoding & Caching E2E", () => {
  let serverInfo;
  let empUser;
  let empClient;

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();
    empUser = await createTestUser({ username: `geo_u_${ts}`, password: "ValidPassword123!", role: "employee" });

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
    if (empUser?.id) await deleteTestUser(empUser.id).catch(() => {});
    if (serverInfo?.close) await serverInfo.close();
    await teardownAll();
  });

  it("1. Rejects unauthenticated and invalid coordinate requests", async () => {
    const anon = new HttpClient({ baseUrl: serverInfo.baseUrl });
    const r401 = await anon.get("/api/location/reverse-geocode?lat=22.6372&lng=88.4655");
    assert.equal(r401.status, 401);

    const rMissing = await empClient.get("/api/location/reverse-geocode");
    assert.equal(rMissing.status, 400);

    const rInvalidLat = await empClient.get("/api/location/reverse-geocode?lat=120&lng=88.4655");
    assert.equal(rInvalidLat.status, 400);

    const rInvalidLng = await empClient.get("/api/location/reverse-geocode?lat=22.6372&lng=abc");
    assert.equal(rInvalidLng.status, 400);
  });

  it("2. Resolves coordinates to readable address and caches normalized coordinates", async () => {
    // Seed a deterministic entry or resolve live (with DB cache verification)
    const lat = 22.6372;
    const lng = 88.4655;

    // Clean any existing test cache entry first
    await db.run("DELETE FROM location_cache WHERE lat_key = 22.6372 AND lng_key = 88.4655");

    const res1 = await empClient.get(`/api/location/reverse-geocode?lat=${lat}&lng=${lng}`);
    assert.equal(res1.status, 200);
    const loc1 = res1.body?.data;
    assert.ok(loc1);
    assert.equal(loc1.latitude, lat);
    assert.equal(loc1.longitude, lng);
    assert.match(String(loc1.plus_code), /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{3}$/);
    assert.match(String(loc1.short_plus_code), /^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{3}$/);
    assert.ok(String(loc1.display_label).startsWith(loc1.short_plus_code));

    // If external network is available, formatted_address is populated and persisted to MySQL location_cache
    if (loc1.formatted_address) {
      const dbRow = await db.get(
        "SELECT * FROM location_cache WHERE lat_key = 22.6372 AND lng_key = 88.4655 LIMIT 1"
      );
      assert.ok(dbRow, "Resolved address must be persisted in location_cache");

      // Second request with slight GPS jitter within 4 decimals should hit cache
      const res2 = await empClient.get("/api/location/reverse-geocode?lat=22.63721&lng=88.46552");
      assert.equal(res2.status, 200);
      assert.equal(res2.body?.data?.cached, true);
      assert.equal(res2.body?.data?.formatted_address, loc1.formatted_address);
    }
  });

  it("3. Supports batch reverse geocoding with graceful per-item validation", async () => {
    const batchRes = await empClient.post("/api/location/reverse-geocode/batch", {
      coordinates: [
        { lat: 22.6372, lng: 88.4655 },
        { lat: "invalid", lng: 88.4655 },
      ],
    });
    assert.equal(batchRes.status, 200);
    const results = batchRes.body?.data?.results;
    assert.equal(results.length, 2);
    assert.equal(results[1].invalid, true);
  });

  it("4. Verifies Web and Mobile LocationDisplay integration", () => {
    const repoRoot = path.resolve(process.cwd(), "..");
    const webFiles = [
      "hrms_saas/src/components/common/LocationDisplay.jsx",
      "hrms_saas/src/pages/AttendanceApprovals.jsx",
      "hrms_saas/src/pages/Attendance.jsx",
      "hrms_saas/src/pages/Employees.jsx",
      "hrms_saas/src/pages/TeamAttendance.jsx",
      "hrms_saas/src/pages/MonthlyRegister.jsx",
    ];
    for (const f of webFiles) {
      const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
      assert.ok(content.includes("LocationDisplay"), `${f} must use LocationDisplay`);
    }

    const teamAttSrc = fs.readFileSync(path.join(repoRoot, "hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
    assert.ok(teamAttSrc.includes("photoModal.punchInLat") && teamAttSrc.includes("photoModal.punchInLng"));
    assert.ok(teamAttSrc.includes("photoModal.punchOutLat") && teamAttSrc.includes("photoModal.punchOutLng"));

    const webLocDisplay = fs.readFileSync(path.join(repoRoot, "hrms_saas/src/components/common/LocationDisplay.jsx"), "utf8");
    assert.ok(!webLocDisplay.includes("MapPin") && !webLocDisplay.includes("ExternalLink") && !webLocDisplay.includes("text-blue-600"));
    assert.ok(webLocDisplay.includes("formatLocationOneLine"));

    const mobileLocDisplay = fs.readFileSync(path.join(repoRoot, "hrms_mobile/src/components/LocationDisplay.tsx"), "utf8");
    assert.ok(!mobileLocDisplay.includes("MapPin") && !mobileLocDisplay.includes("ExternalLink") && !mobileLocDisplay.includes("#2457D6"));
    assert.ok(mobileLocDisplay.includes("formatLocationOneLine") && mobileLocDisplay.includes("numberOfLines={1}"));

    const mobileFiles = [
      "hrms_mobile/src/components/LocationDisplay.tsx",
      "hrms_mobile/src/app/(tabs)/approvals.tsx",
      "hrms_mobile/src/app/(tabs)/employees.tsx",
      "hrms_mobile/src/app/(tabs)/punch.tsx",
      "hrms_mobile/src/app/team-daily-attendance.tsx",
    ];
    for (const f of mobileFiles) {
      const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
      assert.ok(content.includes("LocationDisplay"), `${f} must use LocationDisplay`);
    }
  });

  it("5. Normalizes all 7 locality scenarios without hardcoding or district fallback when locality exists", () => {
    // 1. Renu Bhaban / Rajarhat, West Bengal (county: Rajarhat, municipality: Greater Kolkata, city: Bidhannagar)
    const rajarhat = normalizeNominatimAddress(
      { city: "Bidhannagar", municipality: "Greater Kolkata", county: "Rajarhat", state_district: "North 24 Parganas", state: "West Bengal", postcode: "700136" },
      "Bidhannagar, Greater Kolkata, Rajarhat, North 24 Parganas, West Bengal, 700136, India",
      22.637224,
      88.465514
    );
    assert.equal(rajarhat.locality, "Rajarhat");
    assert.equal(rajarhat.city, "Bidhannagar");
    assert.equal(rajarhat.municipality, "Greater Kolkata");
    assert.equal(rajarhat.metropolitan_area, "Greater Kolkata");
    assert.equal(rajarhat.display_city, "Kolkata");
    assert.equal(rajarhat.district, "North 24 Parganas");
    const rajarhatDisplay = formatPlusCodeLocation(rajarhat);
    assert.equal(rajarhatDisplay, "JFP8+V6J Rajarhat, Kolkata, West Bengal");

    // 2. Salt Lake / Bidhannagar, West Bengal (must NOT display Rajarhat as locality, must retain Bidhannagar)
    const bidhannagar = normalizeNominatimAddress(
      { suburb: "Sector V", city: "Bidhannagar", municipality: "Greater Kolkata", county: "Rajarhat", state_district: "North 24 Parganas", state: "West Bengal" },
      "Sector V, Bidhannagar, West Bengal",
      22.5797,
      88.431
    );
    const saltLakeDisplay = formatPlusCodeLocation(bidhannagar);
    assert.ok(saltLakeDisplay.endsWith("Sector V, Bidhannagar, West Bengal"), `Got: ${saltLakeDisplay}`);
    assert.ok(!saltLakeDisplay.includes("Rajarhat"), "Salt Lake must not display Rajarhat as its locality");

    // 3. Central Kolkata, West Bengal (retains Kolkata)
    const kolkata = normalizeNominatimAddress(
      { suburb: "Dharmatala", city: "Kolkata", municipality: "Greater Kolkata", state_district: "Kolkata", state: "West Bengal" },
      "Dharmatala, Kolkata, West Bengal",
      22.5535,
      88.3532
    );
    assert.ok(formatPlusCodeLocation(kolkata).endsWith("Dharmatala, Kolkata, West Bengal"));

    // 4. Rural West Bengal (retains town/village and does NOT substitute Kolkata)
    const rural = normalizeNominatimAddress(
      { suburb: "Jhikra", village: "Sonakur", city: "Nagarukhra II", municipality: "Greater Kolkata", county: "Haringhata", state_district: "Nadia", state: "West Bengal" },
      "Jhikra, Sonakur, Nadia, West Bengal",
      22.9,
      88.65
    );
    const ruralDisplay = formatPlusCodeLocation(rural);
    assert.ok(ruralDisplay.endsWith("Jhikra, Nagarukhra II, West Bengal"), `Got: ${ruralDisplay}`);
    assert.ok(!ruralDisplay.includes("Kolkata"), "Rural Nadia must not substitute Kolkata");

    // 5. Missing locality
    const missingLoc = normalizeNominatimAddress(
      { city: "Kolkata", state: "West Bengal" },
      "Kolkata, West Bengal",
      22.5726,
      88.3639
    );
    assert.ok(formatPlusCodeLocation(missingLoc).endsWith("Kolkata, West Bengal"));

    // 6. Missing district
    const missingDistrict = normalizeNominatimAddress(
      { suburb: "New Town", city: "Kolkata", state: "West Bengal" },
      "New Town, Kolkata, West Bengal",
      22.5867,
      88.4586
    );
    assert.ok(formatPlusCodeLocation(missingDistrict).endsWith("New Town, Kolkata, West Bengal"));

    // 7. Duplicate city and suburb names
    const dupCity = normalizeNominatimAddress(
      { suburb: "Kolkata", city: "Kolkata", state: "West Bengal" },
      "Kolkata, West Bengal",
      22.5726,
      88.3639
    );
    const dupDisplay = formatPlusCodeLocation(dupCity);
    assert.ok(!dupDisplay.includes("Kolkata, Kolkata"), `Unexpected duplicate city: ${dupDisplay}`);
    assert.ok(dupDisplay.endsWith("Kolkata, West Bengal"));
  });
});
