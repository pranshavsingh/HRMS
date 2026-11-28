# PHASE 2: GitHub Actions & GHCR Audit

## Step 2.1 — Workflow Audit (`.github/workflows/production-cicd.yml`)
1. **Triggers:** `push` to `main` and `workflow_dispatch` (`deploy_to_coolify` input).
2. **Concurrency:** `group: hrms-production-cicd`, `cancel-in-progress: false` (prevents overlapping deployments).
3. **Permissions:** Minimal — `contents: read`, `packages: write`.
4. **Validation Gate (`validate` job):**
   - Spins up `mysql:8.0` and `redis:7-alpine`.
   - Backend/Worker: `npm ci`, `npm run check`, `npm run db:init:mysql`, `npm run db:migrate`, `npm run test:security`, `npm run test:phase2`, `npm run test:phase3`.
   - Frontend: `npm ci`, `npm run lint`, `npm run build`.
5. **Build & Push (`build-and-push`, `needs: validate`):**
   - Uses `docker/setup-buildx-action@v3`, `docker/login-action@v3` (with `GITHUB_TOKEN`), `docker/build-push-action@v6` with GHA layer cache.
   - Publishes all three images only after `validate` succeeds.

## Step 2.2 — Image Naming & Tagging
- `ghcr.io/pranshavsingh/hrms-backend:${{ github.sha }}` + `:latest`
- `ghcr.io/pranshavsingh/hrms-worker:${{ github.sha }}` + `:latest`
- `ghcr.io/pranshavsingh/hrms-frontend:${{ github.sha }}` + `:latest`
- Manifest inspection (`docker buildx imagetools inspect`) verifies all three SHA-tagged manifests in GHCR and uploads `release-digests-${{ github.sha }}` (`release-digests.json`) as a 90-day artifact.

## Step 2.3 — Deployment Verification & Limitations
- `deploy-coolify` (`needs: build-and-push`, `environment: production`) triggers `secrets.COOLIFY_WEBHOOK` (with optional `Authorization: Bearer $COOLIFY_TOKEN`), then polls `https://api.sseone.io/health` (for `"alive"`) and `https://sseone.io/`.
- **Limitation Documented:** Coolify's webhook response only confirms the deployment request was queued (`200/202`), not that container rollout finished. External polling verifies live service availability (`api.sseone.io/health` and `sseone.io/`) rather than internal Coolify deployment-job state.

**Phase 2 Status:** **PASS (workflow verified locally; live GitHub Actions execution pending push to `main` and secrets setup).**
