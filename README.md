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

### Local end-to-end checks

Playwright coverage is intentionally Chromium-only and uses a dedicated local Supabase user. It does not use production credentials or call a live AI provider. Start local Supabase first, then expose the local service-role key only to the test process:

```powershell
npx supabase start
$status = npx supabase status -o json | ConvertFrom-Json
$env:VITE_SUPABASE_URL = $status.API_URL
$env:VITE_SUPABASE_ANON_KEY = $status.ANON_KEY
$env:STOCKPILOT_E2E_SUPABASE_URL = $status.API_URL
$env:STOCKPILOT_E2E_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:STOCKPILOT_E2E_EMAIL = "stockpilot-e2e@example.test"
$env:STOCKPILOT_E2E_PASSWORD = "use-a-local-only-password"
npm run test:e2e:install
npm run test:e2e
```

The E2E setup creates or refreshes only the explicitly supplied local test identity. Keep those values out of committed files and never point them at a production Supabase project.

For database reproducibility, use `npx supabase db lint` and `npx supabase test db`. `npx supabase db reset --local` recreates the local database and is destructive to local data, so run it only in a disposable local environment.

Edge Function tests run with the existing Vitest setup, for example:

```powershell
npx vitest run supabase/functions/ai-analyst/ai-analyst.test.ts supabase/functions/opportunity-advisor/opportunity-advisor.test.ts
```

The Vercel rewrite in `vercel.json` preserves client-side React Router deep links by serving the SPA entry point for application routes.

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
npx supabase test db
```

See [`docs/database-architecture.md`](docs/database-architecture.md) for the tenancy, role permissions, module strategy, inventory transaction boundary, grants, and RLS design.

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
