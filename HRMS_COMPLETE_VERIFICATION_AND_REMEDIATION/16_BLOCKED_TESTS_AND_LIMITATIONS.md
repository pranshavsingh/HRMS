# 16. Blocked Tests and Limitations

| Blocked Test Area | Exact Blocker | Required to Unblock |
|---|---|---|
| **Live Multi-Tenant & E2E Database Integration** | `.env` points to remote `srv999.hstgr.io` (`u356351105_attendance`); local MySQL (`127.0.0.1:3306`) is not running (`ECONNREFUSED`). Writing test records or running Migration `025` against `srv999.hstgr.io` is prohibited. | Provision an isolated staging MySQL 8.0 database, run `npm run db:init:mysql` + `npm run db:migrate`, and seed 2 test tenants + 5 role accounts. |
| **Live Web Browser E2E (`hrms_saas`)** | Chrome DevTools MCP failed (`DevToolsActivePort` ENOENT). | Launch Chrome with `--remote-debugging-port` against the staging environment. |
| **Live Mobile Device/Emulator E2E (`hrms_mobile`)** | No Android emulator / iOS simulator attached. | Connect Android/iOS emulator or device with Expo Go. |
| **Live Redis / BullMQ / Multi-Worker Socket.IO / SMTP** | Redis is `offline (in-memory fallback)` on `:8000`. | Start Redis 7 + `node_backend` worker + sandbox SMTP. |
