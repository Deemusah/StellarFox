# Deployment Guide

This guide explains how to deploy the BANKERCHANGER platform using Docker Compose.

## Prerequisites

- Docker Engine (version 20.10 or later)
- Docker Compose (version 2.0 or later)
- Git (to clone the repository)
- Make (optional, for convenience)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/EbzyJones/StellarFox.git
cd StellarFox

# 2. Set up environment files
cp backend/.env.example backend/.env
cp indexer/.env.example indexer/.env
cp frontend/.env.example frontend/.env
# Edit the .env files with your configuration (see Configuration section below)

# 3. Build and start all services
docker compose up --build

# The platform will be available at:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:3001
# - Indexer: http://localhost:3002
```

## Detailed Steps

### 1. Environment Configuration

Each service requires an `.env` file. Example files are provided:

- `backend/.env.example`
- `indexer/.env.example`
- `frontend/.env.example`

Copy these to `.env` and adjust the values as needed.

#### Backend Environment Variables

Key variables in `backend/.env`:

- `STELLAR_NETWORK`: `testnet` or `mainnet`
- `STELLAR_RPC_URL`: URL to Soroban RPC endpoint
- `HORIZON_URL`: URL to Horizon API
- `FACTORY_CONTRACT_ADDRESS`: Address of the deployed Market Factory contract
- `TREASURY_ADDRESS`: Address of the Treasury contract (set after deployment)
- `ORACLE_PRIVATE_KEY`: Secret key of the oracle account (keep secure)
- `ADMIN_PRIVATE_KEY`: Secret key of the admin account (keep secure)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `PORT`: Backend API port (default: 3001)
- `JWT_SECRET`: Secret for signing JSON Web Tokens
- `ORACLE_API_KEY`: Key for authenticating oracle API requests

#### Indexer Environment Variables

Key variables in `indexer/.env`:

- `PORT`: Indexer service port (default: 3002)
- `HORIZON_URL`: Horizon API URL
- `STELLAR_NETWORK`: Stellar network (`testnet` or `mainnet`)
- `FACTORY_CONTRACT_ADDRESS`: Market Factory contract address
- `DB_PATH`: Path to SQLite database file (relative to indexer working directory)

#### Frontend Environment Variables

Key variables in `frontend/.env`:

- `NEXT_PUBLIC_API_URL`: URL of the backend API (used by frontend)
- `NEXT_PUBLIC_STELLAR_NETWORK`: Stellar network (`testnet` or `mainnet`)
- `NEXT_PUBLIC_HORIZON_URL`: Horizon API URL
- `NEXT_PUBLIC_SOROBAN_RPC_URL`: Soroban RPC URL
- `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS`: Market Factory contract address
- `NEXT_PUBLIC_XLM_TOKEN_ADDRESS`: Native XLM token contract address
- `NEXT_PUBLIC_ADMIN_ADDRESSES`: Comma-separated list of admin wallet addresses

### 2. Building and Running Services

The platform consists of four main services defined in `docker-compose.yml`:

- `postgres`: PostgreSQL 15 database
- `redis`: Redis 7 cache
- `indexer`: Event indexer and API
- `backend`: Main API server
- `frontend`: Next.js web application

#### Development Mode (with hot-reload)

For development, use the docker-compose override file which mounts source code and enables live reloading:

```bash
docker compose up
```

This command uses both `docker-compose.yml` and `docker-compose.override.yml`.

#### Production-like Mode

To run without volume mounts (closer to production):

```bash
docker compose -f docker-compose.yml up --build
```

### 3. Database Migrations

The backend uses PostgreSQL with Drizzle ORM for database schema management.

To apply pending migrations:

```bash
# Enter the backend container
docker compose exec backend bash

# Run migrations
npm run migrate

# Exit the container
exit
```

To check migration status:

```bash
docker compose exec backend npm run migrate:check
```

### 4. Stopping and Cleaning Up

To stop the services:

```bash
docker compose down
```

To stop and remove all volumes (including databases):

```bash
docker compose down -v
```

### 5. Rebuilding Images

If you change a Dockerfile or application code, rebuild the images:

```bash
docker compose build
```

Or rebuild and restart in one command:

```bash
docker compose up --build
```

### 6. Production Considerations

For production deployments:

1. Use strong, unique secrets for all keys and passwords.
2. Enable HTTPS termination at a reverse proxy (e.g., Nginx, Traefik) in front of the services.
3. Set `NODE_ENV=production` in the backend `.env` file.
4. Consider using a managed PostgreSQL and Redis service.
5. Monitor service health via the exposed health check endpoints:
   - Backend: `http://<host>:3001/health`
   - Indexer: `http://<host>:3002/health`
6. Set up log rotation and monitoring for container logs.
7. Regularly backup the PostgreSQL database.

## Verification

After deployment, verify the services are running:

```bash
# Check service status
docker compose ps

# Test API health
curl -s http://localhost:3001/health | jq .

# Test indexer health
curl -s http://localhost:3002/health | jq .

# Test frontend
curl -s http://localhost:3000
```

## Troubleshooting

See the [Troubleshooting Guide](./troubleshooting-guide.md) for common issues and resolution steps.