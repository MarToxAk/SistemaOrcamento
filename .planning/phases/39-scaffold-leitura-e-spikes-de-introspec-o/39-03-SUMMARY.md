---
phase: 39-scaffold-leitura-e-spikes-de-introspec-o
plan: "03"
subsystem: athos-integrations
tags: [produto-composto, read-api, nestjs, pg, jest, tdd]
status: complete

dependency_graph:
  requires: ["39-02"]
  provides: ["GET /athos/produtos/:idprodutomaster/composicao", "AthosProdutoCompostoService", "ProdutoCompostoController"]
  affects: ["AthosModule", "apps/backend/src/modules/integrations/athos/"]

tech_stack:
  added: []
  patterns:
    - "Pool lazy singleton por servico (getPool/getDbConfig com ATHOS_PG_* envs)"
    - "LEFT JOIN produto por idprodutodetail — expoe linhas orfas ao inves de esconde-las"
    - "Queries 100% parametrizadas com $1 — idprodutomaster nunca interpolado"
    - "ParseIntPipe no parametro de rota — rejeita nao-inteiro antes da service layer"
    - "@ApiSecurity(InternalApiKey) no controller class — guard cobre todas as rotas"
    - "TDD: RED (service.test.ts criado primeiro), GREEN (service.ts implementado), 6/6 verde"

key_files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts
    - apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts
    - apps/backend/src/modules/integrations/athos/dto/create-produto-composto.dto.ts
    - apps/backend/src/modules/integrations/athos/dto/update-produto-composto.dto.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.module.ts

decisions:
  - "LEFT JOIN (nao INNER): expoe linhas orfas com descricaoproduto/statusproduto null em vez de esconde-las — data corruption fica visivel ao caller"
  - "Rota de 2 segmentos :idprodutomaster/composicao nao colide com :idproduto de 1 segmento do ProdutoController"
  - "AthosProdutoCompostoService nao exportado no AthosModule — sem consumidores externos no v2.5"
  - "Scaffold de quantidade com @IsNumber + @Min(0.001): safe default pendente do spike (a) para Fase 40"

metrics:
  duration: "~15 min"
  completed: "2026-06-30"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 1
  tests_added: 6
  tests_total_athos_suite: 185
---

# Phase 39 Plan 03: GET Composicao Endpoint (COMP-01) Summary

**One-liner:** GET /athos/produtos/:idprodutomaster/composicao com LEFT JOIN enriquecido, 404/[] semantics, guard x-internal-api-key, 6 testes Jest verdes.

## What Was Built

Entrega completa do COMP-01: endpoint de leitura da composicao de um kit produto.

### Rota exposta

```
GET /athos/produtos/:idprodutomaster/composicao
```

- **Guard:** `x-internal-api-key` via `@ApiSecurity("InternalApiKey")` no controller class (T-39-03-02)
- **Param:** `idprodutomaster` validado por `ParseIntPipe` — rejeita nao-inteiro antes de chegar na service layer (T-39-03-01)
- **Response:** array de `ComposicaoItem[]` — lista plana enriquecida com dados do produto detail via JOIN unico

### Shape da resposta (D-02)

```json
[
  {
    "idprodutocomposto": 1,
    "idprodutodetail": 10,
    "descricaoproduto": "Papel A4 75g",
    "statusproduto": true,
    "quantidade": "5"
  }
]
```

Campos `descricaoproduto` e `statusproduto` sao `null` para linhas orfas (detail deletado do produto).

### Semantics implementadas

| Cenario | Comportamento |
|---------|---------------|
| `idprodutomaster` nao existe em `produto` | HTTP 404 — `NotFoundException` (D-03) |
| master existe, sem componentes em `produto_composto` | HTTP 200 — `[]` (D-03) |
| master com componentes | HTTP 200 — lista plana enriquecida ordenada por `idprodutocomposto` |
| componente com detail inativo (`statusproduto=false`) | Incluido sem filtro — caller decide (D-04) |
| componente cujo `idprodutodetail` nao tem linha em `produto` (linha orfa) | Incluido com `descricaoproduto=null` / `statusproduto=null` via LEFT JOIN |

### Decisao LEFT JOIN (Claude's Discretion)

Usado `LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail` em vez de `INNER JOIN`.

**Razao:** Se `idprodutodetail` nao tiver FK enforcement no DB, linhas orfas existem silenciosamente. Com INNER JOIN elas desaparecem do GET — o caller nao consegue distinguir "componente nunca existiu" de "componente foi deletado". Com LEFT JOIN, o caller ve `descricaoproduto: null` e pode sinalizar a inconsistencia para limpeza. Expor corrupcao de dados e sempre melhor que esconde-la.

### SQL emitido pelo service

```sql
-- Query 1: checagem de existencia do master (D-03)
SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1

-- Query 2: lista plana enriquecida (D-02, D-04)
SELECT
  pc.idprodutocomposto,
  pc.idprodutodetail,
  p.descricaoproduto,
  p.statusproduto,
  pc.quantidade
FROM produto_composto pc
LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail
WHERE pc.idprodutomaster = $1
ORDER BY pc.idprodutocomposto
```

`$1` e SEMPRE o parametro — `idprodutomaster` nunca e interpolado na string SQL.

## Artifacts Produzidos

| Arquivo | Status | Descricao |
|---------|--------|-----------|
| `athos-produto-composto.service.ts` | NOVO | `AthosProdutoCompostoService.listarPorMaster` — somente leitura |
| `athos-produto-composto.controller.ts` | NOVO | `ProdutoCompostoController` — `GET :idprodutomaster/composicao` |
| `athos-produto-composto.service.test.ts` | NOVO | 6 testes Jest (pg mock) — TDD RED/GREEN |
| `dto/create-produto-composto.dto.ts` | NOVO | Scaffold — pendente spike (a) / Fase 40 |
| `dto/update-produto-composto.dto.ts` | NOVO | Scaffold — pendente spike (a) / Fase 40 |
| `athos.module.ts` | MODIFICADO | `providers += AthosProdutoCompostoService`; `controllers += ProdutoCompostoController` |

## Testes Jest

### Suíte athos-produto-composto (6/6 verdes)

| Caso | ID | Comportamento verificado |
|------|----|--------------------------|
| 404 | COMP-01-404 | `NotFoundException` quando master nao existe; `client.release()` chamado |
| Array vazio | COMP-01-empty | `[]` quando master existe mas sem componentes |
| Lista enriquecida | COMP-01-list | `ComposicaoItem[]` com todos os campos; ordenada por `idprodutocomposto` |
| Detail inativo | COMP-01-inactive | Linha com `statusproduto=false` incluida no resultado (D-04) |
| LEFT JOIN | COMP-01-leftjoin | SQL de componentes contem `LEFT JOIN` (assertiva positiva por substring) |
| Erro conexao | — | `pool.connect` rejeita → Promise rejeita (erro propagado) |

### Suíte completa athos (185/185 verdes — 12 suites)

Todos os testes existentes do modulo athos permanecem verdes apos o wiring do `AthosModule`.

## Known Stubs

### DTOs de quantidade (pendentes do spike a)

`CreateProdutoCompostoDto.quantidade` e `UpdateProdutoCompostoDto.quantidade` usam os decorators safe-default `@IsNumber() + @Min(0.001)`.

Os decorators FINAIS dependem do resultado do spike (a):
- Se `base_type = integer` → substituir `@IsNumber()` por `@IsInt()` e ajustar `@Min()` para o floor do CHECK
- Se `base_type = numeric/decimal` → manter `@IsNumber()` e ajustar `@Min()` conforme o CHECK

Os DTOs nao sao consumidos por nenhum endpoint nesta fase (COMP-01 e somente GET). A Fase 40 os wire junto com POST/PATCH/DELETE apos o resultado do spike.

## Deviations from Plan

Nenhuma — plano executado exatamente como escrito.

## Threat Flags

Nenhuma superficie nova alem do planejado no `<threat_model>` do PLAN.md:
- T-39-03-01 (SQL injection): mitigado por `ParseIntPipe` + `$1` parametrizado
- T-39-03-02 (acesso nao autenticado): mitigado por `@ApiSecurity("InternalApiKey")` na classe
- T-39-03-03 (exposicao de linhas orfas/inativas): aceito e intencional (D-04)
- T-39-03-04 (over-fetch sem LIMIT): aceito com nota para reavaliar na Fase 40

## Commits

| Task | Hash | Mensagem |
|------|------|----------|
| 1 — Service + Testes | 262769f | `feat(39-03): AthosProdutoCompostoService.listarPorMaster + testes Jest` |
| 2 — Controller + Module | 2b098e2 | `feat(39-03): ProdutoCompostoController GET + registro no AthosModule` |
| 3 — DTOs scaffold | 2e03709 | `chore(39-03): scaffold DTOs create/update de produto_composto` |

## Self-Check

### Files exist

- FOUND: athos-produto-composto.service.ts
- FOUND: athos-produto-composto.controller.ts
- FOUND: athos-produto-composto.service.test.ts
- FOUND: dto/create-produto-composto.dto.ts
- FOUND: dto/update-produto-composto.dto.ts
- FOUND: athos.module.ts (modified)

### Commits exist

- FOUND: 262769f
- FOUND: 2b098e2
- FOUND: 2e03709

### Test results

- `npx jest athos-produto-composto --no-coverage`: 6/6 PASSED
- `npx jest athos --no-coverage`: 185/185 PASSED (12 suites)
- `npx tsc --noEmit`: 0 erros

## Self-Check: PASSED
