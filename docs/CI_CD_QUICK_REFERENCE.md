# CI/CD Quick Reference

Fast lookup for common CI/CD tasks and workflows.

## At a Glance

| Event | Trigger | What Happens |
|-------|---------|--------------|
| Push to `develop` | Automatic | Run CI tests → Build & push docker images → Deploy to staging |
| Push to `main` | Automatic | Run CI tests → Build & push docker images → Deploy to production |
| Pull Request | Automatic | Run CI tests (no deploy) |
| Manual deployment | GitHub Actions UI | Choose environment → Deploy |

## What Gets Tested

### Backend
- ✅ TypeScript compilation
- ✅ ESLint rules
- ✅ OpenAPI spec validation
- ✅ Database migration integrity
- ✅ Drizzle schema synchronization
- ✅ Unit tests (Jest)
- ✅ Integration tests
- ✅ Load tests (k6)

### Frontend
- ✅ TypeScript compilation
- ✅ ESLint rules
- ✅ Unit tests (Jest)
- ✅ Next.js build
- ✅ E2E tests (Playwright)

### Indexer
- ✅ TypeScript compilation
- ✅ Unit tests (Jest)

### Contracts
- ✅ Cargo clippy (lints as errors)
- ✅ WASM build
- ✅ Dependency audit

## Common Tasks

### Check Workflow Status
```
GitHub → Repository → Actions → View workflow
```

### View Test Results
```
GitHub → Actions → [Workflow name] → [Run] → Logs
```

### View Deployed Images
```
GitHub → Packages → Select image → Versions
```

### Pull Latest Image
```bash
docker pull ghcr.io/your-org/stellarfox/backend:latest
```

### Run Tests Locally
```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test

# Indexer
cd indexer && npm test

# Contracts
cd contracts && cargo test
```

### Manually Trigger Deployment
```
GitHub → Actions → "Deploy to Environment" → "Run workflow"
→ Select environment → Run
```

### Debug Locally with act
```bash
# Install
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# Run specific job
act push -j backend-ci

# Run with env file
act push -j backend-ci -e .env.test
```

## Workflow Status Indicators

| Status | Meaning |
|--------|---------|
| 🟢 Green | All tests passed, images built |
| 🟡 Yellow | Tests running |
| 🔴 Red | Tests failed, deployment blocked |
| ⏸️ Skipped | Conditions not met (e.g., no changes) |

## Docker Image Locations

```
Backend:   ghcr.io/your-org/stellarfox/backend:[tag]
Frontend:  ghcr.io/your-org/stellarfox/frontend:[tag]
Indexer:   ghcr.io/your-org/stellarfox/indexer:[tag]
```

### Available Tags
- `latest` - Main branch
- `develop` - Develop branch
- `main-sha-[hash]` - Specific commit
- `feature-sha-[hash]` - Feature branch

## Log in to Registry

```bash
# Use GitHub token
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Or interactive
docker login ghcr.io
# Enter username: your-github-username
# Enter token: your-personal-access-token
```

## Fix Common Failures

### ❌ Tests Failed
```bash
# Run locally first
npm run lint
npm run test

# Fix issues
npm run format  # Auto-fix formatting
npm run test -- --watch  # Watch mode

# Push again
git add .
git commit -m "fix: resolve test failures"
git push
```

### ❌ Docker Build Failed
```bash
# Check logs in GitHub Actions
# Likely causes:
# - Missing dependencies in package.json
# - Invalid Dockerfile
# - Port already in use

# Test locally
docker build -f backend/Dockerfile -t test .
```

### ❌ Deployment Failed
```bash
# Check deployment logs
# Investigate specific error
# Either:
# 1. Fix and re-push (auto-redeploy)
# 2. Manually trigger deployment from Actions UI
```

## File Changes Watched

| Service | Triggers CI On |
|---------|---|
| Backend | Changes in `backend/` directory |
| Frontend | Changes in `frontend/` directory |
| Indexer | Changes in `indexer/` directory |
| Contracts | Changes in `contracts/` directory |
| All | Changes in `.github/workflows/` |

## Useful Commands

```bash
# View all workflow files
ls -la .github/workflows/

# Validate workflow syntax
act -l  # Lists all jobs

# Check git status before push
git status

# View recent commits
git log --oneline -10

# Amend last commit (before push)
git add .
git commit --amend --no-edit
git push -f origin branch-name

# View Docker image history
docker history ghcr.io/your-org/stellarfox/backend:latest
```

## Performance Tips

1. **Push focused changes**
   - Small commits run faster
   - Easier to debug issues

2. **Keep packages up to date**
   - Reduces dependency resolve time
   - Catches security issues early

3. **Test locally first**
   - Saves CI minutes
   - Faster feedback loop

4. **Use meaningful commit messages**
   - Easier to track issues
   - Better for future debugging

## Contact & Support

- 📖 Full docs: See [GITHUB_ACTIONS_CI_CD.md](./GITHUB_ACTIONS_CI_CD.md)
- 🐛 Report issues: Create GitHub issue
- 💬 Questions: Ask in discussions
