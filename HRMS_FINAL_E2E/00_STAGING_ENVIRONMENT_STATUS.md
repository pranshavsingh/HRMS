# 00. Staging Environment Status

**Verification Branch:** `qa/final-live-e2e-verification`  
**Base Commit Hash:** `4b0a0c1708eb188f85b2472a6c4c23a95645cc87`  
**Audit Date:** 2026-11-25  

## Environment Component Readiness

| Component | Status | Evidence & Exact Details |
|---|---|---|
| **Isolated Staging MySQL** | **BLOCKED** | Local `127.0.0.1:3306` returned `ECONNREFUSED` (`Test-NetConnection` = `False`). No `mysql`, `mysqld`, `mariadb`, or `docker` service/binary is installed on this host. `node_backend/.env` points to remote `srv999.hstgr.io` (`u356351105_attendance`), which is treated as production/live and strictly off-limits for write tests, test migrations, or test account creation. |
| **Staging Redis & BullMQ** | **BLOCKED** | Local `127.0.0.1:6379` returned `ECONNREFUSED` (`Test-NetConnection` = `False`). No Redis binary or service is installed on this host. `node_backend` falls back to in-memory mode; BullMQ worker & Redis Pub/Sub live tests cannot run. |
| **Backend (`node_backend`)** | **PARTIAL (Syntax & Offline Unit/Mocked Suites READY; Live Staging Server BLOCKED)** | `npm run check` (`server.js` & `worker.js`) exited `0`. Offline/mocked unit & Socket.IO tests pass, but live Express server with isolated DB/Redis is blocked. |
| **Web (`hrms_saas`)** | **READY (Unauthenticated Live Browser) / BLOCKED (Authenticated Live Flows)** | `npm run lint` passed (0 errors), `npm run build` passed (`2.86s`), `vite preview` served on `http://127.0.0.1:5173/`, and headless Chrome `158.0.8127.38` (`--remote-debugging-port=9222`) verified unauthenticated routes, responsive viewports, 404, and auth redirects with 0 console errors. Authenticated flows are blocked without staging DB accounts. |
| **Mobile (`hrms_mobile`)** | **BLOCKED (Runtime) / PARTIAL (Static)** | `npx tsc --noEmit` passed (0 errors). `npx expo lint` exited `1` (68 problems: 20 pre-existing `react-hooks/set-state-in-effect` errors, 48 warnings). No Android SDK (`$env:LOCALAPPDATA\Android\Sdk` = `False`), no `adb`, no `emulator`, and no attached device. |
| **Staging SMTP & Media** | **BLOCKED** | No sandbox SMTP server is configured (`node_backend/.env` has placeholder `your-email@yourdomain.com`). Live Cloudinary upload/delete tests were not executed without staging DB isolation. |
