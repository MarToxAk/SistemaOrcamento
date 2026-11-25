---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 01
subsystem: quotes
tags: [pagamento, pix, quitacao, centavos, tdd, fixtures]
requires: []
provides:
  - calcularPixAvista, calcularQuitacao, resolverSituacaoPagamentoQuote, paraCentavos, centavosParaReais, TOLERANCIA_QUITACAO_CENTAVOS
  - fixtures quote-pago (quoteBase, quotePagoPix26809, quoteEntrada50Pix, quoteSemPagamento, quotePagoCaixa, quoteIntegralSemDesconto)
affects: [54-02, 54-06, 54-10]
tech-stack:
  added: []
  patterns: ["util puro em centavos inteiros, sem Nest/Prisma/I-O"]
key-files:
  created:
    - apps/backend/src/modules/quotes/quote-payment.util.ts
    - apps/backend/src/modules/quotes/quote-payment.util.test.ts
    - apps/backend/src/modules/quotes/__fixtures__/quote-pago.fixture.ts
  modified: []
key-decisions:
  - "Tolerancia de quitacao fixa em 2 centavos (constante unica reutilizada por webhook e trava de NFS-e)."
  - "paymentConfirmedAt ou paymentNote sem paidTotal suficiente classifica como INTEGRAL/CAIXA (D-12), conforme regra 3 do plano."
status: complete
metrics:
  duration: "~25 min"
  completed: 2026-11-25
commits: 4
plan_head_before: 9fc19b1870407549f16dd0e31fa4b1170fc38959
plan_head_after: 2fb0533656f51c8bdec36fc476b6a7d5a49dd864
actuals:
  tokens: 9000
  tasks: 2
  commits: 4
---

# Phase 54 Plan 01: Util puro de pagamento do orcamento Summary

Fonte unica e pura de regras de pagamento (centavos inteiros, tolerancia de R$ 0,02, desconto de PIX a vista, situacao INTEGRAL/PARCIAL/SEM_PAGAMENTO) mais fixtures compartilhadas de quote pago, consumidas pelos planos 54-02, 54-06 e 54-10.

## O que foi feito

- **Tarefa 1 (TDD):** `paraCentavos`, `centavosParaReais`, `calcularPixAvista` (mesma expressao literal de `EfiService.resolvePaymentOptions`) e `calcularQuitacao`. Cobertos: #26809 (173,00 com desconto 8,65 e pago 164,35 quita), fronteira 164,33 quita / 164,32 nao (pendente 0,03), entrada 50%, total <= 150, acumulado em dois PIX, teto no total, entradas em texto com virgula e Decimal-like.
- **Tarefa 2 (TDD):** `resolverSituacaoPagamentoQuote` com as 5 regras do plano (PIX integral usa o valor pago, caixa libera sem senha, PARCIAL, SEM_PAGAMENTO) e `__fixtures__/quote-pago.fixture.ts`.
- Nenhum codigo de producao existente foi alterado (apenas arquivos novos).

## Verificacao

- `npm --prefix apps/backend run test -- src/modules/quotes/quote-payment.util.test.ts`: 27/27 verdes.
- `tsc -p tsconfig.json --noEmit` em `apps/backend`: sem erros.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug no plano/teste] Premissa de float incorreta**
- **Found during:** Task 1
- **Issue:** o plano afirma que `173 * 0.95` da `164.34999999999997`; em Node `173 * 0.95 === 164.35` exato. O teste que afirmava `not.toBe(164.35)` falhou.
- **Fix:** o teste passou a exercitar ruido de float real: desconto `173 - 173 * 0.95` (8.650000000000006) e pagamento literal `164.34999999999997`; ambos resultam em devido 164.35 e quitado.
- **Files modified:** `apps/backend/src/modules/quotes/quote-payment.util.test.ts`
- **Commit:** bf103be

**2. [Rule 1 - Bug de teste] Fronteira do resolver com fixture que tem paymentConfirmedAt**
- **Found during:** Task 2
- **Issue:** `quotePagoPix26809` ja traz `paymentConfirmedAt`; pela regra 3 do plano isso classifica INTEGRAL/CAIXA mesmo com paidTotal 164,32, mascarando a fronteira.
- **Fix:** o teste de fronteira zera `paymentConfirmedAt` para isolar a dependencia somente do `paidTotal`. Comportamento do util segue o plano.
- **Commit:** 2fb0533

**3. [Rule 3 - Ambiente] node_modules ausente no worktree**
- Criados symlinks locais (nao versionados) `node_modules` e `apps/backend/node_modules` para o repo principal. Como `node_modules/@orcamento/backend` aponta para o repo principal, o `npm exec -w @orcamento/backend -- tsc` do plano checaria o repo principal e nao o worktree; o typecheck foi rodado com `tsc` direto dentro de `apps/backend` do worktree.

## Pontos de atencao para os planos seguintes

- Se o webhook (54-02) gravar `paymentConfirmedAt` em pagamentos PIX **parciais** (entrada 50%), `resolverSituacaoPagamentoQuote` os classificara como INTEGRAL/CAIXA (regra 3 do plano). Os consumidores devem gravar `paymentConfirmedAt` apenas na quitacao, ou o plano 54-02/54-06 deve ajustar a regra.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum (apenas util puro e testes).

## Estado do planejamento

STATE.md e ROADMAP.md nao foram atualizados nesta execucao (worktree paralelo; atualizacao fica com o orquestrador).

## Self-Check: PASSED

- quote-payment.util.ts, quote-payment.util.test.ts e quote-pago.fixture.ts existem.
- Commits 4f4687c, bf103be, 0a20153, 2fb0533 presentes no historico.
