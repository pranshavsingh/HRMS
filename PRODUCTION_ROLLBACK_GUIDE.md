# Production Rollback & Recovery Guide

## 1. Application Rollback Using Immutable SHA Tags
Every `main` CI/CD run publishes immutable full-SHA tags to GHCR and saves `release-digests.json` as a workflow artifact.

1. **Identify the previous known-good commit SHA** from GitHub Actions (`release-digests-<SHA>` artifact or `git log main`).
2. **Pin all three services to that exact SHA** in Coolify `hrms-stack` Environment Variables:
   ```env
   HRMS_IMAGE_TAG=<PREVIOUS_KNOWN_GOOD_FULL_SHA>
   ```
   *(Because `docker-compose.prod.yml` uses `ghcr.io/pranshavsingh/hrms-<svc>:${HRMS_IMAGE_TAG:-latest}`, setting `HRMS_IMAGE_TAG` rolls `backend`, `worker`, and `frontend` atomically to that exact build.)*
3. In Coolify, click **Pull latest and restart** on `hrms-stack`.
4. **Verify health:**
   - `curl -s https://api.sseone.io/health` → `{"status":"alive",...}`
   - Verify login, attendance, and worker logs.
5. Once a forward fix is merged to `main`, remove `HRMS_IMAGE_TAG` (or set it back to `latest`).

## 2. Database Migration Caveats During Rollback
- Rolling back Docker images does **not** automatically revert applied SQL migrations in `schema_migrations`.
- All current migrations (`001`–`033`) are additive (`ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`), so rolling back application code to a recent prior release remains backward-compatible.
- If a future migration introduces an incompatible schema change, ship a **forward-fix migration** rather than manually deleting rows from `schema_migrations`.
