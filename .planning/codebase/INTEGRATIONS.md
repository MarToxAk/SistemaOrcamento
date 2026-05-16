# External Integrations
_Last updated: 2026-05-15 | Focus: tech_

## Summary

SistemaOrcamento integrates with five external systems: EFI Bank (Pix payments), Chatwoot (customer messaging), Athos Empresarial (ERP/accounting), a local PDV (point-of-sale) database, and iiBrasil/Prefeitura de Ilhabela (NFS-e electronic invoicing). File storage uses MinIO (S3-compatible). Network access to on-premise systems is tunneled via Tailscale VPN.

---

## EFI Bank (Pix / Cobranças)

**Purpose:** Pix payment generation and webhook receipt for quote payment confirmation.

**Module:** `apps/backend/src/modules/integrations/efi/`
- `efi.service.ts` — OAuth token caching, Pix charge creation, webhook payload parsing
- `efi.controller.ts` — webhook endpoint receiver
- `efi.webhook.test.ts`, `efi.service.test.ts`

**Protocol:** HTTPS REST (mTLS with client certificate)

**Authentication:**
- OAuth 2.0 client credentials: `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`
- mTLS certificate: `EFI_CERT_PEM` (PEM text inline, newlines as `\n`) and `EFI_KEY_PEM`
- Token cached in memory with expiry (`tokenCache` object in `EfiService`)

**Env vars:**
```
EFI_BASE_URL=https://pix.api.efipay.com.br
EFI_COBRANCA_BASE_URL=https://cobrancas.api.efipay.com.br
EFI_CLIENT_ID=
EFI_CLIENT_SECRET=
EFI_PIX_KEY=
EFI_CERT_PEM=
EFI_KEY_PEM=
EFI_WEBHOOK_SECRET=
```

**Incoming Webhook:**
- Endpoint: `POST /api/efi/webhook` (backend)
- Validated by `EfiWebhookGuard` at `apps/backend/src/modules/security/efi-webhook.guard.ts`
- Validates `EFI_WEBHOOK_SECRET` against EFI webhook signature
- Webhook payload format: `{ pix: [{ txid, endToEndId, valor, ... }] }`
- On success: marks quote as paid, updates status, posts note to Chatwoot

**Status endpoint:**
- `apps/frontend/src/app/api/efi/status/route.ts` — frontend proxies EFI status checks

---

## Chatwoot (Customer Messaging / CRM)

**Purpose:** Contact lookup when creating quotes from conversations; posting payment/status notes back to conversations.

**Module:** `apps/backend/src/modules/integrations/chatwoot/`
- `chatwoot.service.ts` — contact search, conversation note creation
- `chatwoot.controller.ts` — exposes search endpoint
- `chatwoot.module.ts`

**Protocol:** HTTPS REST (Chatwoot v1 API)

**Authentication:**
- API token in header: `api_access_token: <CHATWOOT_API_TOKEN>`

**Env vars:**
```
CHATWOOT_BASE_URL=https://SEU_CHATWOOT
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=
CHATWOOT_INBOX_ID=
```

**Usage patterns:**
- Contact search: `GET {CHATWOOT_BASE_URL}/api/v1/accounts/{id}/contacts/search?q=...`
- Conversation note: `POST` to conversation messages endpoint
- Integration is optional — if vars are missing, service returns `{ enabled: false }` without throwing

**Data stored in Prisma schema:**
- `Quote.chatwootContactId` (BigInt)
- `Quote.conversationId` (BigInt)
- `Customer.chatwootContactId` (BigInt)

---

## Athos Empresarial (ERP / Accounting)

**Purpose:** Read-only access to the on-premise Athos ERP PostgreSQL database for customer lookup, product pricing, and financial data (contas a pagar). Also supports creating payment entries (contas a pagar) via a REST API token.

**Module:** `apps/backend/src/modules/integrations/athos/`
- `athos.service.ts` — customer/product queries, direct PG connection
- `athos.controller.ts` — exposes `/api/athos/*` endpoints
- `athos-listener.service.ts` — listens for events from Athos
- `athos-conta-pagar.util.ts` — bill creation utilities
- `athos-anexo.util.ts` — attachment utilities
- `dto/` — `create-conta-pagar.dto.ts`, `update-conta-pagar.dto.ts`, `upload-conta-pagar-anexo.dto.ts`

**Protocol:** Direct PostgreSQL connection (read-only user) + optional REST token auth for write operations

**Authentication:**
- DB: read-only PostgreSQL credentials via `ATHOS_PG_*` vars
- REST: `ATHOS_API_TOKEN` (optional; leave empty to disable write endpoints)
- Internal header guard: `x-api-token` validated by `InternalAuthGuard` at `apps/backend/src/modules/security/internal-auth.guard.ts`

**Network:** Athos server is on-premise LAN (IP `192.168.3.198` in dev); accessed through Tailscale VPN in production.

**Env vars:**
```
ATHOS_PG_HOST=192.168.3.198
ATHOS_PG_DB=athos
ATHOS_PG_USER=usuario_leitura
ATHOS_PG_PASS=
ATHOS_PG_PORT=5432
ATHOS_API_TOKEN=
```

**Frontend proxy:**
- `apps/frontend/src/app/api/athos/clientes/route.ts`
- `apps/frontend/src/app/api/quotes/athos/[numero]/route.ts`

---

## PDV — Point of Sale (Read-Only)

**Purpose:** Read product catalog and pricing from the local POS system database to pre-fill quote items.

**Module:** `apps/backend/src/modules/integrations/pdv/`
- `pdv.service.ts` — product/price queries
- `pdv.controller.ts` — exposes `/api/pdv/*` endpoints
- `pdv.module.ts`

**Protocol:** Direct PostgreSQL connection (read-only user, separate DB instance)

**Network:** On-premise, accessed via Tailscale VPN in production.

**Env vars:**
```
PDV_DB_URL=postgresql://readonly:readonly@localhost:5433/pdv
PDV_DB_SCHEMA=public
PDV_DB_READONLY_USER=
PDV_DB_READONLY_PASSWORD=
```

**Data flow:** PDV product IDs are stored in Prisma as `QuoteItem.productExternalId` and `QuoteItem.externalItemId` (BigInt). Price source tracked as `PriceSource.PDV` enum in schema.

---

## NFS-e — Electronic Service Invoice (iiBrasil / Prefeitura de Ilhabela)

**Purpose:** Emit NFS-e (Nota Fiscal de Serviços Eletrônica) to the municipal tax authority after quote payment.

**Module:** `apps/backend/src/modules/integrations/nfse/`
- `nfse.service.ts` — SOAP envelope construction, submission, status polling
- `nfse.controller.ts` — exposes `/api/nfse/*` endpoints
- `nfse.discount.test.ts`, `nfse.service.test.ts`
- `test-homologacao.ts`, `test-integridade.ts` — manual integration test scripts

**Protocol:** SOAP over HTTPS (iiBrasil RPS SOAP API)

**Service codes supported:**
| Code | Description |
|------|-------------|
| `24.01` | Confecção de carimbos, banners, placas |
| `24.01-02` | Gravação de objetos e joias |
| `13.05` | Composição gráfica |
| `14.08` | Encadernação e acabamento |

**Authentication:**
- Bearer token: `NFSE_TOKEN`
- CNPJ and municipal registration: `NFSE_CNPJ_PRESTADOR`, `NFSE_INSCRICAO_MUNICIPAL`

**Env vars:**
```
NFSE_TOKEN=
NFSE_CNPJ_PRESTADOR=
NFSE_INSCRICAO_MUNICIPAL=
NFSE_SOAP_URL=https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps
NFSE_AUX_URL=https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS
```

**Data stored in Prisma:**
- `Quote.nfseNumero`, `Quote.nfseCodigoVerificacao`, `Quote.nfseLink`, `Quote.nfseEmitidaEm`

**Frontend proxy:**
- `apps/frontend/src/app/api/quotes/[id]/nfse/route.ts`

---

## MinIO (S3-Compatible File Storage)

**Purpose:** Store generated PDF quotes persistently and serve public URLs for sharing/download.

**Used by:** `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`

**Client:** `minio` npm package ^8.0.7

**Data stored in Prisma:** `QuoteDocument` model with `storagePath`, `publicUrl`, `fileName`, `contentType`

**Env vars:**
```
MINIO_ENDPOINT=minio.seudominio.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=orcamento
MINIO_REGION=us-east-1
MINIO_PUBLIC_BASE_URL=
MINIO_PATH_PREFIX=quotes
```

---

## Tailscale (VPN / Network Tunnel)

**Purpose:** Secure network tunnel between the VPS (running Docker stack) and on-premise systems (Athos ERP, PDV database). The backend container shares the Tailscale container's network namespace to access the Tailnet.

**Deployment:** `ts-webserver2` service in `deploy/docker-compose.vps.yml`; backend uses `network_mode: service:ts-webserver2`

**Env vars:**
```
TS_AUTHKEY=tskey-auth-xxxxxxxxxxxxxxxx
```

---

## Authentication & Security

**No external auth provider.** Authentication is internal-only:

**Internal API Key (service-to-service):**
- Header: `x-internal-api-key`
- Guard: `apps/backend/src/modules/security/internal-auth.guard.ts`
- Used by frontend Next.js API routes when calling the backend
- Env var: `INTERNAL_API_KEY`

**Athos API Token (optional write access):**
- Header: `x-api-token`
- Guard: `InternalAuthGuard` reused
- Env var: `ATHOS_API_TOKEN`

**EFI Webhook Secret:**
- Guard: `apps/backend/src/modules/security/efi-webhook.guard.ts`
- Env var: `EFI_WEBHOOK_SECRET`

**Rate Limiting (throttler):**
- Default: 60 req/min
- Sensitive endpoints: 10 req/min
- Webhook endpoints: 30 req/min
- Config: `apps/backend/src/modules/security/throttle.config.ts`

**CORS:**
- Allowed origins: `CORS_ORIGINS` env var (comma-separated)
- Configured in `apps/backend/src/main.ts`

---

## Server-Sent Events (Internal Event Bus)

**Purpose:** Real-time payment notifications pushed from backend to frontend (e.g., PDV Caixa payment events).

**Implementation:**
- Backend: `apps/backend/src/modules/events/events.service.ts` — RxJS `Subject`-based SSE stream
- Backend endpoint: `apps/backend/src/modules/events/events.controller.ts`
- Frontend consumer: `apps/frontend/src/app/api/events/pagamentos/route.ts` — proxies SSE stream to browser

**Event shape:**
```typescript
interface CaixaPaymentEvent {
  numeroordem: string;
  idVenda: number;
  timestamp: string;
}
```

---

## Quote Approval (Token-Based, No Auth Provider)

**Purpose:** Customers receive a time-limited token URL to approve quotes without logging in.

**Data stored in Prisma:**
- `Quote.approvalToken`, `Quote.approvalRequestedAt`, `Quote.approvalExpiresAt`, `Quote.approved`, `Quote.approvedAt`

**Frontend routes:**
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` — approval page
- `apps/frontend/src/app/api/quotes/[id]/approve/route.ts` — API proxy

---

## Environment Variables — Complete Reference

| Variable | Service | Required |
|----------|---------|----------|
| `DATABASE_URL` | Prisma / PostgreSQL | Yes |
| `PORT` | Backend server | No (default 4000) |
| `NODE_ENV` | Runtime mode | Yes |
| `APP_BASE_URL` | Approval email links | Yes |
| `BACKEND_URL` | Frontend → Backend proxy | Yes |
| `INTERNAL_API_KEY` | Service-to-service auth | Yes |
| `CORS_ORIGINS` | CORS allowlist | No (default localhost) |
| `EFI_BASE_URL` | EFI Pix API | Yes |
| `EFI_COBRANCA_BASE_URL` | EFI billing API | Yes |
| `EFI_CLIENT_ID` | EFI OAuth | Yes |
| `EFI_CLIENT_SECRET` | EFI OAuth | Yes |
| `EFI_PIX_KEY` | EFI Pix key | Yes |
| `EFI_CERT_PEM` | EFI mTLS cert | Yes |
| `EFI_KEY_PEM` | EFI mTLS key | Yes |
| `EFI_WEBHOOK_SECRET` | Webhook signature | Yes |
| `CHATWOOT_BASE_URL` | Chatwoot API | Optional |
| `CHATWOOT_API_TOKEN` | Chatwoot auth | Optional |
| `CHATWOOT_ACCOUNT_ID` | Chatwoot account | Optional |
| `CHATWOOT_INBOX_ID` | Chatwoot inbox | Optional |
| `ATHOS_PG_HOST` | Athos DB host | Yes |
| `ATHOS_PG_DB` | Athos DB name | Yes |
| `ATHOS_PG_USER` | Athos DB user | Yes |
| `ATHOS_PG_PASS` | Athos DB password | Yes |
| `ATHOS_PG_PORT` | Athos DB port | No (default 5432) |
| `ATHOS_API_TOKEN` | Athos write auth | Optional |
| `PDV_DB_URL` | PDV DB connection | Yes |
| `PDV_DB_SCHEMA` | PDV schema | No (default public) |
| `PDV_DB_READONLY_USER` | PDV DB user | Yes |
| `PDV_DB_READONLY_PASSWORD` | PDV DB password | Yes |
| `MINIO_ENDPOINT` | MinIO host | Yes |
| `MINIO_PORT` | MinIO port | Yes |
| `MINIO_USE_SSL` | MinIO SSL | Yes |
| `MINIO_ACCESS_KEY` | MinIO auth | Yes |
| `MINIO_SECRET_KEY` | MinIO auth | Yes |
| `MINIO_BUCKET` | MinIO bucket | Yes |
| `MINIO_REGION` | MinIO region | Yes |
| `MINIO_PUBLIC_BASE_URL` | MinIO public URL | Yes |
| `MINIO_PATH_PREFIX` | MinIO path prefix | No (default quotes) |
| `NFSE_TOKEN` | NFS-e auth | Yes (prod) |
| `NFSE_CNPJ_PRESTADOR` | NFS-e CNPJ | Yes (prod) |
| `NFSE_INSCRICAO_MUNICIPAL` | NFS-e mun. reg. | Yes (prod) |
| `NFSE_SOAP_URL` | iiBrasil SOAP prod URL | Yes (prod) |
| `NFSE_AUX_URL` | iiBrasil aux URL | Yes (prod) |
| `TS_AUTHKEY` | Tailscale auth | Yes (prod) |
| `POSTGRES_USER` | Docker PG service | Yes |
| `POSTGRES_PASSWORD` | Docker PG service | Yes |
| `POSTGRES_DB` | Docker PG service | Yes |

**Secrets location (dev):** `.env` file at repo root (gitignored; template at `.env.example`)
**Secrets location (prod):** `deploy/stack.env` file on VPS (template at `deploy/stack.env.example`)
