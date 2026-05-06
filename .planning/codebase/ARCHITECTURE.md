<!-- refreshed: 2026-05-06 -->
# Architecture

**Analysis Date:** 2026-05-06

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    Client Browser / Chatwoot Widget                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP (port 3000 / 3001 in prod via Nginx)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  @bomcusto/frontend  (Next.js 14)                    │
│  Page Routes          API Route Handlers (proxies)                  │
│  /orcamento           /api/quotes/*           → backend /api/quotes │
│  /orcamento/novo      /api/quotes/[id]/nfse   → backend nfse        │
│  /orcamento/[id]      /api/quotes/[id]/pdf    → backend pdf         │
│  /orcamento/[id]/approve  /api/athos/clientes → backend athos       │
│  /orcamento/andamento /api/efi/status          → backend efi        │
│  `apps/frontend/src/`                                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP x-internal-api-key header (port 4000)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  @bomcusto/backend  (NestJS 11)                      │
│                                                                      │
│  SecurityModule     ThrottlerGuard     LoggingInterceptor           │
│  InternalAuthGuard  ValidationPipe     ConfigModule                 │
│                                                                      │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐     │
│  │ QuotesModule │  │              IntegrationsModules           │    │
│  │              │  │  AthosModule  EfiModule  NfseModule        │    │
│  │ quotes.      │  │  ChatwootModule   PdvModule                │    │
│  │ controller   │  │                                            │    │
│  │ quotes.      │  └──────────────────────────────────────────┘     │
│  │ service      │                                                    │
│  │ pdf-storage  │                                                    │
│  │ service      │                                                    │
│  └──────────────┘                                                    │
│           │                                                          │
│           ▼                                                          │
│  DatabaseModule (PrismaService)                                      │
│  `apps/backend/src/`                                                 │
└──────┬──────────────┬──────────────────────┬────────────────────────┘
       │              │                      │
       ▼              ▼                      ▼
┌──────────┐  ┌───────────────────┐  ┌────────────────────────────────┐
│ Primary  │  │  Athos ERP        │  │  External Services             │
│ Postgres │  │  PostgreSQL       │  │  Chatwoot CRM (HTTP REST)      │
│ (app DB) │  │  (read-only via   │  │  EFI Pay (HTTPS mTLS REST)     │
│          │  │   pg.Pool,        │  │  NFS-e iiBrasil (SOAP/XML)     │
│          │  │   Tailscale VPN)  │  │  MinIO / S3 (PDF storage)      │
└──────────┘  └───────────────────┘  └────────────────────────────────┘
```

## Module Breakdown

### Backend Modules (`apps/backend/src/modules/`)

| Module | Files | Responsibility |
|--------|-------|----------------|
| `AppModule` | `app.module.ts` | Root module; wires all others; global guards and interceptor |
| `DatabaseModule` | `database/database.module.ts`, `database/prisma.service.ts` | Exports `PrismaService` (extends PrismaClient); lifecycle connect/disconnect |
| `SecurityModule` | `security/` | `InternalAuthGuard` (x-internal-api-key header, timing-safe compare), `@Public()` decorator, throttle constants |
| `QuotesModule` | `quotes/` | Core business — CRUD, status machine, PDF generation + storage, Chatwoot messaging, EFI payment links, Athos conciliation |
| `ChatwootModule` | `integrations/chatwoot/` | Outbound messages, notes, file attachments; purely outbound (no webhooks) |
| `EfiModule` | `integrations/efi/` | PIX payment links (mTLS), card links, webhook receipt and payment reconciliation |
| `NfseModule` | `integrations/nfse/` | Fiscal note emission via SOAP/XML to iiBrasil; discount application; Athos tomador lookup |
| `AthosModule` | `integrations/athos/` | Read-only `pg.Pool` against Athos ERP PostgreSQL; quote lookup, payment verification, `relacao_orcamento_venda`, client search |
| `PdvModule` | `integrations/pdv/` | Stub PDV connector (read-only config; SQL not yet implemented) |
| `HealthController` | `health.controller.ts` | `GET /api/health` — liveness check (public, no auth) |

### Frontend Routes (`apps/frontend/src/app/`)

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Server page | Redirect / landing |
| `/orcamento` | Client page | Quote list + Chatwoot widget integration; receives postMessage from CRM |
| `/orcamento/novo` | Client page | New quote creation form (items, stamps, customer) |
| `/orcamento/[id]` | Client page | Quote detail view (status, PDF, NFS-e actions) |
| `/orcamento/[id]/approve` | Client page | Public token-based approval page for customers |
| `/orcamento/[id]/status` | Client page | Order status tracker (public-facing) |
| `/orcamento/andamento` | Client page | Orders in-progress view |
| `/status` | Client page | System status overview |
| `/api/quotes/*` | Route Handlers | Proxy to backend; inject `x-internal-api-key` |
| `/api/athos/clientes` | Route Handler | Proxy to `GET /api/athos/clientes` |
| `/api/efi/status` | Route Handler | Proxy to `GET /api/integrations/efi/status` |

### Shared Package (`packages/shared/src/index.ts`)

Contains lightweight TypeScript types for cross-boundary use:
- `QuoteStatus` union type (`"draft" | "sent" | "approved" | "rejected" | "cancelled"`)
- `QuoteSummary` type

Note: The backend uses its own Prisma-generated `QuoteStatus` enum (more detailed). The shared package types are not currently imported by backend or frontend — they are stubs.

## Security Architecture

**Internal API authentication:**
- Every backend request (except `@Public()` endpoints) requires header `x-internal-api-key`
- Guard: `apps/backend/src/modules/security/internal-auth.guard.ts`
- Timing-safe comparison via Node.js `crypto.timingSafeEqual`
- Public endpoints: `POST /api/quotes/:id/approve` (customer approval), `POST /api/integrations/efi/webhook/*` (EFI Pay webhooks), `GET /api/health`

**Rate limiting:**
- Default: 60 requests / 60 seconds (global via `ThrottlerGuard`)
- Sensitive (PDF gen, NFS-e emit): 10 requests / 60 seconds
- Webhook endpoints: 30 requests / 60 seconds
- Config: `apps/backend/src/modules/security/throttle.config.ts`

**CORS:**
- Origins configured via `CORS_ORIGINS` env var (comma-separated)
- Default allows `http://localhost:3000` and `http://localhost:3001`

## Data Flow

### 1. New Quote Creation (from Chatwoot CRM widget)

1. Chatwoot sends `postMessage` to frontend `/orcamento` page with conversation/contact context
2. Frontend page (`apps/frontend/src/app/orcamento/page.tsx`) captures event, pre-fills form data
3. User submits form → `POST /api/quotes` (frontend Route Handler)
4. Route Handler proxies to `POST http://backend:4000/api/quotes` with `x-internal-api-key`
5. `QuotesController.create()` → `QuotesService.create()`
6. Prisma transaction: upsert Customer, create Quote + QuoteItems + QuoteStampItems + QuoteStatusHistory
7. `QuotesPdfStorageService.generateAndStore()`: Puppeteer renders Handlebars HTML → PDF bytes → MinIO upload
8. `QuoteDocument` record saved with `publicUrl` pointing to MinIO
9. Response returns mapped quote + PDF metadata

### 2. Send Quote to Customer (enviarParaCliente)

1. `POST /api/quotes/:id/enviar`
2. `QuotesService.enviarParaCliente()`:
   a. Status updated to `ENVIADO`
   b. Athos lookup for `idcliente`
   c. `EfiService.createPixPaymentLink()` — mTLS call to EFI Pay API → txid stored on Quote
   d. Optional: `createPix5050Link()`, `createCardPaymentLink()`
   e. If customer is associated (`isAssociated=true`): generate `approvalToken` (random 24-char hex), persist with expiry
   f. `ChatwootService.sendOutgoingMessage()` — payment message with links
   g. `ChatwootService.sendAttachment()` — PDF attachment
3. Returns `{ message, approvalLink }` immediately (fire-and-forget pattern — caller does not await)

### 3. EFI Pay Webhook (PIX payment confirmation)

1. EFI Pay POSTs to `POST /api/integrations/efi/webhook/payment` or `/pix` (public, throttled)
2. `EfiService.processWebhook()` parses `pix[]` array from payload
3. For each txid: lookup Quote by `paymentExternalId` or `secondInstallmentExternalId`
4. Payment status logic: full payment → `APROVADO`; partial → `PAGAMENTO_PARCIAL`
5. `QuotesService.changeStatus()` updates status and writes `QuoteStatusHistory`
6. `ChatwootService.sendOutgoingMessage()` notifies customer

### 4. Athos Cash Register Conciliation (ATHC flow)

1. Triggered on `GET /api/quotes/:id` when quote has `externalQuoteId`
2. `conciliarViaCaixaAthos()` calls `AthosService.buscarRelacaoOrcamentoVenda(idorcamento)`
3. If `idvenda` found: persist `saleExternalId` on Quote (idempotent — only if null)
4. If status is `PENDENTE`/`ENVIADO`: calls `checkPaymentStatus()` → `AthosService.verificarPagamentoPorOrcamento()`
5. If paid: `changeStatus()` to `APROVADO`, `paymentConfirmedAt` persisted, Chatwoot notified

### 5. Customer Approval via Link

1. Email/WhatsApp link: `GET /orcamento/:id/approve?token=XXX`
2. Frontend page shows summary → customer clicks "Approve"
3. `POST /api/quotes/:id/approve?token=XXX` (public endpoint, no API key)
4. `QuotesService.approveByToken()`: validates token, clears token, sets `approved=true`, `approvedAt`
5. `changeStatus()` transitions to `APROVADO`
6. Chatwoot notified with confirmation message

### 6. NFS-e Emission

1. `POST /api/quotes/:quoteId/nfse` (requires API key + sensitive throttle)
2. `NfseService.emitir()`:
   a. Lookup Quote via Prisma
   b. If `clienteAthosId` provided: `AthosService.buscarClientePorId()` for tomador CNPJ/CPF/address
   c. Build XML RPS using validated service codes (24.01, 13.05, 14.08) and ISS rates
   d. Optional discount: `descontoAtivo` + `descontoPorcentagem`/`descontoValor`
   e. SOAP call to iiBrasil endpoint via `soap` library (token auth)
   f. Parse response, persist `nfseNumero`, `nfseCodigoVerificacao`, `nfseLink`, `nfseEmitidaEm` on Quote

## Quote Status State Machine

```
PENDENTE ──► ENVIADO ──► PAGAMENTO_PARCIAL ──► APROVADO
    │                              │               │
    └──────────────────────────────┘               ▼
    │                                         EM_PRODUCAO
    └──────────────────────────────────────────────►│
                                                    ▼
                                          PRONTO_PARA_ENTREGA
                                                    │
                                                    ▼
                                                ENTREGUE
All states (except ENTREGUE) ──► CANCELADO
```

**Guard for EM_PRODUCAO entry:**
- Associated customers (Athos linked or approval token used): require `approved=true`
- Non-associated customers: require `approved=true` OR `saleExternalId` (cash payment confirmed)

## Key Data Models (Prisma)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Quote` | Core entity | `internalNumber` (auto-increment), `externalQuoteId` (BigInt, Athos ID), `status`, `approvalToken`, `paymentExternalId` (EFI txid), `saleExternalId` (Athos sale ID), `nfseNumero` |
| `Customer` | Buyer/contact | `phone`, `email`, `chatwootContactId`, `isAssociated` (Athos link flag) |
| `QuoteItem` | Line items | Supports parent-child hierarchy (`parentItemId`); `priceSource` (PDV or MANUAL) |
| `QuoteStampItem` | Stamp/seal items | `stampType`, `dimensions` — domain-specific to rubber stamp printing business |
| `QuoteStatusHistory` | Audit trail | Every status transition recorded with actor name |
| `QuoteDocument` | PDF records | `storagePath` (MinIO object key), `publicUrl` |
| `PaymentTransaction` | Payment events | EFI webhook events; `externalId` (e2eId), `source`, `method`, `status` |

## Cross-Cutting Concerns

**Logging:**
- `LoggingInterceptor` (`apps/backend/src/modules/common/logging.interceptor.ts`) — applied globally via `APP_INTERCEPTOR`
- Services use `new Logger(ClassName.name)` — NestJS built-in logger

**Validation:**
- Global `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
- DTOs: `apps/backend/src/modules/quotes/dto/` (create-quote, update-status, merge-duplicates)

**Error Handling:**
- NestJS exception filters: `BadRequestException`, `NotFoundException`, `InternalServerErrorException`
- Integration failures are logged as warnings and do not abort the primary response (fire-and-forget for Chatwoot notifications)

**Quote Lookup:**
- `findQuoteByIdentifier()` in `QuotesService` — resolves by `externalQuoteId` (Athos number), then `internalNumber`, then UUID `id`

## Architectural Constraints

- **Circular DI:** `EfiModule` ↔ `QuotesModule` use `forwardRef()` to resolve circular injection (EfiService needs QuotesService for status updates; QuotesService needs EfiService for payment links)
- **BigInt serialization:** Prisma uses `BigInt` for external IDs; all responses convert to `Number` before JSON serialization (BigInt is not JSON-serializable)
- **Fire-and-forget:** `enviarParaCliente` is called fire-and-forget from the controller; Chatwoot/EFI failures log warnings but never surface errors to the caller
- **Athos read-only:** All Athos access is raw SQL SELECT only; no writes to Athos database ever
- **PDV stub:** `PdvService.searchCustomer()` returns empty results — implementation pending
- **No session/JWT auth:** The system uses a single shared `INTERNAL_API_KEY` for frontend→backend; no per-user authentication implemented yet

## Anti-Patterns

### Circular module dependency via forwardRef

**What happens:** `EfiModule` imports `QuotesModule` and `QuotesModule` imports `EfiModule` — resolved with `forwardRef(() => EfiService)` and `@Inject(forwardRef(() => EfiService))`
**Why it's wrong:** Masks a design issue; makes injection order fragile
**Do this instead:** Extract shared logic (status update after payment) to a third service (e.g., `PaymentReconciliationService`) that both can depend on without creating a cycle

### Inline HTML template string in service

**What happens:** The full Bootstrap-styled quote PDF HTML template is embedded as a multi-hundred-line string literal in `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`
**Why it's wrong:** Untestable in isolation; mixing template and business logic; large file
**Do this instead:** Move to a separate `.hbs` file in `apps/backend/src/templates/` and load with `fs.readFileSync`

---

*Architecture analysis: 2026-05-06*
