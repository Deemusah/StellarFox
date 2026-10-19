# GitHub Actions CI/CD Pipeline

Comprehensive automated testing, building, and deployment pipeline for StellarFox.

## Overview

The CI/CD pipeline automates:
- **Testing**: Unit tests, integration tests, linting, type checking
- **Building**: Docker image creation for all services
- **Registry Push**: Automated push to GitHub Container Registry (GHCR)
- **Deployment**: Staging and production deployments

### Pipeline Architecture

```
Push to main/develop
        ↓
Detect changed files
        ↓
    ┌───┴────┬────────┬──────────┐
    ↓        ↓        ↓          ↓
Backend   Frontend  Indexer  Contracts
  CI        CI       CI        CI
    ↓        ↓        ↓          ↓
  Tests    Tests    Tests      Build
    ↓        ↓        ↓          ↓
  Build    Build    Build    Audit
    ├────────┼────────┤          │
    └────────┼────────┴──────────┘
             ↓
       CI Success Check
             ↓
    Docker Build & Push (main/develop only)
             ↓
    Deploy to Environment
```

## Workflows

### 1. CI/CD Pipeline (`.github/workflows/ci-cd.yml`)

Main continuous integration workflow running on every push and pull request.

#### Triggers
- `push` to `main` or `develop` branches
- `pull_request` against `main` or `develop` branches

#### Jobs

##### Detect Changes
Determines which components have changed using path filters.

**Outputs:**
- `backend`: true if backend files changed
- `frontend`: true if frontend files changed
- `contracts`: true if contract files changed
- `indexer`: true if indexer files changed

```yaml
paths:
  backend:
    - 'backend/**'
    - '.github/workflows/ci-cd.yml'
  frontend:
    - 'frontend/**'
    - '.github/workflows/ci-cd.yml'
  contracts:
    - 'contracts/**'
    - '.github/workflows/ci-cd.yml'
  indexer:
    - 'indexer/**'
    - '.github/workflows/ci-cd.yml'
```

##### Backend CI (`backend-ci`)
Node.js/TypeScript backend testing and validation.

**Steps:**
1. Secret scanning (Gitleaks)
2. Dependency installation (cached)
3. OpenAPI spec validation
4. Database migration check
5. Drizzle schema verification
6. ESLint validation
7. TypeScript compilation (`build:prod`)
8. Unit tests (Jest)
9. Integration tests

**Services:**
- PostgreSQL 15 (localhost:5432)
- Redis 7 (localhost:6379)

**Artifacts:** None (pushed to registry only)

##### Backend Docker (`backend-docker`)
Builds and pushes backend Docker image.

**Conditions:**
- Runs only on `push` to `main` or `develop`
- Depends on `backend-ci` passing

**Outputs:**
- `image`: Full image URI
- `tags`: Generated tags

**Image Tags:**
```
ghcr.io/your-org/stellarfox/backend:develop
ghcr.io/your-org/stellarfox/backend:main-sha-abc123
ghcr.io/your-org/stellarfox/backend:latest  (main only)
```

**Features:**
- Multi-stage build
- GHA caching for faster rebuilds
- Automatic metadata extraction

##### Frontend CI (`frontend-ci`)
Next.js frontend testing and build.

**Steps:**
1. Secret scanning (Gitleaks)
2. Dependency installation (cached)
3. ESLint validation
4. TypeScript type checking
5. Unit tests (Jest)
6. Next.js build
7. Save build artifacts

**Artifacts:** `.next/` directory (used by E2E tests)

##### Frontend E2E (`frontend-e2e`)
Playwright-based end-to-end tests.

**Prerequisites:**
- `frontend-ci` must pass
- Requires build artifacts

**Steps:**
1. Download build artifacts
2. Install Playwright browsers
3. Start Next.js server
4. Wait for port 3000
5. Run Playwright tests
6. Upload test results on failure

**Environment:**
- `PLAYWRIGHT_BASE_URL=http://localhost:3000`
- `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `NEXT_PUBLIC_STELLAR_NETWORK=testnet`

##### Frontend Docker (`frontend-docker`)
Builds and pushes frontend Docker image.

**Conditions:**
- Runs only on `push` to `main` or `develop`
- Depends on `frontend-ci` passing

##### Indexer CI (`indexer-ci`)
TypeScript indexer testing and build.

**Steps:**
1. Secret scanning
2. Dependency installation (cached)
3. ESLint validation (if configured)
4. TypeScript build
5. Unit tests (Jest)

##### Indexer Docker (`indexer-docker`)
Builds and pushes indexer Docker image.

**Conditions:**
- Runs only on `push` to `main` or `develop`
- Depends on `indexer-ci` passing

##### Contracts CI (`contracts-ci`)
Rust smart contracts build and audit.

**Steps:**
1. Secret scanning
2. Install Rust toolchain with WASM target
3. Clippy lints (with warnings as errors)
4. Build WASM optimized binaries
5. Security audit with `cargo-audit`

**Cache:** Cargo registry and compiled artifacts

##### Status Checks
`ci-success` and `docker-success` jobs verify all CI and Docker builds pass.

---

### 2. Deployment Workflow (`.github/workflows/deploy.yml`)

Handles automated deployments to staging and production.

#### Triggers
1. **Automatic**: When CI/CD pipeline completes successfully
   - Develop branch → Staging
   - Main branch → Production

2. **Manual**: Via `workflow_dispatch`
   - Choose target environment
   - Supports both staging and production

#### Jobs

##### Determine Environment
Calculates target environment based on branch and trigger.

**Logic:**
```
- workflow_dispatch → Use input environment
- main branch → production
- develop branch → staging
- other → skip deployment
```

##### Pre-Deployment Checks
Verifies Docker images exist in registry before deployment.

**Validations:**
- Backend image available
- Frontend image available
- Indexer image available

##### Deploy Staging
Deploys to staging environment.

**Current Implementation:** Template with TODO markers

**Environment:** `staging` (https://staging.bankerchanger.app)

**Steps:**
1. Deploy services (TODO: implement)
2. Wait for services to be ready
3. Run smoke tests
4. Notify on success/failure

##### Deploy Production
Deploys to production with deployment tracking.

**Current Implementation:** Template with TODO markers

**Environment:** `production` (https://bankerchanger.app)

**Steps:**
1. Create GitHub deployment record
2. Deploy services (TODO: implement)
3. Wait for services to be ready
4. Run smoke tests
5. Update deployment status
6. Notify on success/failure

**Protection:** Production environment requires explicit approval

##### Rollback Production
Creates incident issue if production deployment fails.

**Triggered:** Only on main branch deployment failure

**Action:**
- Creates GitHub issue with:
  - Failed commit SHA
  - Link to failed workflow run
  - Link to deployment documentation

---

## Configuration

### Secrets Required

Store these in GitHub repository settings:

| Secret | Purpose | Used By |
|--------|---------|---------|
| `GITHUB_TOKEN` | Container registry auth, GitHub API | All workflows |

### Environment Variables

#### All Workflows
```env
REGISTRY=ghcr.io
REGISTRY_USERNAME=${{ github.actor }}
```

#### Backend
```env
DATABASE_URL=postgresql://bankerchanger:bankerchanger@localhost:5432/bankerchanger
REDIS_URL=redis://localhost:6379
MIGRATION_CHECK_STRICT=true
```

#### Frontend
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
CI=true
```

#### Docker Builds
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

---

## Usage

### Triggering Workflows

#### Automatic (Push-based)
```bash
# Push to develop → runs CI + pushes staging images
git push origin develop

# Push to main → runs CI + pushes production images
git push origin main
```

#### Manual Deployment
1. Go to GitHub Actions
2. Select "Deploy to Environment" workflow
3. Click "Run workflow"
4. Choose environment (staging/production)
5. Confirm

### Monitoring

#### View Workflow Runs
```
Repository → Actions → Select workflow
```

#### Viewing Logs
1. Click workflow run
2. Select job name
3. Expand step for detailed logs

#### Check Deployment Status
```
Repository → Deployments
```

---

## Docker Images

### Image Naming Convention

```
ghcr.io/[owner]/[repo]/[service]:[tag]
```

### Available Tags

| Tag Pattern | When Generated | Example |
|------------|-----------------|---------|
| `develop` | Push to develop | `develop` |
| `main` | Push to main | `main` |
| `[branch]-sha-[hash]` | All branches | `feature-sha-abc123def` |
| `latest` | Push to main | `latest` |
| `vX.Y.Z` | Git tags (semver) | `v1.2.3` |

### Pulling Images

```bash
# Latest from main
docker pull ghcr.io/your-org/stellarfox/backend:latest

# Specific branch
docker pull ghcr.io/your-org/stellarfox/frontend:develop

# Specific commit
docker pull ghcr.io/your-org/stellarfox/indexer:develop-sha-abc123def
```

### Authentication

```bash
# Log in to GHCR
echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin

# Or use personal access token
docker login ghcr.io
# Username: your-username
# Password: your-personal-access-token
```

---

## Local Testing

### Simulate CI Pipeline Locally

#### Using act
```bash
# Install act
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# List available workflows
act -l

# Run CI workflow
act push -j backend-ci

# Run with custom environment
act push -j backend-ci -e .env
```

#### Manual Testing
```bash
# Backend
cd backend
npm ci
npm run lint
npm run build:prod
npm test

# Frontend
cd frontend
npm ci
npm run lint
npm test
npm run build

# Indexer
cd indexer
npm ci
npm run build
npm test

# Contracts
cd contracts
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release --target wasm32-unknown-unknown
```

---

## Troubleshooting

### Job Failures

#### Backend CI Fails on Migration Check
```
Error: Migration check failed
```
**Solution:** Verify migration syntax and database connection strings.

```bash
cd backend
npm run migrate:check
```

#### Frontend Build Fails with Type Errors
```
Error: TypeScript errors found
```
**Solution:** Run type check locally and fix errors.

```bash
cd frontend
npm run type-check
```

#### Docker Push Fails (Permission Denied)
```
Error: denied: permission denied
```
**Solutions:**
1. Verify `GITHUB_TOKEN` has `packages:write` permission
2. Check organization settings for container registry access
3. Ensure workflow has `permissions: packages: write`

#### E2E Tests Timeout
```
Error: wait-on timeout
```
**Solutions:**
1. Increase timeout: `wait-on ... --timeout 120000`
2. Check Next.js build output
3. Verify port 3000 is not in use

### Debug Workflow

#### Enable Debug Logging
```bash
# Set in GitHub Actions UI
ACTIONS_STEP_DEBUG=true
```

#### Check Workflow Syntax
```bash
# Install act
act --list-jobs .github/workflows/ci-cd.yml
```

#### View Docker Build Output
Check step logs in GitHub Actions UI for:
- Build context size
- Layer caching status
- Final image size

---

## Performance Optimization

### Current Optimizations

1. **Change Detection**: Only runs jobs for modified components
2. **Dependency Caching**: npm modules cached between runs
3. **Docker Layer Caching**: GHA cache for faster rebuilds
4. **Parallel Jobs**: All independent jobs run simultaneously
5. **Concurrency Control**: Cancels previous runs on new push

### Further Optimization Ideas

1. **Build Matrix**: Test multiple Node.js versions
2. **Conditional Docker Builds**: Skip if tests fail
3. **Cache Warming**: Pre-build base images
4. **Artifact Retention**: Reduce storage costs
5. **Scheduled Builds**: Weekly full builds

---

## Best Practices

### For Developers

1. **Test Locally First**
   ```bash
   npm run lint
   npm run build
   npm test
   ```

2. **Keep Commits Small**
   - Easier to debug if something fails
   - Faster workflow runs

3. **Use Descriptive Branch Names**
   - `feature/user-auth`
   - `fix/wallet-connection`
   - `docs/deployment-guide`

4. **Monitor Workflow Runs**
   - Check GitHub Actions after push
   - Fix failures immediately
   - Learn from CI feedback

### For Maintainers

1. **Review Workflow Logs**
   - Check for flaky tests
   - Monitor build times
   - Watch resource usage

2. **Update Dependencies**
   - Review Dependabot suggestions
   - Pin critical versions
   - Test beta releases

3. **Manage Secrets**
   - Rotate regularly
   - Use environment-specific secrets
   - Audit access logs

4. **Document Deployment**
   - Update deployment runbook
   - Test rollback procedures
   - Document incident responses

---

## Maintenance

### Updating Workflows

1. Test changes locally with `act`
2. Create feature branch
3. Push changes for testing
4. Merge to main once verified

### Adding New Jobs

```yaml
new-job:
  name: New Job Name
  needs: [dependency-job]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup
      run: echo "Setting up..."
    - name: Execute
      run: echo "Running..."
```

### Removing/Disabling Jobs

1. Update `needs:` in dependent jobs
2. Comment out or remove job definition
3. Test workflow runs successfully
4. Merge changes

---

## Related Documentation

- [Deployment Guide](./deployment.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Architecture Overview](./architecture.md)
- [Observability Guide](./observability.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## Support

For issues or questions:

1. Check GitHub Actions logs
2. Review troubleshooting section
3. Test locally with `act`
4. Create issue with workflow logs attached
