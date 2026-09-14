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
