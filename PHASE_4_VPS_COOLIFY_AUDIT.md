# PHASE 4: Read-Only Coolify & VPS Audit

## Step 4.1 — Coolify Inspection (Observed via Coolify MCP)
- **Server:** `localhost` (`uuid: g00jnoa1arsrzmrugox3qwq6`, `ip: host.docker.internal`, `is_reachable: true`)
- **Service Stack:** `hrms-stack` (`uuid: ehsnii5o1kasm2kjbbhmjrqz`, `status: running:healthy`)
- **Sub-Applications & Databases:**
  - `backend` (`ii9yw9hlcuwtnk9gsiqhmzbq`, port `8000`, `running:healthy`, currently `hrms-production-backend:latest`)
  - `worker` (`2jphxei0juq58dkn0fvnqa8k`, `running:healthy`, currently `hrms-production-worker:latest`)
  - `frontend` (`pozaczg7jnqqqpx2kzhglmxj`, port `80`, `running:healthy`, currently `hrms-production-frontend:latest`)
  - `phpmyadmin` (`xxmvrxfpsvgsguym7ylj8wtm`, port `8085:80`, `running:healthy`)
  - `mysql` (`pdi8kffcy4av924hhksgdd7n`, `mysql:8.0`, `running:healthy`)
  - `redis` (`ytyecjhlsc7ucwtmter8pax7`, `redis:7-alpine`, `running:healthy`)

## Step 4.2 — Docker Resources, Volumes & Access Limitation
- **Preserved External Volumes (from `docker-compose.prod.yml`):** `hrms_mysql_data`, `hrms_redis_data`, `hrms_uploads_data` (`external: true`).
- **MCP Scope Limitation:** Calling Coolify `logs` returned `Error: Missing required permissions: read:sensitive`. Direct SSH/Docker CLI inspection on the Hostinger KVM (`docker ps`, `docker volume ls`, `docker network ls`) is **NOT TESTED** from this workstation and must be verified on the VPS.

## Step 4.3 — VPS GHCR Pull Verification
- **Status:** **BLOCKED** — awaiting user's `docker login ghcr.io` on the Hostinger KVM VPS and first GHCR image push from GitHub Actions.
