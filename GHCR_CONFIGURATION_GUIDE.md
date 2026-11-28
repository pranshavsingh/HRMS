# GHCR Configuration Guide (`ghcr.io/pranshavsingh`)

## 1. Private Image Repositories
All three production images are published as **private** packages under `ghcr.io/pranshavsingh`:
- `ghcr.io/pranshavsingh/hrms-backend`
- `ghcr.io/pranshavsingh/hrms-worker`
- `ghcr.io/pranshavsingh/hrms-frontend`

## 2. Tagging Strategy
Every successful `main` build publishes:
- Immutable full commit SHA tag: `:<github.sha>` (never overwritten)
- Rolling production tag: `:latest`

## 3. GitHub Actions Authentication (`packages: write`)
`.github/workflows/production-cicd.yml` authenticates using the built-in `GITHUB_TOKEN` with minimal permissions:
```yaml
permissions:
  contents: read
  packages: write
```
Ensure in **GitHub Repository → Settings → Actions → General → Workflow permissions** that `GITHUB_TOKEN` is permitted to read/write packages (or `production-cicd.yml`'s explicit `packages: write` is allowed).

## 4. Coolify / Hostinger KVM Read-Only Authentication (`read:packages`)
Create a dedicated, least-privilege GitHub Personal Access Token (Classic) with **only** `read:packages` scope:
1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)** → **Generate new token**.
2. Select **only** `read:packages`.
3. On the Hostinger KVM server (used by Coolify's Docker daemon), authenticate once:
   ```bash
   echo "<READ_PACKAGES_PAT>" | docker login ghcr.io -u pranshavsingh --password-stdin
   ```
4. Verify pull access for all three private images after the first CI/CD run:
   ```bash
   docker pull ghcr.io/pranshavsingh/hrms-backend:latest
   docker pull ghcr.io/pranshavsingh/hrms-worker:latest
   docker pull ghcr.io/pranshavsingh/hrms-frontend:latest
   ```
Never commit this token into git or `.env` files tracked by git.
