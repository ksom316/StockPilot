# StockPilot

StockPilot is a modular inventory and business intelligence SaaS. Inventory is the only required module; businesses will be able to opt into capabilities such as sales, purchasing, expenses and profit, customers, analytics, smart insights, and team management independently.

This repository currently contains the application foundation and the initial multi-tenant identity, module, and inventory database schema. No business feature UI has been implemented yet.

## Stack

- React, Vite, and TypeScript
- React Router
- TanStack Query
- Supabase and PostgreSQL
- Tailwind CSS and shadcn/ui
- Recharts
- Vitest and Testing Library

## Getting started

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Supabase project URL and publishable/anonymous key to `.env.local`. The placeholder application can run without credentials; Supabase-backed features should check the exported configuration state before use.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Local database

The project-scoped Supabase CLI configuration lives in `supabase/`. Docker is required to start the local stack.

```bash
npx supabase start
npx supabase db reset
npx supabase db lint --level warning
```

See [`docs/database-architecture.md`](docs/database-architecture.md) for the tenancy, module, inventory transaction, and RLS design.

## Source layout

- `src/app` — global providers and application setup
- `src/components` — shared layout and UI primitives
- `src/features` — future feature modules, kept independent where possible
- `src/lib` — shared integrations and utilities
- `src/pages` — route-level screens
- `src/routes` — route definitions
- `src/test` — test setup and shared test utilities
- `supabase/migrations` — versioned PostgreSQL schema changes
- `docs` — architecture decisions and implementation notes
