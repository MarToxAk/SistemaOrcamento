---
phase: 31-hist-rico-nfs-e-consulta-nf-athos
plan: "02"
subsystem: backend-athos-integration
tags: [athos, nf-e, read-only, tdd, nestjs]
dependency_graph:
  requires: []
  provides:
    - AthosService.buscarNotasFiscaisCliente(idcliente, numero?)
    - "GET /athos/clientes/:idcliente/notas-fiscais?numero=X"
  affects:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
tech_stack:
  added: []
  patterns:
    - Query parametrizada PostgreSQL com params posicionais ($1/$2)
    - Padrão pool.connect() + try/finally client.release() (reutilizado de verificarNFTitulos)
    - Padrão defensivo: catch logger.warn + return [] (reutilizado de buscarTodasNfesParaTitulos)
    - TDD RED-GREEN com mock pg separado por teste (makeClient pattern)
key_files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-notas-fiscais.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
decisions:
  - "Padrão makeClient() por teste (vs getClient() lazy): pool é instanciado lazy pelo AthosService, necessário criar client explicitamente antes da chamada ao service"
  - "Template literal ${filtroNumero} inline na query SQL para condicional AND n.numero = $2"
  - "numero?.trim() || undefined no controller para garantir que string vazia não seja passada como filtro"
metrics:
  duration_minutes: 4
  completed_date: "2026-05-27"
  tasks_completed: 2
  files_changed: 3
---

# Phase 31 Plan 02: Consulta NF-e Athos — Serviço e Rota Summary

Query read-only ao Athos para NF-e de produto por cliente com filtro opcional por número exato server-side, via novo método no AthosService e nova rota no AthosController.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Testes athos-notas-fiscais (TDD RED) | 48c5f18 | athos-notas-fiscais.test.ts (criado) |
| 1 (GREEN) | AthosService.buscarNotasFiscaisCliente | fe5a0ac | athos.service.ts, athos-notas-fiscais.test.ts |
| 2 | GET /athos/clientes/:idcliente/notas-fiscais | 4c8d00a | athos.controller.ts |

## What Was Built

**AthosService.buscarNotasFiscaisCliente(idcliente, numero?)**
- Query SQL `venda JOIN venda_nota JOIN nota` read-only ao banco Athos
- Filtro: `COALESCE(n.cancelada, false) = false AND n.nfechaveacesso IS NOT NULL` (D-12)
- Ordenação: `ORDER BY n.dataemissao DESC LIMIT 50` (D-11)
- Filtro opcional por número exato: `AND n.numero = $2` quando `numero` informado (D-14)
- Mapeamento: `{ numero: string, dataemissao: string|null, valor: number, tipo: "NF-e" }` (D-09)
- Comportamento defensivo: erro de query gera `logger.warn` e retorna `[]`

**GET /athos/clientes/:idcliente/notas-fiscais** (AthosController)
- Autenticação: `validateAthosToken` fail-closed (T-31-05 — mesmo padrão das demais rotas Athos)
- Validação: `Number.isFinite(id) && id > 0` → `BadRequestException` (T-31-04)
- Query param `?numero=X`: string vazia → `undefined` (não ativa filtro)
- Decorators Swagger: `@ApiOperation`, `@ApiParam`, `@ApiQuery`, `@ApiOkResponse`, `@ApiUnauthorizedResponse`

## Verification Results

- `npx jest athos-notas-fiscais`: 4/4 testes passando (lista, filtro número, vazio, limite)
- `npx tsc -p tsconfig.build.json --noEmit`: build sem erros

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Padrão getClient() substituído por makeClient() nos testes**
- **Found during:** Task 1 GREEN
- **Issue:** O helper `getClient()` tentava acessar `pgMock.Pool.mock.results[0]` antes de o Pool ter sido instanciado (Pool é criado de forma lazy ao primeiro `getPool()` no serviço). Os 4 testes falharam com "Pool mock not initialized".
- **Fix:** Adotado o padrão `makeClient()` idêntico ao de `athos.service.test.ts` (L89-91): cria client com `jest.fn()` e substitui `pool.connect` antes de cada chamada ao serviço.
- **Files modified:** athos-notas-fiscais.test.ts
- **Commit:** fe5a0ac (incluído na fase GREEN)

## TDD Gate Compliance

- RED gate: commit `48c5f18` — `test(31-02): add failing test for buscarNotasFiscaisCliente`
- GREEN gate: commit `fe5a0ac` — `feat(31-02): implement AthosService.buscarNotasFiscaisCliente`
- REFACTOR: não necessário

## Known Stubs

Nenhum — todos os campos retornados são lidos de colunas reais do Athos (`n.numero`, `n.dataemissao`, `n.valornota`).

## Threat Surface

| Ameaça | Componente | Mitigação Aplicada |
|--------|------------|--------------------|
| T-31-04 (Injection) | idcliente, numero | Query parametrizada ($1/$2); idcliente validado por Number.isFinite |
| T-31-05 (Info Disclosure) | GET /athos/clientes/:idcliente/notas-fiscais | validateAthosToken com timingSafeEqual; fail-closed |
| T-31-06 (Integridade Athos) | banco Athos | Apenas SELECT; nenhum INSERT/UPDATE/DELETE |
| T-31-07 (DoS) | listagem | LIMIT 50 hardcoded |

## Self-Check: PASSED

- [x] athos-notas-fiscais.test.ts criado — FOUND
- [x] athos.service.ts modificado (buscarNotasFiscaisCliente) — FOUND
- [x] athos.controller.ts modificado (GET clientes/:idcliente/notas-fiscais) — FOUND
- [x] Commit 48c5f18 existe (RED)
- [x] Commit fe5a0ac existe (GREEN)
- [x] Commit 4c8d00a existe (Task 2)
