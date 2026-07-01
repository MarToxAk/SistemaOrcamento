---
phase: 32
plan: 01
subsystem: backend/integrations/athos
tags: [nestjs, postgresql, rest-api, produtos, athos, tdd]
dependency_graph:
  requires: []
  provides: [athos-produto-api-read]
  affects: [phase-33-escrita-produto, phase-34-frontend-produto]
tech_stack:
  added: []
  patterns: [paginated-query-two-queries, dynamic-conditions-array, try-finally-pool-release, static-routes-before-parametric]
key_files:
  created:
    - apps/backend/src/modules/integrations/athos/produto.types.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.controller.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.module.ts
decisions:
  - "ProdutoController sem validateAthosToken — autenticacao via APP_GUARD global (InternalAuthGuard)"
  - "SELECT p.*, NULL::bytea AS imagemproduto para excluir blob binario da resposta"
  - "Rotas lookup/* declaradas antes de :idproduto para evitar conflito de rota NestJS"
  - "Metodos de produto adicionados ao AthosService existente (D-02: sem ProdutoService separado)"
  - "take capado em Math.min(..., 50) com default 20; paginacao obrigatoria sobre 28.836 produtos"
metrics:
  duration: "~20 minutos"
  completed: "2026-06-15"
  tasks_completed: 3
  files_modified: 5
requirements_validated: [BPROD-01, BPROD-02, BPROD-03, BPROD-04, BPROD-05, SPROD-02]
---

# Phase 32 Plan 01: API de Busca de Produto (Read-Only) Summary

**One-liner:** ProdutoController REST sob /athos/produtos com busca paginada por descricao/codigobarra/departamento-grupo-marca, consulta por idproduto e lookups via AthosService — 162 campos tipados, bytea excluido via NULL::bytea, auth por heranca do APP_GUARD global.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Definir contratos (Produto/LookupItem) e stubs de teste RED | dd0bca3 | done |
| 2 | Adicionar metodos de busca/lookup de produto em AthosService | bba42e8 | done |
| 3 | Criar ProdutoController, registrar no AthosModule e deixar testes GREEN | f12aa89 | done |

## What Was Built

- `produto.types.ts`: Interface `Produto` com 162 campos verificados contra banco Athos BomCusto (192.168.3.198). `imagemproduto: null` — coluna bytea nunca serializada. Interface `LookupItem { id: number; nome: string }`.
- `athos-produto.controller.ts`: `ProdutoController` com `@Controller("athos/produtos")`. Endpoints: `GET /` (busca paginada), `GET /:idproduto` (linha completa ou 404), `GET /lookup/departamentos|grupos|marcas` (arrays `{id, nome}[]`). Sem validateAthosToken — protegido por APP_GUARD global. Swagger decorado.
- `athos.service.ts` (+144 linhas): Cinco metodos novos — `buscarProdutos`, `buscarProdutoPorId`, `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas`. Queries SQL 100% parametrizadas (T-32-01). `NULL::bytea AS imagemproduto` em todas as queries de produto (T-32-02). take capado em 50 (T-32-03). Tabelas de lookup verificadas: `produto_departamento`, `produto_grupo`, `produto_marca` com coluna `nome`.
- `athos.module.ts`: `ProdutoController` adicionado em `controllers: [AthosController, ProdutoController]`.
- `athos-produto.controller.test.ts`: 10 testes cobrindo BPROD-01 a BPROD-05 mais lookups. Ciclo TDD RED -> GREEN completo.

## Test Results

- `npx jest "athos-produto"`: 10/10 testes verdes
- `npx jest` (suite completa): 184/184 testes verdes, 16 suites — sem regressao

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None — nenhum dado hardcoded ou placeholder nos arquivos criados.

## Threat Surface Scan

Nenhuma superficie nova fora do threat model do plano. Todos os threats T-32-01 a T-32-04 mitigados conforme planejado:
- T-32-01 (SQL Injection): queries parametrizadas com $1..$N; ParseIntPipe em :idproduto
- T-32-02 (bytea disclosure): NULL::bytea AS imagemproduto em todas as queries de produto
- T-32-03 (DoS take sem limite): Math.min(Math.max(1, ...), 50)
- T-32-04 (auth bypass): ProdutoController sem token manual; herda APP_GUARD global

## Self-Check: PASSED

Files created:
- FOUND: apps/backend/src/modules/integrations/athos/produto.types.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-produto.controller.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts

Commits verified:
- dd0bca3: test(32-01): add RED tests for ProdutoController and Produto/LookupItem interfaces
- bba42e8: feat(32-01): add buscarProdutos, buscarProdutoPorId, buscarDepartamentos, buscarGrupos, buscarMarcas to AthosService
- f12aa89: feat(32-01): create ProdutoController and register in AthosModule (TDD GREEN)
