# StellarFox - Divided Codebase

The StellarFox project has been divided into two separate, independent applications:

## 📁 Project Structure

```
BANKERCHANGER/
├── StellarFox-Frontend/       # Next.js/React TypeScript frontend
├── StellarFox-Backend/        # Express.js TypeScript backend API
├── backend/                   # Original backend (kept for reference)
├── frontend/                  # Original frontend (kept for reference)
├── contracts/                 # Stellar smart contracts
├── indexer/                   # Blockchain indexer
└── docs/                      # Documentation
```

## 🚀 Quick Start Guide

### Prerequisites

**Install Node.js** first (required for both projects):
- Download from [https://nodejs.org/](https://nodejs.org/)
- Recommended version: v20.x or later

### 1. Backend Setup

```bash
cd StellarFox-Backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
npm run migrate

# Start TypeScript dev server
npm run dev
```

Backend runs at: **http://localhost:3001** (or configured PORT)

See [StellarFox-Backend/SETUP.md](./StellarFox-Backend/SETUP.md) for detailed instructions.

### 2. Frontend Setup

```bash
cd StellarFox-Frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with backend API URL

# Start TypeScript dev server
npm run dev
```

Frontend runs at: **http://localhost:3000**

See [StellarFox-Frontend/SETUP.md](./StellarFox-Frontend/SETUP.md) for detailed instructions.

## 🔧 TypeScript Development

Both projects use TypeScript and include:
- ✅ Real-time type checking
- ✅ Hot reload on file changes
- ✅ Automatic error detection
- ✅ VS Code IntelliSense support

### Backend (Express + TypeScript)
- Uses `ts-node-dev` for hot reload
- Type-safe database queries with Drizzle ORM
- OpenAPI specification included

### Frontend (Next.js + TypeScript)
- Next.js built-in TypeScript support
- React 19 with TypeScript
- Type-safe API client generation

## 📦 What's Included in Each Project

### StellarFox-Backend
- Express.js API server
- PostgreSQL database with Drizzle ORM
- Redis for caching
- WebSocket support
- Authentication & authorization
- Database migrations
- API documentation (OpenAPI)
- Integration and E2E tests

### StellarFox-Frontend
- Next.js 14 with App Router
- React 19 components
- TailwindCSS styling
- React Query for data fetching
- Zustand for state management
- Stellar SDK integration
- Playwright E2E tests

## 🔗 Communication Between Projects

The frontend connects to the backend API:
- Backend exposes RESTful API endpoints
- Frontend makes HTTP requests to backend
- WebSocket connection for real-time updates

Configure the backend URL in frontend's `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 🛠️ Development Workflow

1. **Start Backend First**
   ```bash
   cd StellarFox-Backend
   npm run dev
   ```

2. **Then Start Frontend**
   ```bash
   cd StellarFox-Frontend
   npm run dev
   ```

3. **Both TypeScript servers are now running!**
   - Backend: http://localhost:3001
   - Frontend: http://localhost:3000

## 📝 Additional Components

The original repository also contains:

- **contracts/** - Stellar blockchain smart contracts
- **indexer/** - Blockchain event indexer
- **docker-compose.yml** - Docker setup for full stack

## 🧪 Running Tests

### Backend Tests
```bash
cd StellarFox-Backend
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # E2E tests
```

### Frontend Tests
```bash
cd StellarFox-Frontend
npm test                    # Unit tests
npm run test:e2e           # Playwright E2E tests
```

## 📚 Documentation

Each project has its own detailed documentation:
- [Backend Setup Guide](./StellarFox-Backend/SETUP.md)
- [Frontend Setup Guide](./StellarFox-Frontend/SETUP.md)
- [Backend README](./StellarFox-Backend/README.md)
- [Frontend README](./StellarFox-Frontend/README.md)

## 🤝 Need Help?

Check the SETUP.md file in each project directory for troubleshooting and detailed configuration options.
