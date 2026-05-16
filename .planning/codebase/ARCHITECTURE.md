# Architecture
_Last updated: 2026-05-15 | Focus: arch_

## Summary

SistemaOrcamento is a Node.js monorepo with a strict two-tier architecture: a NestJS REST API backend (port 4000) and a Next.js 14 App Router frontend (port 3000). The frontend never talks directly to the database — all persistence goes through the backend's `x-internal-api-key`-authenticated REST layer. The backend follows NestJS's module-controller-service pattern with integration-specific sub-modules.

---

## Overall Architectural Pattern

**Modular Monolith (monorepo) — two-tier with BFF proxy.**

```
┌──────────────────────────────────────────────────────────────┐
│            Next.js Frontend (apps/frontend)  :3000           │
│  pages/     ←→   /src/app/api/* (Route Handlers = BFF)       │
│  "use client" components fetch /api/* locally                │
└─────────────────────────┬────────────────────────────────────┘
                          │  HTTP + x-internal-api-key header
                          │  via backendFetch() helper
                          ▼
┌──────────────────────────────────────────────────────────────┐
│            NestJS Backend (apps/backend)  :4000              │
│  Controller → Service → PrismaService                        │
│  Integration modules: Athos, Chatwoot, Efi, NfSe, PDV       │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
               ▼                          ▼
  PostgreSQL (own DB)           Athos ERP (PostgreSQL, pg LISTEN)
  apps/backend/prisma/          External: Chatwoot, EFI Bank, NFSe
```

The Next.js App Router **Route Handlers** (`src/app/api/**/*.ts`) act as a Backend-for-Frontend (BFF). They inject `INTERNAL_API_KEY` before forwarding requests to NestJS. Frontend pages are all `"use client"` React components; there are no Next.js server components with direct data access.

---

## Component Responsibilities

| Component | Responsibility | Key File |
|-----------|----------------|----------|
| `AppModule` | Root NestJS module — registers all sub-modules and global guards | `apps/backend/src/modules/app.module.ts` |
| `QuotesModule` | Core domain: CRUD, status machine, PDF generation, approval flow | `apps/backend/src/modules/quotes/` |
| `AthosModule` | Integration with Athos ERP PostgreSQL (quotes, contas-a-pagar, listeners) | `apps/backend/src/modules/integrations/athos/` |
| `EfiModule` | PIX payment webhooks, charge creation, EFI Bank API | `apps/backend/src/modules/integrations/efi/` |
| `ChatwootModule` | CRM: conversation lookup, message sending, PDF attachment | `apps/backend/src/modules/integrations/chatwoot/` |
| `NfseModule` | Nota Fiscal de Serviço (NFS-e) issuance | `apps/backend/src/modules/integrations/nfse/` |
| `PdvModule` | Read-only PDV legacy DB connector (stub for future use) | `apps/backend/src/modules/integrations/pdv/` |
| `EventsModule` | SSE stream for real-time cashier payment events | `apps/backend/src/modules/events/` |
| `SecurityModule` | Guards: `InternalAuthGuard`, `EfiWebhookGuard`; `@Public()` decorator | `apps/backend/src/modules/security/` |
| `DatabaseModule` | Exports `PrismaService` singleton | `apps/backend/src/modules/database/` |
| `QuotesPdfStorageService` | Renders HTML → PDF via Puppeteer, stores to MinIO | `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` |
| Next.js BFF Routes | Proxy layer: authenticates and forwards to NestJS | `apps/frontend/src/app/api/**/*.ts` |
| `backendFetch()` | Shared HTTP helper; injects `x-internal-api-key` | `apps/frontend/src/lib/backend-client.ts` |

---

## Request / Response Lifecycle

### Standard Internal Request (Frontend → Backend)

1. **Browser** calls a relative URL like `GET /api/quotes` inside a React `"use client"` component.
2. **Next.js Route Handler** at `apps/frontend/src/app/api/quotes/route.ts` receives the request.
3. Route handler calls `backendFetch("/quotes", ...)` from `apps/frontend/src/lib/backend-client.ts`, injecting the `x-internal-api-key` header and setting `cache: "no-store"`.
4. **NestJS** receives `GET /api/quotes` (global prefix `api` set in `main.ts`).
5. `ThrottlerGuard` checks rate-limit buckets.
6. `InternalAuthGuard` validates the `x-internal-api-key` header using constant-time comparison (`timingSafeEqual`). Routes decorated with `@Public()` skip this check.
7. `LoggingInterceptor` records mutating-method requests (`POST/PUT/PATCH/DELETE`).
8. `ValidationPipe` transforms/validates the request body DTO (whitelist, forbidNonWhitelisted).
9. Controller method delegates to the appropriate `Service` method.
10. `Service` queries `PrismaService` (Prisma ORM) and/or calls integration services.
11. Response serialised as JSON; returned through the chain.

### PIX Webhook (EFI Bank → Backend)

1. EFI Bank POSTs to `POST /api/integrations/efi/webhook/payment` or `/pix`.
2. Route is `@Public()` — skips `InternalAuthGuard`.
3. `@Throttle({ default: THROTTLE_WEBHOOK })` rate-limit applied.
4. `EfiWebhookGuard` validates HMAC-SHA256 signature in `x-gn-signature` header (optional — passes if secret not configured).
5. `EfiService.processWebhook()` extracts payment records, matches to a Quote by `txid`, updates `Quote.status` via `QuotesService.changeStatus()`.
6. On status change, fires SSE event via `EventsService.emitCaixaPayment()`.

### Athos ERP Notification (PostgreSQL LISTEN/NOTIFY)

1. `AthosListenerService` connects to the Athos PostgreSQL at bootstrap (`onApplicationBootstrap`) and issues `LISTEN n8n_channel`.
2. On notification, `handleNotification()` fetches recent PDV sales, cross-references with open quotes, calls `QuotesService.changeStatus()`.
3. `EventsService.emitCaixaPayment()` pushes SSE event to connected frontends.

### SSE Payment Stream (Backend → Frontend)

1. Frontend at `/status` subscribes to `GET /api/events/pagamentos` via the BFF route at `apps/frontend/src/app/api/events/pagamentos/route.ts`.
2. NestJS `EventsController` uses `@Sse("pagamentos")` to return an RxJS `Observable<MessageEvent>` from `EventsService`.
3. Event is backed by an RxJS `Subject` — ephemeral, in-memory broadcast; does not survive restarts.

---

## Status Machine

Defined as a plain map in `apps/backend/src/modules/quotes/quotes.service.ts`:

```
PENDENTE            → ENVIADO | PAGAMENTO_PARCIAL | APROVADO | CANCELADO
ENVIADO             → PAGAMENTO_PARCIAL | APROVADO | CANCELADO
PAGAMENTO_PARCIAL   → APROVADO | CANCELADO
APROVADO            → EM_PRODUCAO | CANCELADO
EM_PRODUCAO         → PRONTO_PARA_ENTREGA | CANCELADO
PRONTO_PARA_ENTREGA → ENTREGUE | CANCELADO
ENTREGUE            → (terminal)
CANCELADO           → (terminal)
```

Every transition is recorded in `QuoteStatusHistory`. Status changes can be triggered by: operator UI, EFI webhook, Athos LISTEN notification, or direct `PATCH /quotes/:id/status`.

---

## Key Design Patterns

| Pattern | Where |
|---------|-------|
| **Module-Controller-Service** (NestJS standard) | All backend modules |
| **BFF Proxy** | `apps/frontend/src/app/api/**/*.ts` — every frontend API route is a thin proxy |
| **Guard + Decorator** for auth | `InternalAuthGuard` + `@Public()` in `apps/backend/src/modules/security/` |
| **LISTEN/NOTIFY** (PostgreSQL) | `AthosListenerService` — push-based integration with Athos ERP |
| **SSE / Observable** | `EventsService` + `EventsController` — real-time payment notifications |
| **DTO validation** | All controller inputs are class-validator DTOs in `dto/` sub-dirs |
| **`forwardRef()`** circular dependency resolution | `QuotesModule` ↔ `EfiModule`, `QuotesModule` ↔ `AthosModule` |
| **Fire-and-forget** | `QuotesController.enviarParaCliente()` returns `{ queued: true }` immediately |
| **Handlebars + Puppeteer → MinIO** | PDF generation pipeline in `QuotesPdfStorageService` |

---

## State Management

**Backend:** Stateless per-request. The only shared mutable state is the RxJS `Subject` inside `EventsService` (in-memory; does not survive restarts). The Athos listener holds a persistent `pg.Client` connection.

**Frontend:** React `useState` + `useEffect` per page component. No global state library (no Redux, Zustand, Context). Each page fetches independently on mount. The `/status` page additionally uses `localStorage` keys (`bomcusto_last_caixa_payment`, `bomcusto_last_caixa_dismissed`) as a dismissal mechanism for the payment toast.

---

## Auth / Session Architecture

There is no user session or JWT system. Authentication operates at three levels:

**1. Internal API Key** (`x-internal-api-key` header, env var `INTERNAL_API_KEY`):
- All backend routes require this by default, enforced by `InternalAuthGuard` in `apps/backend/src/modules/security/internal-auth.guard.ts`.
- The Next.js BFF injects the key automatically via `backendFetch()` in `apps/frontend/src/lib/backend-client.ts`. End-users never see this key.
- Routes opted out with `@Public()` decorator (e.g., approve, EFI webhooks, SSE stream).

**2. EFI Webhook Signature** (`x-gn-signature` header, env var `EFI_WEBHOOK_SECRET`):
- Optional HMAC-SHA256 validation in `EfiWebhookGuard` at `apps/backend/src/modules/security/efi-webhook.guard.ts`.
- If the secret is not configured, the guard passes (permissive fallback).

**3. Customer Approval Token** (one-time token):
- `POST /api/quotes/:id/approve` is `@Public()`.
- Token is a random hex string stored on `Quote.approvalToken` with expiry (`approvalExpiresAt`).
- Customer follows a link; the frontend page `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` submits it.

---

## Architectural Constraints

- **Threading:** Single Node.js event loop per process. No worker threads. Long-running PDF generation (Puppeteer) blocks the event loop briefly.
- **Global state:** `EventsService` holds a module-level `Subject` — shared across all concurrent SSE connections. `AthosListenerService` holds a persistent `pg.Client`.
- **Circular imports:** `QuotesModule` ↔ `EfiModule` and `QuotesModule` ↔ `AthosModule` are both bidirectionally circular, resolved via `forwardRef()`.
- **No caching layer:** All reads hit PostgreSQL directly. No Redis or in-memory query cache.
- **PDF template is inline:** The Handlebars HTML template is embedded as a string constant inside `quotes-pdf-storage.service.ts`, not a separate file.

---

## Anti-Patterns

### Dynamic `any` cast in `resolveVendaCaixa`

**What happens:** `(this.athosService as any)?.buscarVendaCaixa` in `apps/backend/src/modules/quotes/quotes.service.ts` line 67.
**Why it's wrong:** Bypasses TypeScript type safety; silently falls through to a stub if the method is renamed or removed.
**Do this instead:** Declare `buscarVendaCaixa()` as a proper public method on `AthosService` and call it directly.

### Circular `forwardRef()` between core domain and integrations

**What happens:** `QuotesModule` imports `EfiModule` and `AthosModule`; those modules import `QuotesModule` back, requiring `forwardRef()` everywhere.
**Why it's wrong:** Bidirectional coupling makes independent testing and future extraction difficult.
**Do this instead:** Introduce a shared domain event or `PaymentEventService` that integrations emit to, and `QuotesService` subscribes from, breaking the direct circular reference.

---

## Error Handling

**Strategy:** NestJS exception filters with HTTP mapping.

**Patterns:**
- Services throw `NotFoundException`, `BadRequestException`, `InternalServerErrorException` from `@nestjs/common` — the framework maps these to HTTP status codes automatically.
- `LoggingInterceptor` logs method, URL, status code, and latency for all mutating requests.
- Frontend BFF routes wrap all `fetch` calls in `try/catch` and return `{ error: string }` JSON with appropriate HTTP status.
- `AthosListenerService` catches notification-handling errors as warnings and continues — the listener stays alive.

---

*Architecture analysis: 2026-05-15*
