# HRMS – Final Locality and City Normalization Report

**Date:** 2026-11-27  
**Scope:** `node_backend`, `hrms_saas` (React Web), `hrms_mobile` (Expo React Native)

---

## 1. Geographic & Administrative Hierarchy Evidence

Live OpenStreetMap Nominatim responses across four distinct West Bengal locations established why a naive `municipality -> city` replacement would break rural and distinct municipal areas, while a targeted metropolitan-core rule cleanly solves the Rajarhat/Kolkata case without hardcoding any location names:

1. **Renu Bhaban (`22.637224, 88.465514`):**
   - `sub_locality`: `null`
   - `county`: `"Rajarhat"` (sub-district / block)
   - `city`: `"Bidhannagar"`
   - `municipality`: `"Greater Kolkata"` (Kolkata Metropolitan Area)
   - `state_district`: `"North 24 Parganas"`, `state`: `"West Bengal"`
2. **Salt Lake (`22.5797, 88.4310`):**
   - `suburb`: `"Sector V"` (`sub_locality`)
   - `city`: `"Bidhannagar"`, `municipality`: `"Greater Kolkata"`, `county`: `"Rajarhat"`
   - Because `sub_locality` (`"Sector V"`) is present, Salt Lake is an urban ward inside Bidhannagar Municipal Corporation—it must **not** display `"Rajarhat"` as its locality and must **retain** `"Bidhannagar"`.
3. **Central Kolkata (`22.5535, 88.3532`):**
   - `suburb`: `"Dharmatala"`, `city`: `"Kolkata"`, `municipality`: `"Greater Kolkata"`
   - Retains `"Dharmatala, Kolkata, West Bengal"`.
4. **Rural West Bengal (`22.9000, 88.6500`):**
   - `suburb`: `"Jhikra"`, `village`: `"Sonakur"`, `city`: `"Nagarukhra II"`, `municipality`: `"Greater Kolkata"`, `state_district`: `"Nadia"`
   - Even rural Nadia falls inside OSM's KMDA `"Greater Kolkata"` polygon, so `village`/`hamlet` records must **never** substitute `"Kolkata"` for their town/city.

---

## 2. Normalization Strategy Implemented (Zero Hardcoded Locations)

In `node_backend/src/services/location.service.js` (`normalizeNominatimAddress`, `normalizeGeoapifyAddress`, `extractMetroCity`) and `node_backend/src/utils/plusCode.js` (`formatPlusCodeLocation`):

1. **Separate Preserved Fields:**
   The API response preserves `locality`, `sub_locality`, `municipality`, `metropolitan_area`, `city`, `display_city`, `district`, `state`, `country`, and `postal_code` as distinct fields.
2. **Generic Metropolitan Prefix Extraction (`extractMetroCity`):**
   Matches `/^Greater\s+(.+)$/i` on `municipality` (e.g., `"Greater Kolkata"` → `"Kolkata"`, `"Greater Mumbai"` → `"Mumbai"`).
3. **Conditional `display_city` Normalization:**
   `display_city` uses `metroCity` **only when** all of the following hold:
   - `!sub_locality` (not a finer urban ward/suburb like Salt Lake `"Sector V"`),
   - `!isRural` (`!addr.village && !addr.hamlet`),
   - `metroCity` is present (`municipality` starts with `"Greater "`), and
   - `locality` came from `county` (`locality === county`).
   Otherwise, `display_city` preserves `city` unchanged.
4. **Resulting Outputs:**
   - **Renu Bhaban (`22.637224, 88.465514`):** `JFP8+V6J Rajarhat, Kolkata, West Bengal` (with `city: "Bidhannagar"`, `municipality: "Greater Kolkata"`, `metropolitan_area: "Greater Kolkata"`, `display_city: "Kolkata"`).
   - **Salt Lake (`22.5797, 88.4310`):** `... Sector V, Bidhannagar, West Bengal` (does not display Rajarhat; retains Bidhannagar).
   - **Central Kolkata (`22.5535, 88.3532`):** `... Dharmatala, Kolkata, West Bengal`.
   - **Rural Nadia (`22.9000, 88.6500`):** `... Jhikra, Nagarukhra II, West Bengal` (retains town; does not substitute Kolkata).

---

## 3. Caching, Web/Mobile Consistency & Safety

- **Cache Versioning:** Redis keys bumped to `geo:v3:` and MySQL `location_cache.provider` tagged as `nominatim_v3` / `geoapify_v3`. Pre-v3 DB rows refresh automatically on next lookup; `rowToLocationPayload` restores `display_city` from cached `short_name` for `_v3` hits.
- **Web & Mobile Consistency:** Both `hrms_saas/src/services/locationService.js` and `hrms_mobile/src/services/locationService.ts` consume `location.display_label` directly from the backend.
- **Unchanged Systems:** Attendance GPS coordinates (`punch_in_lat`, `punch_in_lng`, `punch_out_lat`, `punch_out_lng`) and geofence Haversine calculations remain completely untouched.

---

## 4. Verification Results

- **Backend Syntax Check (`npm run check`):** Passed.
- **E2E & Regression Suite (`node --test tests/e2e/location_reverse_geocode.test.js`):** **5/5 passed**, including exact assertion `assert.equal(rajarhatDisplay, "JFP8+V6J Rajarhat, Kolkata, West Bengal")`, Salt Lake exclusion of `"Rajarhat"` + retention of `"Bidhannagar"`, Central Kolkata retention of `"Kolkata"`, and Rural Nadia retention of `"Jhikra, Nagarukhra II, West Bengal"`.
- **Web Production Build (`npm run build` in `hrms_saas`):** Passed (`vite build` in `2.35s`, 1,864 modules).
- **Mobile TypeScript Check (`npx tsc --noEmit` in `hrms_mobile`):** Passed (0 errors).
