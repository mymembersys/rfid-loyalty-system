# RFID Loyalty Card System

Multi-branch wellness network loyalty platform — diagnostic clinics, psychological clinics, and gyms. Card-only (no mobile app), stamp/visit-based mechanics.

## Architecture

Monorepo using npm workspaces. Three apps:

```
apps/
├── api/         Node.js + Express + TypeScript REST API
├── admin/       React + Vite admin portal (HQ + branch managers)
└── terminal/    React + Vite branch terminal (front-desk check-in)
```

Database: PostgreSQL.

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (or use the included `docker-compose.yml`)

## First-time setup

```bash
# 1. Install dependencies for all workspaces
npm install

# 2. Start PostgreSQL (option A: docker)
docker compose up -d

# 3. Copy environment file and edit
cp apps/api/.env.example apps/api/.env

# 4. Initialize the database schema
npm run db:init --workspace apps/api

# 5. (Optional) seed dev data
npm run db:seed --workspace apps/api
```

## Running in development

Open three terminals (or use a process manager):

```bash
npm run dev --workspace apps/api        # http://localhost:4000
npm run dev --workspace apps/admin      # http://localhost:5173
npm run dev --workspace apps/terminal   # http://localhost:5174
```

## Project layout

```
rfid-loyalty-system/
├── apps/
│   ├── api/         REST API, business logic, DB schema
│   ├── admin/       Admin web portal (members, rewards, reports)
│   └── terminal/    Branch terminal (tap-to-check-in UI)
├── docs/
│   ├── architecture.md
│   └── api.md
├── docker-compose.yml
├── package.json
└── README.md
```

## Documentation

- [Architecture overview](./docs/architecture.md)
- [API reference (stub)](./docs/api.md)

## Default seed credentials

After `db:seed`:

- HQ Admin: `admin@example.com` / `admin123`
- Branch Manager: `manager@example.com` / `manager123`
- Front Desk: `frontdesk@example.com` / `front123`

> Change these immediately for any non-dev deployment.

## Status

This is the initial scaffold. Route handlers are stubs; the schema and project structure are in place so feature implementation can begin.
