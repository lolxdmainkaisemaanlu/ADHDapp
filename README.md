# ADHD App Monorepo

This repository contains a minimal React + Vite client and an Express server with shared TypeScript types.

## Structure
- `client/` – React + Vite + Tailwind UI that consumes the server health endpoint.
- `server/` – Express API with CORS, security headers, rate limiting, and health checks.
- `shared/` – Shared TypeScript types used by both client and server.

## Getting Started
1. Copy `.env.example` to `.env` and adjust values as needed.
2. Install dependencies (from the repo root):
   ```bash
   npm install
   npm install --prefix client
   npm install --prefix server
   ```
3. Run the development servers:
   ```bash
   npm run dev --prefix server
   npm run dev --prefix client
   ```

## Health Checks
- `GET /health` returns a JSON payload with status, uptime, and timestamp.
- `GET /healthz` returns a simple `ok` string for lightweight probes.
