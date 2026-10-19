# Deployment Files Guide

Quick reference to all blue-green deployment files and where to find them.

## File Locations

### Infrastructure Configuration

```
docker-compose.blue-green.yml          Main compose file with dual environments
├── postgres                           Shared database
├── redis                              Shared cache
├── nginx                              Reverse proxy router
├── backend-blue / backend-green       API services
├── indexer-blue / indexer-green       Indexer services
└── frontend-blue / frontend-green     Web app services
```

### Deployment Scripts

```
deployment/
├── deploy.sh                          Main deployment script
│   └── Commands: deploy, switch, status, health, verify, rollback
├── rollback.sh                        Emergency rollback script
│   └── Commands: standard, --force, --verbose
├── test-deployment.sh                 Test verification suite
│   └── 11 tests covering all components
├── nginx.conf                         Reverse proxy configuration
└── upstream.conf                      Upstream pool definitions
```

### Documentation

```
BLUE_GREEN_DEPLOYMENT.md              Complete strategy guide (560 lines)
DEPLOYMENT_RUNBOOK.md                 Operations procedures (466 lines)
DEPLOYMENT_QUICK_START.md             Getting started guide (276 lines)
DEPLOYMENT_IMPLEMENTATION_SUMMARY.md  Implementation summary
DEPLOYMENT_FILES.md                   This file
```

## Quick Access

### View Documentation

```bash
# Complete guide
cat BLUE_GREEN_DEPLOYMENT.md

# Operations procedures
cat DEPLOYMENT_RUNBOOK.md

# Quick start
cat DEPLOYMENT_QUICK_START.md

# Implementation details
cat DEPLOYMENT_IMPLEMENTATION_SUMMARY.md
```

### Run Scripts

```bash
# Check deployment status
./deployment/deploy.sh status

# Deploy to inactive environment
./deployment/deploy.sh deploy

# Switch traffic
./deployment/deploy.sh switch

# Rollback
./deployment/rollback.sh

# Run tests
./deployment/test-deployment.sh
```

### View Configurations

```bash
# Main infrastructure
cat docker-compose.blue-green.yml

# Nginx reverse proxy
cat deployment/nginx.conf

# Upstream definitions
cat deployment/upstream.conf
```

## File Sizes

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| docker-compose.blue-green.yml | 6.8K | 264 | Infrastructure definition |
| deployment/nginx.conf | 3.3K | 103 | Reverse proxy config |
| deployment/upstream.conf | 1.8K | 67 | Upstream pool definitions |
| deployment/deploy.sh | 9.7K | 349 | Deployment script |
| deployment/rollback.sh | 7.4K | 291 | Rollback script |
| deployment/test-deployment.sh | 11K | 407 | Test suite |
| BLUE_GREEN_DEPLOYMENT.md | 15K | 560 | Strategy guide |
| DEPLOYMENT_RUNBOOK.md | 11K | 466 | Operations guide |
| DEPLOYMENT_QUICK_START.md | 5.9K | 276 | Quick start |

**Total**: ~74KB of configuration and scripts

## Dependencies

### Required
- Docker
- Docker Compose
- Bash shell

### Optional
- Nginx (for local validation)
- curl (for testing)

## Environment Variables

Used by deployment scripts:

```
ACTIVE_ENV              Current active environment (blue/green)
COMPOSE_FILE            Path to docker-compose file
PROJECT_DIR             Root project directory
HEALTH_CHECK_RETRIES    Max health check attempts (default: 30)
HEALTH_CHECK_INTERVAL   Seconds between checks (default: 2)
TRAFFIC_SWITCH_PAUSE    Pause before switching traffic (default: 5)
```

## Port Mapping Reference

### Blue Environment Ports
- Frontend: 3000
- Backend: 3001
- Indexer: 3002

### Green Environment Ports
- Frontend: 3010
- Backend: 3011
- Indexer: 3012

### Shared Infrastructure Ports
- PostgreSQL: 5432
- Redis: 6379
- Nginx: 80 / 443

## Start Here

### For Deployment:
1. Read: `DEPLOYMENT_QUICK_START.md` (5 minutes)
2. Run: `./deployment/test-deployment.sh` (verify setup)
3. Execute: `./deployment/deploy.sh deploy` (deploy)
4. Execute: `./deployment/deploy.sh switch` (go live)

### For Operations:
1. Read: `DEPLOYMENT_RUNBOOK.md` (reference during deployment)
2. Follow: Step-by-step procedures
3. Use: Scenario guides for common issues

### For Deep Understanding:
1. Read: `BLUE_GREEN_DEPLOYMENT.md` (complete strategy)
2. Study: Architecture diagrams
3. Review: Advanced topics and best practices

### For Developers:
1. Understand: How blue-green works
2. Integrate: Scripts into CI/CD
3. Customize: Scripts for your needs

## Testing

```bash
# Run all tests
./deployment/test-deployment.sh

# Run tests with verbose output
./deployment/test-deployment.sh --verbose

# Expected output: 11/11 tests passing
```

## Troubleshooting

Check these files in order:

1. `DEPLOYMENT_RUNBOOK.md` - Troubleshooting section
2. `BLUE_GREEN_DEPLOYMENT.md` - Common issues and solutions
3. Script output - Run with `--verbose` flag
4. Docker logs - `docker compose logs -f`

## Backup Files

Created during deployment:

```
.deployment-backups/
└── state-{timestamp}.json        Deployment state backup
```

Location: `.deployment-backups/` in project root

Contains:
- Timestamp of backup
- Date in ISO format
- Active environment at time of backup
- Inactive environment at time of backup

## Integration Points

### CI/CD Integration

Add to your pipeline:

```yaml
# Deploy stage
- ./deployment/deploy.sh deploy

# Test stage
- ./deployment/test-deployment.sh

# Switch stage (manual approval)
- ./deployment/deploy.sh switch
```

### Monitoring Integration

Points to monitor:

```bash
# Health endpoint
curl http://localhost/health

# Status endpoint
curl http://localhost/status

# Service health
./deployment/deploy.sh health
```

### Backup Integration

Run before deployment:

```bash
# Database backup
docker compose -f docker-compose.blue-green.yml exec -T postgres \
  pg_dump -U bankerchanger bankerchanger > backup.sql
```

## Customization

To customize for your setup:

1. **Environment variables**: Edit `.env` files in backend/, indexer/, frontend/
2. **Ports**: Modify docker-compose.blue-green.yml port mappings
3. **Health checks**: Add custom endpoints to healthcheck sections
4. **Nginx routing**: Edit deployment/nginx.conf for custom paths
5. **Scripts**: Modify deployment/deploy.sh and rollback.sh as needed

## Support Resources

### Documentation
- Strategy: `BLUE_GREEN_DEPLOYMENT.md`
- Operations: `DEPLOYMENT_RUNBOOK.md`
- Quick start: `DEPLOYMENT_QUICK_START.md`

### Scripts
- Deploy: `./deployment/deploy.sh -h`
- Rollback: `./deployment/rollback.sh -h`
- Test: `./deployment/test-deployment.sh --help`

### Commands
- Status: `./deployment/deploy.sh status`
- Health: `./deployment/deploy.sh health`
- Logs: `docker compose -f docker-compose.blue-green.yml logs -f`

---

**Last Updated**: October 16, 2024  
**Version**: 1.0  
**Status**: ✅ Complete and tested
