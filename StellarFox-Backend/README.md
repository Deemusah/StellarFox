# StellarFox Backend

Express.js API backend with TypeScript for the StellarFox application.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start development server:
```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Type check TypeScript
- `npm run build:prod` - Compile TypeScript for production
- `npm run test` - Run tests
- `npm run lint` - Lint code
- `npm run migrate` - Run database migrations

## Tech Stack

- TypeScript
- Express.js
- Drizzle ORM
- PostgreSQL
- Redis
- WebSockets

## API Documentation

OpenAPI specification available at `openapi.yaml`

## Backup and Disaster Recovery Plan

This section documents the backup strategy, recovery procedures, and recovery
targets for the StellarFox backend. It covers documentation and recovery test
procedures only; multi-region replication, automated failover, and DR
automation are explicitly out of scope.

### Recovery Targets (RTO / RPO)

| Data / Service | RPO (max data loss) | RTO (max downtime) |
| --- | --- | --- |
| PostgreSQL database | 15 minutes | 1 hour |
| Redis cache | Not applicable (rebuildable) | 15 minutes |
| Application (API) | Not applicable (stateless) | 30 minutes |
| Configuration / secrets | 24 hours | 1 hour |

- **RPO** is the maximum acceptable amount of data loss measured in time.
- **RTO** is the maximum acceptable time to restore service after a disaster.

### Backup Strategy

- **PostgreSQL**: continuous WAL archiving plus a full logical backup
  (`pg_dump`) every 24 hours. WAL archives are retained for 7 days; daily
  backups are retained for 30 days.
- **Redis**: treated as ephemeral. No backup is required; the cache is rebuilt
  from the database on restart.
- **Configuration**: environment files and secrets are stored in the secret
  manager and exported to encrypted storage daily.
- **Verification**: every backup is checksummed and a restore is validated at
  least weekly (see Recovery Test Procedure).

### Restore Procedures

#### 1. Restore PostgreSQL

1. Provision a clean PostgreSQL instance matching the production version.
2. Restore the most recent full backup:
   ```bash
   pg_restore --clean --if-exists --dbname "$DATABASE_URL" latest.dump
   ```
3. Replay WAL archives up to the desired recovery point (target RPO: 15 min).
4. Verify row counts and run the application health check against the restored
   database.

#### 2. Restore Redis

1. Start a fresh Redis instance.
2. No data restore is required; the cache repopulates on demand.

#### 3. Restore the Application

1. Deploy the last known-good build to the target environment.
2. Point `DATABASE_URL` and `REDIS_URL` at the restored services.
3. Run `npm run migrate` to ensure the schema is current.
4. Confirm the health endpoint returns OK and smoke-test critical API routes.

### Recovery Test Procedure

Run this checklist at least quarterly and after any major infrastructure
change. Record the results and the measured RTO/RPO for each run.

- [ ] Trigger a restore into an isolated environment from the latest backup.
- [ ] Measure the elapsed time from restore start to a healthy application
      (must be within the 1 hour RTO).
- [ ] Measure the data gap between the last committed transaction and the
      restored state (must be within the 15 minute RPO).
- [ ] Verify the restored database passes the application test suite
      (`npm run test`).
- [ ] Verify Redis rebuilds correctly and the API serves requests.
- [ ] Confirm configuration/secrets are recoverable from the secret manager.
- [ ] Document any deviations and open follow-up issues for gaps found.

A recovery test is considered successful when the application is fully
operational within the RTO and no more than the RPO of data is lost.
