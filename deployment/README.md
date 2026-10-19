# Deployment Directory

Blue-green deployment infrastructure and tooling for zero-downtime deployments.

## Quick Links

### 🚀 Getting Started
- **New to blue-green deployments?** Start here: [DEPLOYMENT_QUICK_START.md](../DEPLOYMENT_QUICK_START.md)
- **Operating deployments?** Use: [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md)
- **Want deep knowledge?** Read: [BLUE_GREEN_DEPLOYMENT.md](../BLUE_GREEN_DEPLOYMENT.md)

### 📋 Files in This Directory

#### Executable Scripts
- **`deploy.sh`** (349 lines) - Main deployment orchestration
  - Usage: `./deploy.sh deploy|switch|status|health|verify|rollback`
  - Help: `./deploy.sh -h`

- **`rollback.sh`** (291 lines) - Rollback procedures
  - Usage: `./rollback.sh [--force] [--verbose]`
  - Help: `./rollback.sh -h`

- **`test-deployment.sh`** (407 lines) - Automated test suite (11 tests)
  - Usage: `./test-deployment.sh [--verbose]`
  - Expected: 11/11 tests passing

#### Configuration Files
- **`nginx.conf`** (103 lines) - Nginx reverse proxy configuration
  - Provides dynamic routing between blue/green environments
  - No reload required for traffic switching

- **`upstream.conf`** (67 lines) - Upstream pool definitions
  - Defines backend_blue, backend_green, indexer_blue, indexer_green, etc.
  - Used by nginx.conf for dynamic routing

## Common Commands

### Check Deployment Status
```bash
./deploy.sh status
```

### Deploy to Inactive Environment
```bash
./deploy.sh deploy
# Wait for health checks and testing
```

### Switch Traffic After Testing
```bash
./deploy.sh switch
```

### Emergency Rollback
```bash
./rollback.sh --force
```

### Run Tests
```bash
./test-deployment.sh
```

### View Help
```bash
./deploy.sh -h
./rollback.sh -h
./test-deployment.sh --help
```

## Full Deployment Workflow

1. **Prepare**
   ```bash
   git pull origin main
   docker compose -f docker-compose.blue-green.yml build
   ```

2. **Deploy to Inactive**
   ```bash
   ./deploy.sh deploy
   # Wait for health checks
   ```

3. **Test**
   ```bash
   # Test the inactive environment
   curl http://localhost:3011/api/health  # if green is inactive
   # Run integration tests
   ./tests/smoke-test.sh
   ```

4. **Switch Traffic**
   ```bash
   ./deploy.sh switch
   ```

5. **Verify**
   ```bash
   ./deploy.sh health
   docker compose logs -f
   ```

## Port Reference

| Service | Blue | Green |
|---------|------|-------|
| Frontend | 3000 | 3010 |
| Backend | 3001 | 3011 |
| Indexer | 3002 | 3012 |
| Database | 5432 (shared) |
| Cache | 6379 (shared) |
| Nginx | 80/443 (shared) |

## Architecture

```
┌─────────────────────┐
│   Nginx Proxy       │
│  (80/443, Routing)  │
└──────────┬──────────┘
           │
      ┌────┴────┐
      │          │
  ┌───▼──┐   ┌──▼───┐
  │ Blue │   │Green │
  └─┬──┬─┘   └──┬──┬─┘
    │  │        │  │
   API API     API API
  3001 3000  3011 3010
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker compose -f ../docker-compose.blue-green.yml logs

# Common issues:
# 1. Missing .env files - copy .env.example
# 2. Ports in use - check other services
# 3. Database not ready - wait a few seconds
```

### Can't test inactive environment
```bash
# Find which environment is active
./deploy.sh status

# If blue is active, green is inactive
# Test green on ports 3010-3012
curl http://localhost:3011/api/health
```

### Deployment takes too long
```bash
# Health checks take 20-30 seconds
# Database migrations may take additional time
# Check logs for specific delays
docker compose logs backend-green
```

## Integration Points

### CI/CD Pipeline
```yaml
deploy:
  script: ./deployment/deploy.sh deploy

verify:
  script: ./deployment/test-deployment.sh

switch:
  script: ./deployment/deploy.sh switch
  when: manual
```

### Monitoring
```bash
# Health checks
./deploy.sh health

# Status
./deploy.sh status

# Logs
docker compose logs -f
```

### Backups
```bash
# Database backup before deployment
docker compose exec -T postgres \
  pg_dump -U bankerchanger bankerchanger > backup.sql

# Automatic state backup
# Saved to: ../.deployment-backups/state-{timestamp}.json
```

## Documentation

- **Architecture & Strategy**: [BLUE_GREEN_DEPLOYMENT.md](../BLUE_GREEN_DEPLOYMENT.md)
- **Operations Guide**: [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md)  
- **Quick Start**: [DEPLOYMENT_QUICK_START.md](../DEPLOYMENT_QUICK_START.md)
- **Implementation Summary**: [DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](../DEPLOYMENT_IMPLEMENTATION_SUMMARY.md)
- **File Reference**: [DEPLOYMENT_FILES.md](../DEPLOYMENT_FILES.md)

## Support

For detailed information about any command:
```bash
./deploy.sh -h
./rollback.sh -h
./test-deployment.sh --help
```

## Key Features

✅ Zero downtime deployments
✅ Instant traffic switching
✅ Quick rollback (< 10 seconds)
✅ Automated health checks
✅ Complete test suite
✅ State tracking and backups
✅ Emergency procedures

## Performance

- Deploy: 10-15 minutes
- Switch: < 5 seconds
- Rollback: < 10 seconds
- Emergency rollback: < 5 seconds

---

**Ready to deploy?** Start with [DEPLOYMENT_QUICK_START.md](../DEPLOYMENT_QUICK_START.md)

**Need to operate?** Use [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md)

**Want to understand it all?** Read [BLUE_GREEN_DEPLOYMENT.md](../BLUE_GREEN_DEPLOYMENT.md)
