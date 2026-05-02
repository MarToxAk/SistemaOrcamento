# 01-UAT — Segurança e Autenticação

**Phase:** 01 — Segurança e Autenticação  
**Date:** 2026-05-02  
**Tester:** Automated (HTTP + code review)  
**Result:** 6/6 PASSED ✅

---

## Bug Encontrado e Corrigido Durante UAT

**Problema:** `@nestjs/common: 10.4.22` (backend) + `@nestjs/core: 11.1.19` (root) — versões incompatíveis.  
**Sintoma:** Guards lançavam `UnauthorizedException` mas o exception filter da v11 não reconhecia a exceção da v10 → retornava 500 em vez de 401.  
**Correção:** `apps/backend/package.json` — `@nestjs/common: ^11.1.19`, `@nestjs/testing: ^11.1.19`.  
**Commit:** `9e24815`  

---

## Resultados

| # | Critério | Esperado | Obtido | Status |
|---|----------|----------|--------|--------|
| 1 | `GET /api/quotes` sem token | 401 | 401 | ✅ PASS |
| 2 | `GET /api/quotes` com token Chatwoot válido | 200 | 200 | ✅ PASS |
| 3 | Webhook EFI sem assinatura `x-gn-signature` | 401 | 401 `{"message":"Missing webhook signature"}` | ✅ PASS |
| 4 | Webhook EFI com assinatura HMAC-SHA256 correta | 200 | 200 (processado, warn "quote not found" esperado) | ✅ PASS |
| 5 | Backend sem `DATABASE_URL` → crash com erro descritivo | processo encerra com mensagem | `validateEnv()` em `app.module.ts` lança `Error: Missing required environment variables: DATABASE_URL` | ✅ PASS (code review) |
| 6 | `POST /api/quotes/:id/approve?token=...` sem auth | acessível (não 401) | 404 (quote não existe, mas NÃO 401) | ✅ PASS |

---

## Detalhes Técnicos

### InternalAuthGuard (`security/internal-auth.guard.ts`)
- Verificação global via `APP_GUARD` — todos os endpoints protegidos por padrão
- `@Public()` decorator para bypass: `GET /health`, `POST /efi/webhook/*`, `POST /quotes/:id/approve`
- `timingSafeEqual` para comparação constante (resistente a timing attacks)
- Header: `x-internal-api-key`

### EfiWebhookGuard (`security/efi-webhook.guard.ts`)
- HMAC-SHA256 com `EFI_WEBHOOK_SECRET`
- Aceita `x-gn-signature` e `x-signature`
- Usa `rawBody` (NestJS com `rawBody: true` no NestFactory)

### Env Validation (`app.module.ts`)
- `validateEnv()` em `ConfigModule.forRoot({ validate: validateEnv })`
- 7 variáveis obrigatórias: `DATABASE_URL`, `INTERNAL_API_KEY`, `EFI_WEBHOOK_SECRET`, `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `NFSE_TOKEN`

### Rate Limiting (`throttle.config.ts`)
- Default: 60 req/min
- Sensitive: 10 req/min
- Webhook: 30 req/min
- Headers `X-RateLimit-*` presentes em todas as respostas
