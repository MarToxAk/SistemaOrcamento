---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 10
subsystem: quotes
tags: [pagamento, pix, reconciliacao, script, dry-run, tdd]
requires: ["54-01"]
provides:
  - planejarReconciliacao, interpretarArgumentos, LIMITE_PADRAO, AUTOR_RECONCILIACAO (util puro)
  - scripts/reconciliar-pagamentos-pix.ts (dry-run por padrao, --aplicar, --quote, --limite, --ajuda)
affects: [54-12]
tech-stack:
  added: []
  patterns: ["util puro em centavos reutilizando quote-payment.util", "script ts-node com PrismaClient proprio e escrita condicional por orcamento"]
key-files:
  created:
    - apps/backend/src/modules/quotes/quote-payment-reconciliation.util.ts
    - apps/backend/src/modules/quotes/quote-payment-reconciliation.util.test.ts
    - apps/backend/scripts/reconciliar-pagamentos-pix.ts
  modified: []
key-decisions:
  - "Elegibilidade decidida somente pelas transacoes PIX no txid a vista (paymentExternalId); paymentConfirmedAt nunca e filtro nem entrada da decisao."
  - "paymentAmount grava a soma efetivamente paga no txid a vista (ex. 164.33), nao o valor devido teorico; paymentDiscount vem de calcularPixAvista."
  - "Com --quote o script nao aplica o filtro de candidatos (paidTotal > 0 etc.), para o planejador explicar o motivo de descarte do orcamento pedido."
  - "Atualizacao condicional por orcamento: paymentDiscount ainda zero E status igual ao lido; senao pula e relata como alterado por outro processo."
status: complete
metrics:
  duration: "~20 min"
  completed: 2026-11-25
commits: 3
plan_head_before: bd4fd31096789760e881a98d4713f1066147a08e
plan_head_after: 57835aeecc476f4efc6474a635ec78cacae18786
actuals:
  tokens: 7000
  tasks: 2
  commits: 3
---

# Phase 54 Plan 10: Reconciliacao de pagamentos PIX a vista Summary

Funcao pura `planejarReconciliacao` (elegibilidade e plano para orcamentos gravados como parciais pelo webhook antigo, como o #26809) e script `reconciliar-pagamentos-pix.ts` com DRY-RUN por padrao e escrita somente com `--aplicar`. Nada foi executado contra banco real.

## O que foi feito

- **Tarefa 1 (TDD, RED 9393e97 / GREEN 092eb24):** `planejarReconciliacao` e `interpretarArgumentos`. O desconto vem de `calcularPixAvista(total)` e a quitacao de `calcularQuitacao`, ambos de `quote-payment.util` (centavos inteiros, tolerancia de R$ 0,02). Motivos de descarte: CANCELADO, JA_RECONCILIADO, SEM_TXID_AVISTA, SEM_DESCONTO_AVISTA, SEM_TRANSACAO_AVISTA, PAGO_SEM_DESCONTO, VALOR_INCOMPATIVEL. O plano traz `paymentDiscount`, `paymentAmount`, `pendingTotal` 0, `paymentConfirmedAt` (o existente, ou o `processedAt` da ultima transacao a vista), `novoStatus` APROVADO somente quando o status atual e PAGAMENTO_PARCIAL e `transacoesParaPago` (a vista ainda PARTIAL). Soma duas transacoes a vista (100,00 + 64,35). Transacao que nao e PIX, com status fora de PAID/PARTIAL ou com metadata ausente/invalida nao conta.
- **Tarefa 2 (57835ae):** script no estilo de `seed-pdf-templates.ts`. `--ajuda` e argumento invalido saem antes de qualquer conexao. Imprime modo e `host/banco` (sem usuario/senha) antes da primeira consulta; em `--aplicar` aguarda 5 s. Cada elegivel e gravado numa `$transaction` propria com `updateMany` condicional; transacoes PARTIAL do plano viram PAID; quando o status muda grava `QuoteStatusHistory` com autor "Reconciliacao Fase 54". Sem Chatwoot, sem mensagem ao cliente, sem `QuotesService`. No fim lista os orcamentos com status alterado para conferir as etiquetas. `$disconnect` em `finally` e `exitCode` 1 em erro/falha.

## Achado do 54-01 considerado

`resolverSituacaoPagamentoQuote` classifica INTEGRAL/CAIXA quando `paymentConfirmedAt` esta preenchido. Consequencias tratadas aqui:

- A reconciliacao nao usa esse resolver nem filtra por `paymentConfirmedAt`; um orcamento com `paymentConfirmedAt` ja preenchido (ex. confirmado no caixa) e PIX a vista de 164,35 continua elegivel e o valor existente e preservado (teste dedicado).
- Entrada de 50% (txid de `secondInstallmentExternalId`) nunca e reconciliada, entao `paymentConfirmedAt` nao e gravado em pagamento parcial.
- Teste de regressao: depois do plano, o resolver devolve INTEGRAL/PIX com `valorMaximoNota` 164,35 (teto no valor pago, nao no total 173,00) e a trava de NFS-e (54-06) libera o #26809. Antes da reconciliacao, um orcamento nesse estado com `paymentConfirmedAt` seria visto como CAIXA com teto no valor devido de 173,00 (sem desconto gravado); a reconciliacao corrige isso.

## Verificacao

- `npm --prefix apps/backend run test -- src/modules/quotes/quote-payment`: 2 suites, 53/53 verdes (26 novos da reconciliacao + 27 do 54-01).
- `tsc -p tsconfig.json --noEmit` em `apps/backend`: sem erros. O script (fora do `include`) tambem foi checado com `tsc --noEmit` direto e compilado pelo ts-node.
- `env -u DATABASE_URL npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/reconciliar-pagamentos-pix.ts --ajuda`: imprime o uso, exit 0, sem DATABASE_URL (prova que nao conecta). `--limite abc` imprime erro e uso com exit 1.
- Nenhum comando desta execucao usou DATABASE_URL real; o script nunca foi rodado com acesso a banco.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Ambiente] node_modules ausente no worktree**
- Criados symlinks locais nao versionados `node_modules` e `apps/backend/node_modules` apontando para o repo principal (aparecem como untracked, nunca adicionados). O typecheck foi rodado com `tsc` direto em `apps/backend` (o `npm exec -w @orcamento/backend` do plano checaria o repo principal, nao o worktree).

**2. [Rule 2 - Robustez] Escolhas adicionais nao previstas literalmente**
- `--quote` ignora o filtro de candidatos para que o planejador diga por que um orcamento nao e elegivel (em vez de "nenhum orcamento encontrado").
- `updateMany` condicional tambem exige o status lido (alem de `paymentDiscount` zero) para nao sobrescrever mudanca manual de status no intervalo.
- Identificador numerico maior que Int32 so casa `externalQuoteId` (evita erro do Postgres em `internalNumber`).
- Argumentos aceitam `--flag=valor` alem de `--flag valor`.

Nenhum desvio de escopo; STATE.md e ROADMAP.md nao foram alterados (worktree paralelo, atualizacao fica com o orquestrador, como no 54-01).

## Pontos de atencao para o 54-12 (checkpoint)

- Executar primeiro em DRY-RUN contra producao, conferir a lista (esperado o #26809) e so entao `--aplicar --quote 26809`.
- Depois de aplicar, conferir manualmente as etiquetas do Chatwoot dos orcamentos que mudaram para APROVADO (o script nao as sincroniza).
- Quotes com `paidTotal` acumulado de entrada 50% somada a pagamento a vista nao sao tratados de forma especial: a decisao usa so as transacoes do txid a vista.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do ja coberto por T-54-26 e T-54-27 (dry-run padrao, host/banco sem credenciais, pausa de 5 s, atualizacao condicional e transacao por orcamento).

## Self-Check: PASSED

- Os tres arquivos de codigo existem; commits 9393e97, 092eb24 e 57835ae presentes no historico da branch do worktree.
