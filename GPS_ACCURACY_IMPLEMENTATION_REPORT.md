# HRMS – GPS Position Accuracy & Telemetry Implementation Report (GEO-02, GEO-03, GEO-04)

**Date:** 2026-11-27  
**Scope:** MySQL (`030_attendance_gps_telemetry.sql`), `node_backend`, `hrms_saas` (React Web), `hrms_mobile` (Expo React Native)

---

## 1. Files Changed

- **Database Migration:**
  - `node_backend/scripts/migrations/030_attendance_gps_telemetry.sql` (new)
- **Backend (`node_backend`):**
  - `node_backend/src/config/env.js` — Added configurable thresholds (`gpsGoodAccuracyMeters: 25`, `gpsWarnAccuracyMeters: 50`, `gpsMaxAccuracyMeters: 100`, `gpsMaxLocationAgeMs: 120000`).
  - `node_backend/src/controllers/attendance.controller.js` — Extracted `location_timestamp` and `location_provider` in `punchIn` and `punchOut`.
  - `node_backend/src/services/attendance.service.js` — Added `validateAndClassifyGpsTelemetry()` and persisted `punch_in_accuracy`, `punch_out_accuracy`, `punch_in_location_ts`, `punch_out_location_ts`, `punch_in_location_provider`, and `punch_out_location_provider`.
  - `node_backend/tests/e2e/gps_accuracy_telemetry.test.js` (new) — E2E & regression tests for accuracy thresholds, freshness validation, telemetry persistence, and concurrent punch serialization.
- **React Web (`hrms_saas`):**
  - `hrms_saas/src/services/locationService.js` — Added `acquireBestGpsPosition()` using `navigator.geolocation.watchPosition`.
  - `hrms_saas/src/pages/Attendance.jsx` — Replaced single-shot `getCurrentPosition` + 5-minute `MAX_LOCATION_AGE_MS` cache + silent stale fallback with fresh `acquireBestGpsPosition` convergence on both camera start and `handleSubmit`, added GPS Accuracy `InfoCard`, and sent `location_timestamp` & `location_provider: "web_geolocation"`.
- **Expo Mobile (`hrms_mobile`):**
  - `hrms_mobile/src/services/locationService.ts` — Added `acquireBestMobileGpsPosition()` using `Location.hasServicesEnabledAsync()` + `Location.watchPositionAsync(BestForNavigation)` with early stop and clean subscription disposal.
  - `hrms_mobile/src/app/(tabs)/punch.tsx` — Integrated `acquireBestMobileGpsPosition` with `gpsCancelRef` cancellation, live `±Xm` accuracy badge, and `location_timestamp` / `location_provider: "expo_location"` submission.

---

## 2. Database Migration (`030_attendance_gps_telemetry.sql`)

Added six nullable columns to `attendance_attendance` (zero impact on existing rows):
- `punch_in_accuracy DECIMAL(7, 2) NULL`
- `punch_out_accuracy DECIMAL(7, 2) NULL`
- `punch_in_location_ts DATETIME NULL`
- `punch_out_location_ts DATETIME NULL`
- `punch_in_location_provider VARCHAR(32) NULL`
- `punch_out_location_provider VARCHAR(32) NULL`

Applied cleanly via `npm run db:migrate` on `u356351105_attendance`.

---

## 3. Before vs. After GPS Acquisition Behavior

| Aspect | Before | After |
|---|---|---|
| **Web Capture** | Single `getCurrentPosition()` on camera open; cached up to 5 min (`MAX_LOCATION_AGE_MS`); silent fallback to stale coords if refresh failed. | `watchPosition` convergence (`acquireBestGpsPosition`, up to 7s, early stop `<= 25m`) on camera open AND fresh `watchPosition` convergence (`6s`) on `handleSubmit`; no stale fallback. |
| **Mobile Capture** | Single `getCurrentPositionAsync(Balanced)` on open; single `getCurrentPositionAsync(High)` on submit accepting first reading `<= 100m`. | `hasServicesEnabledAsync()` check + `watchPositionAsync(BestForNavigation)` collecting fresh samples up to 7s, selecting lowest `accuracy`, stopping early at `<= 25m`, with `cancelToken` cleanup. |
| **Backend Telemetry** | Validated `accuracy <= 100m` and discarded `accuracy`, timestamp, and provider. | Validates finite coordinates, `accuracy <= 100m`, and `location_timestamp` freshness (`<= 120s`); classifies tier (`good <= 25m`, `moderate 25–50m`, `low 50–100m`); persists all 6 telemetry fields without altering original `DOUBLE` lat/lng or geofence math. |

---

## 4. Google Maps & Coordinate Integrity

- Original `punch_in_lat`, `punch_in_lng`, `punch_out_lat`, and `punch_out_lng` are stored at full `DOUBLE` precision without snapping, rounding, or geocoding replacement.
- `LocationDisplay` continues to open `https://www.google.com/maps?q=LATITUDE,LONGITUDE` using the exact stored coordinates.
- No paid Google Geocoding API was introduced.

---

## 5. Verification & Test Results

- **Backend Syntax Check (`npm run check`):** Passed.
- **E2E Suite (`gps_accuracy_telemetry.test.js`, `location_reverse_geocode.test.js`, `manager_team_attendance.test.js`):** **10/10 passed** across 3 suites (poor accuracy `145m` rejected `400`, stale `5m` timestamp rejected `400`, concurrent punch-in serialization, `16.4m` punch-in & `68.5m` indoor punch-out telemetry persistence with exact coordinates preserved, Web/Mobile convergence hooks).
- **React Web Build (`npm run build` in `hrms_saas`):** Passed (`vite build` in `2.52s`, 1,864 modules).
- **Mobile TypeScript & Expo Lint:** Verified via `npx tsc --noEmit` and `npx expo lint`.

---

## 6. Performance Impact & Rollback Instructions

- **Performance Impact:** Nominal punch latency increases only up to `1–7s` while `watchPosition` / `watchPositionAsync` converges (stopping immediately as soon as `accuracy <= 25m`). Database write overhead is zero additional queries (6 nullable columns in the existing `INSERT`/`UPDATE`).
- **Rollback Instructions:**
  1. Revert code changes in `Attendance.jsx`, `hrms_saas/src/services/locationService.js`, `punch.tsx`, `hrms_mobile/src/services/locationService.ts`, `attendance.controller.js`, `attendance.service.js`, and `env.js`.
  2. The 6 nullable columns on `attendance_attendance` are backward-compatible and do not need to be dropped for older code to run; if full schema rollback is desired, run:
     `ALTER TABLE attendance_attendance DROP COLUMN punch_in_accuracy, DROP COLUMN punch_out_accuracy, DROP COLUMN punch_in_location_ts, DROP COLUMN punch_out_location_ts, DROP COLUMN punch_in_location_provider, DROP COLUMN punch_out_location_provider;`
