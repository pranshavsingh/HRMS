# 11. Performance & Stability Results

## Offline / Unit / Browser Stability Checks
- **Web Production Bundle (`vite build`):** Built cleanly in `2.86s` (`dist/assets/index-BXyVzf7v.js` 2,197.21 kB / 542.29 kB gzipped; chunk size >500 kB warning noted).
- **Web Unauthenticated Browser Stability (Headless Chrome CDP):** Navigated across 10+ routes and 4 viewports with `0` uncaught JS exceptions and `0` console errors.
- **Socket.IO Multi-Client Suite:** 12 multi-client scenarios completed in `1296.9ms` with clean teardown.

## Load, Concurrency & DB Query Performance (`tests/performance/load_simulation.test.js`, `tests/concurrency/attendance_concurrency.test.js`, `tests/pagination/pagination.test.js`)
- **Pagination Unit Checks:** `pagination.test.js` parameter bounds/clamping & envelope formatting **5/5 PASS**.
- **DB-Backed Load & Concurrency Tests:** **BLOCKED / FAIL (`ECONNREFUSED 127.0.0.1:3306`)** — 3 pagination integration tests, 5 attendance concurrency tests, and 4 load simulation tests require an isolated staging MySQL database.
