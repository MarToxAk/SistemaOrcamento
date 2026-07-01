---
phase: 39-scaffold-leitura-e-spikes-de-introspec-o
plan: "02"
subsystem: athos-integrations
tags: [refactor, util, fk-validation, comp-08]
requirements: [COMP-08]

dependency_graph:
  requires: []
  provides: [athos-fk.util.ts]
  affects: [athos-produto.service.ts]

tech_stack:
  added: []
  patterns:
    - module-level utility function extracted from injectable service
    - TDD RED→GREEN for isolated pure-function util

key_files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-fk.util.ts
    - apps/backend/src/modules/integrations/athos/athos-fk.util.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-produto.service.ts

decisions:
  - "COMP-08: validarFkExiste extraído como função module-level; corpo verbatim das linhas 58-74 do service original"
  - "TDD: RED (import error) → GREEN (3 casos verdes); teste usa mock de PoolClient por parâmetro (sem jest.mock('pg'))"
  - "6 call-sites atualizados (criarProduto: 3, editarProduto: 3); this. removido; import adicionado"

metrics:
  duration: "~10 minutes"
  completed: "2026-06-30"
  tasks_total: 2
  tasks_completed: 2

status: complete
---

# Phase 39 Plan 02: validarFkExiste Extraction (COMP-08) Summary

Extracted `validarFkExiste` from `AthosProdutoService` into a reusable module-level function in `athos-fk.util.ts`, with isolated unit tests and zero behavior change.

## What Was Built

- `athos-fk.util.ts` — exports `async function validarFkExiste(client: PoolClient, tabela: string, coluna: string, id: number, nomeEntidade: string): Promise<void>` with body copied verbatim from the private method (lines 58-74). Imports `UnprocessableEntityException` from `@nestjs/common` and `PoolClient` from `pg`.
- `athos-fk.util.test.ts` — 3 unit tests covering: (1) resolves silently when FK exists, (2) throws `UnprocessableEntityException` with message `${nomeEntidade} com id ${id} nao encontrado no Athos` when absent, (3) id parametrizado via `$1` (never interpolated). Mock is a simple `{ query: jest.fn() }` — no `jest.mock("pg")` needed.
- `athos-produto.service.ts` — private method removed (17 lines), `import { validarFkExiste } from "./athos-fk.util"` added, 6 call-sites updated from `this.validarFkExiste(` to `validarFkExiste(`.

## Call-Sites Updated

| Method | Count | Lines (before edit) |
|--------|-------|---------------------|
| `criarProduto` | 3 | 83, 86, 89 |
| `editarProduto` | 3 | 278, 281, 284 |
| **Total** | **6** | — |

## Exported Signature (for consumption by Phase 40)

```typescript
export async function validarFkExiste(
  client: PoolClient,
  tabela: string,
  coluna: string,
  id: number,
  nomeEntidade: string,
): Promise<void>
```

Import: `import { validarFkExiste } from "./athos-fk.util";`

## Regression Guard Confirmation

- `athos-produto.service.test.ts` — NOT edited (git diff empty).
- `npx jest athos-produto.service athos-fk.util --no-coverage` → 36/36 tests green.
- `grep "this.validarFkExiste" athos-produto.service.ts` → 0 lines.

## Verification Results

| Check | Result |
|-------|--------|
| `npx jest athos-fk.util --no-coverage` (3 cases) | PASS 3/3 |
| `npx jest athos-produto.service --no-coverage` (regression) | PASS 33/33 |
| `grep this.validarFkExiste athos-produto.service.ts` | 0 lines |
| `git diff athos-produto.service.test.ts` | empty (unmodified) |

## Commits

| Commit | Message |
|--------|---------|
| `fccc01c` | feat(39-02): extrair validarFkExiste para athos-fk.util.ts (COMP-08) |
| `2d86649` | refactor(39-02): re-wirear AthosProdutoService para usar athos-fk.util (COMP-08) |

## Deviations from Plan

None — plan executed exactly as written. Corpo verbatim confirmado; TDD RED→GREEN executado; 6 call-sites atualizados conforme especificado; guarda de regressão 100% verde sem edição do arquivo de teste.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This is a pure internal refactor — the SQL query, parametrization pattern, and error type are all identical to the original private method. STRIDE threat T-39-02-01 (regressão silenciosa) mitigated by the regression test suite passing unchanged.

## Self-Check

- `athos-fk.util.ts` exists: FOUND
- `athos-fk.util.test.ts` exists: FOUND
- Commit `fccc01c` exists: FOUND
- Commit `2d86649` exists: FOUND

## Self-Check: PASSED
