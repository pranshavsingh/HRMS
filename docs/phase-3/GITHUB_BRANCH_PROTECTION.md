# GitHub Branch Protection & Merge Gating Guide
## Enforcing Mandatory CI Checks, Review Gates & History Protection for HRMS

- **Repository**: `pranshavsingh/HRMS`
- **Protected Target Branches**: `main`, `feat/**`
- **Governing Workflow**: `.github/workflows/security.yml`

---

## 1. Required Status Checks from GitHub Actions CI

To prevent untested code from reaching `main`, the following two workflow job names must be configured as **Required Status Checks** in GitHub branch protection:

1. `Backend Security, Migrations & Tests` (Job: `backend-security`)
   - Validates Node.js syntax (`npm run check`)
   - Checks dependency vulnerabilities (`npm audit`)
   - Executes MySQL migrations (`npm run db:migrate`)
   - Runs Phase 1 Security Suite (37 tests)
   - Runs Phase 2 Concurrency & Pagination Suite (17 tests)
   - Runs Phase 3 Distributed Reliability Suite (41 tests)
2. `Frontend Build Verification` (Job: `frontend-build`)
   - Validates React + Vite clean build without compilation errors

---

## 2. GitHub UI Configuration Steps

Navigate to:
`https://github.com/pranshavsingh/HRMS/settings/branches`

### Step 2.1: Add Branch Protection Rule for `main`
Click **Add branch protection rule**:
- **Branch name pattern**: `main`

Enable the following settings:
- [x] **Require a pull request before merging**
  - [x] Require approvals: `1`
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] **Require status checks to pass before merging**
  - [x] **Require branches to be up to date before merging**
  - Under *Status checks that are required*: Search and select:
    - `Backend Security, Migrations & Tests`
    - `Frontend Build Verification`
- [x] **Do not allow bypassing the above settings** (Enforce for administrators)
- [x] **Restrict force pushes** (Prevent history rewriting)
- [x] **Restrict deletions** (Prevent branch deletion)

Click **Create** or **Save changes**.

---

### Step 2.2: Add Branch Protection Rule for `feat/**` (Optional Staging Protection)
- **Branch name pattern**: `feat/**`
- Enable:
  - [x] **Require status checks to pass before merging**:
    - `Backend Security, Migrations & Tests`
    - `Frontend Build Verification`
  - [x] **Restrict force pushes**

---

## 3. GitHub REST API Automated Configuration (Alternative via CLI)

If configuring via GitHub Personal Access Token (`repo` admin permissions):

```bash
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/pranshavsingh/HRMS/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Backend Security, Migrations & Tests",
        "Frontend Build Verification"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 1
    },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```
