# Blue-Green Deployment Operational Runbook

Quick reference guide for operating zero-downtime deployments.

## Emergency Contacts

- On-call DevOps: [contact info]
- Release Manager: [contact info]
- Database Team: [contact info]

## Quick Commands

### Check Deployment Status
```bash
./deployment/deploy.sh status
```

### Deploy New Version
```bash
# Standard deployment (manual verification before switch)
./deployment/deploy.sh deploy

# Automated deployment (includes traffic switch)
./deployment/deploy.sh deploy --auto-switch
```

### Switch Traffic
```bash
./deployment/deploy.sh switch
```

### Rollback to Previous Version
```bash
# Standard rollback (with verification)
./deployment/rollback.sh

# Emergency rollback (skip verification)
./deployment/rollback.sh --force
```

### Check Health
```bash
./deployment/deploy.sh health
```

## Deployment Checklist

Before starting deployment:

- [ ] Verify all tests pass: `./deployment/test-deployment.sh`
- [ ] Backup database: `docker compose -f docker-compose.blue-green.yml exec -T postgres pg_dump -U bankerchanger bankerchanger > backup-$(date +%s).sql`
- [ ] Alert team: Post to #deployments channel
- [ ] Check system resources: `docker stats`
- [ ] Verify both environments are running: `./deployment/deploy.sh status`

## Standard Deployment Procedure

### 1. Prepare (5 min)
```bash
cd /workspaces/StellarFox

# Verify configuration
./deployment/test-deployment.sh

# Pull latest code
git pull origin main

# Build new images
docker compose -f docker-compose.blue-green.yml build
```

### 2. Deploy to Inactive (10 min)
```bash
# Deploy to inactive environment
./deployment/deploy.sh deploy

# Wait for health checks to complete (watch the output)
```

### 3. Test (10-30 min)
```bash
# Identify inactive environment
INACTIVE=$(docker compose -f docker-compose.blue-green.yml ps | grep -E 'green|blue' | grep 'Up' | head -1 | awk '{print $1}')

# Test inactive environment
curl http://localhost:3011/health    # Adjust port if green is active
curl http://localhost:3010            # Frontend

# Run smoke tests
./tests/smoke-test.sh  # If this exists

# Monitor logs for errors
docker compose -f docker-compose.blue-green.yml logs -f
```

### 4. Switch Traffic (1 min)
```bash
# When ready to switch
./deployment/deploy.sh switch

# Verify switch
curl http://localhost/status
```

### 5. Post-Deployment (5 min)
```bash
# Monitor new environment
./deployment/deploy.sh health

# Watch logs for errors
docker compose -f docker-compose.blue-green.yml logs -f

# Monitor metrics (if available)
# Check error rates, latency, resource usage
```

### 6. Cleanup (after 2 hours)
```bash
# Once new environment is stable, optionally recycle old environment
# Keep old environment running for quick rollback availability
```

## Common Scenarios

### Scenario 1: Deploy fails health checks

**Problem**: Deployment to green fails because services aren't healthy

**Action**:
```bash
# 1. Check what went wrong
docker compose -f docker-compose.blue-green.yml logs backend-green

# 2. Fix the issue (code fix, config, database migration, etc.)

# 3. Try deployment again
./deployment/deploy.sh deploy
```

### Scenario 2: Tests pass but production behaves differently

**Problem**: Inactive environment tests pass, but after switch, users report issues

**Action**:
```bash
# 1. Immediate rollback
./deployment/rollback.sh

# 2. Investigation
docker compose -f docker-compose.blue-green.yml logs backend-blue > investigation.log

# 3. Debug and fix
# - Check database state
# - Review configuration differences
# - Check third-party API connectivity

# 4. Deploy again after fix
./deployment/deploy.sh deploy
```

### Scenario 3: Database migration fails

**Problem**: Deployment gets stuck waiting for database migrations

**Action**:
```bash
# 1. Check migration status
docker compose -f docker-compose.blue-green.yml exec -T backend-green \
  sh -c 'npm run migrate:check'

# 2. Investigate migration
docker compose -f docker-compose.blue-green.yml logs backend-green

# 3. Options:
#    a) Fix migration and restart container
docker compose -f docker-compose.blue-green.yml restart backend-green

#    b) Or rollback and fix migration
./deployment/rollback.sh

# 4. Retry deployment
./deployment/deploy.sh deploy
```

### Scenario 4: Need to rollback immediately

**Problem**: Critical issue in production requires immediate rollback

**Action**:
```bash
# 1. Emergency rollback (skip health checks)
./deployment/rollback.sh --force

# 2. Monitor old environment
./deployment/deploy.sh health

# 3. Post-incident:
#    - Investigate what went wrong
#    - Fix the issue
#    - Re-deploy with fix
```

### Scenario 5: One service fails but others are OK

**Problem**: Backend is healthy but indexer is having issues

**Action**:
```bash
# 1. Check indexer status
docker compose -f docker-compose.blue-green.yml ps indexer-green
docker compose -f docker-compose.blue-green.yml logs indexer-green

# 2. Restart just that service
docker compose -f docker-compose.blue-green.yml restart indexer-green

# 3. Re-run health check
./deployment/deploy.sh health

# 4. If still fails:
./deployment/rollback.sh --force
```

## Monitoring During Deployment

### Metrics to Watch

- **Error Rate**: Should remain < 0.1% during switch
- **Latency**: p95 latency should not increase > 10%
- **Database Connections**: Should be stable
- **Memory Usage**: Should not exceed 80% on hosts
- **Disk Space**: Should have > 10% free

### Commands to Run

```bash
# Terminal 1: Watch service status
watch -n 2 'docker compose -f docker-compose.blue-green.yml ps'

# Terminal 2: Watch logs
docker compose -f docker-compose.blue-green.yml logs -f

# Terminal 3: Monitor resources
docker stats

# Terminal 4: Health monitoring
while true; do
  echo "$(date): $(curl -s http://localhost/status)"
  sleep 5
done
```

## Rollback Decision Tree

```
Is there a critical production issue?
├─ YES → Is rollback the right solution?
│  ├─ YES → ./deployment/rollback.sh --force
│  └─ NO → Fix the issue without rollback
└─ NO → Investigate further
        │
        ├─ Issue in new deployment?
        │  └─ YES → ./deployment/rollback.sh
        └─ Issue elsewhere?
           └─ NO → Continue monitoring
```

## Database Backup Before Deployment

Always backup before deployment:

```bash
# Full database backup
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  pg_dump -U bankerchanger bankerchanger > backup-$(date +%Y%m%d-%H%M%S).sql

# Backup size
ls -lh backup-*.sql

# Test restore (optional)
# pg_restore -U bankerchanger -d bankerchanger_test < backup-file.sql
```

## Post-Deployment Verification

After switching, verify these items:

### Functional Tests
- [ ] User login works
- [ ] Key API endpoints responding
- [ ] Database queries return correct data
- [ ] File uploads work
- [ ] External integrations working
- [ ] WebSocket connections stable

### System Checks
- [ ] No error spikes in logs
- [ ] Database connections normal
- [ ] Memory/CPU stable
- [ ] Disk space sufficient
- [ ] Network connectivity good

### Monitoring Checks
- [ ] Application metrics normal
- [ ] Database metrics normal
- [ ] Error rates normal
- [ ] Latency normal
- [ ] Throughput normal

## Troubleshooting

### Service won't start

```bash
# Check logs
docker compose -f docker-compose.blue-green.yml logs backend-green

# Common issues:
# - Port already in use
# - Database not ready
# - Configuration error
# - Image build failure

# Solution steps:
docker compose -f docker-compose.blue-green.yml up -d backend-green
sleep 5
docker compose -f docker-compose.blue-green.yml logs backend-green
```

### Traffic not routing correctly

```bash
# Check nginx status
docker compose -f docker-compose.blue-green.yml exec nginx \
  sh -c 'curl -s http://localhost/status'

# Check nginx config
docker compose -f docker-compose.blue-green.yml exec nginx \
  nginx -t

# Restart nginx
docker compose -f docker-compose.blue-green.yml restart nginx
```

### Database connection issues

```bash
# Check database health
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  pg_isready -U bankerchanger

# Check connections
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  sh -c 'psql -U bankerchanger -c "SELECT * FROM pg_stat_connections"'

# If too many connections, scale down old environment
docker compose -f docker-compose.blue-green.yml down --remove-orphans
```

## Escalation Path

1. **Problem**: Issue detected in new deployment
   - Action: Rollback immediately
   - Owner: On-call DevOps

2. **Investigation**: Determine root cause
   - Owner: Release Manager + team
   - Time: 30 minutes

3. **Fix**: Implement fix and test
   - Owner: Engineering team
   - Time: 1-2 hours

4. **Re-deploy**: Deploy fix to production
   - Owner: Release Manager
   - Time: 10-30 minutes

5. **Post-Incident**: Review what happened
   - Owner: Team lead
   - Time: Next business day

## Communication Template

### Deployment Starting
```
🚀 Starting deployment of [version/feature]

Inactive environment: [blue/green]
Estimated duration: 30 minutes
Status: Deploying...

Will notify when traffic is switched.
```

### Deployment Complete
```
✅ Deployment complete - version [version] is now live

What changed:
- [key change 1]
- [key change 2]

Metrics:
- Error rate: 0.05% (normal)
- Latency: 120ms p95 (normal)
- All services healthy

No action needed. Will monitor for next 2 hours.
```

### Rollback Executed
```
⚠️ Rollback initiated - returned to version [previous-version]

Reason: [brief explanation]

Investigation ongoing. Details in #incidents channel.

Sorry for the disruption!
```

## Contact and Escalation

For deployment issues:

1. **Tier 1**: Check logs and runbook
   - `docker compose logs -f`
   - Check `/workspaces/StellarFox/BLUE_GREEN_DEPLOYMENT.md`

2. **Tier 2**: Consult deployment scripts help
   - `./deployment/deploy.sh -h`
   - `./deployment/rollback.sh -h`

3. **Tier 3**: Page on-call DevOps
   - Run: `./deployment/rollback.sh --force` (emergency)
   - Call: [on-call number]

4. **Tier 4**: Escalate to engineering team
   - Inform: #incidents channel
   - Page: Team lead if not responding

## Deployment Success Criteria

✅ Deployment succeeded if:

- [x] All services in new environment are healthy
- [x] Traffic successfully switched with no user impact
- [x] Error rate remains below 0.1%
- [x] Latency remains stable (within 10% of baseline)
- [x] All automated tests pass
- [x] No critical alerts triggered
- [x] Manual verification tests pass

❌ Rollback if:

- [ ] Any service fails health check
- [ ] Significant error rate increase
- [ ] User-facing feature breaks
- [ ] Database issues detected
- [ ] Critical alert triggered
- [ ] Manual verification fails

---

**Last updated**: 2024-10-16  
**Version**: 1.0  
**Owner**: DevOps Team
