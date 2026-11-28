# PHASE 3: GitHub Secrets & Hostinger GHCR Access Configuration

## 1. GitHub Repository Secrets (`pranshavsingh/HRMS`)
Go to **GitHub → `pranshavsingh/HRMS` → Settings → Secrets and variables → Actions → Repository secrets** and add:

1. **`COOLIFY_WEBHOOK`** *(Required)*
   - Value: The Coolify **Deploy Webhook URL** from Coolify → `HRMS` → `production` → `hrms-stack` → **Webhooks**.
2. **`COOLIFY_TOKEN`** *(Required if your Coolify webhook endpoint requires API Bearer auth)*
   - Value: A Coolify API token with deploy permissions.
3. **Optional GitHub Environment Approval Gate:**
   - Go to **Settings → Environments → `production`** → enable **Required reviewers** so the first production deployment pauses for manual approval after GHCR images are built.

*(Note: GHCR publishing inside GitHub Actions uses the automatic `GITHUB_TOKEN` with `packages: write` — do NOT add a personal PAT for publishing.)*

---

## 2. Hostinger KVM VPS — Read-Only GHCR Authentication (`read:packages`)
1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Select **only** the **`read:packages`** scope (least privilege).
3. SSH into your Hostinger KVM VPS and authenticate Docker to GHCR:
   ```bash
   echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u pranshavsingh --password-stdin
   ```
4. Verify authentication succeeded (`~/.docker/config.json` contains `ghcr.io` auth).
5. After the first GitHub Actions build completes, verify private image pull on the VPS:
   ```bash
   docker pull ghcr.io/pranshavsingh/hrms-backend:latest
   docker pull ghcr.io/pranshavsingh/hrms-worker:latest
   docker pull ghcr.io/pranshavsingh/hrms-frontend:latest
   ```

**Phase 3 Status:** **BLOCKED (Awaiting user action to configure GitHub Secrets and VPS `docker login ghcr.io`).**
