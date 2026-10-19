# 🚀 Zero-Downtime Blue-Green Deployment - START HERE

Welcome! This guide gets you started with StellarFox's zero-downtime deployment system in 5 minutes.

## What You're Getting

A production-ready blue-green deployment system that:
- ✅ **Never goes down** - Users keep working during deployment
- ✅ **Rolls back instantly** - Problems? Back to previous version in seconds
- ✅ **Tests automatically** - Verify new version before switching
- ✅ **Fully documented** - Everything explained with examples

## Quick Start (5 minutes)

### 1. Verify Everything Works
```bash
cd /workspaces/StellarFox
./deployment/test-deployment.sh
```
You should see: `✓ All tests passed!` (11/11 tests)

### 2. Check Current Status
```bash
./deployment/deploy.sh status
```
Shows which environment (blue/green) is currently active.

### 3. Ready to Deploy
To deploy a new version:
```bash
./deployment/deploy.sh deploy         # Deploy to inactive environment
# Test the new version...
./deployment/deploy.sh switch         # Switch traffic to new version
```

That's it! Your new version is live with zero downtime.

### 4. Need to Rollback
If something goes wrong:
```bash
./deployment/rollback.sh              # Instant rollback
```

## How It Works (2 minute overview)

Two identical environments run in parallel:
- **Blue**: Current production (users access this)
- **Green**: New version staging (being tested)

### Deployment Process

```
1. Deploy new code to inactive (green) environment
   ↓
2. Test the new environment
   ↓
3. Switch traffic from old (blue) to new (green)
   ↓
4. Users access new version
   ↓
5. Keep old environment ready for quick rollback
```

### Traffic Switching

- **Before**: Users → Blue (old version)
- **Switch**: Nginx routes to Green
- **After**: Users → Green (new version)
- **Time**: < 5 seconds, users don't notice

## Documentation Map

Choose your path:

### I want to deploy something now
→ Read: **[DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md)** (5 min)

### I need to operate deployments
→ Read: **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** (reference guide)

### I want to understand everything
→ Read: **[BLUE_GREEN_DEPLOYMENT.md](BLUE_GREEN_DEPLOYMENT.md)** (complete guide)

### I need to find a specific file
→ Read: **[DEPLOYMENT_FILES.md](DEPLOYMENT_FILES.md)** (file reference)

### I want implementation details
→ Read: **[DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](DEPLOYMENT_IMPLEMENTATION_SUMMARY.md)** (technical overview)

## Key Commands

```bash
# Status
./deployment/deploy.sh status          # What's running?

# Deploy
./deployment/deploy.sh deploy          # Deploy to inactive
./deployment/deploy.sh deploy --auto-switch  # Deploy & switch (auto)

# Switch
./deployment/deploy.sh switch          # Switch traffic

# Verify
./deployment/deploy.sh health          # Check health
./deployment/test-deployment.sh        # Run tests

# Rollback
./deployment/rollback.sh               # Rollback
./deployment/rollback.sh --force       # Emergency rollback

# Help
./deployment/deploy.sh -h              # Deploy help
./deployment/rollback.sh -h            # Rollback help
```

## Ports Reference

When deploying, you can access:

| Service | Blue | Green | Active |
|---------|------|-------|--------|
| Frontend | 3000 | 3010 | localhost |
| Backend | 3001 | 3011 | localhost/api |
| Indexer | 3002 | 3012 | localhost/ws |

**Example**: If green is inactive, test at:
- Frontend: http://localhost:3010
- Backend: http://localhost:3011
- Indexer: http://localhost:3012

## Step-by-Step Deployment

### Before You Start
```bash
# Make sure tests pass
./deployment/test-deployment.sh

# Backup your database (optional but recommended)
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  pg_dump -U bankerchanger bankerchanger > backup-$(date +%s).sql
```

### Step 1: Deploy
```bash
./deployment/deploy.sh deploy

# Wait for output like:
# ✓ Deployment to green completed successfully
# ✓ Deployment ready. Run './deployment/deploy.sh switch' to switch traffic
```

### Step 2: Test
```bash
# Find which environment is inactive
./deployment/deploy.sh status

# If green is inactive (ports 3010-3012), test it:
curl http://localhost:3011/api/health
curl http://localhost:3010

# Run your test suite
npm run test:integration
```

### Step 3: Switch
```bash
./deployment/deploy.sh switch

# Wait for:
# ✓ Traffic successfully switched to green
```

### Step 4: Verify
```bash
# Check everything is working
./deployment/deploy.sh health

# Monitor logs for errors
docker compose -f docker-compose.blue-green.yml logs -f
```

## Troubleshooting

### Tests fail
```bash
# Check that .env files exist
ls backend/.env indexer/.env frontend/.env

# If missing, copy examples
cp backend/.env.example backend/.env
cp indexer/.env.example indexer/.env
cp frontend/.env.example frontend/.env
```

### Deployment takes too long
- Health checks take 20-30 seconds (normal)
- Database migrations may add time
- Check logs: `docker compose logs backend-green`

### Can't switch traffic
```bash
# Make sure inactive environment is healthy
./deployment/deploy.sh health

# Check Nginx
docker compose -f docker-compose.blue-green.yml logs nginx
```

### Need to rollback
```bash
# Standard rollback
./deployment/rollback.sh

# Emergency rollback (skip checks)
./deployment/rollback.sh --force
```

## Performance

| Task | Time |
|------|------|
| Deploy to inactive | 10-15 min |
| Switch traffic | < 5 sec |
| Rollback | < 10 sec |
| Emergency rollback | < 5 sec |

## Features Included

✅ **Dual environments** - Blue and green run in parallel
✅ **Health checks** - All services verified before switching
✅ **State backup** - Tracks deployment history
✅ **Quick rollback** - One command to go back
✅ **Emergency mode** - Force rollback when needed
✅ **Automated tests** - 11 tests verify everything
✅ **Complete docs** - Everything explained
✅ **Monitoring** - Check status, health, logs anytime

## First-Time Setup

If starting from scratch:

```bash
# 1. Navigate to project
cd /workspaces/StellarFox

# 2. Verify configuration
./deployment/test-deployment.sh

# 3. Start all services
docker compose -f docker-compose.blue-green.yml up -d

# 4. Wait 30 seconds for startup
sleep 30

# 5. Check status
./deployment/deploy.sh status

# 6. Verify health
./deployment/deploy.sh health
```

All services should show `running` and health checks should pass.

## What Happens During Switch

1. **Pre-switch**: Verify new environment is healthy (5-30 seconds)
2. **Switch**: Update routing (< 1 second)
3. **Verification**: Confirm switch completed (< 1 second)
4. **Total**: < 5 seconds, users don't see downtime

**User experience**: Seamless transition, no service interruption.

## Integration with CI/CD

Add to your pipeline:

```yaml
deploy:
  script: ./deployment/deploy.sh deploy

test:
  script: ./deployment/test-deployment.sh

switch:
  script: ./deployment/deploy.sh switch
  when: manual  # Require approval before switch
```

## Need Help?

1. **Quick answer**: Check [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md)
2. **How to operate**: See [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)
3. **Deep dive**: Read [BLUE_GREEN_DEPLOYMENT.md](BLUE_GREEN_DEPLOYMENT.md)
4. **Find a file**: Check [DEPLOYMENT_FILES.md](DEPLOYMENT_FILES.md)
5. **Script help**: Run `./deployment/deploy.sh -h`

## Summary

You now have:
- ✅ Zero-downtime deployment system
- ✅ Instant rollback capability
- ✅ Automated testing
- ✅ Complete documentation
- ✅ Production-ready infrastructure

**Next step**: Read [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md) for detailed walkthrough.

---

**Questions?** All answers are in the documentation files.
**Ready to deploy?** Use `./deployment/deploy.sh deploy`
**Something wrong?** Use `./deployment/rollback.sh`

**Version**: 1.0 | **Date**: October 16, 2024 | **Status**: ✅ Complete
