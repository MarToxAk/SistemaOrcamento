---
phase: 29-boleto-consolidado-efi
plan: "01"
subsystem: payments
tags: [nestjs, efi, boleto, prisma, webhook, cobranca, oauth2]

# Dependency graph
requires:
  - phase: 28-contas-receber
    provides: CobrancaBoleto + CobrancaBoletoTitulo Prisma models, AthosService.buscarTitulosClienteContasReceber()
provides:
  - CobrancaModule com POST /cobranca/boleto e POST /cobranca/boleto/notificacao
  - CobrancaService.criarBoleto() — auth EFI, cria boleto bancário, salva Prisma, retorna linkBoleto + barcodeLinhaDigitavel
  - CobrancaService.processarNotificacaoEFI() — processa webhook EFI, atualiza status para 'pago'
affects:
  - 29-02 (frontend modal boleto depende de POST /cobranca/boleto)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth EFI Cobranças: Basic base64(CLIENT_ID:CLIENT_SECRET) → POST /v1/authorize → Bearer token (sem mTLS)"
    - "Webhook sempre retorna HTTP 200, erros logados internamente (D-18)"
    - "DatabaseModule @Global() — PrismaService injetável sem import explícito no módulo"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/backend/src/modules/cobranca/dto/criar-boleto.dto.ts
  modified:
    - apps/backend/src/modules/app.module.ts

key-decisions:
  - "Auth EFI: padrão idêntico ao createCardPaymentLink() — Basic Auth sem mTLS para obter Bearer token"
  - "Endpoint boleto: POST /v1/charge/one-step com payment_method: banking_billet (não /link)"
  - "Webhook endpoint @Public() — EFI não envia x-internal-api-key; validação ocorre via GET /v1/notification/{token}"
  - "txidEfi salvo como String(chargeId) para consistência com campo String? existente no schema"
  - "notification_url omitida quando URL contém localhost/127.0.0.1 (mesmo padrão createCardPaymentLink)"

patterns-established:
  - "CobrancaModule: módulo NestJS importa EfiModule + AthosModule; DatabaseModule @Global() não precisa ser importado"
  - "Webhook EFI: try/catch no controller retorna {ok:true} sempre; erros logados no service"

requirements-completed: [BOL-01, BOL-02, BOL-03]

# Metrics
duration: 25min
completed: 2026-05-22
---

# Phase 29 Plan 01: Boleto Consolidado EFI — Backend Summary

**CobrancaModule NestJS completo com geração de boleto via EFI `/v1/charge/one-step`, persistência Prisma em CobrancaBoleto/CobrancaBoletoTitulo, e webhook de atualização de status por token opaco**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-22T00:00:00Z
- **Completed:** 2026-05-22T00:25:00Z
- **Tasks:** 2 (+ checkpoint aguardando verificação humana)
- **Files modified:** 5

## Accomplishments
- POST /cobranca/boleto autenticado via x-internal-api-key: valida títulos no Athos, calcula total, cria boleto na EFI, salva CobrancaBoleto + CobrancaBoletoTitulo com nested write Prisma, retorna cobrancaId + chargeId + linkBoleto + barcodeLinhaDigitavel + nomeArquivo
- POST /cobranca/boleto/notificacao público (@Public): processa webhook EFI consultando GET /v1/notification/{token}, atualiza status para "pago" de forma idempotente, nunca relança exceções
- TypeScript compila sem erros (npx tsc --noEmit limpo)
- CobrancaModule + AthosModule registrados em AppModule

## Task Commits

1. **Task 1: CobrancaModule esqueleto — controller + module + app.module** - `6058c50` (feat)
2. **Task 2: CobrancaService — criarBoleto() + processarNotificacaoEFI()** - `acae64d` (feat)

## Files Created/Modified
- `apps/backend/src/modules/cobranca/cobranca.module.ts` - NestJS module importando EfiModule + AthosModule
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` - POST /cobranca/boleto (auth) e POST /cobranca/boleto/notificacao (@Public, HTTP 200 sempre)
- `apps/backend/src/modules/cobranca/cobranca.service.ts` - criarBoleto() 9 passos + processarNotificacaoEFI() com auth EFI
- `apps/backend/src/modules/cobranca/dto/criar-boleto.dto.ts` - CriarBoletoDto com class-validator (idclienteAthos, idcontasReceber[], expireAt)
- `apps/backend/src/modules/app.module.ts` - adicionados AthosModule + CobrancaModule ao array imports

## Decisions Made
- Auth EFI sem mTLS: padrão exato de `createCardPaymentLink()` — Basic base64(CLIENT_ID:CLIENT_SECRET) + POST /v1/authorize + Bearer token
- `notification_url` omitida quando `WEBHOOK_BASE_URL`/`APP_URL` contém localhost ou 127.0.0.1
- `getRequiredConfig()` lança `InternalServerErrorException` (não BadRequestException) pois a ausência de env var é erro de configuração de servidor, não erro de input
- CPF/CNPJ extraído de `buscarClientePorId()` com try/catch — omitido silenciosamente se indisponível (campo não obrigatório na EFI)

## Deviations from Plan

None — plano executado exatamente como escrito. A Task 1 e Task 2 foram commitadas separadamente conforme especificado.

## Issues Encountered
None — TypeScript compilou limpo na primeira execução.

## User Setup Required
None — todas as env vars necessárias (`EFI_COBRANCA_BASE_URL`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`) já existem no `.env` conforme D-04 do CONTEXT.md.

## Next Phase Readiness
- Backend completo: POST /cobranca/boleto e POST /cobranca/boleto/notificacao implementados e compilando
- Aguarda checkpoint de verificação humana (Task 3) — testar rota com `x-internal-api-key` e validar resposta 400 para data passada
- Phase 29 Plan 02 (frontend modal boleto) pode ser iniciado após aprovação do checkpoint

---
*Phase: 29-boleto-consolidado-efi*
*Completed: 2026-05-22*
