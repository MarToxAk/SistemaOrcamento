---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 05
subsystem: api
tags: [nestjs, prisma, boleto, email, efi, webhook, cobranca]

requires:
  - phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
    provides: "50-01: CobrancaBoleto.mensagemAtualizacao, boletoOrigemId, valorJuros/valorMulta e snapshot juros/multa/diasAtraso por titulo"
provides:
  - "Quadro 'Boleto atualizado' no e-mail de boleto (HTML e texto), com CC padrao inalterado"
  - "CobrancaService.alertarPagamentoBoletoSubstituido (log WARN, nunca lanca) no webhook e no Verificar"
  - "buscarTitulosComBoletoAtivo com ordenacao por boleto, total, vinculo, juros/multa e alertaPagamentoDuplicado"
affects: [50-06, 50-07]

actuals:
  tokens: 6200
  tasks: 2
  commits: 4
plan_head_before: 05cae5705a2b583dd13fe8038ffc4576d0cb6bfd
plan_head_after: eb6890c4252f71df7fd2ca3edb6ede971f2da37f

tech-stack:
  added: []
  patterns:
    - "Alerta interno por log WARN em ASCII com ids e status apenas, helper try/catch que nunca derruba o webhook"
    - "Conversao defensiva de Decimal/null/undefined para number|null na consulta da tela (nunca NaN)"

key-files:
  created: []
  modified:
    - apps/backend/src/modules/cobranca/email-envio.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.service.baixa-hook.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.titulos-em-uso.test.ts

key-decisions:
  - "O alerta D-15 so consulta o sucessor (findFirst por boletoOrigemId, status != cancelado) e loga; nenhuma escrita nem chamada EFI, entao o boleto atualizado nunca e tocado"
  - "No webhook o alerta roda depois do update para pago e antes da consulta da cobranca/baixa, mantendo o fluxo de baixa identico"
  - "alertaPagamentoDuplicado = original pago OU (este pago E sucessor nao cancelado); boletoRelacionadoId aponta para o outro boleto"

patterns-established:
  - "Mensagem do boleto atualizado renderizada linha a linha: escapeHtml + <br> no HTML, bloco 'Boleto atualizado:' no texto, ausente em boleto comum"

requirements-completed: [BA-07, BA-10]

coverage:
  - id: D1
    description: "E-mail do boleto atualizado leva o quadro com a mensagem (juros, multa, vencimento original, novo vencimento e taxas) escapada, com o mesmo assunto e CC; boleto comum fica identico"
    requirement: BA-07
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/email-envio.service.test.ts#M1..M3"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pagamento do original cancelado com boleto atualizado ativo (webhook e Verificar) segue a baixa normal e so emite alerta WARN, sem cancelar nem alterar o novo; falha do alerta nao derruba o webhook"
    requirement: BA-10
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.baixa-hook.test.ts#D1..D4"
        status: pass
    human_judgment: false
  - id: D3
    description: "titulos-em-uso ordena por boleto e entrega total, vinculo, juros/multa e alertaPagamentoDuplicado sem NaN em linhas antigas"
    requirement: BA-10
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.titulos-em-uso.test.ts#T1..T5"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 05: E-mail do boleto atualizado e alerta de pagamento em dobro Summary

**O e-mail de boleto existente passa a levar o quadro "Boleto atualizado" com a mensagem gravada, e o pagamento de um original cancelado gera apenas alerta WARN e sinal na consulta da tela, sem cancelar o boleto novo.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 5 (nenhum criado)

## Accomplishments

- `enviarBoletoENotas` aproveita o `findUnique` ja existente para ler `mensagemAtualizacao`; `montarCorpoHtml` e `montarCorpoTexto` ganharam o campo opcional e inserem o quadro antes da lista de documentos (cada linha por `escapeHtml`, unidas por `<br>`). Sem mensagem a saida e identica a de hoje; assunto, anexos, CC e registro de envio nao mudaram.
- `alertarPagamentoBoletoSubstituido` em `CobrancaService`: consulta o sucessor ativo e loga em ASCII "ALERTA pagamento em dobro possivel" com os dois ids, o status e a origem (webhook ou reconciliacao). Erros viram `logger.error` com o id e o nome do erro; nunca relanca. Chamado em `processarNotificacaoEFI` (quando o boleto estava cancelado) e em `verificarPagamentoBoleto` (cancelado para pago).
- `buscarTitulosComBoletoAtivo`: `orderBy: { cobrancaBoletoId: "asc" }` (boleto mais novo vence no mapa da tela) e campos novos `valorBoleto`, `boletoOrigemId`, `valorJuros`, `valorMulta`, `jurosTitulo`, `multaTitulo`, `diasAtrasoTitulo`, `alertaPagamentoDuplicado`, `boletoRelacionadoId`, com conversao defensiva.
- Confirmado por grep que o frontend nao consome `boleto/cliente`; `buscarBoletosCliente` ficou como esta. Gate de regiao (`buscarDetalheBoleto` ate `removerBoletoBanco`) identico a `ec3199e`.
- Tracer gate: `email-envio` re-executado verde (45 passed) antes de seguir para a Task 2.

## Task Commits

1. **Task 1 (tracer), RED:** `52f12d3` test(50-05): tracer do e-mail do boleto atualizado
2. **Task 1 (tracer), GREEN:** `7505800` feat(50-05): e-mail do boleto atualizado leva o quadro com a mensagem informativa
3. **Task 2, RED:** `938e9b4` test(50-05): alerta de pagamento do original cancelado e titulos-em-uso do boleto atualizado
4. **Task 2, GREEN:** `eb6890c` feat(50-05): alerta de pagamento do original cancelado e titulos-em-uso do boleto atualizado

## Verification

- `npm --prefix apps/backend run test -- email-envio --no-coverage`: 45 passed (baseline 42, +3).
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 28 suites, 383 passed (inclui D1..D4, D3b e T1..T5).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceitacao: `alertarPagamentoBoletoSubstituido` 3 ocorrencias, `orderBy` 1, `alertaPagamentoDuplicado` 2, `boleto/cliente` no frontend 0, gate de regiao OK, nenhuma linha removida nos testes existentes (numstat com 0 remocoes).

## Deviations from Plan

Nenhuma de regra 1 a 4. Acrescentei um caso extra D3b (boleto pendente pago nao consulta sucessor nem alerta) para travar o caminho comum; nao estava no plano e nao altera nenhum caso existente.

## Issues Encountered

Nenhum.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes T-50-20 a T-50-23 aplicadas: escape do HTML (M2), WARN com os dois ids mais sinal persistido na consulta (D1, D2, T3, T4), helper que nunca lanca (D4) e log apenas com ids e status.

## Next Phase Readiness

50-06 (tela do operador) ja pode consumir `valorBoleto`, `boletoOrigemId`, juros/multa, `alertaPagamentoDuplicado` e `boletoRelacionadoId` de `titulos-em-uso`.

## Self-Check: PASSED

Commits `52f12d3`, `7505800`, `938e9b4` e `eb6890c` presentes no historico; arquivos modificados existentes.
