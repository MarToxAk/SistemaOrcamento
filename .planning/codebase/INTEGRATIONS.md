# External Integrations

**Analysis Date:** 2026-05-01

## APIs & External Services

**Chatwoot (Customer Chat):**
- Purpose: Contact search, post private notes and outgoing messages to conversations
- Module: `apps/backend/src/modules/integrations/chatwoot/`
- Service: `chatwoot.service.ts`
- Controller: `chatwoot.controller.ts` — routes under `GET /api/integrations/chatwoot/contacts`, `POST /api/integrations/chatwoot/conversations/:id/note`
- SDK/Client: `axios` (direct REST calls to Chatwoot API v1)
- Auth: `api_access_token` header
- Required env vars:
  - `CHATWOOT_BASE_URL` — base URL of the Chatwoot instance
  - `CHATWOOT_ACCOUNT_ID` — numeric account ID
  - `CHATWOOT_API_TOKEN` — API access token
- Fail-safe: if any env var is absent, returns `{ enabled: false, message: "..." }` without throwing

**EFI Pay / Gerencianet (Pix Payment Gateway):**
- Purpose: Generate Pix charges, receive payment webhooks, update quote status on payment
- Module: `apps/backend/src/modules/integrations/efi/`
- Service: `efi.service.ts`
- Controller: `efi.controller.ts` — routes under `GET /api/integrations/efi/status`, `POST /api/integrations/efi/webhook/payment`, `POST /api/integrations/efi/webhook/payment/pix`
- SDK/Client: `axios` with mTLS (`https.Agent` with client certificate)
- Auth: OAuth2 client credentials (`EFI_CLIENT_ID` / `EFI_CLIENT_SECRET`) + mTLS certificate
- Required env vars:
  - `EFI_BASE_URL` — main EFI API base URL
  - `EFI_COBRANCA_BASE_URL` — billing/cobrança endpoint (default: `https://cobrancas-h.api.efipay.com.br`)
  - `EFI_CLIENT_ID` — OAuth2 client ID
  - `EFI_CLIENT_SECRET` — OAuth2 client secret
  - `EFI_PIX_KEY` — Pix key for charge generation
  - Certificate (one of):
    - `EFI_CERT_PEM` — PEM text with literal `\n` escapes
    - `EFI_CERT_BASE64` — Base64-encoded PEM
    - `EFI_CERT_PATH` — path to PEM file on disk
  - Private key (one of):
    - `EFI_KEY_PEM`, `EFI_KEY_BASE64`, or `EFI_KEY_PATH`
- Token cache: in-memory (`tokenCache` field on `EfiService`), no persistence
- Fail-safe: `BadRequestException` thrown if cert/key or required config is missing

**NFS-e / IIBR (Brazilian Electronic Service Invoice — SOAP):**
- Purpose: Emit and query NFS-e (Nota Fiscal de Serviços Eletrônica) for quotes
- Municipality: Ilhéus/Bahia (código município `3520400`)
- Module: `apps/backend/src/modules/integrations/nfse/`
- Service: `nfse.service.ts`
- Controller: `nfse.controller.ts` — routes under `GET /api/quotes/:quoteId/nfse`, `POST /api/quotes/:quoteId/nfse`, `POST /api/quotes/:quoteId/nfse/teste`
- SDK/Client: `soap ^1.9.1` (WSDL-based SOAP client)
- Default SOAP endpoint: `https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps`
- Default aux endpoint: `https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS`
- Auth: `NFSE_TOKEN` (bearer token for signature integrity hash)
- Required env vars:
  - `NFSE_TOKEN` — authentication/integrity token
  - `NFSE_CNPJ_PRESTADOR` — service provider CNPJ
  - `NFSE_INSCRICAO_MUNICIPAL` — municipal inscription number
  - `NFSE_SOAP_URL` *(optional)* — override default SOAP endpoint
  - `NFSE_AUX_URL` *(optional)* — override default aux endpoint
  - `NFSE_DEBUG_INTEGRIDADE` *(optional boolean)* — enable integrity debug logging
- Service codes supported: `24.01`, `24.01-02`, `13.05`, `14.08`
- Depends on: `AthosService` (for quote data), `ChatwootService` (for notification)

## Data Storage

**Databases:**

*Main Database (Prisma):*
- Type: PostgreSQL 16
- ORM: Prisma 5.22.0
- Schema: `apps/backend/prisma/schema.prisma`
- Connection env var: `DATABASE_URL`
- Local dev: `docker-compose.yml` — `postgres:16-alpine` on port `5435`
- Production: Remote VPS PostgreSQL instance

*Athos Legacy Database (Direct PostgreSQL):*
- Purpose: Read quotes and customer data from the Athos ERP/PDV legacy system
- Module: `apps/backend/src/modules/integrations/athos/`
- Service: `athos.service.ts`
- Client: `pg` (direct queries, no ORM)
- Connection: ephemeral `Client` per request (no connection pooling)
- Access: read-only by design; queries use parameterized SQL (`$1` placeholders)
- Required env vars:
  - `ATHOS_PG_HOST`
  - `ATHOS_PG_DB`
  - `ATHOS_PG_USER`
  - `ATHOS_PG_PASS`
  - `ATHOS_PG_PORT` *(optional, default: `5432`)*
- Internal API protection env var: `ATHOS_API_TOKEN` (checked in `athos.controller.ts`)
- Fail-safe: `InternalServerErrorException` thrown if env vars are absent

*PDV Legacy Database (stub):*
- Module: `apps/backend/src/modules/integrations/pdv/`
- Service: `pdv.service.ts`
- Status: **Stub/contract only** — `searchCustomer` returns a placeholder; real SQL not yet implemented
- Required env vars (read but not yet used for queries):
  - `PDV_DB_URL`
  - `PDV_DB_SCHEMA` *(default: `public`)*
  - `PDV_DB_READONLY_USER`

**File Storage:**
- Provider: MinIO (S3-compatible object storage)
- Purpose: Store generated quote PDFs
- Client: `minio ^8.0.7`
- Service: `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`
- Required env vars:
  - `MINIO_ENDPOINT` — MinIO server URL
  - `MINIO_ACCESS_KEY` — access key
  - `MINIO_SECRET_KEY` — secret key
  - `MINIO_BUCKET` — bucket name for PDFs
  - `MINIO_PORT` *(optional)* — defaults to `443` (SSL) or `80` (no SSL)
  - `MINIO_USE_SSL` *(optional, default: `"true"`)* — overridden by URL protocol

**Caching:**
- None (in-process EFI token cache only, not Redis or Memcached)

## Authentication & Identity

**Auth Provider:**
- None — no external auth provider (no Supabase, Auth0, Clerk, etc.)
- `UserRole` enum (`VENDEDOR`, `ATENDENTE`, `ADMIN`) exists in Prisma schema but no auth middleware detected in scanned modules
- Internal API protection: `ATHOS_API_TOKEN` env var checked in `athos.controller.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, etc.)

**Logs:**
- NestJS `Logger` class used in service files (`EfiService`, `NfseService`, `athos.service.ts`)
- `console.log` used in `main.ts` for startup message

## CI/CD & Deployment

**Hosting:**
- VPS (inferred from `deploy/docker-compose.vps.yml`)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars (full list):**
```
# Main DB
DATABASE_URL

# Backend port
PORT                        # default: 4000

# Chatwoot
CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_API_TOKEN

# EFI Pay (Pix)
EFI_BASE_URL
EFI_COBRANCA_BASE_URL       # optional, has default
EFI_CLIENT_ID
EFI_CLIENT_SECRET
EFI_PIX_KEY
EFI_CERT_PEM | EFI_CERT_BASE64 | EFI_CERT_PATH
EFI_KEY_PEM  | EFI_KEY_BASE64  | EFI_KEY_PATH

# NFS-e
NFSE_TOKEN
NFSE_CNPJ_PRESTADOR
NFSE_INSCRICAO_MUNICIPAL
NFSE_SOAP_URL               # optional, has default
NFSE_AUX_URL                # optional, has default
NFSE_DEBUG_INTEGRIDADE      # optional boolean

# Athos legacy DB
ATHOS_PG_HOST
ATHOS_PG_DB
ATHOS_PG_USER
ATHOS_PG_PASS
ATHOS_PG_PORT               # optional, default: 5432
ATHOS_API_TOKEN             # internal controller protection

# PDV legacy DB (stub — not yet active)
PDV_DB_URL
PDV_DB_SCHEMA               # optional, default: public
PDV_DB_READONLY_USER

# MinIO / Object Storage
MINIO_ENDPOINT
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET
MINIO_PORT                  # optional
MINIO_USE_SSL               # optional, default: true
```

**Secrets location:**
- `.env` file (local only, never committed)
- Production: VPS environment variables

## Webhooks & Callbacks

**Incoming (received by this system):**
- `POST /api/integrations/efi/webhook/payment` — EFI Pay generic payment notification
- `POST /api/integrations/efi/webhook/payment/pix` — EFI Pay Pix-specific notification
  - Both handled by `EfiController.handleWebhook()`
  - Signature verified via `x-signature` or `x-gn-signature` header
  - Payload format: `{ pix: [{ txid, endToEndId, valor, ... }] }` or single-payment fallback

**Outgoing (sent by this system):**
- Chatwoot: `POST {CHATWOOT_BASE_URL}/api/v1/accounts/{id}/conversations/{id}/messages` — posts notes and outgoing messages after quote events

---

*Integration audit: 2026-05-01*
