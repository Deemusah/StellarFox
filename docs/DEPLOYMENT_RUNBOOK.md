# Deployment Runbook

Step-by-step procedures for deploying StellarFox to staging and production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Automatic Deployment](#automatic-deployment)
3. [Manual Deployment](#manual-deployment)
4. [Verification](#verification)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment](#post-deployment)

---

## Prerequisites

### System Requirements
- Docker installed locally (for testing)
- Access to GitHub repository
- GitHub Actions enabled
- Container registry configured (GHCR)
- Target environment credentials (AWS/K8s/etc.)

### GitHub Setup
1. Verify `GITHUB_TOKEN` has proper permissions:
   - `contents: read`
   - `packages: write`
   - `deployments: write`

2. Verify branch protection rules:
   - Main branch requires PR approval
   - All status checks pass
   - Code owners approve changes

### Environment Credentials
Store in GitHub Secrets:
- Cloud provider credentials (AWS keys, K8s certs, etc.)
- Database connection strings
- API keys and tokens
- SSL certificates

---

## Automatic Deployment

### Branch-Based Automatic Deployment

**When:** On every push to `main` or `develop`

**Flow:**
```
git push origin main
    ↓
[CI Pipeline Runs]
    ├─ Test backend
    ├─ Test frontend  
    ├─ Test indexer
    └─ Build contracts
    ↓
[All tests pass?]
    ├─ Yes → Docker build & push
    │        ↓
    │        Deploy to production
    ├─ No → STOP (notify team)
```

### To Deploy via Automatic Trigger

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   git add .
   git commit -m "feat: implement feature"
   ```

2. **Create Pull Request**
   ```bash
   git push -u origin feature/my-feature
   # GitHub: Create PR to main or develop
   ```

3. **Wait for CI checks**
   - GitHub Actions runs automatically
   - All checks must pass
   - Reviews approved

4. **Merge PR**
   - Click "Squash and merge" or "Merge"
   - Delete branch

5. **Monitor Deployment**
   - Go to Actions tab
   - Watch deployment job
   - Verify in environment

---

## Manual Deployment

### When to Use Manual Deployment
- Hotfixes that can't wait for PR merge
- Rolling back to previous version
- Testing deployment process
- Emergency situations

### Step-by-Step Manual Deployment

#### Step 1: Access GitHub Actions

```
1. Go to https://github.com/your-org/stellarfox
2. Click "Actions" tab
3. Select "Deploy to Environment" workflow
4. Click "Run workflow" button (top-right)
```

#### Step 2: Choose Environment

```
Dropdown: Select environment
  → staging
  → production

Input: Branch (if applicable)
```

#### Step 3: Confirm & Run

```
Click green "Run workflow" button
Wait for dialog to confirm
```

#### Step 4: Monitor Deployment

```
1. Workflow starts in Actions tab
2. Check "Determine Environment" job
3. Follow "Deploy to [env]" job
4. Read logs for any issues
```

#### Step 5: Verify Deployment

See [Verification](#verification) section below.

---

## Verification

### Pre-Deployment Verification

#### 1. Check All Tests Pass
```bash
# In GitHub Actions, before deployment runs
# All these should show ✅:
- backend-ci: success
- frontend-ci: success
- indexer-ci: success
- contracts-ci: success
```

#### 2. Verify Docker Images Built
```bash
# In "Backend Docker" job logs
# Should see:
Successfully pushed ghcr.io/.../backend:[tag]

# Test locally
docker pull ghcr.io/your-org/stellarfox/backend:latest
```

### Post-Deployment Verification

#### 1. Health Checks
```bash
# Backend health
curl https://api.staging.bankerchanger.app/health
# Expected: {"status": "ok"}

# Frontend health
curl https://staging.bankerchanger.app/
# Expected: HTTP 200 with HTML

# Indexer health
curl https://api.staging.bankerchanger.app/indexer/health
# Expected: {"status": "healthy"}
```

#### 2. Service Connectivity
```bash
# Test backend → database
curl https://api.staging.bankerchanger.app/api/status
# Check database connection in response

# Test backend → Redis
# Verify cache operations work

# Test frontend → backend API
# Open frontend and check network requests in DevTools
```

#### 3. Key Functionality Tests

**Backend:**
```bash
# List markets
curl https://api.staging.bankerchanger.app/api/markets

# Get health
curl https://api.staging.bankerchanger.app/health

# Check metrics
curl https://api.staging.bankerchanger.app/metrics
```

**Frontend:**
```bash
# Load homepage
curl https://staging.bankerchanger.app

# Check JavaScript loads
# Open browser console (F12)
# Should see no critical errors
```

**Indexer:**
```bash
# Check indexer status
curl https://api.staging.bankerchanger.app/indexer/status

# Verify contract sync
# Check latest block processed
```

#### 4. Database Verification
```bash
# Connect to staging database
psql postgresql://user:pass@staging-db:5432/bankerchanger

# Check migrations ran
SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 5;

# Verify data exists
SELECT COUNT(*) FROM markets;
SELECT COUNT(*) FROM users;
```

#### 5. Smoke Tests

Run automated smoke tests:
```bash
# Deployed as part of workflow, but can run manually
./tests/smoke/run.sh https://staging.bankerchanger.app
```

Expected output:
```
✓ Frontend loads
✓ API responds
✓ Database connected
✓ Cache working
✓ WebSocket connects
```

#### 6. Application-Specific Checks

**Market Creation:**
- [ ] Can create market
- [ ] Can place bet
- [ ] Can view bet history
- [ ] Can withdraw funds

**Wallet Integration:**
- [ ] Freighter wallet connects
- [ ] Can sign transactions
- [ ] Transactions broadcast correctly

**Real-time Updates:**
- [ ] WebSocket connected
- [ ] Market updates in real-time
- [ ] Odd changes broadcast correctly

---

## Rollback Procedures

### Automatic Rollback Trigger

If deployment fails:
```
Deployment job fails
    ↓
Automated incident issue created
    ↓
Team notified via Slack/Discord
    ↓
Manual review and decision
```

### Manual Rollback to Previous Version

#### Option 1: Deploy Previous Commit

```bash
# Find last known good commit
git log --oneline | head -20

# Note the commit SHA

# Option A: Via GitHub (easier)
GitHub → Actions → Deploy Workflow
→ Choose environment
→ Input previous commit SHA
→ Run

# Option B: Via CLI
git checkout <previous-commit-sha>
git push origin main --force-with-lease
```

**Warning:** Force push should be rare. Prefer creating new commit.

#### Option 2: Deploy from Previous Tag

```bash
# List versions
git tag | sort -V | tail -10

# Checkout tag
git checkout v1.2.3

# Create rollback commit
git checkout -b hotfix/rollback-v1.2.3
git push -u origin hotfix/rollback-v1.2.3

# Create PR, merge to main, auto-deploy
```

#### Option 3: Revert Recent Commit

```bash
# Most common and safest
git revert <commit-sha>
git push origin main

# Auto-deploy will handle rollback
```

### Rollback Verification

After rollback deployment:

```bash
# Verify old version running
curl https://api.production.bankerchanger.app/version
# Should show previous version

# Check services healthy
curl https://api.production.bankerchanger.app/health

# Monitor logs for errors
# Should see normal operation

# Run smoke tests again
./tests/smoke/run.sh https://production.bankerchanger.app
```

### Post-Rollback Analysis

1. **Capture Logs**
   ```bash
   # Export full deployment logs
   # Save error messages
   # Document timeline
   ```

2. **Create Incident Issue**
   ```
   GitHub Issues → New Issue
   Title: "Incident: Production deployment failed [date]"
   Body: Include
     - Timeline of events
     - Root cause
     - Error messages
     - Resolution taken
     - Prevention measures
   Label: 🔴 critical, incident
   ```

3. **Notify Team**
   - Send summary to Slack/Discord
   - Schedule postmortem
   - Update status page

---

## Troubleshooting

### Deployment Hangs

**Symptom:** Deployment job stuck for >30 min

**Investigation:**
```bash
# 1. Check workflow logs
GitHub → Actions → [Workflow] → [Job] → Logs

# 2. Look for:
# - Timeout errors
# - Network connectivity issues
# - Resource exhaustion

# 3. Check target environment
# - SSH into server
# - Check disk space: df -h
# - Check memory: free -h
# - Check network: ping 8.8.8.8
```

**Solutions:**
```bash
# Option 1: Cancel and retry
GitHub → Actions → [Workflow] → Cancel job

# Option 2: Manual investigation
ssh deployment@staging-server.aws

# Option 3: Scale resources
# Increase instance memory/CPU
# Clear old Docker images: docker image prune
# Free up disk space
```

### Docker Image Not Found

**Symptom:** `Error: image not found`

**Investigation:**
```bash
# Verify image exists
docker pull ghcr.io/your-org/stellarfox/backend:latest
# If fails: not pushed

# Check registry
GitHub → Packages → Select service
```

**Solutions:**
```bash
# 1. Re-run CI pipeline
GitHub → Actions → CI/CD Pipeline → Re-run jobs

# 2. Verify Docker build succeeded
Check "Backend Docker" job logs

# 3. Check registry credentials
Verify GITHUB_TOKEN secret has packages:write
```

### Health Checks Failing

**Symptom:** `Health check failed` in deployment logs

**Investigation:**
```bash
# SSH into server
ssh deployment@staging-server.aws

# Check container logs
docker logs <container-id>

# Verify port is listening
ss -tlnp | grep 3001

# Check connectivity
curl http://localhost:3001/health
```

**Solutions:**
```bash
# 1. Check environment variables
docker inspect <container-id> | grep Env

# 2. Check database connectivity
# Verify DATABASE_URL is correct
# Test connection: psql $DATABASE_URL

# 3. Check logs for errors
docker logs --tail 50 <container-id>

# 4. Manually restart container
docker restart <container-id>
```

### Database Migration Failed

**Symptom:** `Migration failed` in logs

**Investigation:**
```bash
# Connect to database
psql $DATABASE_URL

# Check migrations table
SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 5;

# Check for incomplete migrations
SELECT * FROM schema_migrations WHERE completed_at IS NULL;

# Run migrations manually
cd backend
npm run migrate

# Check migration files
ls -la src/migrations/
```

**Solutions:**
```bash
# 1. Rollback previous migration
npm run migrate:down

# 2. Fix migration script
# Edit offending migration file
# Re-run migrations

# 3. Manual SQL fix (last resort)
# SSH to server, run manual SQL
# Document what was fixed

# 4. Redeploy after fix
git add src/migrations/fix.ts
git commit -m "fix: correct migration"
git push
```

### Performance Degradation Post-Deployment

**Symptom:** Slow response times, timeouts

**Investigation:**
```bash
# Check resource usage
df -h           # Disk space
free -h         # Memory
top -b -n 1     # CPU usage

# Check logs for errors
docker logs --tail 100 <container-id>

# Monitor network
ss -s           # Connection stats
```

**Solutions:**
```bash
# 1. Check for memory leaks
# Monitor heap usage in app logs

# 2. Scale up resources
# Increase container memory limit

# 3. Check for database issues
# Run EXPLAIN ANALYZE on slow queries
# Add indexes if needed

# 4. If all else fails, rollback
git revert <commit-sha>
git push
```

---

## Post-Deployment

### Monitoring

#### Immediate (First Hour)
```
✓ Health checks pass
✓ Error logs normal level
✓ Response times acceptable
✓ No spike in exceptions
```

#### Short-term (First 24h)
```
✓ Monitor resource usage
✓ Watch database queries
✓ Check for memory leaks
✓ Verify cache hit rates
```

#### Ongoing
```
✓ Daily log review
✓ Weekly performance analysis
✓ Monthly dependency updates
✓ Quarterly capacity planning
```

### Communication

1. **Notify Stakeholders**
   ```
   Slack: #deployments
   @channel Deployment to production complete
   - Deployed version: v1.2.3
   - Changes: [link to PR]
   - All systems healthy
   ```

2. **Update Status Page**
   - Mark deployment as complete
   - Note any changes to functionality

3. **Document Changes**
   - Add to CHANGELOG.md
   - Update API docs if needed

### Cleanup

1. **Remove old images**
   ```bash
   docker image prune -a --filter "until=720h"
   ```

2. **Archive logs**
   ```bash
   # Compress old logs
   # Move to long-term storage
   ```

3. **Update documentation**
   - Update deployment guide if changed
   - Document any manual steps taken
   - Update runbook based on issues

---

## Emergency Procedures

### Production is Down

**Immediate Actions:**
```
1. STOP - Don't panic
2. NOTIFY - Alert team in #incidents channel
3. ASSESS - What's the status?
   - Is database responsive?
   - Are services running?
   - What do logs say?
4. TRIAGE - Severity:
   - P1 (Critical): Immediate rollback
   - P2 (High): Attempt fix
   - P3 (Medium): Schedule maintenance
```

### Critical Security Issue

```
1. STOP active deployment
2. REVERT latest changes
3. Hotfix security issue
4. Deploy fixed version
5. Review logs for breach
6. Notify security team
```

### Data Corruption Detected

```
1. STOP writes to database
2. Use read-only replicas only
3. Restore from backup
4. Investigate root cause
5. Prevent recurrence
6. Audit affected data
```

---

## Success Criteria Checklist

After each deployment, verify:

- [ ] All status checks green
- [ ] All health endpoints respond 200
- [ ] Frontend loads without console errors
- [ ] Can create and place bets
- [ ] WebSocket updates work
- [ ] Database queries responsive (<100ms)
- [ ] No spike in error rates
- [ ] No memory leaks in monitoring
- [ ] API response times normal
- [ ] No degradation vs previous deployment

---

## Related Documentation

- [CI/CD Pipeline Guide](./GITHUB_ACTIONS_CI_CD.md)
- [CI/CD Quick Reference](./CI_CD_QUICK_REFERENCE.md)
- [Architecture Overview](./architecture.md)
- [Observability Guide](./observability.md)
- [Contributing Guide](../CONTRIBUTING.md)

