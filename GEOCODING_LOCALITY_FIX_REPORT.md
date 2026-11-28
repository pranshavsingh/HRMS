# HRMS – Reverse Geocoding Locality Normalization & Cache Fix Report

**Date:** 2026-11-27  
**Scope:** Backend (`node_backend`), React Web (`hrms_saas`), Expo Mobile (`hrms_mobile`), MySQL `location_cache`

---

## 1. Root Cause

In Indian OpenStreetMap (Nominatim) records, sub-districts / community development blocks such as **`Rajarhat`** are returned in `address.county`, while the administrative district (`North 24 Parganas`) is in `address.state_district`, and the municipal city (`Bidhannagar`) is in `address.city`.

Previously, `parseNominatimResult` in `node_backend/src/services/location.service.js`:
1. Looked only at `city_district || town || village || hamlet` for `locality` (ignoring `addr.county`).
2. Mapped `addr.state_district || addr.county` into `district`, so `North 24 Parganas` masked `Rajarhat`.
3. Left `locality: null` and `sub_locality: null`, causing `formatPlusCodeLocation()` in `node_backend/src/utils/plusCode.js` to fall back to `district` (`North 24 Parganas`) instead of `Rajarhat`.

---

## 2. Provider Response Comparison

### Live OpenStreetMap Nominatim Response (`22.637224, 88.465514`)
```json
{
  "display_name": "Bidhannagar, Greater Kolkata, Rajarhat, North 24 Parganas, West Bengal, 700136, India",
  "address": {
    "city": "Bidhannagar",
    "municipality": "Greater Kolkata",
    "county": "Rajarhat",
    "state_district": "North 24 Parganas",
    "state": "West Bengal",
    "postcode": "700136",
    "country": "India"
  }
}
```
- **Additional Verified Nominatim Points:**
  - **Salt Lake (`22.5797, 88.4310`):** `suburb: "Sector V"`, `city: "Bidhannagar"`, `county: "Rajarhat"`, `state_district: "North 24 Parganas"`, `state: "West Bengal"`
  - **Kolkata (`22.5535, 88.3532`):** `suburb: "Dharmatala"`, `city: "Kolkata"`, `state_district: "Kolkata"`, `state: "West Bengal"`
  - **Rural (`22.9000, 88.6500`):** `suburb: "Jhikra"`, `village: "Sonakur"`, `city: "Nagarukhra II"`, `county: "Haringhata"`, `state_district: "Nadia"`, `state: "West Bengal"`

### Geoapify Evaluation
- `GEOAPIFY_API_KEY` is **not** configured in `node_backend/.env`, so Geoapify could not be live-tested without a key (and no results were fabricated).
- Backend support for Geoapify (`fetchFromGeoapify` + `normalizeGeoapifyAddress`) was added in `node_backend/src/services/location.service.js` behind server-side `config.geoapifyApiKey`, with Nominatim (`nominatim_v2`) as the active zero-key free provider.
- Google Geocoding API was **removed** from `node_backend/src/config/env.js` and `node_backend/src/services/location.service.js`.

---

## 3. Address Normalization Changes

- **`node_backend/src/services/location.service.js` (`normalizeNominatimAddress`, `normalizeGeoapifyAddress`):**
  - `sub_locality`: `suburb || neighbourhood || quarter || residential || road`
  - `locality`: `city_district || town || village || hamlet || county || sub_locality` (captures `"Rajarhat"` from `county`)
  - `city`: `city || town || village || municipality`
  - `district`: `state_district || county` (used only if both `sub_locality` and `locality` are absent)
  - `formatPlusCodeLocation` (`node_backend/src/utils/plusCode.js`) formats `[SHORT PLUS CODE] [LOCALITY], [CITY], [STATE]`, deduplicating identical locality/city/state names case-insensitively.
- **Note on `"Bidhannagar"` vs `"Kolkata"`:** Nominatim's `address.city` for `22.637224, 88.465514` is `"Bidhannagar"` (with `"Greater Kolkata"` in `municipality`). Per the restriction against hardcoding locality/city names, the normalizer uses the actual provider field `"Bidhannagar"`, producing `JFP8+V6J Rajarhat, Bidhannagar, West Bengal` (eliminating `"North 24 Parganas"`).

---

## 4. Cache Migration & Invalidation Strategy

- **Redis:** Key prefix upgraded from `geo:v1:` to `geo:v2:` so stale v1 entries are automatically bypassed.
- **MySQL (`location_cache`):** Normalized rows are stored with `provider = 'nominatim_v2'` (or `'geoapify_v2'`). In `reverseGeocode()`, any cached DB row whose `provider` does not end with `_v2` is treated as stale and refreshed once on next lookup—requiring zero schema changes and leaving all historical attendance GPS coordinates untouched.

---

## 5. Web & Mobile Validation

- Updated `formatLocationOneLine` in `hrms_saas/src/services/locationService.js` and `hrms_mobile/src/services/locationService.ts` to prefer `location.display_label` directly from the backend so Web and Mobile always render identical normalized text.
- **Web Build (`hrms_saas`):** `npm run build` (`vite build`) passed in `2.81s` (1,864 modules).
- **Mobile TypeScript (`hrms_mobile`):** `npx tsc --noEmit` passed with 0 errors.

---

## 6. Regression Test Results

- **Backend Syntax Check (`npm run check`):** Passed.
- **E2E & Normalization Regression (`node --test tests/e2e/location_reverse_geocode.test.js`):** **5/5 passed**, covering:
  1. Unauthenticated (`401`) and invalid coordinate (`400`) rejection.
  2. Live reverse geocoding of `22.6372, 88.4655`, `location_cache` persistence, and jittered cache hit (`22.63721, 88.46552`).
  3. Batch reverse geocoding (`/api/location/reverse-geocode/batch`).
  4. Web & Mobile `LocationDisplay` single-line Plus Code integration.
  5. All 7 locality normalization scenarios: Rajarhat (verifying `locality === "Rajarhat"` and absence of `"North 24 Parganas"`), Bidhannagar (`Sector V`), Kolkata (`Dharmatala`), Rural (`Jhikra, Nagarukhra II`), missing locality, missing district, and duplicate city/suburb deduplication.
