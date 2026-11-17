---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 02
subsystem: api
tags: [nestjs, athos, baixa, boleto, juros, multa, cobranca]

requires:
  - phase: 43-baixa-athos
    provides: AthosContaReceberBaixaService.baixarTitulos, athos-baixa-encargos.util e orquestrador CobrancaBaixaAthosService
  - phase: 50-01
    provides: campos de snapshot (juros/multa/diasAtraso) e de vinculo/pos-vencimento no schema Prisma
provides:
  - decidirValoresBaixaFixos (pura): confere valor da EFI contra principal+juros+multa do snapshot e contra o teto pos-vencimento
  - BaixarTitulosInput.titulos[].encargosFixos e posVencimento; caminho de encargos fixos na fase 2b sem ler conf_financeiro
  - CobrancaBaixaAthosService repassando snapshot e pos-vencimento no automatico, manual (inclusive simular) e retentativa
affects: [50-03, 50-07]


actuals:
  tokens: 17000
  tasks: 2
  commits: 3
plan_head_before: 787e422360194a4745d41e82dca746e349bff966
plan_head_after: 98641bbd5b1a1472bda167737dcc76bbbb8ff34a

tech-stack:
  added: []
  patterns:
    - "Espalhamento condicional: boleto comum continua enviando exatamente { idcontareceber, valorEsperado } e sem a chave posVencimento"
    - "Rateio proporcional em centavos com o resto no ultimo titulo (soma exata)"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.boleto-atualizado.tracer.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.ts
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.test.ts
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts

key-decisions:
  - "Caminho de encargos fixos so e usado quando TODOS os titulos pendentes trazem encargosFixos; mistura parcial entre os titulos do boleto e recusada com CONFIG_INVALIDA antes de abrir conexao"
  - "No caminho fixo nao existe modo nominal: pagar so o principal e VALOR_INCOMPATIVEL (o boleto atualizado cobra os encargos explicitamente)"
  - "Pagamento depois do novo vencimento aceita excedente ate multa teorica + juros diarios (sem carencia) + tolerancia, tudo calculado com as taxas pos-vencimento gravadas no boleto"

requirements-completed: [BA-06, BA-09]

coverage:
  - id: D1
    description: "Boleto atualizado pago baixa o titulo original com juros 2,64 / multa 20,00 / atraso 8 do snapshot, numa transacao, sem ler conf_financeiro"
    requirement: BA-06
    verification:
      - kind: integration
        ref: "apps/backend/src/modules/cobranca/cobranca-baixa-athos.boleto-atualizado.tracer.test.ts#A1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Valor pago divergente do snapshot (inclusive so o principal) -> VALOR_INCOMPATIVEL sem escrita e falha registrada"
    requirement: BA-06
    verification:
      - kind: integration
        ref: "cobranca-baixa-athos.boleto-atualizado.tracer.test.ts#A2; athos-conta-receber-baixa.service.test.ts#B3"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pagamento atrasado do boleto atualizado aceito ate o teto dos encargos pos-vencimento, com rateio exato entre titulos"
    requirement: BA-09
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.test.ts#F1..F8"
        status: pass
    human_judgment: false
  - id: D4
    description: "Boleto comum, titulo REC, simulacao e baixa manual sem regressao"
    requirement: BA-06
    verification:
      - kind: unit
        ref: "athos-conta-receber-baixa.service.test.ts#B2,B4,B5; cobranca-baixa-athos.service.test.ts#C1..C4; suite completa 1126 passed"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 02: Baixa Athos do boleto atualizado Summary

**Baixa automatica no Athos do titulo original com os juros, a multa e o atraso cobrados no boleto atualizado (snapshot), conferindo o valor da EFI contra o snapshot e contra o teto de encargos pos-vencimento, sem recalcular pelo conf_financeiro do Athos.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-11-17
- **Tasks:** 2
- **Files modified:** 7 (1 criado, 6 alterados)

## Accomplishments

- `decidirValoresBaixaFixos` (pura, em centavos, nunca lanca): snapshot quando a EFI nao informa valor ou bate dentro de R$ 0,10; apos o novo vencimento aceita excedente ate multa teorica + juros diarios pelos dias apos o vencimento + tolerancia; multa extra primeiro (ate a multa teorica), resto como juros; rateio proporcional ao valor atualizado com o resto no ultimo titulo; atraso acrescido dos dias apos o vencimento. Caso de referencia conferido: 1043,76 em V+2 gera juros 3,31, multa 40,45, atraso 10.
- `baixarTitulos`: `encargosFixos` por titulo e `posVencimento`; validacao pura antes de abrir conexao (parcial ou invalido -> `CONFIG_INVALIDA`); quando todos os pendentes tem encargos fixos a leitura de `conf_financeiro` nao acontece. A fase de escrita e o SQL permanecem identicos (gate de regiao contra `ec3199e` passou).
- `CobrancaBaixaAthosService`: `titulosParaBaixa` acrescenta `encargosFixos` so quando juros e multa do snapshot existem; `posVencimentoParaBaixa` so para boleto com `boletoOrigemId`, `expireAt` e as duas taxas; repassado nas duas chamadas a `baixarTitulos` (automatica/retentativa via `executarBaixa`, manual e simulacao).
- Tracer: boleto 42 pago -> orquestrador real -> servico Athos real (pg mockado) -> sequencia de SQL da baixa, INSERT em `conta_recebida` com `1022.64 / 2.64 / 8 / 20.00`, sem `LER_CONF`.
- Tracer gate (auto): verify end-to-end re-executado apos o GREEN, 2 passed; expansao liberada.

## Task Commits

1. **Task 1 (tracer), RED:** `da4b5fa` test(50-02): tracer da baixa Athos do boleto atualizado (RED)
2. **Task 1 (tracer), GREEN:** `09786eb` feat(50-02): baixa Athos do boleto atualizado com encargos fixos do snapshot
3. **Task 2:** `98641bb` test(50-02): conferencia da baixa do boleto atualizado (tolerancia, pos-vencimento, rateio, REC, manual)

## Verification

- `npm --prefix apps/backend run test -- athos-conta-receber-baixa athos-baixa-encargos cobranca-baixa-athos --no-coverage`: 7 suites, 156 passed (baseline 137; +2 tracer, +17).
- `npm --prefix apps/backend run test -- --no-coverage`: 79 suites passed, 1126 passed, 28 skipped (baseline 1081).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceitacao: greps de `decidirValoresBaixaFixos`, `encargosFixos`, `posVencimento` ok; gate de regiao do SQL ok; numstat dos testes antigos com 0 linhas removidas (60/94/90 adicionadas, 0 removidas).

## Deviations from Plan

None - plan executed exactly as written. Observacao: o passo 3 da regra (D-12) foi implementado por inteiro na Task 1 (a assinatura final ja o exigia), entao F1..F8 passaram na primeira execucao como testes de caracterizacao; nenhum ajuste de codigo foi necessario na Task 2. Alem disso, o caso C3 cobre tambem `simular: true` (a chamada de simulacao do `baixarManual` tambem repassa os campos).

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. Nenhuma superficie nova alem das cobertas por T-50-08..T-50-11 (mitigadas por F2-F6, A2, B3, B4, C2 e gate de numstat).

## Issues Encountered

None. A suite de testes imprime o aviso "worker failed to exit gracefully" (pre-existente, nao relacionado a este plano).

## Next Phase Readiness

Pronto para 50-03. Nenhuma migration aplicada e nenhuma conexao a Athos/EFI reais foi feita (pg mockado, `assertHostPermitido` com hosts locais).

## Self-Check: PASSED

- Arquivo criado (tracer) existe; commits `da4b5fa`, `09786eb`, `98641bb` sao ancestrais de HEAD.
