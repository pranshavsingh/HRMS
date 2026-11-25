# 00. Baseline Report

**Date:** 2026-11-25  
**Git Branch:** `fix/hrms-5-cross-platform-bugs`  
**Base Commit:** `4b0a0c1708eb188f85b2472a6c4c23a95645cc87`  
**Environment:** Windows, Node.js `v24.3.0`, npm `11.4.2`

## Database & Infrastructure Target
- **Backend `.env`:** `DB_CLIENT=mysql`, `MYSQL_HOST=srv999.hstgr.io`, `MYSQL_DATABASE=u356351105_attendance` (remote live database — **no destructive or write integration tests will be run against it**).
- **Redis:** Offline (`in-memory fallback` reported on `:8000/health/ready`).
- **Local SQLite:** `node_backend/src/db/index.js` uses `mysql2/promise` exclusively; no SQLite adapter exists.

## Baseline Checks
| Application | Command | Result | Notes |
|---|---|---|---|
| `node_backend` | `npm run check` | **PASS** (exit 0) | Syntax valid for `src/server.js` & `src/worker.js` |
| `hrms_saas` | `npm run build` | **PASS** (exit 0) | Built in 7.82s (`dist/assets/index-BBVtU2KL.js` 2,196.03 kB) |
| `hrms_saas` | `npm run lint` | **FAIL** (exit 1) | 6 ESLint errors (`RealtimeContext.jsx`, `MonthlyRegister.jsx`, `EmployeeDashboard.jsx`, `Leave.jsx`, `TeamAttendance.jsx`) |
| `hrms_mobile` | `npx tsc --noEmit` | **PASS** (exit 0) | 0 TypeScript errors |
| `hrms_mobile` | `npx expo lint` | **FAIL** (exit 1) | 75 problems (22 errors, 53 warnings) |
