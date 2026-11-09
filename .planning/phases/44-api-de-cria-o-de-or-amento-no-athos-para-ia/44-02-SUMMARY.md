---
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
plan: 02
subsystem: api
tags: [nestjs, athos, postgres-9.0.5, orcamento, simulacao, descontos, deploy, tdd]
status: complete
requires:
  - phase: 44-01
    provides: AthosOrcamentoService (tracer), athos-orcamento-calc.util (calcularOrcamento), DTO e controller
provides:
  - modo simular (SET TRANSACTION READ ONLY + ROLLBACK) em criarOrcamento, funcional com a escrita desligada
  - idcliente opcional validado (CLIENTE_INEXISTENTE 422) e gravado
  - descontoRS por item, valorUnitario (abaixo do preco vira desconto) e descontoTotalRS com limite conf_vendas.permitedescontode
  - athos-orcamento.service.test.ts (46 testes, pg falso, varredura de compatibilidade PostgreSQL 9.0.5)
  - variaveis ATHOS_ORCAMENTO_* documentadas e repassadas nos dois compose
affects: [44-03, 44-04]
tech-stack:
  added: []
  patterns:
    - "Ponto unico de decisao da simulacao antes do primeiro INSERT (ROLLBACK + retorno), com READ ONLY como defesa no banco"
    - "Classificador tipo(sql) no pg falso: SQL desconhecido vira OUTRO:<sql> e quebra a sequencia"
key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
    - apps/backend/src/modules/integrations/athos/dto/create-athos-orcamento.dto.ts
    - .env.example
    - deploy/stack.env.example
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml
key-decisions:
  - "Simulacao dispensa ATHOS_ORCAMENTO_ESCRITA mas continua exigindo e validando autor/PIX (resolverConfigOrcamentoAthos)"
  - "LER_CONFIG unico (uma ida ao banco) agora traz cliente_ok e permitedescontode; permitedescontode NULL/ilegivel = 100%"
  - "valorUnitario/descontoRS sao convertidos para inteiros em validarEntrada (sem conexao aberta); erro vira VALOR_INVALIDO 422 com sequenciaitem"
  - "A trava de campos nao suportados de 44-01 (rejeitarCamposNaoSuportados) foi removida, pois todos os campos agora sao honrados"
requirements-completed: [ORC-02, ORC-04, ORC-05, ORC-06, ORC-08, ORC-10]
duration: ~40min
completed: 2026-11-09
estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low
actuals:
  tokens: 21000
  tasks: 3
  commits: 5
plan_head_before: 617415d49ca139212a0228f2c177327df1a3be99
plan_head_after: ebea68da970f5485d03effa13c71610e7e7ab19d
---

# Phase 44 Plan 02: Simulacao, descontos e deploy do orcamento IA Summary

`criarOrcamento` agora simula sem gravar (READ ONLY + ROLLBACK, mesmo com a escrita desligada), aceita cliente opcional e descontos (por linha, preco negociado e global) calculados por `calcularOrcamento` com o limite de `conf_vendas.permitedescontode`, e as cinco variaveis `ATHOS_ORCAMENTO_*` estao documentadas e repassadas ao container.

## O que foi entregue

- **Task 1 (TDD)**: RED `1e0e31c` (S1..S11, 6 falhas esperadas) e GREEN `0c683e1`. `simular: true` emite `BEGIN`, `SET TRANSACTION READ ONLY`, `SET LOCAL statement_timeout`, LER_CONFIG, LER_PRODUTOS e `ROLLBACK`, devolvendo `simulado: true`, `idorcamento`/`senhabalcao` nulos. `idcliente` vai como `$5` do LER_CONFIG; inexistente -> `CLIENTE_INEXISTENTE` 422 antes de qualquer escrita; ausente grava NULL. DTO ganhou `idcliente` e `simular`.
- **Task 2 (TDD)**: RED `b88c139` (D1..D8, 10 falhas esperadas) e GREEN `8f11dcf`. O servico monta `LinhaCalcEntrada` (preco do Athos via `paraMilli`, `valorUnitario`, `descontoRS` via `paraCentavos`), chama `calcularOrcamento` antes de qualquer escrita e grava `valoritem`, `orcamentodesconto` e `orcamentovalorfinalitem` por linha, `descontors`/`desconto` no cabecalho e o liquido no pagamento PIX. `CalcOrcamentoError` vira `OrcamentoAthosError` 422 com `detalhes.sequenciaitem`. `descontomaximo` do produto nao e consultado (D-04). Valores do orcamento real 25378 provados em D1 (2.28, 0.70, 35.059, 5.52).
- **Task 3**: `ebea68d`. Bloco "Orcamento criado pela IA no Athos (Fase 44)" em `.env.example` e `deploy/stack.env.example` (escrita `false`, ids de autor vazios, PIX `5`) e cinco entradas no `environment` do backend nos dois compose, com `ATHOS_ORCAMENTO_ESCRITA` padrao `false` e forma de pagamento padrao `5`. Nenhuma linha da Fase 43 alterada.

## Verificacao

| Verificacao | Resultado |
|---|---|
| `athos-orcamento.service` | 46 passed (minimo 14 da Task 1; casos S1..S11 + D1..D8 expandidos) |
| `athos-orcamento` (util + servico; IT skipped sem ATHOS_IT_CLONE) | 75 passed, 2 skipped |
| `npm --prefix apps/backend run test -- athos` (Task 1, apos GREEN) | 483 passed, 2 skipped (minimo 457) |
| `npm --prefix apps/backend run test -- --no-coverage` (suite completa, ao final) | 54 suites passed + 1 skipped; 776 passed, 2 skipped |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| IT no clone athos-teste (`athos-orcamento.clone`, ATHOS_IT_CLONE=1) apos as mudancas | 2 passed |
| S11: SQL emitido em criar + simular sem on conflict/filter/json/with/lateral/generated/lock_timeout/unaccent/pg_sequence_last_value/currval/max(idorcamento | passou |
| `grep -E '192\\.168\\.\|100\\.102\\.'` no teste do servico | exit 1 (nenhuma ocorrencia) |
| `grep "SET TRANSACTION READ ONLY"` no servico | 1 |
| `grep CLIENTE_INEXISTENTE` no servico | 2 |
| `grep idformapagamento` no DTO | 0 (D-04) |
| 4 arquivos de deploy: contagem `ATHOS_ORCAMENTO_` | 6, 6, 5, 5 (minimo 5); ATHOS_BAIXA_AUTO igual ao baseline (3, 3, 2, 2); YAML valido |

Nenhuma conexao com o Athos original; escrita somente no clone 127.0.0.1:5440 (IT existente de 44-01, rodado como regressao).

## Decisions Made

Ver `key-decisions` no frontmatter.

## Deviations from Plan

### Ajustes

**1. [Rule 3 - Bloqueio] Worktree sem o codigo de 44-01 e os planos da Fase 44**
- **Found during:** inicio da execucao
- **Fix:** `git merge --no-edit 7b94d8c` (instrucao do orquestrador). Conflitos em `.planning/ROADMAP.md` e em `athos.module.ts` (o lado HEAD nao tinha o registro da Fase 44); resolvidos tomando o lado `7b94d8c` (`git checkout --theirs`) nos dois. `athos.module.ts` ficou identico a `7b94d8c`, com `AthosContaReceberBaixaService` preservado. Merge commit `617415d` (= `plan_head_before`), separado dos commits do plano.

**2. [Escopo] Task 1 mantem a trava de campos de desconto**
- Na Task 1 so `idcliente` e `simular` foram liberados; `rejeitarCamposNaoSuportados` continuou recusando desconto/`valorUnitario` ate a Task 2, que a removeu por completo.

**3. [Pequeno] Pre-checagem de total de linha removida do servico**
- A checagem `VALOR_FORA_DO_LIMITE` por linha (duplicada em 44-01) foi delegada a `calcularOrcamento`, que a faz sobre o valor efetivo (inclusive `valorUnitario` acima do preco). Mesmo codigo e status, agora com `detalhes.sequenciaitem`.

Fora isso, o plano foi executado como escrito. STATE.md e ROADMAP.md nao foram alterados neste worktree (execucao paralela com 44-03; atualizacao fica com o orquestrador, como em 44-01).

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova alem da prevista no `<threat_model>` (T-44-08 a T-44-13 cobertos pelos casos S2/S3/S4/S6/S9/S10/D4/D7).

## Self-Check: PASSED

- Arquivos presentes: `athos-orcamento.service.test.ts` (novo), `athos-orcamento.service.ts`, `create-athos-orcamento.dto.ts`, `.env.example`, `deploy/stack.env.example`, `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`.
- Commits do plano (todos ancestrais de HEAD): `1e0e31c`, `0c683e1`, `b88c139`, `8f11dcf`, `ebea68d`; `git rev-list --count 617415d..HEAD` = 5 antes deste commit de documentacao.
