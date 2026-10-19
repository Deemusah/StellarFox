# Blue-Green Deployment Quick Start

Get up and running with zero-downtime deployments in 5 minutes.

## What is Blue-Green Deployment?

Two identical environments (blue and green) run in parallel. To deploy:

1. Deploy to the **inactive** environment (while users use the active one)
2. Test the new version thoroughly
3. Switch traffic to the new environment
4. If problems occur, instantly switch back

**Result**: Zero downtime. Users don't see any interruption.

## Quick Setup

### Prerequisites

```bash
# Check Docker is installed
docker --version
docker compose version

# You should see version info for both
```

### Start Both Environments

```bash
cd /workspaces/StellarFox

# Start all services (blue and green)
docker compose -f docker-compose.blue-green.yml up -d

# Wait 20-30 seconds for startup...

# Check status
./deployment/deploy.sh status
```

You should see:
- `postgres` (shared database)
- `redis` (shared cache)
- `nginx` (traffic router)
- `backend-blue`, `backend-green` (APIs)
- `indexer-blue`, `indexer-green` (indexers)
- `frontend-blue`, `frontend-green` (web apps)

## Deploy Your First Change

### Step 1: Make Your Changes

```bash
# Update code in backend/, frontend/, or indexer/
# Commit and push to git (or just make local changes)

git add .
git commit -m "Feature: awesome new feature"
```

### Step 2: Deploy to Inactive Environment

```bash
# This deploys to green (if blue is active)
./deployment/deploy.sh deploy

# Watch the output - it will:
# 1. Build new images
# 2. Start services
# 3. Run health checks
# 4. Tell you when ready
```

**Status**: New version is running but users still see the old version.

### Step 3: Test the New Version

```bash
# Test inactive environment (e.g., port 3010 if green is inactive)
curl http://localhost:3011/api/health

# Or in browser: http://localhost:3010

# Run your tests
./tests/smoke-test.sh
# or: npm run test:integration
```

**Status**: Everything looks good? Move to step 4.

### Step 4: Switch Traffic

```bash
./deployment/deploy.sh switch
```

Done! Traffic now goes to your new version. Users are already using it - they never saw downtime.

### Step 5: Verify

```bash
./deployment/deploy.sh health

# Check logs for errors
docker compose -f docker-compose.blue-green.yml logs -f
```

## If Something Goes Wrong

### Instant Rollback

```bash
./deployment/rollback.sh
```

Done. Traffic is back to the previous version. No users were affected (or only for a few seconds).

### For Emergencies

```bash
./deployment/rollback.sh --force
```

This skips verification - rollback happens immediately.

## How to Check Status

```bash
# Current status
./deployment/deploy.sh status

# Health of all services
./deployment/deploy.sh health

# Watch logs
docker compose -f docker-compose.blue-green.yml logs -f
```

## Port Reference

### Active Environment (Example: Blue)

- Frontend: `localhost:3000`
- Backend: `localhost:3001`
- Indexer: `localhost:3002`

### Inactive Environment (Example: Green)

- Frontend: `localhost:3010`
- Backend: `localhost:3011`
- Indexer: `localhost:3012`

### After Traffic Switch

Traffic routes through Nginx (port 80/443):
- Frontend: `localhost`
- Backend: `localhost/api`

## Verify Everything Works

```bash
# Run all tests
./deployment/test-deployment.sh

# You should see "✓ All tests passed!"
```

## Common Commands

```bash
# Deploy (no traffic switch - manual step later)
./deployment/deploy.sh deploy

# Deploy and automatically switch traffic
./deployment/deploy.sh deploy --auto-switch

# Switch traffic after deployment
./deployment/deploy.sh switch

# Rollback to previous version
./deployment/rollback.sh

# Check status
./deployment/deploy.sh status

# Check health
./deployment/deploy.sh health
```

## Troubleshooting

### Services won't start

```bash
# Check what went wrong
docker compose -f docker-compose.blue-green.yml logs

# Usually it's:
# 1. Missing .env files - copy .env.example files
# 2. Ports in use - stop conflicting services
# 3. Build error - run docker compose build again
```

### Can't connect to services

```bash
# Make sure containers are running
docker compose -f docker-compose.blue-green.yml ps

# Check port mapping
docker compose -f docker-compose.blue-green.yml port backend-blue 3001

# Test connectivity
curl http://localhost:3001/health
```

### Database issues

```bash
# Check if postgres is healthy
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  pg_isready -U bankerchanger

# View postgres logs
docker compose -f docker-compose.blue-green.yml logs postgres
```

## Useful Shortcuts

Add these to `~/.bashrc` for quick access:

```bash
alias bg-deploy='cd /workspaces/StellarFox && ./deployment/deploy.sh'
alias bg-rollback='cd /workspaces/StellarFox && ./deployment/rollback.sh'
alias bg-status='cd /workspaces/StellarFox && ./deployment/deploy.sh status'
alias bg-logs='docker compose -f docker-compose.blue-green.yml logs -f'
```

Then use:
```bash
bg-status
bg-deploy deploy
bg-deploy switch
bg-rollback
```

## Next Steps

1. Read the full documentation: `/workspaces/StellarFox/BLUE_GREEN_DEPLOYMENT.md`
2. Review the operational runbook: `/workspaces/StellarFox/DEPLOYMENT_RUNBOOK.md`
3. Try a full deployment cycle locally
4. Integrate with your CI/CD pipeline

## Key Benefits

✅ **Zero Downtime**: Users never see interruption  
✅ **Instant Rollback**: Revert to previous version in seconds  
✅ **Full Testing**: Test new version before switching traffic  
✅ **Independent Environments**: Scale and manage each separately  
✅ **Data Consistency**: Shared database ensures no data loss  

## Support

For issues:

1. Check logs: `docker compose -f docker-compose.blue-green.yml logs -f`
2. Run tests: `./deployment/test-deployment.sh`
3. Check status: `./deployment/deploy.sh status --verbose`
4. Refer to full documentation: `BLUE_GREEN_DEPLOYMENT.md`

---

**Questions?** Check the [Full Deployment Documentation](BLUE_GREEN_DEPLOYMENT.md)

**Need help?** See the [Deployment Runbook](DEPLOYMENT_RUNBOOK.md)
