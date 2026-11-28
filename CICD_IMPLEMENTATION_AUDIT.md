# HRMS CI/CD Implementation Audit (Stage A — Read-Only)

**Repository:** `pranshavsingh/HRMS`  
**Branch / Commit Audited:** `main` @ `0d5749c`  
**Production Coolify Stack:** Project `HRMS` → Environment `production` → Service `hrms-stack` (`uuid: ehsnii5o1kasm2kjbbhmjrqz`)

---

## 1. Current Architecture & Build Contexts
| Service | Compose Name | Build Context | Dockerfile | Startup Command | Current Image |
|---|---|---|---|---|---|
| Backend API | `backend` | `./node_backend` | `node_backend/Dockerfile` | `npm start` (via `docker-entrypoint.sh`) | `hrms-production-backend:latest` |
| Worker | `worker` | `./node_backend` | `node_backend/Dockerfile` | `npm run start:worker` (via `docker-entrypoint.sh`) | `hrms-production-worker:latest` |
| Frontend Web | `frontend` | `./hrms_saas` | `hrms_saas/Dockerfile` | `nginx -g "daemon off;"` | `hrms-production-frontend:latest` |
| MySQL | `mysql` | — | — | `mysql:8.0` | `mysql:8.0` |
| Redis | `redis` | — | — | `redis:7-alpine` | `redis:7-alpine` |
| phpMyAdmin | `phpmyadmin` | — | — | — | `phpmyadmin/phpmyadmin:latest` |

---

## 2. Existing Build & Validation Commands (Verified in `package.json`)
- **Backend (`node_backend/package.json`):**
  - Syntax check: `npm run check` (`node --check src/server.js && node --check src/worker.js`)
  - Unit/Security/Phase suites: `npm run test:security`, `npm run test:phase2`, `npm run test:phase3`, `npm run test:e2e`
  - Migrations: `npm run db:init:mysql`, `npm run db:migrate`
- **Frontend (`hrms_saas/package.json`):**
  - Lint: `npm run lint` (`eslint .`)
  - Production bundle: `npm run build` (`vite build`)

---

## 3. Dockerfile & Entrypoint Audit Findings
1. **Backend (`node_backend/Dockerfile`):**
   - Uses `node:22-alpine`, installs production dependencies only (`npm install --omit=dev`), runs as non-root `USER node`, exposes `8000`, healthchecks `http://127.0.0.1:8000/health`.
   - `.dockerignore` excludes `.env`, `.env.local`, `.env.*.local`, `node_modules`, `tests`, `.git`, and `src/uploads/*`.
2. **Worker (`docker-compose.prod.yml`):**
   - Shares `./node_backend/Dockerfile` with `command: ["npm", "run", "start:worker"]`, `IS_WORKER: "true"`, `RUN_MIGRATIONS: "false"`.
   - `docker-entrypoint.sh` only runs `npm run db:migrate` when `RUN_MIGRATIONS = "true"` or `IS_WORKER != "true"`, so `worker` does **not** run migrations or start an HTTP API server.
3. **Frontend (`hrms_saas/Dockerfile` & `nginx.conf`):**
   - Multi-stage build (`node:22-alpine` → `nginx:1.27-alpine`) with `VITE_API_BASE_URL=/api`.
   - `nginx.conf` proxies `/api/` and `/socket.io/` to `http://backend:8000` and serves SPA fallback `/index.html`.
   - **Gap Found:** `location ~* \.(?:ico|css|js|...)$` applies `Cache-Control: public, max-age=31536000, immutable` to all `.js` files, which caches `/sw.js` (Web Push Service Worker) for 1 year. An explicit `location = /sw.js` `no-cache` rule is recommended.

---

## 4. Registry, Permissions & Coolify Requirements
- **Target Private GHCR Images:**
  - `ghcr.io/pranshavsingh/hrms-backend`
  - `ghcr.io/pranshavsingh/hrms-worker`
  - `ghcr.io/pranshavsingh/hrms-frontend`
- **GitHub Actions Permissions:** `contents: read`, `packages: write` (via `GITHUB_TOKEN`).
- **Coolify Registry Auth:** Dedicated GitHub PAT (`read:packages` only) configured on the Hostinger KVM server / Coolify Docker daemon (`docker login ghcr.io`).
- **GitHub Secrets Needed for Automated Coolify Trigger:**
  - `COOLIFY_WEBHOOK` (Coolify deploy webhook URL for `hrms-stack`)
  - `COOLIFY_TOKEN` (Coolify API Bearer token, if webhook/status verification requires authentication)
  - Optional: `PRODUCTION_API_HEALTH_URL` (e.g. `https://api.sseone.io/health`) and `PRODUCTION_WEB_URL` for post-deploy smoke checks.

---

## 5. Deployment Risks & Preserved Invariants
- **External Persistent Volumes (`docker-compose.prod.yml`):** `hrms_mysql_data`, `hrms_redis_data`, `hrms_uploads_data` (`external: true`) **must remain untouched**.
- **Coolify Env Vars:** `VAPID_*`, `JWT_SECRET`, `OTP_SECRET`, `OUTBOX_ENCRYPTION_KEY`, `MYSQL_PASSWORD` live in Coolify `hrms-stack` and are preserved across image pulls/restarts.
- **Missing Automated Info:** Live Coolify container logs and webhook URL cannot be read via the current read-only/limited MCP token (`read:sensitive` missing), so the Coolify webhook/token must be added to GitHub Secrets by the repository owner.
