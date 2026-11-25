# 14. Final Build and Test Results

*(All backend tests executed with `$env:MYSQL_HOST="127.0.0.1"` to guarantee zero accidental writes or queries against `srv999.hstgr.io`.)*

| Suite / Command | Working Dir | Exit Code | Pass | Fail | Skipped / Blocked | Notes |
|---|---|---|---|---|---|---|
| `npm run check` | `node_backend` | `0` | 2 (`server.js`, `worker.js`) | 0 | 0 | Syntax check PASS |
| `npm run lint` | `hrms_saas` | `0` | 1 | 0 | 0 | 0 ESLint errors, 0 warnings |
| `npm run build` | `hrms_saas` | `0` | 1 | 0 | 0 | Vite build 2.86s |
| `npx tsc --noEmit` | `hrms_mobile` | `0` | 1 | 0 | 0 | 0 TypeScript errors |
| `npx expo lint` | `hrms_mobile` | `1` | 0 | 20 errors (48 warnings) | 0 | Pre-existing `react-hooks/set-state-in-effect` |
| `node --test tests/leave/*.test.js` | `node_backend` | `0` | 8 | 0 | 0 | Includes `BUG-E2E-001` fix |
| `node --test --test-force-exit tests/realtime/*.test.js` | `node_backend` | `0` | 12 | 0 | 0 | Multi-client Socket.IO E2E PASS |
| `node --test --test-force-exit tests/bugs/remediation_regression.test.js` | `node_backend` | `0` | 17 | 0 | 0 | Includes `BUG-E2E-002` `db.get` mock fix |
| `node --test --test-force-exit node_backend/tests/bugs/master_audit_remediation.test.js` | `f:\hrms` | `1` | 25 | 3 | 0 | 3 DB tests fail with `ECONNREFUSED 127.0.0.1:3306` |
| `npm run test:security` | `node_backend` | `1` | 2 suites (`auth` 7/7, `api_security` 11/11) | 3 suites (`jwt`, `otp`, `rbac`) | 0 | Failed tests require MySQL (`127.0.0.1:3306`) |
| `npm run test:phase3` | `node_backend` | `1` | 4 suites (`queue` 2/2+3 skip, `worker_lifecycle`, `realtime_pubsub` 4/4+2 skip, `observability` 7/7) | 5 suites (`outbox`, `otp_outbox`, `failure_injection`, `dead_letter_replay`, `reconciliation`) | 5 Redis skips | Failed tests require MySQL (`127.0.0.1:3306`) |
| Headless Chrome CDP (`127.0.0.1:5173`) | `f:\hrms` | `0` | 14 checks | 0 | Authenticated pages | Login, password toggle, 4 viewports, 404, 8 route guards PASS |
