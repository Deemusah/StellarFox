# Backend Setup Guide

## Prerequisites

Before you can run the TypeScript development server, you need:

### Install Node.js

1. **Download Node.js** from [https://nodejs.org/](https://nodejs.org/)
   - Recommended: LTS version (v20.x or later)
   - This will also install npm (Node Package Manager)

2. **Verify Installation**
   ```bash
   node --version
   npm --version
   ```

### Install PostgreSQL

The backend requires PostgreSQL for data storage:
- Download from [https://www.postgresql.org/download/](https://www.postgresql.org/download/)
- Or use Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`

### Install Redis (Optional)

For caching and WebSocket support:
- Windows: [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases)
- Or use Docker: `docker run -p 6379:6379 redis`

## Installation Steps

Once prerequisites are installed:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database credentials and other configuration:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/stellarfox
   REDIS_URL=redis://localhost:6379
   PORT=3001
   ```

3. **Run Database Migrations**
   ```bash
   npm run migrate
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```
   The API will be available at [http://localhost:3001](http://localhost:3001)

## TypeScript Development

The development server uses `ts-node-dev` which:
- Runs TypeScript directly without compilation
- Provides hot reload on file changes
- Shows type errors in real-time

To check types without running the server:
```bash
npm run build
```

## Project Structure

```
StellarFox-Backend/
├── src/               # Source code
│   ├── index.ts      # Application entry point
│   ├── routes/       # API route handlers
│   ├── services/     # Business logic
│   ├── db/           # Database schema and queries
│   └── types/        # TypeScript type definitions
├── migrations/       # Database migrations
├── tests/           # Test files
├── scripts/         # Utility scripts
└── tsconfig.json    # TypeScript configuration
```

## API Documentation

View the OpenAPI specification:
- File: `openapi.yaml`
- Interactive docs: Start the server and visit `/api-docs`

## Development Tips

- TypeScript errors will appear in your terminal
- Use `npm run lint` to check code style
- Run `npm run test` to execute tests
- Use Drizzle Studio for database visualization: `npm run drizzle:studio`

## Backup and Disaster Recovery Plan

This section documents the backup strategy, recovery procedures, and the RTO/RPO targets for the StellarFox backend. It covers documentation and recovery test procedures only; multi-region replication, automated failover, and DR automation are explicitly out of scope.

### Recovery Objectives

| Objective | Target | Description |
| --- | --- | --- |
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable time to restore the API and database to a serving state after a disaster. |
| **RPO** (Recovery Point Objective) | 1 hour | Maximum acceptable data loss window; backups must be taken at least hourly. |

These targets apply to the primary PostgreSQL database and the application configuration. Redis is treated as a cache and may be rebuilt from source data (RPO/RTO not enforced).

### Backup Strategy

- **Database (PostgreSQL)**
  - Full logical backup daily via `pg_dump`.
  - Incremental/WAL archiving enabled so point-in-time recovery (PITR) is possible within the 1-hour RPO.
  - Backups are encrypted at rest and stored in an off-host location separate from the primary database.
- **Configuration and Secrets**
  - `.env` values and infrastructure configuration are stored in the team's secret manager, not in the repository.
  - A copy of non-secret configuration is version-controlled.
- **Retention**
  - Daily backups retained for 30 days.
  - Weekly backups retained for 12 weeks.
  - Monthly backups retained for 12 months.

### Restore Procedures

1. **Provision a clean environment**
   - Spin up a fresh PostgreSQL instance (or restore into an isolated recovery database).
2. **Restore the database**
   ```bash
   # Full restore from the most recent dump
   pg_restore --clean --if-exists --dbname "$DATABASE_URL" /backups/stellarfox_latest.dump
   ```
   - For point-in-time recovery, restore the base backup and replay WAL segments up to the desired timestamp.
3. **Restore configuration**
   - Re-apply environment variables from the secret manager and verify `DATABASE_URL`, `REDIS_URL`, and `PORT`.
4. **Run migrations**
   ```bash
   npm run migrate
   ```
5. **Start the service and verify**
   ```bash
   npm run dev
   ```
   - Confirm the API responds at [http://localhost:3001](http://localhost:3001) and `/api-docs` loads.
6. **Validate data integrity**
   - Run the recovery test checklist below and confirm RTO/RPO are met.

### Recovery Test Procedure (Checklist)

Run this checklist at least quarterly, and after any change to the backup or restore process. Record the start time to measure RTO and the timestamp of the newest restored record to measure RPO.

- [ ] **Pre-test**: Confirm the latest backup exists and is not older than the 1-hour RPO window.
- [ ] **Pre-test**: Verify backup integrity (checksum / `pg_restore --list`).
- [ ] **Restore**: Restore the database into an isolated environment using the steps above.
- [ ] **Restore**: Re-apply configuration and run `npm run migrate` successfully.
- [ ] **Verify**: Start the service and confirm health/API endpoints respond.
- [ ] **Verify**: Run `npm run test` against the restored environment and confirm tests pass.
- [ ] **RTO check**: Confirm total restore time is within the 4-hour RTO target.
- [ ] **RPO check**: Confirm the newest restored record is within the 1-hour RPO target.
- [ ] **Document**: Record the test date, measured RTO/RPO, and any issues found; file follow-ups as needed.

### Roles and Escalation

- **Incident lead**: Coordinates the recovery effort and communicates status.
- **Database owner**: Executes restore and validates data integrity.
- **Application owner**: Restores configuration, runs migrations, and verifies the service.

Escalate to the incident lead immediately if the measured RTO or RPO exceeds the targets above.
