# Codebase Structure

**Analysis Date:** 2026-05-01

## Directory Layout

```
SistemaOrcamento-main/
├── apps/
│   ├── backend/                    # NestJS API server
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Database schema, enums, models
│   │   │   └── migrations/         # Prisma migration history
│   │   └── src/
│   │       ├── main.ts             # Application bootstrap entry point
│   │       └── modules/
│   │           ├── app.module.ts   # Root NestJS module
│   │           ├── health.controller.ts
│   │           ├── database/       # Global PrismaService
│   │           ├── quotes/         # Core domain: quotes business logic
│   │           │   ├── dto/        # class-validator DTOs
│   │           │   ├── quotes.controller.ts
│   │           │   ├── quotes.service.ts
│   │           │   ├── quotes-pdf-storage.service.ts
│   │           │   └── quotes.module.ts
│   │           └── integrations/
│   │               ├── athos/      # Athos ERP legacy connector
│   │               ├── chatwoot/   # Chatwoot messaging integration
│   │               ├── efi/        # EFI payment gateway (Pix)
│   │               ├── nfse/       # Nota Fiscal de Serviço Eletrônica
│   │               └── pdv/        # PDV point-of-sale (read-only)
│   └── frontend/                   # Next.js App Router
│       ├── public/
│       │   └── media/              # Static assets
│       └── src/
│           └── app/
│               ├── layout.tsx      # Root layout
│               ├── page.tsx        # Root page
│               ├── api/            # BFF proxy API routes
│               │   ├── quotes/
│               │   │   ├── route.ts              # GET list, POST create
│               │   │   ├── [id]/
│               │   │   │   ├── route.ts          # GET detail
│               │   │   │   ├── status/route.ts   # PATCH status
│               │   │   │   ├── pdf/route.ts      # POST generate PDF
│               │   │   │   ├── enviar/route.ts   # POST send to client
│               │   │   │   └── nfse/route.ts     # POST emit NF-Se
│               │   │   └── athos/[numero]/route.ts
│               │   └── efi/
│               │       └── status/route.ts       # EFI payment status
│               ├── orcamento/      # Quotes operator UI
│               │   ├── page.tsx            # Quote list
│               │   ├── novo/page.tsx       # New quote form
│               │   ├── andamento/page.tsx  # In-progress quotes
│               │   └── [id]/page.tsx       # Quote detail
│               └── status/
│                   └── page.tsx    # Customer-facing status page
├── packages/
│   └── shared/
│       └── src/
│           └── index.ts            # Shared TS types (QuoteStatus, QuoteSummary)
├── docs/                           # Project documentation
├── deploy/                         # Deployment configuration
├── scripts/                        # Utility scripts
├── memory/                         # Project memory/notes
├── .planning/                      # GSD planning artifacts
│   └── codebase/                   # Codebase analysis documents
└── package.json                    # npm workspaces root
```

## Directory Purposes

**`apps/backend/src/modules/quotes/`:**
- Purpose: Core business domain — all quote lifecycle logic
- Contains: Service, controller, PDF storage service, DTOs, module definition
- Key files: `quotes.service.ts`, `quotes.controller.ts`, `quotes.module.ts`

**`apps/backend/src/modules/integrations/`:**
- Purpose: Adapters to all external systems
- Contains: One subdirectory per external system, each with service/controller/module
- Key pattern: Each integration exports its service and is imported by modules that need it

**`apps/backend/src/modules/database/`:**
- Purpose: Centralized Prisma client access
- Contains: `prisma.service.ts` (extends PrismaClient), `database.module.ts` (@Global)
- Key files: `prisma.service.ts`

**`apps/backend/prisma/`:**
- Purpose: Database schema source of truth and migration history
- Contains: `schema.prisma` defining all models and enums, migration SQL files
- Key files: `schema.prisma`

**`apps/frontend/src/app/api/`:**
- Purpose: BFF proxy layer — Next.js Route Handlers that forward to the NestJS backend
- Contains: Route files mirroring backend endpoints; no business logic
- Pattern: All routes read `BACKEND_URL` from env and use `fetch()` to proxy

**`apps/frontend/src/app/orcamento/`:**
- Purpose: Operator-facing quote management UI
- Contains: Page components for listing, creating, and managing quotes

**`packages/shared/src/`:**
- Purpose: TypeScript types shared between frontend and backend consumers
- Contains: `index.ts` with `QuoteStatus` union and `QuoteSummary` type

## Key File Locations

**Entry Points:**
- `apps/backend/src/main.ts`: NestJS bootstrap — port, global prefix, CORS, ValidationPipe
- `apps/frontend/src/app/layout.tsx`: Next.js root layout

**Configuration:**
- `apps/backend/prisma/schema.prisma`: Database schema, enums (QuoteStatus, DataSource, PriceSource, UserRole)
- `apps/backend/src/modules/app.module.ts`: Backend module registry and config loading
- Root `package.json`: npm workspaces definition (`apps/backend`, `apps/frontend`, `packages/shared`)

**Core Logic:**
- `apps/backend/src/modules/quotes/quotes.service.ts`: Status machine, quote CRUD, integration orchestration
- `apps/backend/src/modules/quotes/quotes.controller.ts`: REST surface for `/api/quotes`
- `apps/backend/src/modules/database/prisma.service.ts`: Prisma client singleton

**Integration Adapters:**
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts`
- `apps/backend/src/modules/integrations/efi/efi.service.ts`
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts`
- `apps/backend/src/modules/integrations/pdv/pdv.service.ts`
- `apps/backend/src/modules/integrations/athos/athos.service.ts`

**Shared Types:**
- `packages/shared/src/index.ts`

## Naming Conventions

**Files (backend):**
- NestJS modules: `<feature>.module.ts`
- Controllers: `<feature>.controller.ts`
- Services: `<feature>.service.ts` (additional services: `<feature>-<concern>.service.ts`)
- DTOs: `<action>-<entity>.dto.ts` (e.g., `create-quote.dto.ts`, `update-status.dto.ts`)
- Tests: `<feature>.service.<focus>.test.ts`

**Files (frontend):**
- Pages: `page.tsx` inside route segment directories
- API routes: `route.ts` inside route segment directories
- Dynamic segments: `[paramName]` directory naming (e.g., `[id]`, `[numero]`)

**Directories:**
- Backend modules: kebab-case matching feature name
- Frontend routes: kebab-case (e.g., `orcamento`, `andamento`, `novo`)

**TypeScript:**
- Interfaces and types: PascalCase
- Enums: SCREAMING_SNAKE_CASE values (matching Prisma schema)

## Where to Add New Code

**New backend feature module:**
- Create directory: `apps/backend/src/modules/<feature>/`
- Files needed: `<feature>.module.ts`, `<feature>.service.ts`, `<feature>.controller.ts`
- Register in: `apps/backend/src/modules/app.module.ts` imports array

**New backend integration:**
- Create directory: `apps/backend/src/modules/integrations/<system>/`
- Follow pattern of existing integrations (module/service/controller trio)
- Import in consuming module using `forwardRef()` if circular dependency exists

**New DTO:**
- Add to: `apps/backend/src/modules/quotes/dto/` (or `<feature>/dto/`)
- Use class-validator decorators; ensure `ValidationPipe` will pick it up automatically

**New frontend page:**
- Add directory under: `apps/frontend/src/app/`
- Create `page.tsx` in the directory (App Router convention)

**New frontend API proxy route:**
- Add `route.ts` under: `apps/frontend/src/app/api/<path>/`
- Pattern: read `BACKEND_URL`, forward with `fetch()`, return `Response.json()`

**New shared type:**
- Add to: `packages/shared/src/index.ts`

## Special Directories

**`.planning/`:**
- Purpose: GSD planning artifacts (roadmap, phase plans, codebase analysis)
- Generated: No (manually managed)
- Committed: Yes

**`apps/backend/prisma/migrations/`:**
- Purpose: Prisma migration SQL history
- Generated: Yes (via `prisma migrate dev`)
- Committed: Yes

**`deploy/`:**
- Purpose: Deployment configuration files (VPS/Docker)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-01*
