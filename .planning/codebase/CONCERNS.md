# Codebase Concerns

**Analysis Date:** 2026-05-01

---

## Security Considerations

### No Authentication on Any Endpoint (CRITICAL)
- Risk: All API endpoints are fully unauthenticated — no JWT, session, or API-key guard is applied to any controller.
- Files: `apps/backend/src/modules/quotes/quotes.controller.ts`, all controller files under `apps/backend/src/modules/integrations/`
- Current mitigation: None found. No `@UseGuards`, `JwtAuthGuard`, or `AuthGuard` decorator is used anywhere in the backend source.
- Recommendation: Add NestJS `@UseGuards` with a JWT or API-key guard as a global guard via `APP_GUARD` in `AppModule`, then selectively exclude public routes with a custom decorator.

### Unauthenticated Payment Webhook Endpoints (CRITICAL)
- Risk: `POST /integrations/efi/webhook/payment` and `POST /integrations/efi/webhook/payment/pix` process financial state transitions (updating quote status, recording payments) with no HMAC/signature verification enforced.
- Files: `apps/backend/src/modules/integrations/efi/efi.controller.ts` (lines 16–33), `apps/backend/src/modules/integrations/efi/efi.service.ts`
- Current mitigation: `signature` and `gnSignature` headers are forwarded to `processWebhook()`, but the controller does not reject requests where both are absent. Signature check logic in the service is unconfirmed.
- Recommendation: Validate the `x-gn-signature` header using HMAC-SHA256 against `EFI_WEBHOOK_SECRET` before touching any database state. Reject 401 immediately if invalid.

### Unauthenticated NFS-e Emission Endpoint (CRITICAL)
- Risk: `POST /quotes/:quoteId/nfse` issues real tax invoices to the municipality. Any anonymous caller can trigger NFS-e emission.
- Files: `apps/backend/src/modules/integrations/nfse/nfse.controller.ts`
- Current mitigation: None.
- Recommendation: Protect behind an API-key or admin-role guard before V1 launch.

### Conditional Auth on Athos Endpoint (HIGH)
- Risk: `GET /athos/contas-pagar` only enforces token validation when `ATHOS_API_TOKEN` environment variable is set. If that variable is absent, the endpoint is open to all.
- Files: `apps/backend/src/modules/integrations/athos/athos.controller.ts` (lines 11–22)
- Current mitigation: Conditional check `if (requiredToken)` — silently bypasses auth when env var is missing.
- Recommendation: Throw `UnauthorizedException` unconditionally when `ATHOS_API_TOKEN` is absent rather than skipping the check. Fail closed, not open.

### PDV and Chatwoot Endpoints Unauthenticated (HIGH)
- Risk: `GET /integrations/pdv/customers?q=...` allows arbitrary customer search against the external PDV database. `POST /integrations/chatwoot/conversations/:id/note` allows posting notes to any conversation.
- Files: `apps/backend/src/modules/integrations/pdv/pdv.controller.ts`, `apps/backend/src/modules/integrations/chatwoot/chatwoot.controller.ts`
- Current mitigation: None.
- Recommendation: Apply at minimum an internal API-key guard.

### No Rate Limiting (HIGH)
- Risk: All endpoints (including payment, NFS-e, PDF generation, and Chatwoot messaging) are unbounded. Attackers or malfunctioning clients can trigger Puppeteer instances, Pix charge creation, and SOAP calls at will.
- Files: `apps/backend/src/modules/app.module.ts` — no `ThrottlerModule` registered.
- Current mitigation: None.
- Recommendation: Add `@nestjs/throttler` with sensible per-route limits; apply stricter limits to payment and invoice endpoints.

### No CORS Configuration
- Risk: `AppModule` registers no `CorsModule` or `.enableCors()` call. NestJS defaults to allowing all origins, which exposes the API to cross-site requests.
- Files: `apps/backend/src/modules/app.module.ts`
- Current mitigation: None visible.
- Recommendation: Explicitly configure CORS with an allowlist via `app.enableCors({ origin: [...] })` in `main.ts`.

### Approval Token Sent via Publicly Visible URL (MEDIUM)
- Risk: Approval tokens (`approvalToken`) are transmitted in a Chatwoot message as a plain URL query parameter `?token=...`. Tokens also appear in application logs when approval link is built.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (approveByToken/enviarParaCliente)
- Current mitigation: Tokens have expiry (`approvalExpiresAt`), but they are single-use only in concept — the code does not invalidate the token after first use (`approvalToken: null` is only set on success).
- Recommendation: Ensure token is invalidated immediately after first successful use. Consider using PKCE or short-lived signed JWTs instead of random hex tokens in URLs.

---

## Tech Debt

### `quotes.service.ts` is a God Class (~1800+ lines)
- Issue: A single NestJS service handles: CRUD, status machine transitions, PDF generation orchestration, Chatwoot messaging, EFI PIX/card payment link creation, approval token lifecycle, duplicate merging, Athos data sync, and `mapQuoteBody` output transformation.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts`
- Impact: Every feature change touches this file. High cognitive load, high merge conflict probability, impossible to unit test in isolation.
- Fix approach: Extract `QuotePaymentService`, `QuoteMessagingService`, `QuoteApprovalService`, and `QuoteMappingService` as separate injectable services. Keep `QuotesService` as a thin orchestrator.

### Circular Dependency via `forwardRef` (QuotesService ↔ EfiService)
- Issue: `QuotesService` depends on `EfiService` and `EfiService` depends on `QuotesService`. Both use `@Inject(forwardRef(() => ...))` to break the cycle.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (line 63), `apps/backend/src/modules/integrations/efi/efi.service.ts` (line 22)
- Impact: Circular dependencies make initialization order fragile and prevent clean extraction into independent modules.
- Fix approach: Introduce a `PaymentEventService` that depends on neither. Both `QuotesService` and `EfiService` emit/consume events through it.

### Pervasive `as any` Type Casts
- Issue: `as any` is used throughout `quotes.service.ts` to escape type-safety, including on Prisma query results and domain objects.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (lines 166, 180, 641, 1378, 1385, 1631, 1649, 1702, 1707, 1727, 1751, 1752)
- Impact: Runtime errors from shape mismatches are not caught at compile time. Refactoring becomes dangerous.
- Fix approach: Define proper TypeScript interfaces for mapped quote shapes; replace `as any` with typed `Prisma.QuoteGetPayload<...>` generics.

### Magic String Flag in `notes` Field (`__associated__`)
- Issue: Customer association state is encoded as a magic substring `__associated__` inside the free-text `notes` field of a quote.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (line 641), `apps/backend/prisma/schema.prisma`
- Impact: The flag is invisible in schema, breaks if notes are edited by any other process, and makes queries impossible (no index). Adding a proper boolean field requires a migration.
- Fix approach: Add a dedicated `isAssociated Boolean @default(false)` field to the `Quote` model and migrate existing records.

### `console.warn` Mixed with Logger
- Issue: `validateChatwootContext` uses `console.warn` directly instead of the NestJS `Logger` instance.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (validateChatwootContext method)
- Impact: Bypasses structured logging; warning messages are invisible in production log aggregation (e.g., Loki, CloudWatch).
- Fix approach: Replace with `this.logger.warn(...)`.

### Unused Computed Value in `mergeDuplicates`
- Issue: `const recomputed = await tx.$queryRaw<...>` computes item totals but the result is never used to update the quote's `subtotal`, `discount`, or `total` fields. The `quote.update` call only bumps `updatedAt`.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (mergeDuplicates, line ~1060)
- Impact: After a merge, the `Quote.total` field may be stale relative to the actual merged items.
- Fix approach: Use the `recomputed` result to update `subtotal`/`total` inside the same transaction, or remove the query if recomputation is not intended.

### `approveByToken` Bypasses the Status Machine
- Issue: `approveByToken` directly writes `status: "EM_PRODUCAO"` via `prisma.quote.update` without calling `changeStatus()`. The `statusTransitions` guard is circumvented.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (approveByToken)
- Impact: A quote can be moved from any status (e.g., `CANCELADO`) directly to `EM_PRODUCAO` if a token is valid, bypassing all transition rules.
- Fix approach: Call `this.changeStatus(quote.id, "EM_PRODUCAO", "Aprovacao pelo cliente")` and handle `BadRequestException` for illegal transitions gracefully.

---

## Performance Bottlenecks

### `list()` Has No Default Pagination Limit (HIGH)
- Problem: When `take` is not provided, `prisma.quote.findMany()` runs without a `LIMIT`, loading all quotes with full nested includes (customer, items + children, stamps, documents).
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (list method, line ~104–165)
- Cause: `if (typeof take === "number") args.take = take;` — if `take` is `undefined`, no limit is applied.
- Improvement path: Apply a hard default of `take = 50` and a maximum cap of `200`. Return a `total` count separately for cursor-based pagination.

### New `pg.Client` per Athos Request (No Connection Pooling)
- Problem: `AthosService` creates a new `pg.Client` instance for every query to the external Athos PostgreSQL database.
- Files: `apps/backend/src/modules/integrations/athos/athos.service.ts`
- Cause: `new Client(...)` called per-operation; no `pg.Pool` used.
- Improvement path: Replace with a `pg.Pool` singleton configured via `ConfigService`, or use a dedicated Prisma datasource/connection for the Athos DB.

### Puppeteer Launched Per PDF Request (No Browser Reuse)
- Problem: Each call to `quotesPdfStorageService.generateAndStore()` launches a new Puppeteer browser instance and terminates it after rendering.
- Files: `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`
- Cause: Standard Puppeteer pattern without a browser pool.
- Improvement path: Keep a single browser instance as a module-level singleton with a page pool, or offload PDF generation to a dedicated queue worker.

### Hardcoded External CDN in PDF Template
- Problem: The HTML template in `QuotesPdfStorageService` loads Bootstrap 5 CSS from `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css` on every PDF render. In a VPS/air-gapped environment, this adds network latency or fails silently.
- Files: `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` (HTML_TEMPLATE constant)
- Cause: CDN URL hardcoded in the template string.
- Improvement path: Bundle Bootstrap CSS inline or serve it from the local backend static assets folder.

---

## Fragile Areas

### `findQuoteByIdentifier` Performs Up to 3 Sequential DB Queries
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (findQuoteByIdentifier, ~line 1570)
- Why fragile: For numeric identifiers it queries by `externalQuoteId`, then by `internalNumber`, then by `id` as UUID — three separate full-includes queries in sequence. Any caller that passes a low-numbered string (e.g., `"1"`) will always pay for two queries.
- Safe modification: Add an index on `internalNumber` (already present) and consider a single `OR` query, or document the resolution priority clearly.

### `resolveCustomer` Has a Race Condition
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (resolveCustomer, ~line 1480)
- Why fragile: `findFirst → create` pattern outside a transaction. Two concurrent requests with the same phone/email can both pass `findFirst` returning `null` and both attempt `create`, causing a unique constraint violation on `phone`/`email` (if indexed uniquely).
- Safe modification: Wrap in `prisma.$transaction` with `upsert`, or use `createMany` with `skipDuplicates`.

### Dynamic SQL in Athos `loadItems`
- Files: `apps/backend/src/modules/integrations/athos/athos.service.ts` (loadItems function)
- Why fragile: Column names read from `information_schema` are used to build `ORDER BY` clauses without full quoting. While `isSafeIdentifier` guards table names, multiple ORDER BY columns are interpolated via `.map(name => \`COALESCE(${name}, 0)\`).join(", ")` which is not fully parameterised.
- Safe modification: Quote all column identifiers with double-quotes (`"columnName"`), or replace the dynamic approach with a fixed set of known columns.

---

## Test Coverage Gaps

### Zero Tests Across the Entire Codebase (CRITICAL)
- What's not tested: No `.spec.ts` or `.test.ts` files found anywhere in `apps/backend/src/` or `apps/frontend/`.
- Files: Entire `apps/backend/src/modules/` tree
- Risk: Payment processing, status machine transitions, duplicate merge logic, approval token validation, and NFS-e emission have no automated verification. Regressions are only caught in production.
- Priority: High
- Recommended starting points: `quotes.service.ts` status machine (`changeStatus`, `normalizeStatus`), `efi.service.ts` webhook payload parsing, and `approveByToken` token validation.

### No Integration Tests for External Integrations
- What's not tested: Athos PostgreSQL queries, EFI API calls, Chatwoot HTTP client, and NFS-e SOAP calls are never exercised in a test environment.
- Files: `apps/backend/src/modules/integrations/` (all)
- Risk: Integration contracts silently break when external services change their API.
- Priority: Medium
- Recommended approach: Use `nock` or `msw` to record/replay HTTP fixtures; add a `test-integridade.ts` equivalent for each integration module.

---

## Missing Critical Features

### No Structured Environment Validation at Startup
- Problem: The application starts successfully even when critical variables (`DATABASE_URL`, `EFI_CLIENT_ID`, `MINIO_ACCESS_KEY`, `NFSE_TOKEN`, etc.) are absent. Errors only surface at runtime when a specific code path is first exercised.
- Blocks: Production deploys may silently degrade (PDF generation fails silently, payments not created, NFS-e fails) without an early alerting signal.
- Recommendation: Use `class-validator` + `@nestjs/config` `validationSchema` in `ConfigModule.forRoot()` to validate required env vars at boot time and crash fast if they are missing.

### No Request Logging / Audit Trail for Destructive Operations
- Problem: Status changes, quote merges, NFS-e emissions, and payment link creations leave no structured audit log beyond the `QuoteStatusHistory` table for status changes. Who called `mergeDuplicates`, from which IP, and when, is not recorded.
- Files: `apps/backend/src/modules/quotes/quotes.controller.ts`
- Recommendation: Add a NestJS `LoggingInterceptor` that records method, route, caller IP, and response status for all mutating endpoints.

### No Background Job / Queue for PDF and Payment Link Generation
- Problem: `enviarParaCliente` is a single HTTP request handler that: (1) generates a Pix charge with EFI, (2) optionally generates 50/50 and card links, (3) generates or downloads a PDF, (4) sends a Chatwoot message, and (5) sends a Chatwoot attachment. Any step that times out causes the entire HTTP request to fail.
- Files: `apps/backend/src/modules/quotes/quotes.service.ts` (enviarParaCliente, ~line 1420)
- Recommendation: Move the multi-step send flow to a BullMQ job queue. The HTTP endpoint enqueues the job and returns immediately; the worker processes it asynchronously.

---

## Dependencies at Risk

### Puppeteer (Headless Chrome) in Production Container
- Risk: Puppeteer bundles Chromium (~300 MB) and requires OS-level dependencies (`libxss1`, `libasound2`, etc.) in the Docker image. The current `Dockerfile` or base image is not visible here, but missing dependencies cause silent PDF failures.
- Impact: PDF generation fails without a clear error if `puppeteer` cannot launch.
- Migration plan: Consider `@sparticuz/chromium` (AWS Lambda–compatible) or replace Puppeteer with `@playwright/test` browser or a dedicated PDF microservice using `weasyprint` or `gotenberg`.

### `soap` Package for NFS-e
- Risk: The `soap` npm package has historically been poorly maintained and struggles with complex WSDL variations. The service already works around encoding issues by computing hashes with both UTF-8 and Latin-1.
- Impact: NFS-e emission may break with municipality server updates.
- Migration plan: Monitor for municipality API migration to REST (ABRASF 2.x implementations increasingly support REST); prepare a switchover path.

---

## Scaling Limits

### Single Stateless Backend Process
- Current capacity: Single NestJS process; in-memory EFI token cache (`tokenCache` instance variable) is not shared across replicas.
- Limit: Horizontal scaling behind a load balancer would cause each replica to maintain its own token cache, leading to redundant OAuth token requests against EFI.
- Scaling path: Move `tokenCache` to Redis with TTL, or use a shared secret store (Vault).

### Athos External PostgreSQL (Read-Only, No Pool)
- Current capacity: One connection per query, no timeout enforced by the `pg.Client` usage.
- Limit: Under concurrent load, the Athos database will hit its connection limit.
- Scaling path: Replace `pg.Client` with `pg.Pool` with a bounded `max` (e.g., 5 connections) and `idleTimeoutMillis`.

---

*Concerns audit: 2026-05-01*
