---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 01
subsystem: api
tags: [nestjs, prisma, efi, boleto, juros, multa, cobranca]

requires:
  - phase: 43-baixa-athos
    provides: calcularEncargosTitulo (athos-baixa-encargos.util) e hojeSaoPaulo reaproveitados no calculo
  - phase: 45-aviso-vencimento
    provides: somarDias (cobranca-aviso-vencimento.util)
provides:
  - POST /api/cobranca/boleto/:id/atualizar (tracer do boleto atualizado)
  - model CobrancaEncargosConfig + campos de vinculo/snapshot em CobrancaBoleto e CobrancaBoletoTitulo (migration aditiva)
  - util puro de dia util, calculo por titulo, configurations EFI e mensagem informativa
  - CobrancaService.prepararEmissaoEfi e montarItensEfiPorVendaItem publico
affects: [50-02, 50-03, 50-04, 50-05, 50-06, 50-07]

actuals:
  tokens: 15900
  tasks: 2
  commits: 3
plan_head_before: 871d97c4136198d6460a5406d6892de7b7a9ed95
plan_head_after: be3471dc4f20f5595911d5811234f31daec5a97e

tech-stack:
  added: []
  patterns:
    - "Ordem estrita criar -> persistir -> cancelar (so code 200), sem remocao de linhas"
    - "Singleton de config no padrao ChatwootAutomationConfig (id default, get-or-create)"
    - "Teste HTTP com guard global real + ValidationPipe do main.ts e dependencias falsas"

key-files:
  created:
    - apps/backend/prisma/migrations/20261117120000_add_cobranca_boleto_atualizado/migration.sql
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.test.ts
    - apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.ts
    - apps/backend/src/modules/cobranca/dto/gerar-boleto-atualizado.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.controller.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.emissao-efi.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts

key-decisions:
  - "configurations.fine/interest e o texto de novo atraso usam as taxas PADRAO configuradas, mesmo quando o operador editou as taxas do calculo; os dois pares ficam gravados no boleto (aplicadas e pos-vencimento)"
  - "CobrancaBoletoTitulo.valor continua sendo o PRINCIPAL; o total fica em CobrancaBoleto.valor (a baixa compara o valor do titulo com o Athos)"
  - "Falha ao gravar o novo boleto depois da EFI aceitar vira 500 com o charge_id na mensagem e no log; compensacao fica para 50-03"

patterns-established:
  - "Cancelamento estrito: so cancelResp.data.code === 200 marca o original como cancelado; qualquer outro caso devolve cancelamentoOriginal falhou com aviso"

requirements-completed: [BA-01, BA-02, BA-05, BA-09]

coverage:
  - id: D1
    description: "Rota POST /cobranca/boleto/:id/atualizar cria o boleto atualizado (caso dourado 1.022,64), grava vinculo e snapshot e cancela o original de forma estrita"
    requirement: BA-05
    verification:
      - kind: integration
        ref: "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts#H1..H8"
        status: pass
    human_judgment: false
  - id: D2
    description: "Regras de data (hoje SP ou proximo dia util), calculo por titulo e tetos de taxa"
    requirement: BA-02
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.test.ts#U1..U13"
        status: pass
    human_judgment: false
  - id: D3
    description: "Boleto novo sai com configurations fine/interest e mensagem informativa de ate 4 linhas ASCII"
    requirement: BA-09
    verification:
      - kind: integration
        ref: "cobranca-boleto-atualizado.http.test.ts#H2 corpo EFI; cobranca-boleto-atualizado.util.test.ts#U11,U12"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration aditiva e idempotente, nao aplicada em banco algum"
    requirement: BA-09
    verification:
      - kind: other
        ref: "npx prisma validate --schema apps/backend/prisma/schema.prisma; grep -o 'IF NOT EXISTS' ... | wc -l = 16"
        status: pass
    human_judgment: true
    rationale: "A aplicacao real so ocorre no deploy (apos o gate de 50-07); o SQL idempotente foi validado so por prisma validate e migrate diff, sem banco."
  - id: D5
    description: "Helper prepararEmissaoEfi reproduz customer PF/PJ, autenticacao e notification_url de criarBoleto"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.emissao-efi.test.ts#E1..E5"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 01: Boleto atualizado (tracer) Summary

**POST /cobranca/boleto/:id/atualizar gera boleto EFI com linhas de juros de mora e multa por atraso (calculo por titulo, pro rata e half-up), configurations pos-vencimento e mensagem informativa, e cancela o original so depois de gravar o novo, sem apagar linhas.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-17T13:04Z (aprox.)
- **Completed:** 2026-11-17T13:19Z
- **Tasks:** 2
- **Files modified:** 12 (9 criados, 3 alterados)

## Accomplishments

- Schema e migration `20261117120000_add_cobranca_boleto_atualizado`: `CobrancaEncargosConfig` (singleton), `boletoOrigemId` (self-relation `ON DELETE SET NULL`), valores/taxas aplicadas e pos-vencimento, mensagem e snapshot por titulo (juros, multa, diasAtraso, vencimentoOriginal). 16 clausulas `IF NOT EXISTS`, FK protegida por `pg_constraint`, nenhum `DROP`. Apenas `prisma generate` e `prisma validate` foram executados; nenhum comando de migracao contra banco.
- Util puro (`cobranca-boleto-atualizado.util.ts`): `proximoDiaUtil`, `vencimentosPermitidos`, `novoVencimentoPermitido`, `validarTaxas` (tetos 1% a.m. e 2%), `calcularBoletoAtualizado` (reusa `calcularEncargosTitulo` com carencia 0, somas em centavos), `configuracoesEfi`, `montarMensagemAtualizacao` e formatadores. Caso dourado 1000,00 vencido em 10/11 com novo vencimento 18/11 = 8 dias, juros 2,64, multa 20,00, total 1.022,64.
- `CobrancaBoletoAtualizadoService.gerar`: valida pendente e data, le titulos no Athos, calcula no servidor (o corpo so traz vencimento e taxas), sincroniza com a EFI (pago/cancelado recusa), monta itens (soma conferida em centavos), emite no one-step, persiste com vinculo e snapshot e so entao cancela o original (code 200). Falha de cancelamento devolve `cancelamentoOriginal: "falhou"` com aviso; falha da EFI ao criar nao grava nada.
- `CobrancaService` ganhou `prepararEmissaoEfi` e tornou publico `montarItensEfiPorVendaItem`; `criarBoleto` ficou byte a byte igual (gate de regiao contra `ec3199e` passou).
- Tracer gate: verify end-to-end re-executado e verde (8 testes HTTP). Tracer verificado de ponta a ponta, expansao liberada.

## Task Commits

1. **Task 1 (tracer), RED:** `70f3196` test(50-01): tracer HTTP do boleto atualizado
2. **Task 1 (tracer), GREEN:** `12d5b3e` feat(50-01): POST /cobranca/boleto/:id/atualizar gera boleto com juros e multa
3. **Task 2:** `be3471d` test(50-01): regras puras do boleto atualizado e helper de emissao EFI

## Verification

- `npm --prefix apps/backend run prisma:generate`: Generated Prisma Client; `npx prisma validate`: schema valido.
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 25 suites, 332 passed (baseline 306; +8 tracer, +13 util, +5 emissao).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceitacao de ambas as tasks (grep de schema, migration, ausencia de `.delete(`, util sem import de Nest/Prisma, modulo, gate de regiao de `criarBoleto`): todos passaram.

## Deviations from Plan

None - plan executed exactly as written. Observacao: o util foi escrito por inteiro na Task 1 (o tracer o exige), entao os testes U1..U13 e E1..E5 da Task 2 passaram na primeira execucao como testes de caracterizacao; nenhum ajuste de producao foi necessario.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. A nova rota e coberta pelo `<threat_model>` do plano (T-50-01..T-50-07).

## Issues Encountered

None. O `prisma generate` carrega o `.env` do projeto por conta propria (comportamento do Prisma); nenhum arquivo `.env` foi lido ou alterado pelo executor.

## Next Phase Readiness

Pronto para 50-02 (baixa Athos com encargos fixos, le os campos novos), 50-03 (previa, sucessor ativo/retentativa, mutex, compensacao de falha pos-EFI), 50-04 (tela de taxas) e seguintes. Migration ainda NAO aplicada; sera aplicada pelo `prisma migrate deploy` do bootstrap no deploy, depois do gate de 50-07.

## Self-Check: PASSED

- Arquivos criados existem no disco (verificados abaixo na execucao).
- Commits `70f3196`, `12d5b3e`, `be3471d` sao ancestrais de HEAD.
