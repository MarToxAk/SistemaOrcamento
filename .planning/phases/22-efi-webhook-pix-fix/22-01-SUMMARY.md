---
phase: 22-efi-webhook-pix-fix
plan: "01"
subsystem: payments
tags: [efi, pix, webhook, nfse, soap, nestjs]

requires:
  - phase: 11-webhook-efi-sem-assinatura
    provides: endpoint /webhook/payment/pix registrado como @Public() no backend

provides:
  - "getWebhookUrl() retorna URL com sufixo /pix — EFI Pay registra endpoint correto"
  - "NfseService usa .trim() || para fallback de URL SOAP — string vazia em .env nao quebra inicializacao"

affects:
  - 22-02-efi-webhook-pix-fix
  - efi.service.ts
  - nfse.service.ts

tech-stack:
  added: []
  patterns:
    - "Fallback de variavel de ambiente com ?.trim() || DEFAULT ao inves de ?? para tratar string vazia"

key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/efi/efi.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts

key-decisions:
  - "Usar ?.trim() || ao inves de ?? para fallback de URL: ?? nao trata string vazia, apenas null/undefined"
  - "Sufixo /pix obrigatorio na URL de webhook EFI: EFI Pay exige path exato para entregar eventos PIX"

patterns-established:
  - "Config fallback pattern: config.get<string>('VAR')?.trim() || DEFAULT — trata null, undefined e string vazia"

requirements-completed: [EFIWH-01, EFIWH-02]

duration: 5min
completed: 2026-05-04
---

# Phase 22 Plan 01: Correcao webhook EFI /pix e fallback NfseService Summary

**Corrigido getWebhookUrl() com sufixo /pix e NfseService usando .trim() || para fallback de NFSE_SOAP_URL vazia**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-04T00:00:00Z
- **Completed:** 2026-05-04T00:05:00Z
- **Tasks:** 3 (2 code fixes + 1 build verification)
- **Files modified:** 2

## Accomplishments

- `getWebhookUrl()` no EFI Service agora retorna `…/integrations/efi/webhook/payment/pix` — corrigindo o path registrado na EFI Pay para receber eventos de PIX
- `NfseService` usa `?.trim() ||` nos getters `WSDL_URL`, `ENDPOINT` e `AUX_URL` — evita erro `ENOENT '?wsdl'` quando variavel esta definida mas vazia no .env
- Build do backend compilou sem erros TypeScript apos as correcoes

## Task Commits

1. **Task 1 + 2: Corrigir getWebhookUrl() e fallback NfseService** - `a668f80` (fix)
2. **Task 3: Build e verificacao** - validado em tempo de execucao (exit code 0, sem commits adicionais)

**Plan metadata:** pendente (commit final de docs)

## Files Created/Modified

- `apps/backend/src/modules/integrations/efi/efi.service.ts` — linha 489: adicionado `/pix` ao path de retorno de `getWebhookUrl()`
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — getters `WSDL_URL`, `ENDPOINT`, `AUX_URL`: trocado `??` por `?.trim() ||`

## Decisions Made

- Usou `?.trim() ||` em vez de `?? ` para tratar string vazia: o operador nullish coalescing (`??`) so faz fallback para `null`/`undefined`, enquanto `||` (com `.trim()`) trata tambem `""` e `"  "`.
- O sufixo `/pix` e obrigatorio: o endpoint `@Post('payment/pix')` no controller EFI espera exatamente esse path — sem ele a EFI Pay entrega eventos para um URL que o backend nao tem mapeado.

## Deviations from Plan

None — plano executado exatamente como escrito. As correcoes ja estavam comprometidas em `a668f80` antes do executor ser iniciado; o executor verificou que o estado do repositorio ja satisfazia todos os criterios de conclusao e executou apenas a verificacao de build (Task 3).

## Issues Encountered

None.

## User Setup Required

None — nenhuma variavel de ambiente nova exigida. A correcao e puramente de logica interna.

## Next Phase Readiness

- Fase 22-02 (testes unitarios de `getWebhookUrl()`) pode prosseguir; a logica corrigida esta disponivel para ser coberta por specs.
- Nenhum bloqueador.

## Threat Flags

Nenhuma nova superficie de seguranca introduzida. O endpoint `/webhook/payment/pix` permanece `@Public()` por design conforme T-22-01 do threat model.

## Self-Check: PASSED

- FOUND: .planning/phases/22-efi-webhook-pix-fix/22-01-SUMMARY.md
- FOUND: commit a668f80 (fix: getWebhookUrl /pix + NfseService fallback)
- FOUND: commit 3700ee3 (docs: plan 22-01 complete)
- Build backend: exit code 0, no TypeScript errors

---
*Phase: 22-efi-webhook-pix-fix*
*Completed: 2026-05-04*
