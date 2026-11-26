# NOTIFICATION_PRODUCTION_DEPLOYMENT.md

## 1. Database Migration
Run the safe SQL migration on MySQL 8.0+ / MariaDB:
```bash
node --env-file=node_backend/.env node_backend/scripts/run-migrations.js
```
This applies `026_notifications_and_push_tokens.sql` without dropping or modifying existing tables.

## 2. Environment Variables
- **Backend (`node_backend/.env`)**: No new mandatory secrets required for REST + Socket.IO + Expo Push API. Optional Redis (`REDIS_URL`) enables multi-worker Socket.IO pub/sub scaling.
- **Mobile (`hrms_mobile/.env` & `app.json`)**:
  - `EXPO_PUBLIC_API_URL=https://<your-api-domain>/api`
  - For remote FCM push notifications on Android, configure EAS (`extra.eas.projectId` in `app.json`) and add your Firebase `google-services.json` under `android.googleServicesFile`, then build an Expo Development / Production build (`eas build --platform android`).

## 3. Rollout Checklist
1. Apply migration `026`.
2. Restart `node_backend` API & worker processes.
3. Build & deploy `hrms_saas` (`npm --prefix hrms_saas run build`).
4. Build `hrms_mobile` EAS build for Android/iOS push testing.
