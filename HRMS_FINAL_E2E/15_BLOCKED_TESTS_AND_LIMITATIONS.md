# 15. Blocked Tests and Limitations

| Blocked Test Area | Exact Blocker | Required to Unblock |
|---|---|---|
| **Isolated Staging MySQL Integration (`WF-01`..`WF-11`, `BUG-A12`/`A13`, `jwt`/`otp`/`rbac`, `outbox`, `concurrency`, `pagination`, `performance`)** | No MySQL/MariaDB server or Docker is installed on this host (`127.0.0.1:3306` `ECONNREFUSED`). `node_backend/.env` points to `srv999.hstgr.io` (`u356351105_attendance`), which is off-limits for write tests and test migrations. | Provision an isolated staging MySQL 8.0 / MariaDB 11.x instance, set staging `.env`, run `npm run db:init:mysql` + `npm run db:migrate`, and seed 2 tenants + 5 role accounts. |
| **Redis, BullMQ Worker & Multi-Instance Socket.IO Pub/Sub** | No Redis server installed or running (`127.0.0.1:6379` `ECONNREFUSED`). | Start Redis 7 in staging and run `node_backend` API + `npm run start:worker`. |
| **Authenticated Web Browser E2E (27 Pages, All Forms, RBAC UI)** | Depends on staging MySQL + seeded test accounts. | Provision staging DB & accounts, then run headless Chrome CDP / Playwright against all 27 pages. |
| **Mobile Real-Device / Emulator Runtime (`hrms_mobile`)** | No Android SDK (`$env:LOCALAPPDATA\Android\Sdk` missing), no `adb`, no emulator, and no attached physical device. | Attach Android emulator/device or iOS simulator with Expo Go pointing to staging API. |
| **Staging SMTP & Live Cloudinary Media** | `node_backend/.env` has placeholder SMTP credentials; live media upload/delete requires authenticated staging DB session. | Configure Mailpit/sandbox SMTP and staging Cloudinary folder/credentials. |
