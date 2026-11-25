---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 02
subsystem: integrations/efi
tags: [pagamento, pix, webhook, desconto, quitacao, efi, tdd]
requires: ["54-01"]
provides:
  - processWebhook com quitacao via calcularQuitacao/calcularPixAvista (desconto so no txid a vista)
  - gravacao de Quote.paymentDiscount e Quote.paymentAmount no PIX a vista com desconto
  - metadata do PaymentTransaction com desconto, devido, horario, infoPagador e pagador
  - variavel numeroOrcamento declarada fora do try da mensagem (reutilizada pelo plano 54-04)
  - createPixPaymentLink com opcao aplicarDescontoPix; createPix5050Link sem desconto
affects: [54-04, 54-06, 54-10]
tech-stack:
  added: []
  patterns: ["webhook delega a regra de dinheiro ao util puro em centavos", "campos de desconto gravados via spread condicional"]
key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/efi/efi.service.ts
    - apps/backend/src/modules/integrations/efi/efi.webhook.test.ts
    - apps/backend/src/modules/integrations/efi/efi.service.test.ts
key-decisions:
  - "paymentConfirmedAt so e gravado na quitacao (o codigo ja era assim; mantido e coberto por teste de entrada 50% e de parcial a vista), porque resolverSituacaoPagamentoQuote classifica paymentConfirmedAt preenchido como INTEGRAL/CAIXA."
  - "paymentDiscount/paymentAmount sao gravados no txid a vista com desconto mesmo em pagamento parcial a vista (o devido com desconto ja vale para esse txid); nunca em txid de entrada nem quando total <= 150."
  - "Em txid diferente do a vista, o desconto considerado e o paymentDiscount ja gravado (0 se ausente), sem reescreve-lo."
status: complete
metrics:
  duration: "~20 min"
  completed: 2026-11-25
commits: 3
plan_head_before: bd4fd31096789760e881a98d4713f1066147a08e
plan_head_after: 90cc8c300a4fffbb3d38d480795e43c5f5da68e1
actuals:
  tokens: 5900
  tasks: 3
  commits: 3
---

# Phase 54 Plan 02: Webhook PIX com desconto a vista Summary

O webhook PIX da EFI passa a quitar o orcamento quando o PIX a vista com desconto de 5% e pago (caso #26809: 164,35 de 173,00), gravando desconto e devido nos campos existentes do schema, e o PIX 50/50 deixa de reaplicar o desconto nas metades.

## O que foi feito

- **Tarefa 1 (tracer, commit e9c5a91):** `processWebhook` calcula `ehAvista` (txid igual a `paymentExternalId`), obtem o desconto de `calcularPixAvista` (so no txid a vista) ou do `paymentDiscount` ja gravado, e usa `calcularQuitacao` para `nextPaid`, `pending` e `fullyPaid`. `quote.update` grava `paymentDiscount` e `paymentAmount` apenas no txid a vista com desconto; `paymentConfirmedAt` continua somente na quitacao. Metadata do `PaymentTransaction` ganhou desconto, devido, horario, infoPagador e pagador (mantendo txid e signature). `numeroOrcamento` foi declarado antes do try da mensagem. Mensagem nova para quitado com desconto (total, desconto PIX, valor pago, pagamento integral) sem "parcial", "Restam" nem "Comprovante gerado". Teste tracer #26809 visto falhar (pendingTotal 8.65) antes da implementacao.
- **Tarefa 2 (commit cb25c5c):** testes de fronteira (164,33 quita; 164,32 fica parcial com pendente 0,03), entrada 50% (parcial, sem desconto, sem `paymentConfirmedAt`, mensagem com "entrada"), total <= 150, acumulado em dois PIX, "Restam" pelo pendente calculado (64,35 e nao 73,00), pagamento em txid diferente reaproveitando o desconto, metadata completa e duplicado sem `$transaction`.
- **Tarefa 3 (commit 90cc8c3):** `createPixPaymentLink` ganhou `aplicarDescontoPix` (padrao verdadeiro); `createPix5050Link` passa `false` (total 400 gera cobranca de 200.00; a vista de 400 continua 380.00). `resolvePaymentOptions` delega a `calcularPixAvista`, com teste de paridade contra a formula original para os totais 0, 99.9, 150, 150.01, 150.1, 173, 400 e 1234.56.

## Verificacao

- `npm --prefix apps/backend run test -- src/modules/integrations/efi`: 5 suites, 89 passed, 1 skipped (preexistente).
- `npm --prefix apps/backend run test -- src/modules/quotes`: 14 suites passed, 195 passed.
- `webhook` existentes (MSG-02/03/04, H1 a H5, auditoria da assinatura) verdes sem alteracao.
- `tsc -p tsconfig.json --noEmit` em `apps/backend` do worktree: sem erros.
- `efi.controller.ts` nao aparece no diff (D-17).

## Deviations from Plan

### Auto-fixed Issues

**1. [Ordem TDD] Testes da Tarefa 2 ja nasceram verdes**
- **Found during:** Task 2
- **Issue:** a implementacao completa de `processWebhook` (incluindo `remaining` por `pending` e "Pago: X de Y" com acumulado e devido, itens (a) e (b) da tarefa 2) foi feita junto com o tracer da tarefa 1, entao os testes de expansao passaram na primeira execucao, sem etapa RED separada.
- **Fix:** nenhuma necessaria; os testes cobrem o comportamento e a cobertura foi verificada pelo comportamento (ex.: Restam 64,35 nao 73,00).
- **Commit:** cb25c5c

**2. [Rule 3 - Ambiente] node_modules ausente no worktree**
- Criados symlinks locais nao versionados (`node_modules` e `apps/backend/node_modules`) para o repo principal; typecheck com `tsc` direto em `apps/backend`. Nao foram commitados.

## Auth gates

Nenhum.

## Known Stubs

Nenhum.

## Deferred Issues / Riscos

- **T-54-03 (D-17, aceito):** `webhook/payment/pix` segue `@Public()` sem `EfiWebhookGuard`; um POST forjado com txid valido marcaria o pedido como pago. Nao alterado nesta fase; recomendada fase propria de hardening.
- Reconciliacao de orcamentos antigos gravados como parciais (incluindo #26809) e escopo do plano 54-10; este plano so corrige pagamentos novos.

## Threat Flags

Nenhum novo alem do T-54-03 ja registrado.

## Pontos de atencao para planos seguintes

- 54-04 (comprovante): `numeroOrcamento` esta disponivel como `let` no escopo do loop, depois do bloco da mensagem; metadata do `PaymentTransaction` ja traz horario, infoPagador e pagador; `descontoPix`, `quitacao.devido` e `nextPaid` estao em escopo no mesmo bloco.
- `createPixPaymentLink` agora aceita `aplicarDescontoPix`; chamador em `quotes.service.ts` nao foi alterado.

## Estado do planejamento

STATE.md e ROADMAP.md nao foram atualizados nesta execucao (worktree paralelo; atualizacao fica com o orquestrador), mesmo criterio do 54-01.

## Self-Check: PASSED

- Arquivos modificados existem: efi.service.ts, efi.webhook.test.ts, efi.service.test.ts.
- Commits e9c5a91, cb25c5c, 90cc8c3 presentes no historico do ramo.
