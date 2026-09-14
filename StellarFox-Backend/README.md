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
