# Technology Stack

**Analysis Date:** 2026-05-01

## Languages

**Primary:**
- TypeScript 5.6 — Backend (`apps/backend/`) and Frontend (`apps/frontend/`), all source files

**Secondary:**
- JavaScript — Config files only (e.g., `apps/frontend/next.config.mjs`)

## Runtime

**Environment:**
- Node.js (inferred from `ts-node-dev`, `node --test`, and NestJS platform)

**Package Manager:**
- npm with workspaces
- Workspace roots: `apps/*`, `packages/*`
- Lockfile: present (`package-lock.json` expected; workspace defined in root `package.json`)

## Frameworks

**Core (Backend):**
- NestJS ~10/11 (`@nestjs/common ^10.4.2`, `@nestjs/core ^11.1.19`) — HTTP framework for REST API
- `@nestjs/platform-express ^11.1.19` — Express adapter
- `@nestjs/config ^4.0.4` — Environment variable management via `ConfigService`

**Core (Frontend):**
- Next.js 14.2.35 — App Router, React 18.3.1, SSR/SSG
- React 18.3.1 + ReactDOM 18.3.1

**ORM / Database:**
- Prisma 5.22.0 (`@prisma/client ^5.22.0`) — schema at `apps/backend/prisma/schema.prisma`
- PostgreSQL driver: `pg ^8.20.0`

**PDF Generation:**
- Puppeteer 24.40.0 — headless Chrome for HTML→PDF rendering
- Handlebars 4.7.9 — HTML templating for PDF content

**Validation:**
- class-validator 0.14.1 — DTO validation decorators
- class-transformer 0.5.1 — request payload transformation
- NestJS `ValidationPipe` (global, `whitelist: true`, `forbidNonWhitelisted: true`)

**HTTP Client:**
- axios 1.7.7 — used for all outbound HTTP calls (Chatwoot, EFI)

**SOAP:**
- soap 1.9.1 — used by `NfseService` for NFS-e web service calls

**Object Storage Client:**
- minio 8.0.7 — MinIO/S3-compatible SDK for PDF storage

**Build/Dev:**
- ts-node-dev 2.0.0 — hot-reload dev server for backend
- ts-node 10.9.2 — TypeScript execution
- tsc (TypeScript compiler) — production build via `tsconfig.build.json`
- dotenv-cli 11.0.0 — `.env` injection for Prisma CLI commands

**Testing:**
- Node.js built-in test runner (`node --test`) — runs compiled `dist/**/*.test.js`
- No external test framework (jest/vitest) detected

## Key Dependencies

**Critical:**
- `@prisma/client ^5.22.0` — all database access; generated client required before running
- `reflect-metadata ^0.2.2` — required by NestJS decorators; imported first in `apps/backend/src/main.ts`
- `rxjs ^7.8.1` — required by NestJS internals

**Infrastructure:**
- `puppeteer ^24.40.0` — large binary dependency; requires Chromium download
- `minio ^8.0.7` — PDF document storage backend
- `soap ^1.9.1` — NFS-e SOAP integration
- `pg ^8.20.0` — direct PostgreSQL access (Athos legacy DB connector)

## Configuration

**Environment:**
- Managed by `@nestjs/config` (`ConfigService`) throughout backend modules
- `.env` file loaded by NestJS at startup (standard NestJS pattern)
- `dotenv-cli` used only for Prisma CLI commands

**Key env vars required at runtime:**
- `DATABASE_URL` — Prisma PostgreSQL connection string
- `PORT` — backend HTTP port (default: `4000`)
- See INTEGRATIONS.md for integration-specific variables

**Build:**
- Backend: `apps/backend/tsconfig.json` — target `es2021`, module `Node16`, `emitDecoratorMetadata: true`, `strict: true`
- Backend build: `apps/backend/tsconfig.build.json` (separate build config)
- Frontend: `apps/frontend/next.config.mjs` — `reactStrictMode: true`

## Platform Requirements

**Development:**
- Docker optional: `docker-compose.yml` provides `postgres:16-alpine` on port `5435`
- Main DB is remote (VPS); local Docker is an alternative
- Puppeteer requires a compatible Chromium binary (auto-downloaded on `npm install`)

**Production:**
- Backend: `node dist/src/main.js` (compiled output)
- Frontend: `next start -p 3000`
- Deployment config: `deploy/docker-compose.vps.yml`
- Backend API prefix: `/api` (set globally in `apps/backend/src/main.ts`)
- CORS: enabled globally (no restrictions configured in `main.ts`)

---

*Stack analysis: 2026-05-01*
