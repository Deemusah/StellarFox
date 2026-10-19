# Troubleshooting Guide

This guide covers common issues encountered when deploying and running the BANKERCHANGER platform, along with their solutions.

## Container Deployment Issues

### Frontend Service Fails to Build

**Symptom:** 
```
=> ERROR: failed to solve: failed to read dockerfile: open /path/to/StellarFox/frontend/Dockerfile: no such file or directory
```

**Cause:** The `frontend` service in `docker-compose.yml` expects a `Dockerfile` in the `./frontend` directory, but none exists.

**Solution:** 
The frontend is intended to be run in development mode using the override file which mounts the source code and runs `npm run dev`. For production-like builds, a Dockerfile must be added or the compose file overridden.

**Workaround:** Use the development override:
```bash
docker compose up   # Uses docker-compose.override.yml which mounts source and runs dev command
```

Alternatively, create a `Dockerfile` in the frontend directory (see example below) or extend the compose file.

### Backend or Indexer Container Fails to Start

**Symptom:** Container exits immediately after starting, or logs show connection errors.

**Common Causes:**
1. **Environment variables not set** - Missing or incorrect values in `.env` files.
2. **Database/Redis not ready** - Service starts before dependencies are healthy.
3. **Port conflicts** - Another process is using the configured port.

**Solutions:**
1. Check the container logs:
   ```bash
   docker compose logs backend
   docker compose logs indexer
   ```
2. Verify environment files exist and have correct values.
3. Ensure PostgreSQL and Redis are healthy:
   ```bash
   docker compose exec postgres pg_isready -U bankerchanger
   docker compose exec redis redis-cli ping
   ```
4. Change ports in `.env` files if conflicts exist.

### Health Check Failures

**Symptom:** Docker shows `health: starting` or `health: unhealthy` for a service.

**Backend Health Check:**
The backend health check attempts to GET `http://localhost:3001/health`. If the backend is not listening on port 3001 inside the container, or the route is not available, the check fails.

**Verify:**
```bash
# Check if backend is listening inside the container
docker compose exec backend netstat -tlnp | grep :3001

# Test the health endpoint manually
docker compose exec backend curl -s http://localhost:3001/health
```

**Indexer Health Check:**
Similar to backend, checks `http://localhost:3002/health`.

## Configuration Issues

### Missing Contract Addresses

**Symptom:** Backend or indexer logs show errors about invalid contract addresses, or API calls fail with contract invocation errors.

**Cause:** The `FACTORY_CONTRACT_ADDRESS` (and optionally `TREASURY_ADDRESS`) in `.env` files are not set or set to placeholder values.

**Solution:** 
After deploying the smart contracts to the desired Stellar network, update the `.env` files with the actual contract addresses.

### Incorrect Network Configuration

**Symptom:** Transactions fail with network mismatch errors, or indexer fails to read events.

**Cause:** Mismatch between `STELLAR_NETWORK` in `.env` and the actual network of the RPC and Horizon URLs.

**Solution:**
Ensure:
- `STELLAR_NETWORK` matches the network of `STELLAR_RPC_URL` and `HORIZON_URL`
- For testnet: Use `https://soroban-testnet.stellar.org` and `https://horizon-testnet.stellar.org`
- For mainnet: Use `https://soroban-mainnet.stellar.org` and `https://horizon.stellar.org`

### Database Connection Errors

**Symptom:** Backend logs show `error: connection to database failed` or similar.

**Cause:** 
- PostgreSQL service not ready
- Incorrect `DATABASE_URL` in backend `.env`
- Network issues between containers

**Solution:**
1. Check PostgreSQL logs:
   ```bash
   docker compose logs postgres
   ```
2. Verify the connection string format:
   ```
   postgresql://username:password@host:port/database
   ```
   In the default compose setup:
   - host: `postgres` (the service name)
   - port: `5432`
   - username/password/database: `bankerchanger` (from environment)
3. Test connection from backend container:
   ```bash
   docker compose exec backend psql $DATABASE_URL -c "SELECT version();"
   ```

### Redis Connection Errors

**Symptom:** Backend logs show Redis connection errors or rate limiting/caching features fail.

**Solution:**
1. Check Redis logs:
   ```bash
   docker compose logs redis
   ```
2. Verify `REDIS_URL` in backend `.env` is `redis://redis:6379`
3. Test connection:
   ```bash
   docker compose exec backend redis-cli -u $REDIS_URL ping
   ```

## Runtime Issues

### Oracle Submission Failures

**Symptom:** 
- Oracle reports show as failed in API logs
- Markets remain in `locked` state past resolution time
- Error logs show `oracle submit failed`

**See also:** The [Runbook](./runbook.md) section on Oracle Failures & Unresolved Markets.

**Initial Checks:**
1. Verify oracle account has sufficient XLM for transaction fees
2. Check that the oracle's public key is whitelisted in the Market Factory contract
3. Ensure the oracle private key in backend `.env` corresponds to the public key
4. Test oracle API endpoint:
   ```bash
   curl -s -X POST http://localhost:3001/api/oracle/health
   ```

### High Disk Usage

**Symptom:** Containers or host system running out of disk space.

**Common Causes:**
- PostgreSQL data volume growing unbounded
- Redis persistence (if enabled) or logs
- Indexer SQLite database growth

**Solutions:**
1. PostgreSQL: 
   - Enable automatic vacuuming
   - Archive old data
   - Consider managed service with storage scaling
2. Redis: 
   - Configure maxmemory policy
   - Disable persistence if used only for cache
3. Indexer: 
   - The indexer uses SQLite; monitor `./data/indexer.db` size
   - Consider pruning old event data if necessary

### Memory Issues

**Symptom:** Containers being killed by OOM killer, or slow performance.

**Solutions:**
1. Check memory usage:
   ```bash
   docker compose stats
   ```
2. Increase container memory limits in `docker-compose.yml` (under `deploy.resources.limits` for Swarm, or use `mem_limit` for Compose v2 with profiles)
3. Optimize application:
   - Backend: Ensure database queries are indexed
   - Indexer: Tune polling interval and batch sizes

## Verification of Fixes

After applying a solution, verify the service returns to healthy state:

```bash
# Check all services
docker compose ps

# Check logs for recent errors
docker compose logs --tail=20 <service_name>

# Test key endpoints
curl -s http://localhost:3001/health
curl -s http://localhost:3002/health
curl -s http://localhost:3000
```

## Getting Help

If the issue persists:
1. Check the [GitHub Issues](https://github.com/EbzyJones/StellarFox/issues) for similar problems.
2. Consult the [Runbook](./runbook.md) for incident-specific procedures.
3. Review the logs in detail with `docker compose logs <service>`.
4. Reproduce the issue in a minimal environment if possible.