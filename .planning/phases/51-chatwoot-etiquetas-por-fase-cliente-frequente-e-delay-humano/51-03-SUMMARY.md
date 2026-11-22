---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
plan: 03
subsystem: integrations/efi
tags: [chatwoot, etiquetas, efi, webhook, pix, cartao, fire-and-forget]
requires: ["51-01"]
provides:
  - "EfiService.dispararEtiquetasChatwoot (privado): nunca lanca, tolera QuotesService sem o metodo, log so com id e err.message"
  - "Gancho nos webhooks EFI PIX (processWebhook) e cartao (processCardWebhook), depois do $transaction e so com mudanca de status"
affects:
  - "51-04/51-05: todos os caminhos que gravam Quote.status agora sincronizam as etiquetas (D-03 completo)"
tech-stack:
  added: []
  patterns:
    - "typeof ... === 'function' antes de chamar + Promise.resolve(...).catch (mesmo padrao do resolveVendaCaixa)"
key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/efi/efi.service.ts
    - apps/backend/src/modules/integrations/efi/efi.webhook.test.ts
    - apps/backend/src/modules/integrations/efi/efi.card-webhook.test.ts
key-decisions:
  - "gancho so dispara com nextStatus !== quote.status e conversationId presente; construtor de EfiService inalterado"
requirements-completed: [CW-03, CW-12]
status: complete
duration: ~15 min
completed: 2026-11-21
actuals:
  tokens: 3500
  tasks: 2
  commits: 2
plan_head_before: e9b6431ce2686b872d42d01f6dbaba0d57fd8115
plan_head_after: b34bdc879a888b6362e976f176c50d466d8de361
---

# Phase 51 Plan 03: Gancho de etiquetas nos webhooks EFI (PIX e cartao) Summary

Os dois webhooks da EFI passam a sincronizar as etiquetas da conversa depois da transacao, so quando o pagamento muda o status do orcamento, sem nunca derrubar o webhook nem atrasar a mensagem de confirmacao ao cliente.

## O que foi feito

**Task 1 (tracer, commit da78e43):**
- `EfiService.dispararEtiquetasChatwoot`: sem `conversationId` nao faz nada; confere `typeof this.quotesService?.sincronizarEtiquetasChatwoot === "function"` (tolera mock antigo); chama sem await com `Promise.resolve(...).catch`; falha vira `logger.warn` com so o id e `err.message`.
- Chamado em `processWebhook` (PIX) logo depois do `$transaction` e antes do bloco de mensagem automatica, so com `nextStatus !== quote.status`. O mesmo gancho foi ligado em `processCardWebhook` neste mesmo commit (a Task 2 do plano so acrescenta os testes de cartao).
- `efi.webhook.test.ts`: `mockQuotesService` com `sincronizarEtiquetasChatwoot` e H1 a H5 (ordem pela flag da transacao e `invocationCallOrder` contra `sendOutgoingMessage`; parcial sem mudanca; sem conversa; falha sincrona e rejeicao; metodo ausente).

**Task 2 (commit b34bdc8):**
- `efi.card-webhook.test.ts`: `mockQuotesService` com o metodo e H1 a H5 de cartao (caminho feliz do teste 8 como base).

## Verificacao

- `jest src/modules/integrations/efi`: 3 suites, 41 testes passando (18 PIX, 14 cartao).
- `jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot`: 19 suites passando + 1 pulada; 272 passed, 18 skipped (baseline 200 passed; apos 51-02: 262).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Teste de mutacao manual: removendo a chamada do gancho (PIX e, separadamente, cartao) o H1 correspondente falha; codigo restaurado (conferido por `git diff` vazio).
- Criterios de aceite: `dispararEtiquetasChatwoot` 3 vezes em efi.service.ts (definicao + PIX + cartao); `sincronizarEtiquetasChatwoot` 14 vezes em cada um dos dois arquivos de teste.

## Deviations from Plan

Nenhuma de regra 1 a 4. Observacoes:
- A ordem das tarefas foi ajustada de forma benigna: o gancho do cartao entrou junto do PIX no commit da Task 1 (mesmo arquivo e mesmo metodo privado); a Task 2 ficou so com os testes de cartao. Os H1 de cartao foram validados por mutacao.
- Estado do projeto (STATE.md, ROADMAP.md, REQUIREMENTS.md, config.json) NAO foi atualizado, por instrucao do orquestrador.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova. T-51-21 (gancho so depois do commit; H1 verifica pela flag da transacao), T-51-22 (H4/H5 em PIX e cartao) e T-51-23 (logs so com id e err.message) cobertas.

## Self-Check: PASSED

- FOUND: efi.service.ts, efi.webhook.test.ts, efi.card-webhook.test.ts
- FOUND commits: da78e43, b34bdc8
