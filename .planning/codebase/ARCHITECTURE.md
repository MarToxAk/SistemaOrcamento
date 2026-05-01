<!-- refreshed: 2026-05-01 -->
# Architecture

**Analysis Date:** 2026-05-01

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                    Browser / Chatwoot Widget                      │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              Next.js App Router (Frontend)                        │
│              apps/frontend/src/app/                               │
│  ┌───────────────────┐   ┌──────────────────────────────────┐    │
│  │  Pages (UI)       │   │  API Routes (BFF Proxy)          │    │
│  │  /orcamento       │   │  /api/quotes/*, /api/efi/status  │    │
│  │  /status          │   │  (passthrough to backend)        │    │
│  └───────────────────┘   └─────────────────┬────────────────┘    │
└────────────────────────────────────────────┼─────────────────────┘
                                             │ HTTP (BACKEND_URL)
                                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              NestJS Backend  apps/backend/src/                    │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Quotes    │  │ Integrations │  │  Database (Global)       │  │
│  │  Module    │  │  chatwoot    │  │  PrismaService           │  │
│  │  /quotes   │  │  efi         │  │  apps/backend/src/       │  │
│  └────────────┘  │  nfse        │  │  modules/database/       │  │
│                  │  pdv         │  └──────────────────────────┘  │
│                  │  athos       │                                  │
│                  └──────────────┘                                  │
└──────────────────────────────────────────────────────────────────┘
                           │ Prisma
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              PostgreSQL (remote VPS / docker local)               │
│              apps/backend/prisma/schema.prisma                    │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| AppModule | Root NestJS module, global config wiring | `apps/backend/src/modules/app.module.ts` |
| QuotesModule | Core business domain — CRUD, status machine, PDF, approval | `apps/backend/src/modules/quotes/` |
| QuotesService | All quote business logic, status transitions, integrations orchestration | `apps/backend/src/modules/quotes/quotes.service.ts` |
| QuotesPdfStorageService | PDF generation and storage | `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` |
| QuotesController | REST endpoints under `/api/quotes` | `apps/backend/src/modules/quotes/quotes.controller.ts` |
| DatabaseModule | Global PrismaService provider (singleton) | `apps/backend/src/modules/database/database.module.ts` |
| ChatwootModule | Chatwoot messaging API integration | `apps/backend/src/modules/integrations/chatwoot/` |
| EfiModule | EFI payment gateway (webhook handling, Pix) | `apps/backend/src/modules/integrations/efi/` |
| NfseModule | Nota Fiscal de Serviço Eletrônica emission | `apps/backend/src/modules/integrations/nfse/` |
| PdvModule | PDV (point of sale) read-only integration | `apps/backend/src/modules/integrations/pdv/` |
| AthosModule | Athos legacy ERP — quote lookup | `apps/backend/src/modules/integrations/athos/` |
| Frontend API Routes | BFF proxy layer — forward requests to backend, no business logic | `apps/frontend/src/app/api/` |
| Frontend Pages | Operator UI — quote list, detail, creation, status tracking | `apps/frontend/src/app/orcamento/` |
| packages/shared | Shared TypeScript types (QuoteStatus, QuoteSummary) | `packages/shared/src/index.ts` |

## Pattern Overview

**Overall:** Monorepo (npm workspaces) with a NestJS API backend and Next.js App Router frontend acting as a thin BFF proxy.

**Key Characteristics:**
- Frontend has zero direct database access — all persistence goes through the backend API
- Frontend API routes in `apps/frontend/src/app/api/` are pure HTTP proxies that forward to `BACKEND_URL`
- Backend enforces all business rules, validation (class-validator DTOs), and integrations
- NestJS modules are feature-scoped; cross-module dependencies use `forwardRef()` where circular
- `DatabaseModule` is marked `@Global()` — `PrismaService` is available everywhere without explicit import

## Layers

**Presentation (UI):**
- Purpose: Operator-facing pages for managing quotes
- Location: `apps/frontend/src/app/orcamento/`, `apps/frontend/src/app/status/`
- Contains: React Server/Client components, page layouts
- Depends on: Frontend API Routes
- Used by: Browser, Chatwoot iframe widget

**BFF / API Proxy:**
- Purpose: Next.js API routes that proxy frontend requests to the NestJS backend
- Location: `apps/frontend/src/app/api/`
- Contains: Route handlers (GET, POST, PATCH) with `fetch()` to `BACKEND_URL`
- Depends on: `BACKEND_URL` env var (default `http://localhost:4000/api`)
- Used by: Frontend pages

**Application / Domain:**
- Purpose: All business logic — quote lifecycle, status machine, payment, approval
- Location: `apps/backend/src/modules/quotes/`
- Contains: Service, Controller, DTOs, PDF storage
- Depends on: DatabaseModule (global), integration modules
- Used by: HTTP clients via `/api/quotes`

**Integration:**
- Purpose: Adapters to external systems
- Location: `apps/backend/src/modules/integrations/`
- Contains: chatwoot, efi, nfse, pdv, athos modules
- Depends on: DatabaseModule, each other via forwardRef where needed
- Used by: QuotesService, NfseModule

**Persistence:**
- Purpose: PostgreSQL access via Prisma ORM
- Location: `apps/backend/src/modules/database/`, `apps/backend/prisma/`
- Contains: PrismaService, schema.prisma, migrations
- Depends on: `DATABASE_URL` env var
- Used by: All backend modules (global)

## Data Flow

### Create Quote (POST /api/quotes)

1. Browser POST → Next.js API route `apps/frontend/src/app/api/quotes/route.ts`
2. API route proxies to `BACKEND_URL/quotes` with `fetch()`
3. `QuotesController.create()` (`apps/backend/src/modules/quotes/quotes.controller.ts:62`)
4. `QuotesService.create()` validates payload (CreateQuoteDto), persists via PrismaService
5. Optional: ChatwootService notified; PDF generated

### Status Change (PATCH /api/quotes/:id/status)

1. Browser PATCH → `apps/frontend/src/app/api/quotes/[id]/status/route.ts`
2. Proxied to `BACKEND_URL/quotes/:id/status`
3. `QuotesController.updateStatus()` receives `UpdateStatusDto`
4. `QuotesService.changeStatus()` validates transition via `statusTransitions` map (`apps/backend/src/modules/quotes/quotes.service.ts:15`)
5. Prisma updates `Quote.status` and appends `QuoteStatusHistory` record

### Athos Quote Lookup (GET /api/quotes/athos-health)

1. `QuotesController.buscarNoAthos()` (`apps/backend/src/modules/quotes/quotes.controller.ts:19`)
2. `QuotesService.buscarNoAthosPorNumero()` checks local DB first (by `externalQuoteId`)
3. Falls back to `AthosService.buscarOrcamentoPorNumero()` if not found locally
4. Returns raw rows or mapped DTO depending on `format` query param

### EFI Payment Webhook

1. Webhook POST to `/api/efi/*` (backend EfiController)
2. `EfiService` processes payment event, updates `PaymentTransaction`
3. `EfiService` calls `QuotesService` (via forwardRef) to update quote payment fields
4. `ChatwootService` notified if conversation linked

**State Management:**
- No client-side state management library; pages use React `useState`/`useEffect`
- Backend is stateless; all state in PostgreSQL via Prisma

## Key Abstractions

**QuoteStatus State Machine:**
- Purpose: Enforces valid lifecycle transitions on every status change
- Definition: `statusTransitions` map at `apps/backend/src/modules/quotes/quotes.service.ts:15`
- Transitions:
  - `PENDENTE` → `ENVIADO`, `PAGAMENTO_PARCIAL`, `APROVADO`, `CANCELADO`
  - `ENVIADO` → `PAGAMENTO_PARCIAL`, `APROVADO`, `CANCELADO`
  - `PAGAMENTO_PARCIAL` → `APROVADO`, `CANCELADO`
  - `APROVADO` → `EM_PRODUCAO`, `CANCELADO`
  - `EM_PRODUCAO` → `PRONTO_PARA_ENTREGA`, `CANCELADO`
  - `PRONTO_PARA_ENTREGA` → `ENTREGUE`, `CANCELADO`
  - `ENTREGUE`, `CANCELADO` → terminal states

**DTOs (class-validator):**
- Purpose: Boundary validation for all inbound payloads
- Location: `apps/backend/src/modules/quotes/dto/`
- Files: `create-quote.dto.ts`, `update-status.dto.ts`, `merge-duplicates.dto.ts`
- Pattern: `@IsString()`, `@IsEnum()` decorators + `ValidationPipe(whitelist: true)`

**Shared Types:**
- Purpose: TypeScript types shared across packages
- Location: `packages/shared/src/index.ts`
- Current contents: `QuoteStatus` union type, `QuoteSummary` type
- Note: Backend uses Prisma-generated enums; shared package types are frontend-facing

## Entry Points

**Backend HTTP Server:**
- Location: `apps/backend/src/main.ts`
- Triggers: `npm run dev:backend` or production start
- Responsibilities: Bootstraps NestJS, sets global prefix `/api`, enables CORS, registers `ValidationPipe`

**Frontend Dev Server:**
- Location: `apps/frontend/src/app/layout.tsx`
- Triggers: `npm run dev:frontend`

**Health Check:**
- Location: `apps/backend/src/modules/health.controller.ts`
- Endpoint: `GET /api/health`

## Architectural Constraints

- **CORS:** `app.enableCors()` is called with no origin restriction — suitable for development; production should restrict origins
- **Global state:** `PrismaService` is a global singleton via `@Global()` DatabaseModule
- **Circular imports:** `QuotesModule ↔ EfiModule` and `QuotesModule ↔ ChatwootModule` resolved with `forwardRef()`
- **Payload compatibility:** `QuotesController.create()` handles both `{ body: CreateQuoteDto }` and bare `CreateQuoteDto` for legacy caller compatibility (Chatwoot webhook payload)
- **BigInt serialization:** `externalQuoteId`, `conversationId`, `chatwootContactId` are `BigInt` in Prisma — require special handling when JSON serialized

## Anti-Patterns

### Payload shape ambiguity in QuotesController.create

**What happens:** `create()` checks if `payload.body` exists before using `payload as CreateQuoteDto` directly (`apps/backend/src/modules/quotes/quotes.controller.ts:62`)
**Why it's wrong:** Bypasses ValidationPipe's DTO enforcement for one code path; two shapes are accepted silently
**Do this instead:** Normalize callers to always send bare `CreateQuoteDto`; use an explicit transformation interceptor if legacy callers cannot be updated

### Frontend type divergence from backend

**What happens:** `packages/shared/src/index.ts` defines its own `QuoteStatus` as string literals that partially overlap with the Prisma enum
**Why it's wrong:** Status values can drift between frontend and backend without compile-time errors
**Do this instead:** Generate or export Prisma enum values to shared package, or import from a single source of truth

## Error Handling

**Strategy:** NestJS built-in exception filters + manual throws

**Patterns:**
- `NotFoundException` thrown in service when entity not found
- `BadRequestException` thrown for invalid status transitions
- `InternalServerErrorException` for unexpected failures
- Frontend API routes catch `fetch` errors and return `{ error: "Falha ao conectar no backend." }` with 500

## Cross-Cutting Concerns

**Logging:** NestJS `Logger` class used in `QuotesService` (`this.logger = new Logger(QuotesService.name)`)
**Validation:** Global `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true` in `apps/backend/src/main.ts`
**Authentication:** No authentication layer implemented — all backend routes are publicly accessible

---

*Architecture analysis: 2026-05-01*
