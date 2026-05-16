# Technology Stack
_Last updated: 2026-05-15 | Focus: tech_

## Summary

SistemaOrcamento is a TypeScript-only monorepo (npm workspaces) with a NestJS REST API backend and a Next.js frontend. Both apps run in Docker containers in production and share type definitions via a `@bomcusto/shared` workspace package. The database is PostgreSQL 16 accessed through Prisma ORM.

---

## Languages

**Primary:**
- TypeScript 5.6 — all source code in `apps/backend/src/` and `apps/frontend/src/`

**Secondary:**
- SQL — Prisma migrations in `apps/backend/prisma/migrations/`
- Shell — bootstrap script at `apps/backend/scripts/bootstrap-runtime.sh`

---

## Runtime

**Environment:**
- Node.js 20 (image: `node:20-bookworm-slim` in all Dockerfiles)

**Package Manager:**
- npm (workspaces)
- Lockfile: `package-lock.json` — present and committed

**Workspaces:**
| Workspace | Name | Path |
|-----------|------|------|
| Backend | `@bomcusto/backend` | `apps/backend/` |
| Frontend | `@bomcusto/frontend` | `apps/frontend/` |
| Shared types | `@bomcusto/shared` | `packages/shared/` |

Root-level `package.json`: `package.json`

---

## Frameworks

**Backend:**
- NestJS 11 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) — modular REST API, port 4000
- NestJS Swagger 11 (`@nestjs/swagger`) — API docs at `/api/docs` (non-production only)
- NestJS Throttler 6 (`@nestjs/throttler`) — rate limiting; config at `apps/backend/src/modules/security/throttle.config.ts`
- NestJS Config 4 (`@nestjs/config`) — environment variable injection

**Frontend:**
- Next.js 16 with App Router — port 3000
- React 18.3 + React DOM 18.3
- `reactStrictMode: true` — configured in `apps/frontend/next.config.mjs`
- No UI component library detected (no Tailwind, shadcn, MUI, or Chakra in `package.json`)

**Build/Dev:**
- `ts-node-dev` 2 — backend hot-reload in dev: `npm run dev:backend`
- `tsc` (TypeScript compiler) — production backend build; output to `apps/backend/dist/`
- Next.js built-in bundler — frontend build
- `concurrently` 9 + `kill-port` 2 — parallel dev runner (`npm run dev` at root)

---

## Database & ORM

**Database:**
- PostgreSQL 16-alpine (Docker image)
- Dev: port `5435:5432` (local Docker), defined in `docker-compose.yml`
- Prod: port `5435:5432` in VPS stack, `deploy/docker-compose.vps.yml`

**ORM:**
- Prisma 5 (`@prisma/client` 5.22, `prisma` CLI 5.19)
- Schema: `apps/backend/prisma/schema.prisma`
- Migrations: `apps/backend/prisma/migrations/` (9 migrations, earliest Apr 2026)
- Connection: `DATABASE_URL` env var

**Secondary DB connections (read-only, raw `pg`):**
- Athos Empresarial PostgreSQL — direct host connection via `ATHOS_PG_*` vars
- PDV (Point-of-Sale) PostgreSQL — `PDV_DB_URL` connection string, read-only user
- Both accessed without Prisma (raw `pg` client, package `pg` ^8.20.0 at root)

---

## PDF Generation

- Puppeteer 24 (`puppeteer`) — headless Chromium renders HTML to PDF
- Chromium installed system-level in Docker (`apt-get install chromium`); `PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- Handlebars 4 (`handlebars`) — HTML templating for PDF content
- Generated PDFs stored in MinIO (see Integrations)
- Service: `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`

---

## HTTP Client

- Axios 1.7 — used in all backend integration services (EFI, Chatwoot, NFS-e, Athos)
- Node.js native `fetch` — used in frontend `apps/frontend/src/lib/backend-client.ts` (proxied API calls)

---

## Validation

- `class-validator` 0.14 + `class-transformer` 0.5 — NestJS global `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
- DTOs in each module's `dto/` subdirectory

---

## SOAP Client

- `soap` 1.9 — used by NFS-e service to call iiBrasil municipal invoice API
- File: `apps/backend/src/modules/integrations/nfse/nfse.service.ts`

---

## Real-time / Server-Sent Events

- RxJS 7.8 (`rxjs`) — `Subject`-based SSE stream in `apps/backend/src/modules/events/events.service.ts`
- Frontend SSE consumer: `apps/frontend/src/app/api/events/pagamentos/route.ts`

---

## Testing

**Framework:**
- Jest 30 (`jest`, `@types/jest`)
- ts-jest 29 (`ts-jest`) — TypeScript transform for Jest
- Config: `apps/backend/jest.config.js`
- `@nestjs/testing` 11 — NestJS test module builder

**Run Commands:**
```bash
npm run test                # run all tests (root — delegates to backend workspace)
npm --workspace @bomcusto/backend run test:watch     # watch mode
npm --workspace @bomcusto/backend run test:coverage  # coverage report
```

**Test files:**
- `apps/backend/src/modules/integrations/athos/athos.service.test.ts`
- `apps/backend/src/modules/integrations/athos/athos.controller.test.ts`
- `apps/backend/src/modules/integrations/athos/athos-anexo.util.test.ts`
- `apps/backend/src/modules/integrations/efi/efi.service.test.ts`
- `apps/backend/src/modules/integrations/efi/efi.webhook.test.ts`
- `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts`
- `apps/backend/src/modules/integrations/nfse/nfse.discount.test.ts`
- `apps/backend/src/modules/quotes/quotes.service.test.ts`
- `apps/backend/src/modules/quotes/quotes.service.unit.test.ts`
- `apps/backend/src/modules/quotes/quotes.service.chatwoot.test.ts`

---

## Dev Tooling

| Tool | Purpose | Config |
|------|---------|--------|
| TypeScript 5.6 | Type checking & compilation | `apps/backend/tsconfig.json` |
| ts-node-dev 2 | Dev hot-reload (backend) | `package.json` scripts |
| dotenv-cli 11 | `.env` injection for CLI commands | devDependency in backend |
| concurrently 9 | Parallel dev processes | root `package.json` |
| kill-port 2 | Port cleanup before dev start | root `package.json` |

**Linting/Formatting:** No ESLint, Prettier, or Biome config files detected in the repository. The only ESLint reference is a `// eslint-disable-next-line` comment in `apps/backend/src/main.ts`.

---

## Deployment & Hosting

**Containerization:**
- Docker multi-stage builds
  - Backend: `apps/backend/Dockerfile` (base → deps → build → runtime)
  - Frontend: `apps/frontend/Dockerfile` (deps → build → runtime)
- Container images published to GitHub Container Registry: `ghcr.io/martoxak/bomcusto-backend:latest` and `ghcr.io/martoxak/bomcusto-frontend:latest`

**VPS Stack:**
- Compose file: `deploy/docker-compose.vps.yml`
- Services: `postgres`, `backend`, `frontend`, `ts-webserver2` (Tailscale sidecar)
- Backend shares Tailscale network namespace (`network_mode: service:ts-webserver2`) to reach the internal Tailnet
- Nginx reverse proxy config: `deploy/nginx.conf`
- Tailscale used for secure VPN tunnel between VPS and on-premise systems (Athos, PDV)

**Ports (production):**
- Frontend: `3001:3000`
- Backend: `4001:4000` (via Tailscale container)
- PostgreSQL: `5435:5432`

**Environment file pattern:**
- Dev: `.env.example` at repo root — copy to `.env` and fill values
- Prod: `deploy/stack.env.example` — copy to `stack.env` and inject into VPS Docker stack

**CI/CD:**
- No `.github/workflows/` directory detected in this repo; images are expected to be pre-built and pushed to GHCR before deployment via `deploy/UPDATE_RUNBOOK.md`
