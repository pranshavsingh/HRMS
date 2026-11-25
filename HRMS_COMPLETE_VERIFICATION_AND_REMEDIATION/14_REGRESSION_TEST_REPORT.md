# 14. Regression Test Report

| Suite / Command | Scope | Result | Details |
|---|---|---|---|
| `node --test --test-force-exit tests/bugs/remediation_regression.test.js` | `BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, Stage C Security/Tenant Isolation, Phase 6/7 Validation, Migration `025` | **PASS (17/17)** | 0 failures, 0 skipped, 1324ms |
| `cd node_backend && npm run check` | Backend syntax (`server.js` & `worker.js`) | **PASS** | Exit code 0 |
| `cd hrms_saas && npm run lint` | Web ESLint | **PASS** | **0 errors, 0 warnings** (was 6 errors) |
| `cd hrms_saas && npm run build` | Web Vite production build | **PASS** | Built in 1.84s (`dist/` generated) |
| `cd hrms_mobile && npx tsc --noEmit` | Mobile TypeScript check | **PASS** | **0 errors** |
| `cd hrms_mobile && npx expo lint` | Mobile Expo ESLint | **PARTIAL / FAIL** | Reduced from 75 (22 errors) to 69 (20 `react-hooks/set-state-in-effect` errors in pre-existing screen `useEffect` fetchers) |
| `node --test --test-force-exit node_backend/tests/bugs/master_audit_remediation.test.js` | Prior remediation suite | **PARTIAL (25/28 PASS)** | 25 static/unit checks passed; 3 DB tests failed (`ECONNREFUSED 127.0.0.1:3306` — local MySQL not running) |
