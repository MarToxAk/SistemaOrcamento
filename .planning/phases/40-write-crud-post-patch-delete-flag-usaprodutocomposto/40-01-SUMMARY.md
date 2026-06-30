---
phase: 40-write-crud-post-patch-delete-flag-usaprodutocomposto
plan: "01"
subsystem: athos-produto-composto
status: complete
tags: [athos, produto-composto, write-crud, post, transacao, jest]
dependency_graph:
  requires:
    - 39-scaffold-leitura-e-spikes-de-introspec-o/39-03-SUMMARY.md
    - apps/backend/src/modules/integrations/athos/athos-fk.util.ts
  provides:
    - POST /athos/produtos/:idprodutomaster/composicao (COMP-02, COMP-05, COMP-06)
    - AthosProdutoCompostoService.adicionarComponente (transacional BEGIN/COMMIT/ROLLBACK)
    - AthosProdutoCompostoService.mapPgWriteError (helper reutilizavel — Phase 40-02)
  affects:
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/create-produto-composto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts
tech_stack:
  added: []
  patterns:
    - BEGIN/COMMIT/ROLLBACK com PoolClient (pg raw) — identico ao padrao de athos-produto.service.ts
    - mapPgWriteError: re-throw HttpException + switch em err.code
    - INSERT...RETURNING para PK serial (nunca MAX+1)
    - validarFkExiste dual (master + detail) — reuso de athos-fk.util.ts
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/create-produto-composto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts
decisions:
  - "mapPgWriteError como metodo privado do service (nao modulo separado) — helper criado aqui e reusado pelo plan 40-02 via heranca do mesmo arquivo"
  - "INSERT com colunas literais fixas (idprodutomaster, idprodutodetail, quantidade) — nomes nunca interpolados de input (T-40-01)"
  - "ehPrimeiro via SELECT count(*) ANTES do INSERT, dentro da mesma transacao — garante atomicidade do flag-on (COMP-05)"
  - "ROLLBACK protegido por try/catch interno no catch do adicionarComponente — evita erro de ROLLBACK mascarar o erro original"
metrics:
  duration: "~6 min"
  completed: "2026-06-30"
  tasks: 3
  files: 4
requirements: [COMP-02, COMP-05, COMP-06]
---

# Phase 40 Plan 01: POST adicionarComponente — Summary

**One-liner:** Endpoint POST /athos/produtos/:id/composicao com transacao BEGIN/COMMIT/ROLLBACK, guardas de aplicacao (auto-ref, FK dual, detail inativo, duplicata), serial PK via RETURNING e flag usaprodutocomposto ativado transacionalmente no primeiro componente.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Finalizar DTO create + adicionarComponente + mapPgWriteError | 8cbb6d8 | service.ts, dto/create-produto-composto.dto.ts |
| 2 | Endpoint POST no ProdutoCompostoController | 7de2de1 | controller.ts |
| 3 | Testes Jest adicionarComponente (19 testes verdes) | f1350fa | service.test.ts |

## Verification Results

- **tsc:** compilacao limpa em todos os checkpoints (Tasks 1, 2 e verificacao final)
- **Jest:** 19/19 testes passando (`npx jest athos-produto-composto.service.test --runInBand`)
  - 5 testes do GET (listarPorMaster) — sem regressao
  - 14 testes novos do POST (adicionarComponente)

## Success Criteria Verified

- **COMP-02:** POST valida FK dual (master+detail via validarFkExiste); rejeita auto-referencia (422), par duplicado (409) e detail inativo (422). Testes cobrindo todos os 4 guardas.
- **COMP-05 (flag-on):** usaprodutocomposto do master vira true no primeiro componente, dentro do mesmo BEGIN/COMMIT. Coberto por teste assertando UPDATE de "usaprodutocomposto" so quando count==0.
- **COMP-06:** PK serial via RETURNING (nao MAX+1 — assertado em teste); erros pg mapeados: 42501->500 acionavel (mensagem menciona GRANT), 22003->422, 23503->422, 23505->409, 23514->422.

## Deviations from Plan

Nenhuma — plano executado exatamente conforme escrito.

## Known Stubs

Nenhum. Todos os campos do DTO foram finalizados. Comentario SCAFFOLD removido apos confirmacao do spike (a): `quantidade` = `numeric(9,3)` SEM clausula CHECK; decorators `@IsNumber() + @Min(0.001)` finais.

## Threat Flags

Nenhuma nova superficie nao contemplada pelo threat model do plano:
- T-40-01 (SQL injection via INSERT): mitigado — colunas literais fixas, valores via $1/$2/$3.
- T-40-02 (auth): mitigado — @ApiSecurity("InternalApiKey") de classe herdado pelo POST.
- T-40-03 (integridade sem UNIQUE/FK): mitigado — 4 guardas de aplicacao dentro da transacao.
- T-40-04 (flag desincronizado): mitigado — INSERT + UPDATE dentro de BEGIN/COMMIT.
- T-40-05 (42501 information disclosure): mitigado — mensagem acionavel sem vazar credenciais.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| service.ts existe | FOUND |
| controller.ts existe | FOUND |
| create-produto-composto.dto.ts existe | FOUND |
| service.test.ts existe | FOUND |
| 40-01-SUMMARY.md existe | FOUND |
| commit 8cbb6d8 existe | FOUND |
| commit 7de2de1 existe | FOUND |
| commit f1350fa existe | FOUND |
| DTO sem SCAFFOLD | 0 occurrences |
| INSERT contem RETURNING | FOUND |
| INSERT nao contem MAX( | OK |
| validarFkExiste chamado 2x | 5 references (master + detail + imports) |
| UPDATE usaprodutocomposto dentro da transacao | FOUND |
