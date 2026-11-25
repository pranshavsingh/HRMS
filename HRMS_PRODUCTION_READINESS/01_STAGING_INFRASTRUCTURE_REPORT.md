# 01. Staging Infrastructure Report

**Branch:** `release/final-production-readiness`  
**Base Commit:** `4b0a0c1708eb188f85b2472a6c4c23a95645cc87`  
**Audit Date:** 2026-11-25  

## Environment Isolation Confirmation
- **Staging Database:** `mysql://hrms_staging_user@127.0.0.1:3306/hrms_staging` (MySQL Community Server `8.0.46`, `utf8mb4` / `utf8mb4_unicode_ci`, session `time_zone = '+00:00'`).
- **Production Database Safety:** `srv999.hstgr.io` (`u356351105_attendance`) was **never** accessed, migrated, or written to. All staging runs used `DOTENV_CONFIG_PATH` pointing to an isolated `.env.staging` outside the repository.
- **Root Cause of Prior `ECONNREFUSED 127.0.0.1:3306`:** No local MySQL or Redis binary/service was installed on the Windows host. Portable MySQL `8.0.46` and Redis `8.10.3` were deployed in user space under `C:\Users\Administrator\staging_infra\`.

## Component Status

| Component | Endpoint / Version | Status | Verification Evidence |
|---|---|---|---|
| **MySQL 8.0** | `127.0.0.1:3306` (`hrms_staging`, v8.0.46) | **PASS** | Schema initialized via `scripts/init-mysql.js`; all 25 SQL migrations (`001`–`025`) applied and verified with advisory lock `hrms_db_migration_lock` (exit code `0`). 45 tables created with InnoDB FK integrity. |
| **Redis** | `127.0.0.1:6379` (v8.10.3, AOF enabled) | **PASS** | `PING` -> `PONG`; AOF persistence active; Pub/Sub multi-instance distribution verified (`realtime_pubsub.test.js` 6/6 PASS). |
| **BullMQ Worker** | `node_backend/src/worker.js` (`IS_WORKER=true`) | **PASS** | Live worker processed `email-notifications`, `maintenance`, and `dead-letter` queues (`queue.test.js` 5/5 PASS; live OTP email delivered). |
| **Staging SMTP** | `127.0.0.1:1025` (Local SMTP Capture) | **PASS** | `nodemailer` delivered real OTP emails from outbox -> BullMQ -> SMTP capture (`captured_emails.jsonl`) with zero external employee emails sent. |
| **Backend API** | `http://127.0.0.1:8000` (`node_backend/src/server.js`) | **PASS** | `/health` -> `200 {"status":"alive"}`; `/metrics` -> `200` Prometheus telemetry; Socket.IO initialized with Redis adapter. |
| **Web Frontend** | `http://127.0.0.1:5173` (`hrms_saas` Vite) | **PASS** | `VITE_API_BASE_URL=http://127.0.0.1:8000/api`; authenticated login, 20/20 protected routes, and 0 console/JS/5xx errors verified in Headless Edge CDP (`158.0.4370.33`). |
| **Mobile App** | `hrms_mobile` (Expo SDK 58) | **BLOCKED (Runtime) / PASS (TS)** | `npx tsc --noEmit` exited `0`; `npx expo lint` exited `1` (20 pre-existing `react-hooks/set-state-in-effect` errors, 48 warnings). No Android SDK, `adb`, emulator, or iOS simulator on host. |
| **Media (Cloudinary)** | External Cloudinary API | **BLOCKED (External Keys)** | Staging `.env.staging` intentionally omits production Cloudinary keys; `StorageService.store()` fails closed (`500 Cloudinary storage service is not configured.`). Static `/media/documents/*` verified blocked (`403`). |
