# Technology Stack

**Analysis Date:** 2026-05-06

## Languages

**Primary:**
- TypeScript 5.6.x — all backend and frontend source code
- SQL — raw queries via Prisma `$queryRaw` (PostgreSQL dialect)

**Secondary:**
- XML/SOAP — NFS-e fiscal note emission via `soap` library

## Runtime

**Environment:**
- Node.js 20 (pinned in CI via `actions/setup-node@v4 node-version: '20'`)

**Package Manager:**
- npm workspaces (root `package.json` defines `apps/*` and `packages/*`)
- Lockfile: present (`package-lock.json`)

## Monorepo Workspaces

| Workspace | Package Name | Port |
|-----------|--------------|------|
| `apps/backend` | `@bomcusto/backend` | 4000 |
| `apps/frontend` | `@bomcusto/frontend` | 3000 |
| `packages/shared` | `@bomcusto/shared` | — |

## Frameworks

**Backend:**
- NestJS 11.1.x — HTTP framework, DI container, module system
  - `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` ^11.1.19
  - `@nestjs/config` ^4.0.4 — env var configuration with validation
  - `@nestjs/throttler` ^6.5.0 — rate limiting (global guard)

**Frontend:**
- Next.js 14.2.35 — React framework with App Router
  - Server Components and API Route Handlers (not Pages Router)
  - `react` 18.3.1, `react-dom` 18.3.1

## Key Backend Dependencies

**ORM / Database:**
- `@prisma/client` ^5.22.0 — PostgreSQL ORM, generated client
- `prisma` ^5.19.1 (dev) — CLI for migrations and schema management
- `pg` ^8.20.0 — raw `node-postgres` client used directly by AthosService and PdvService for read-only access to legacy databases

**HTTP / API:**
- `axios` ^1.7.7 — outbound HTTP (Chatwoot API, EFI Pay API)
- Express (via `@nestjs/platform-express`) — underlying HTTP server

**PDF Generation:**
- `puppeteer` ^24.40.0 — headless Chromium for HTML-to-PDF rendering
- `handlebars` ^4.7.9 — HTML template engine for quote PDF layout
- Bootstrap 5.3.2 (CDN, embedded in HTML template string) — PDF styling

**Storage:**
- `minio` ^8.0.7 — S3-compatible object storage client (PDF files)

**SOAP / Fiscal:**
- `soap` ^1.9.1 — WSDL/SOAP client for NFS-e emission (iiBrasil provider, Prefeitura de Ilhabela-SP)

**Validation:**
- `class-validator` ^0.14.1 — DTO validation decorators
- `class-transformer` ^0.5.1 — request payload transformation
- `reflect-metadata` ^0.2.2 — TypeScript decorator metadata

**Runtime utilities:**
- `rxjs` ^7.8.1 — required by NestJS core

## Key Frontend Dependencies

**Framework:**
- `next` ^14.2.35 — App Router, API routes as proxies to backend
- `react` 18.3.1, `react-dom` 18.3.1

**No UI component library** — custom inline CSS; Bootstrap loaded via `<Script>` CDN tag in pages.
**No client-side HTTP library** — native `fetch` in Client Components; `backendFetch` helper (`src/lib/backend-client.ts`) in Route Handlers.

## Dev Dependencies (Backend)

- `jest` ^30.3.0 — test runner
- `ts-jest` ^29.4.9 — TypeScript transformer for Jest
- `@nestjs/testing` ^11.1.19 — NestJS testing module
- `ts-node` ^10.9.2 — TypeScript execution
- `ts-node-dev` ^2.0.0 — dev server with hot reload (`--respawn --transpile-only`)
- `dotenv-cli` ^11.0.0 — env file loading for test runs
- `typescript` ^5.6.2

## Build / Toolchain

**Backend build:** `tsc -p tsconfig.build.json` → outputs to `apps/backend/dist/`
**Backend dev:** `ts-node-dev --respawn --transpile-only src/main.ts`
**Frontend build:** `next build`
**Frontend dev:** `next dev -p 3000`
**Monorepo dev (concurrent):** `concurrently` ^9.2.1 + `kill-port` ^2.0.1 (root `npm run dev`)

## Database

**Primary (application):**
- PostgreSQL 16 (Docker image `postgres:16-alpine` in production)
- ORM: Prisma with migrations in `apps/backend/prisma/`
- Connection: `DATABASE_URL` env var

**External read-only (Athos ERP):**
- PostgreSQL (version managed by ERP vendor)
- Direct `pg.Pool` connection — env vars: `ATHOS_PG_HOST`, `ATHOS_PG_DB`, `ATHOS_PG_USER`, `ATHOS_PG_PASS`, `ATHOS_PG_PORT`
- No ORM — raw SQL only; schema discovered at runtime via `information_schema.columns`

**External read-only (PDV):**
- PostgreSQL
- Env vars: `PDV_DB_URL`, `PDV_DB_SCHEMA`, `PDV_DB_READONLY_USER`, `PDV_DB_READONLY_PASSWORD`
- Implementation is a stub (connector scaffolded, SQL queries not yet implemented)

## Configuration

**Environment loading (backend):**
- `ConfigModule.forRoot` loads in order: `.env.{NODE_ENV}` → `.env` → `../../.env`
- Boot-time validation: `DATABASE_URL`, `INTERNAL_API_KEY`, `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `NFSE_TOKEN` — process exits if any are missing

**Environment loading (frontend):**
- Next.js standard `.env` / `.env.local` loading
- Two vars consumed: `BACKEND_URL`, `INTERNAL_API_KEY`

## Platform Requirements

**Development:**
- Node.js 20, npm workspaces
- Docker optional — for local Postgres (`npm run docker:up`)
- Chromium installed automatically by Puppeteer on `npm install`

**Production:**
- Docker Compose stack (`deploy/docker-compose.vps.yml`)
- Services: `postgres:16-alpine`, `backend`, `frontend`, `tailscale/tailscale` (VPN sidecar)
- Images published to GHCR: `ghcr.io/martoxak/bomcusto-backend:latest` and `ghcr.io/martoxak/bomcusto-frontend:latest`
- Nginx reverse proxy (`deploy/nginx.conf`) for TLS termination
- Tailscale VPN — backend shares network namespace with Tailscale container for private access to Athos ERP database on Tailnet

## CI/CD

- `ci.yml` — build + test on push/PR to `main` and `dev`
- `build-and-publish.yml` — Docker image build + push to GHCR
- `deploy.yml` / `deploy-portainer.yml` — VPS deployment via Portainer webhook
- `deploy-dev.yml` — dev environment deployment

---

*Stack analysis: 2026-05-06*
