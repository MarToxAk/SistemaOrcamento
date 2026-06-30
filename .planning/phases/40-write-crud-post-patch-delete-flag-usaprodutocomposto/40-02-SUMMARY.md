---
phase: 40-write-crud-post-patch-delete-flag-usaprodutocomposto
plan: "02"
subsystem: athos-produto-composto
status: complete
tags: [athos, produto-composto, write-crud, patch, delete, transacao, flag-off, jest]
dependency_graph:
  requires:
    - 40-write-crud-post-patch-delete-flag-usaprodutocomposto/40-01-SUMMARY.md
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts (mapPgWriteError + padrao BEGIN/COMMIT)
  provides:
    - PATCH /athos/produtos/:idprodutomaster/composicao/:idprodutodetail (COMP-03)
    - DELETE /athos/produtos/:idprodutomaster/composicao/:idprodutodetail (COMP-04)
    - flag-off transacional usaprodutocomposto=false no ultimo componente (COMP-05)
    - AthosProdutoCompostoService.atualizarQuantidade
    - AthosProdutoCompostoService.removerComponente
  affects:
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/update-produto-composto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts
tech_stack:
  added: []
  patterns:
    - BEGIN/COMMIT/ROLLBACK com PoolClient — espelhado de adicionarComponente (40-01)
    - mapPgWriteError reutilizado (22003->422, 42501->500 acionavel, re-throw HttpException)
    - DELETE fisico em tabela de composicao (nao soft-delete)
    - flag-off condicional (total === 0 apos DELETE) dentro da mesma transacao (T-40-08)
    - PATCH sem transacao multi-statement explicita (single-UPDATE com try/finally)
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/update-produto-composto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts
decisions:
  - "UPDATE produto_composto (PATCH) sem BEGIN explicito — operacao single-statement; mapPgWriteError cobre 22003->422 no catch"
  - "usaprodutocomposto = false como literal SQL (nao parametro $N) — nome de coluna e valor boolean sao literais fixos; idproduto = $1 e parametrizado (T-40-06)"
  - "flagDesligado = total === 0 avaliado APOS o DELETE dentro da mesma transacao (T-40-08 atomicidade)"
  - "ROLLBACK protegido por try/catch interno em removerComponente — mesmo padrao de adicionarComponente (40-01)"
metrics:
  duration: "~5 min"
  completed: "2026-06-30"
  tasks: 3
  files: 4
requirements: [COMP-03, COMP-04, COMP-05]
---

# Phase 40 Plan 02: PATCH atualizarQuantidade + DELETE removerComponente — Summary

**One-liner:** PATCH e DELETE em /athos/produtos/:idprodutomaster/composicao/:idprodutodetail com 404 por par, 422 via mapPgWriteError (22003) e flag usaprodutocomposto=false transacional no ultimo componente.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Finalizar DTO update + atualizarQuantidade + removerComponente no service | a207d1e | service.ts, dto/update-produto-composto.dto.ts |
| 2 | Endpoints PATCH e DELETE no ProdutoCompostoController | fd7115b | controller.ts |
| 3 | Testes Jest de PATCH (atualizarQuantidade) e DELETE (removerComponente) | 3f36f1c | service.test.ts |

## Verification Results

- **tsc:** compilacao limpa em todos os checkpoints (Tasks 1, 2 e verificacao final)
- **Jest:** 28/28 testes passando (`npx jest athos-produto-composto.service.test --runInBand`)
  - 5 testes do GET (listarPorMaster) — sem regressao
  - 14 testes do POST (adicionarComponente) — sem regressao
  - 4 testes novos do PATCH (atualizarQuantidade): sucesso, 404, 422, release
  - 5 testes novos do DELETE (removerComponente): ultimo/flag-off, nao-ultimo, 404, DELETE fisico, release

## Success Criteria Verified

- **COMP-03:** PATCH atualiza quantidade parametrizado ($1,$2,$3); 404 quando SELECT do par retorna vazio; 422 quando pg lanca 22003 (overflow numeric(9,3)) via mapPgWriteError.
- **COMP-04:** DELETE fisico (DELETE FROM produto_composto) sem soft-delete; 404 quando par inexistente com ROLLBACK; ROLLBACK protegido em erro.
- **COMP-05 (flag-off):** usaprodutocomposto=false disparado SOMENTE quando count apos DELETE == 0, dentro do mesmo BEGIN/COMMIT. Testado: caso ultimo (flag desligado) e nao-ultimo (flag intocado — nenhum SQL com usaprodutocomposto).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion de teste: valor `false` e literal SQL, nao parametro**
- **Found during:** Task 3 — primeiro run Jest falhou com `Expected value: false / Received array: [42]`
- **Issue:** O teste assertava `flagCall[1].toContain(false)` (esperando false como parametro $N), mas o SQL usa `SET usaprodutocomposto = false` como literal fixo; o unico parametro e `[idprodutomaster]`.
- **Fix:** Assertion alterada para `expect(flagSql!).toContain("false")` — verifica a string SQL diretamente.
- **Files modified:** athos-produto-composto.service.test.ts
- **Commit:** 3f36f1c (incluido na task, nao commit separado)

## Known Stubs

Nenhum. DTO finalizado (SCAFFOLD removido); todos os metodos implementados e testados.

## Threat Flags

Nenhuma nova superficie nao contemplada pelo threat model do plano:
- T-40-06 (SQL injection UPDATE/DELETE): mitigado — valores via $N; nomes de coluna literais fixos.
- T-40-07 (auth PATCH/DELETE): mitigado — @ApiSecurity("InternalApiKey") de classe herdado; sem guard inline.
- T-40-08 (flag desincronizado): mitigado — DELETE + UPDATE do flag dentro de BEGIN/COMMIT; ROLLBACK em erro; flag-off somente quando total === 0.
- T-40-09 (42501 information disclosure): mitigado — mapPgWriteError mapeia para 500 acionavel sem vazar credenciais.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| service.ts existe | FOUND |
| controller.ts existe | FOUND |
| update-produto-composto.dto.ts existe | FOUND |
| service.test.ts existe | FOUND |
| 40-02-SUMMARY.md existe | FOUND |
| commit a207d1e existe | FOUND |
| commit fd7115b existe | FOUND |
| commit 3f36f1c existe | FOUND |
| DTO sem SCAFFOLD | 0 occurrences |
| DELETE FROM produto_composto presente | FOUND (linha 338) |
| usaprodutocomposto = false condicional (total === 0) | FOUND (linha 351/354) |
| ROLLBACK em removerComponente | FOUND (linha 369) |
| mapPgWriteError nos dois novos metodos | FOUND (linhas 296 e 373) |
| tsc limpo | OK |
| Jest 28/28 verde | OK |
