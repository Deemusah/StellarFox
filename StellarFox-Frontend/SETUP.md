# Frontend Setup Guide

## Prerequisites

Before you can run the TypeScript development server, you need to install Node.js:

### Install Node.js

1. **Download Node.js** from [https://nodejs.org/](https://nodejs.org/)
   - Recommended: LTS version (v20.x or later)
   - This will also install npm (Node Package Manager)

2. **Verify Installation**
   ```bash
   node --version
   npm --version
   ```

## Installation Steps

Once Node.js is installed:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your backend API URL and other configuration.

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   The frontend will be available at [http://localhost:3000](http://localhost:3000)

## TypeScript Development

The TypeScript compiler runs automatically when you start the dev server with `npm run dev`. It provides:
- Real-time type checking
- Hot module replacement
- Error detection as you code

## Project Structure

```
StellarFox-Frontend/
├── src/               # Source code
│   ├── app/          # Next.js app router pages
│   ├── components/   # React components
│   └── lib/          # Utility functions and types
├── public/           # Static assets
├── e2e/              # End-to-end tests
└── tsconfig.json     # TypeScript configuration
```

## Development Tips

- TypeScript errors will appear in your terminal and browser
- Use VS Code for the best TypeScript experience
- Run `npm run build` to check for type errors across the entire project
