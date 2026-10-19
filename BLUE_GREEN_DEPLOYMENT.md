# Zero-Downtime Blue-Green Deployment Strategy

## Overview

This document describes the zero-downtime blue-green deployment infrastructure for StellarFox. The strategy enables deploying new versions without downtime by maintaining two identical production environments (blue and green) and switching traffic between them.

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                      │
│                    (Traffic Router)                          │
└────────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │  API    │    │ Indexer │    │Frontend │
   │ (3001)  │    │ (3002)  │    │ (3000)  │
   └────┬────┘    └────┬────┘    └────┬────┘
        │              │              │
        │         BLUE ENVIRONMENT    │
        │         (Active/Staging)    │
        │              │              │
        │         [Shared DB/Cache]   │
        │              │              │
        │         GREEN ENVIRONMENT   │
        │         (Standby/New)       │
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │  API    │    │ Indexer │    │Frontend │
   │ (3011)  │    │ (3012)  │    │ (3010)  │
   └─────────┘    └─────────┘    └─────────┘
```

### Environment Structure

| Component | Blue Ports | Green Ports | Shared |
|-----------|-----------|-----------|---------|
| Frontend | 3000 | 3010 | ❌ |
| Backend API | 3001 | 3011 | ❌ |
| Indexer | 3002 | 3012 | ❌ |
| PostgreSQL | — | — | ✅ (5432) |
| Redis | — | — | ✅ (6379) |
| Nginx | — | — | ✅ (80/443) |

### Key Features

- **Zero Downtime**: Traffic switches instantly between environments
- **Data Consistency**: Shared database ensures no data loss
- **Quick Rollback**: One command to revert to previous version
- **Health Checks**: Automatic verification before traffic switch
- **Independent Scaling**: Each environment can scale separately
- **Complete Isolation**: Services run independently until traffic switch

## Deployment Configuration

### Files Overview

```
deployment/
├── docker-compose.blue-green.yml   # Dual-environment compose file
├── nginx.conf                      # Reverse proxy configuration
├── upstream.conf                   # Dynamic upstream definitions
├── deploy.sh                       # Main deployment script
├── rollback.sh                     # Rollback procedure
└── test-deployment.sh              # Verification test suite
```

### Docker Compose Configuration

The `docker-compose.blue-green.yml` file defines:

- **Dual application stacks**: backend-blue/green, indexer-blue/green, frontend-blue/green
- **Shared infrastructure**: postgres, redis, nginx
- **Health checks**: HTTP endpoints on /health for all services
- **Network isolation**: All services on a shared bridge network
- **Volume management**: Separate indexer data volumes per environment

### Nginx Configuration

The reverse proxy (`nginx.conf`) provides:

- **Traffic routing**: Routes requests to active environment
- **WebSocket support**: Passes through WebSocket connections
- **Health endpoint**: `/health` endpoint for monitoring
- **API routing**: `/api` paths to backend
- **Status endpoint**: `/status` returns active environment

## Usage

### Prerequisites

1. Docker and Docker Compose installed
2. Environment files configured (`.env` files in backend/, indexer/, frontend/)
3. All services built or able to build from Dockerfile

### Initial Setup

```bash
# Verify deployment configuration
cd /workspaces/StellarFox
./deployment/test-deployment.sh

# Start both environments
docker compose -f docker-compose.blue-green.yml up -d
```

### Standard Deployment Workflow

#### 1. Deploy to Inactive Environment

```bash
./deployment/deploy.sh deploy
```

This will:
- Identify the inactive environment (e.g., green if blue is active)
- Build images for the inactive environment
- Start all services in the inactive environment
- Run health checks on all services
- Wait for verification (does NOT switch traffic)

#### 2. Verify the Deployment

```bash
# Check logs
docker compose -f docker-compose.blue-green.yml logs backend-green

# Test the inactive environment
curl http://localhost:3011/health  # If green is inactive

# Test specific features
# Run your integration tests against the new environment
```

#### 3. Switch Traffic

Once verified, switch traffic to the new environment:

```bash
./deployment/deploy.sh switch
```

This will:
- Verify target environment is healthy
- Update Nginx configuration
- Route all traffic to the new environment
- Return to previous environment if the switch fails

#### 4. Verification

```bash
./deployment/deploy.sh status
```

### Automated Deployment

For automated deployments that skip manual verification:

```bash
./deployment/deploy.sh deploy --auto-switch
```

This combines deployment and traffic switch in one command.

## Rollback Procedure

### Quick Rollback

If issues are detected after deployment:

```bash
./deployment/rollback.sh
```

This will:
- Save current deployment state to `.deployment-backups/`
- Validate target environment
- Switch traffic back to previous environment
- Verify rollback completed

### Emergency Rollback

For critical failures, skip validation:

```bash
./deployment/rollback.sh --force
```

### Verbose Rollback

For debugging rollback issues:

```bash
./deployment/rollback.sh --verbose
```

## Monitoring and Troubleshooting

### Check Deployment Status

```bash
./deployment/deploy.sh status
```

Shows:
- Currently active environment
- Service status for all containers
- Port assignments

### Health Checks

```bash
./deployment/deploy.sh health
```

Tests all services in both environments:
- Backend API health endpoint
- Frontend availability
- Indexer status

### View Logs

```bash
# Current active environment
docker compose -f docker-compose.blue-green.yml logs -f nginx backend-blue frontend-blue

# Inactive environment
docker compose -f docker-compose.blue-green.yml logs -f backend-green frontend-green indexer-green

# Specific service
docker compose -f docker-compose.blue-green.yml logs -f backend-blue
```

### Common Issues

#### Traffic Not Switching

**Problem**: `./deployment/deploy.sh switch` completes but traffic isn't routed to new environment.

**Solution**:
```bash
# Restart nginx to apply routing changes
docker compose -f docker-compose.blue-green.yml up -d --no-deps nginx

# Verify with status
./deployment/deploy.sh status
```

#### Service Health Check Fails

**Problem**: Deployment stops because health checks fail.

**Solution**:
```bash
# Check service logs
docker compose -f docker-compose.blue-green.yml logs backend-green

# Verify database connectivity
docker compose -f docker-compose.blue-green.yml exec backend-green \
  sh -c 'curl -s http://localhost:3001/health'

# If database issue, ensure postgres is healthy
docker compose -f docker-compose.blue-green.yml logs postgres
```

#### Stuck in Previous Environment

**Problem**: After rollback, traffic is still going to new environment.

**Solution**:
```bash
# Force rollback with debugging
./deployment/rollback.sh --force --verbose

# If still stuck, manually switch
docker compose -f docker-compose.blue-green.yml up -d --no-deps \
  -e "ACTIVE_ENV=blue" nginx
```

## Port Mapping Reference

### Blue Environment (Currently Active Example)

- Frontend: `localhost:3000` → container port 3000
- Backend API: `localhost:3001` → container port 3001
- Indexer: `localhost:3002` → container port 3002

### Green Environment (Staging Example)

- Frontend: `localhost:3010` → container port 3000
- Backend API: `localhost:3011` → container port 3001
- Indexer: `localhost:3012` → container port 3002

### Shared Infrastructure

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Nginx (proxy): `localhost:80` (or `localhost:443` for HTTPS)

## Testing

### Run All Tests

```bash
./deployment/test-deployment.sh
```

### Run Specific Tests

```bash
./deployment/test-deployment.sh --verbose

# Individual test categories
./deployment/test-deployment.sh config_files
./deployment/test-deployment.sh dual_env
./deployment/test-deployment.sh scripts
```

### Test Coverage

The test suite verifies:

1. **Configuration Files**
   - All required files exist
   - Docker Compose config is valid

2. **Deployment Strategy**
   - Blue and green environments are defined
   - Shared infrastructure configured
   - Upstream pools for traffic routing
   - Port mapping strategy
   - Health checks present
   - Network configuration
   - Volume configuration

3. **Tooling**
   - Scripts are executable
   - Scripts have help documentation

## Best Practices

### Before Deployment

1. **Test on a staging environment first**
   ```bash
   # Run tests on the green environment before switching
   ./deployment/deploy.sh deploy
   # (test thoroughly)
   ./deployment/deploy.sh switch
   ```

2. **Backup important data**
   ```bash
   # Backup database
   docker compose -f docker-compose.blue-green.yml exec -T postgres \
     pg_dump -U bankerchanger bankerchanger > backup.sql
   ```

3. **Monitor logs during deployment**
   ```bash
   # In one terminal
   ./deployment/deploy.sh deploy
   
   # In another terminal
   docker compose -f docker-compose.blue-green.yml logs -f
   ```

### During Deployment

1. **Watch for errors**
   - Monitor application logs
   - Track error rates
   - Check database connections

2. **Have a rollback plan**
   - Know the rollback command
   - Have backups ready
   - Communicate with team

### After Deployment

1. **Verify functionality**
   ```bash
   # Test critical paths
   curl http://localhost/api/health
   
   # Monitor error rates
   # Check user reports
   ```

2. **Keep previous environment running**
   - Don't stop the old environment immediately
   - Wait 1-2 hours to confirm stability
   - Then gracefully stop old environment

3. **Document the deployment**
   - Record what changed
   - Note any issues encountered
   - Update deployment logs

## Advanced Topics

### Multi-Region Deployment

For multi-region deployments, replicate this setup in each region:

1. Each region has its own blue-green pair
2. Global load balancer routes to active regions
3. Database replication between regions
4. Independent rollback per region

### Coordinating with CI/CD

Integration with CI/CD pipeline:

```yaml
# Example CI/CD pipeline
stages:
  - test
  - deploy
  - verify
  - switch

deploy:
  stage: deploy
  script:
    - ./deployment/deploy.sh deploy
  only:
    - main

verify:
  stage: verify
  script:
    - ./deployment/test-deployment.sh
    - # run integration tests
  only:
    - main

switch:
  stage: switch
  script:
    - ./deployment/deploy.sh switch
  when: manual
  only:
    - main
```

### Custom Health Checks

Extend health checks by modifying `docker-compose.blue-green.yml`:

```yaml
backend-blue:
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:3001/api/health']
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 20s
```

### Scaling Individual Environments

Scale specific environment:

```bash
# Scale green environment
docker compose -f docker-compose.blue-green.yml up -d \
  --scale backend-green=3

# Verify scaling
docker compose -f docker-compose.blue-green.yml ps
```

## Security Considerations

1. **Network Isolation**
   - Services communicate over internal bridge network
   - Only Nginx exposes ports to host

2. **Secrets Management**
   - Use `.env` files (not committed to git)
   - Rotate secrets regularly
   - Consider using Docker secrets for production

3. **Traffic Encryption**
   - Configure HTTPS in Nginx for production
   - Use SSL/TLS certificates
   - Enable HSTS headers

## Performance Considerations

1. **Startup Time**
   - Health checks have 10s interval + 10s startup period
   - Total time to ready: ~20-30 seconds per service
   - Plan deployments accordingly

2. **Resource Usage**
   - Both environments consume resources
   - Plan for 2x resource usage during deployment
   - Scale down old environment after switch

3. **Database Connections**
   - Shared database handles connections from both environments
   - Set appropriate connection pool limits
   - Monitor for connection leaks

## Troubleshooting Scripts

### Debug Deployment Script

Add these to `~/.bashrc` for quick troubleshooting:

```bash
alias bg-status='cd /workspaces/StellarFox && ./deployment/deploy.sh status'
alias bg-health='cd /workspaces/StellarFox && ./deployment/deploy.sh health'
alias bg-logs='docker compose -f docker-compose.blue-green.yml logs -f'
alias bg-deploy='cd /workspaces/StellarFox && ./deployment/deploy.sh deploy'
alias bg-switch='cd /workspaces/StellarFox && ./deployment/deploy.sh switch'
alias bg-rollback='cd /workspaces/StellarFox && ./deployment/rollback.sh'
```

## Support and Debugging

For issues, collect the following information:

1. Status output:
   ```bash
   ./deployment/deploy.sh status > status.txt
   ```

2. Logs from all services:
   ```bash
   docker compose -f docker-compose.blue-green.yml logs > all-logs.txt
   ```

3. Docker info:
   ```bash
   docker ps -a > containers.txt
   docker network ls > networks.txt
   ```

4. Test results:
   ```bash
   ./deployment/test-deployment.sh > tests.txt
   ```

Include these outputs when reporting issues.

## Conclusion

The blue-green deployment strategy provides a robust, zero-downtime deployment mechanism for StellarFox. By following this guide, you can confidently deploy new versions while maintaining service availability.

For questions or issues, refer to the troubleshooting section or check the logs from individual services.
