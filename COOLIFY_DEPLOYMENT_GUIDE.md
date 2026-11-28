# Coolify Deployment Guide (`hrms-stack`)

## 1. Preserved Production Stack
- **Project:** `HRMS` → **Environment:** `production` → **Service:** `hrms-stack` (`uuid: ehsnii5o1kasm2kjbbhmjrqz`)
- **Preserved External Volumes:** `hrms_mysql_data`, `hrms_redis_data`, `hrms_uploads_data` (`external: true` — **never** run `docker compose down -v` or `docker volume prune`).
- **Preserved Domains & Routing:** `https://sseone.io`, `https://www.sseone.io`, `https://api.sseone.io` (Traefik labels unchanged).
- **Preserved Coolify Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `JWT_SECRET`, `OTP_SECRET`, `OUTBOX_ENCRYPTION_KEY`, `MYSQL_PASSWORD`.

## 2. One-Time Coolify Update (After First GHCR Push)
1. Authenticate Docker on the Hostinger KVM server to GHCR (`read:packages` PAT):
   ```bash
   echo "<READ_PACKAGES_PAT>" | docker login ghcr.io -u pranshavsingh --password-stdin
   ```
2. In Coolify UI → `HRMS` → `production` → `hrms-stack`, update the Compose configuration (or image fields) to match [docker-compose.prod.yml](file:///f:/hrms/docker-compose.prod.yml):
   - `backend`: `ghcr.io/pranshavsingh/hrms-backend:${HRMS_IMAGE_TAG:-latest}`
   - `worker`: `ghcr.io/pranshavsingh/hrms-worker:${HRMS_IMAGE_TAG:-latest}`
   - `frontend`: `ghcr.io/pranshavsingh/hrms-frontend:${HRMS_IMAGE_TAG:-latest}`
3. Ensure `HRMS_IMAGE_TAG` is unset (defaults to `latest`) or set to `latest`.
4. Copy the Coolify **Deploy Webhook URL** for `hrms-stack` into GitHub Secret `COOLIFY_WEBHOOK` (and `COOLIFY_TOKEN` if using Coolify API auth).
5. Click **Pull latest and restart** in Coolify for the first cutover, or trigger `production-cicd.yml` from GitHub.

## 3. Post-Deployment Smoke Checklist
1. `curl -s https://api.sseone.io/health` returns `{"status":"alive",...}`.
2. Web loads at `https://sseone.io/` and `/sw.js` returns `Cache-Control: no-cache, no-store, must-revalidate`.
3. Attendance timestamps render in `Asia/Kolkata` (`15:14` IST instead of `09:44` UTC).
4. Push notifications (`Web Push` + `Mobile Expo Push`) and Socket.IO realtime updates function normally.
