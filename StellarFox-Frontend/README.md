# StellarFox Frontend

Next.js frontend application with TypeScript for the StellarFox platform.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

3. Start development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run E2E tests with Playwright
- `npm run lint` - Lint code

## Tech Stack

- TypeScript
- Next.js 14
- React 19
- TailwindCSS
- React Query
- Zustand (state management)
- Stellar SDK

## Features

- Server-side rendering with Next.js
- Type-safe API integration
- Responsive design with TailwindCSS
- E2E testing with Playwright
