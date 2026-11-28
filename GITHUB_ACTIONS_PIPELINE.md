# GitHub Actions Production CI/CD Pipeline

**Workflow File:** [.github/workflows/production-cicd.yml](file:///f:/hrms/.github/workflows/production-cicd.yml)

## 1. Triggers & Concurrency
- **Triggers:** `push` to `main`, plus manual `workflow_dispatch` (with `deploy_to_coolify` option).
- **Concurrency:** `group: hrms-production-cicd`, `cancel-in-progress: false` — prevents overlapping production builds/deployments.
- **Permissions:** `contents: read`, `packages: write`.

## 2. Pipeline Stages
1. **`validate` (MySQL 8.0 + Redis 7-alpine):**
   - Backend & Worker: `npm ci`, `npm run check`, `npm run db:init:mysql`, `npm run db:migrate`, `npm run test:security`, `npm run test:phase2`, `npm run test:phase3`.
   - Frontend: `npm ci`, `npm run lint`, `npm run build`.
2. **`build-and-push` (`needs: validate`):**
   - Uses `docker/setup-buildx-action@v3` and `docker/build-push-action@v6` with GitHub Actions cache (`type=gha`).
   - Builds & pushes `hrms-backend`, `hrms-worker`, and `hrms-frontend` to `ghcr.io/pranshavsingh/*` with both `:${{ github.sha }}` and `:latest` tags plus OCI labels.
   - Inspects all three published manifests via `docker buildx imagetools inspect` and uploads `release-digests.json` as a 90-day artifact.
3. **`deploy-coolify` (`needs: build-and-push`, `environment: production`):**
   - Uses GitHub `production` environment (supports manual approval gate).
   - Calls `secrets.COOLIFY_WEBHOOK` (with `secrets.COOLIFY_TOKEN` Bearer header if set).
   - Polls `https://api.sseone.io/health` (for `"alive"`) and `https://sseone.io/` to verify live container readiness rather than trusting the webhook HTTP response alone.

## 3. Required GitHub Repository Secrets & Variables
- **Secrets (`Settings → Secrets and variables → Actions → Secrets`):**
  - `COOLIFY_WEBHOOK` — Coolify webhook URL for `hrms-stack` (`ehsnii5o1kasm2kjbbhmjrqz`).
  - `COOLIFY_TOKEN` *(if required by Coolify API/webhook)* — Coolify API Bearer token.
- **Optional Variables (`Actions → Variables`):**
  - `PRODUCTION_API_HEALTH_URL` (defaults to `https://api.sseone.io/health`)
  - `PRODUCTION_WEB_URL` (defaults to `https://sseone.io/`)
