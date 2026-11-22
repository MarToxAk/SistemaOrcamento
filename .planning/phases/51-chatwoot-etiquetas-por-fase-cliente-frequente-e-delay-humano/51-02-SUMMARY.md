---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
plan: 02
subsystem: integrations/chatwoot + quotes
tags: [chatwoot, etiquetas, cliente-frequente, fila-por-conversa, enviarParaCliente, create]
requires: ["51-01"]
provides:
  - "chatwoot-etiquetas.ts: STATUS_PEDIDO_CONCRETIZADO, lerLimiaresClienteFrequente, inicioJanelaClienteFrequente, clienteEhFrequente, enfileirarPorConversa (teto 3), aguardarFilaEtiquetas"
  - "QuotesService.sincronizarEtiquetasChatwoot completo: fila por conversa, cotacao mais recente, cliente-frequente"
  - "Gancho dispararEtiquetasChatwoot em enviarParaCliente (-> ENVIADO) e create, depois do commit"
affects:
  - "51-03 (webhooks EFI) reutiliza sincronizarEtiquetasChatwoot sem mudar a assinatura"
  - "51-04 (fechamento) reutiliza enfileirarPorConversa e aguardarFilaEtiquetas"
tech-stack:
  added: []
  patterns:
    - "fila por conversationId (Map de caudas de promessa) + semaforo global, so promises"
    - "leitura fresca do banco e do Chatwoot dentro da fila (R1/R2)"
key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/quotes/quotes.service.etiquetas.test.ts
    - apps/backend/src/modules/quotes/quotes.service.mensagem.test.ts
    - apps/backend/src/modules/quotes/quotes.service.chatwoot.test.ts
key-decisions:
  - "janela de 6 meses calculada em UTC (setUTCMonth) para nao depender do fuso do servidor"
  - "limiares por env aceitam so inteiros decimais >= 1 (regex ^\\d+$); qualquer outro valor volta ao padrao 3 / 6"
  - "contagem de cliente frequente so no Prisma, por createdAt, sem indice novo (T-51-09 aceito)"
requirements-completed: [CW-02, CW-03, CW-05, CW-12]
status: complete
duration: ~20 min
completed: 2026-11-21
actuals:
  tokens: 7700
  tasks: 2
  commits: 2
plan_head_before: 67efe73cb3da90bad2668721b748783c1899aca9
plan_head_after: aab5fce92a7fb2866ba22ad9b390def84e0e1118
---

# Phase 51 Plan 02: Cliente frequente, fila por conversa e ganchos restantes de QuotesService Summary

A sincronizacao de etiquetas passa a refletir a fase da cotacao mais recente da conversa mais `cliente-frequente` (3+ pedidos concretizados em 6 meses), com gravacoes serializadas por conversa (teto global de 3) e disparo tambem em `enviarParaCliente` e `create`, sempre depois do commit.

## O que foi feito

**Task 1 (tracer, commit 0b9f127):**
- `chatwoot-etiquetas.ts`: `STATUS_PEDIDO_CONCRETIZADO` (APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE), `lerLimiaresClienteFrequente`, `inicioJanelaClienteFrequente`, `clienteEhFrequente` (uma unica `count` por createdAt), `enfileirarPorConversa` (serie por conversa, paralelo entre conversas, semaforo de 3, so promises, cauda que nunca rejeita) e `aguardarFilaEtiquetas`.
- `QuotesService.sincronizarEtiquetasChatwoot`: depois do kill-switch e do `findUnique` do conversationId, executa dentro de `enfileirarPorConversa`: `findFirst` (where conversationId, orderBy updatedAt desc, select status/customerId) -> fase + cliente frequente -> `aplicarEtiquetasGerenciadas`. Continua sem lancar e sem tocar no Athos; log leve so com quoteId, conversationId e `alterou`.
- Testes: 18 novos puros em `chatwoot-etiquetas.test.ts` (38 no total) e F1 a F6 em `quotes.service.etiquetas.test.ts` (13 no total; `prepararTroca` agora distingue o `findFirst` do changeStatus do da conversa).

**Task 2 (commit aab5fce):**
- `enviarParaCliente` dispara o gancho logo depois do `prisma.quote.update` que grava ENVIADO (so quando a transicao acontece).
- `create` dispara depois do `$transaction`, antes de `mapQuoteBody`, sem await.
- G1 a G3 em `quotes.service.mensagem.test.ts` e G4/G5 em `quotes.service.chatwoot.test.ts`.

## Verificacao

- `jest src/modules/integrations/chatwoot src/modules/quotes/quotes.service.etiquetas`: 4 suites, 76 testes passando.
- `jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot`: 19 suites passando + 1 pulada; 262 passed, 18 skipped (baseline 200 passed, 18 skipped; apos 51-01: 233).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceite: `clienteEhFrequente` no etiquetas.ts (1 linha de definicao, mais o uso em quotes.service.ts), `enfileirarPorConversa` em quotes.service.ts (3 linhas), `STATUS_PEDIDO_CONCRETIZADO` 2+ vezes, `dispararEtiquetasChatwoot` 4 vezes em quotes.service.ts, `sincronizarEtiquetasChatwoot` 5 e 2 vezes nos testes de mensagem e chatwoot.

## Deviations from Plan

Nenhuma de regra 1 a 4. Observacoes:
- O criterio "pelo menos 22 `it(`" em `chatwoot-etiquetas.test.ts` conta so `it(` literais; o arquivo tem 33 `it(` (mais 5 casos de `it.each` para valores invalidos), entao atende com folga.
- Em G2 (ja ENVIADO), outros `prisma.quote.update` (dados do pagamento) ocorrem legitimamente; a asserção verifica que nenhum update grava `status`, em vez de "update nao chamado".
- Os testes F foram escritos junto da implementacao (ordem Task 1 passos 1-3 antes do 4), sem ciclo vermelho observado separadamente.
- Estado do projeto (STATE.md, ROADMAP.md, REQUIREMENTS.md, config.json) NAO foi atualizado, por instrucao do orquestrador.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova. Mitigacoes T-51-06 (F5, fila por conversa), T-51-07 (teto 3), T-51-08 (E7 do 51-01 segue valendo; logs so com ids) e T-51-11 (G1, G4) cobertas por testes. T-51-09 e T-51-10 aceitos conforme o plano.

## Self-Check: PASSED

- FOUND: chatwoot-etiquetas.ts, chatwoot-etiquetas.test.ts, quotes.service.ts, quotes.service.etiquetas.test.ts, quotes.service.mensagem.test.ts, quotes.service.chatwoot.test.ts
- FOUND commits: 0b9f127, aab5fce
