# Phase 39: Scaffold, Leitura e Spikes de Introspecção - Research

**Researched:** 2026-06-29
**Domain:** NestJS + raw pg — produto_composto read API + DB introspection spikes + FK util extraction
**Confidence:** HIGH (codebase first-party; SQL queries from pg_catalog documentation [ASSUMED]; spike results pending user)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Spike logistics mode (b) — the researcher/executor CANNOT reach 192.168.3.198. Deliver the EXACT, copy-pasteable SQL queries. The USER runs them and pastes results back before any DTO/INSERT is finalized.
- **D-02:** GET response shape — flat list, one object per component, fields: `idprodutocomposto`, `idprodutodetail`, `descricaoproduto` (from produto detail via JOIN), `statusproduto` (from produto detail via JOIN), `quantidade`. No master data in the payload. Single JOIN — no N+1.
- **D-03:** Route `GET /athos/produtos/:idprodutomaster/composicao`. Static routes declared before parametric (existing controller comment "Rotas estáticas declaradas ANTES da rota paramétrica"). 404 when master absent; `[]` (HTTP 200) when master exists with no components.
- **D-04:** GET lists ALL components including those whose detail has `statusproduto = false`. Exposes `statusproduto` in payload. No filtering.

### Carregadas das fases anteriores (v2.2/v2.4)
- INSERT/SELECT com allowlist explícita + parâmetros `$N`
- Pool lazy singleton por serviço com as mesmas env `ATHOS_PG_*`; `getDbConfig()` falha-fechado
- `Logger` estruturado por serviço
- Pré-validação de FK + mapeamento de erros Postgres estabelecidos em `AthosProdutoService`

### Claude's Discretion
- Estrutura exata de `athos-fk.util.ts` (assinatura de `validarFkExiste`)
- SQL exato do JOIN do GET (LEFT vs INNER — ver seção COMP-01)
- Formato exato das 3 queries de introspecção entregues ao usuário
- Nomes de arquivos novos seguindo o padrão `athos-produto-composto.*`

### Deferred Ideas (OUT OF SCOPE)
- Qualquer escrita em `produto_composto` (POST/PATCH/DELETE) e o flag `usaprodutocomposto` → Fase 40
- O write GRANT no Athos → pré-requisito externo da Fase 40
- Frontend (v2.5 é API-only)
- Detecção de ciclos, add em lote, explosão recursiva de BOM — fora do v2.5
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-07 | Spikes de introspecção na DB de referência read-only (192.168.3.198): tipo-base + CHECK do domínio `quantidade`; presença de UNIQUE em `(idprodutomaster, idprodutodetail)`; inventário de triggers/rules em `produto_composto` | Section "COMP-07 — Introspection Spike Queries" — três queries prontas para copiar e colar; seção "Placeholder para Resultados dos Spikes" |
| COMP-08 | `validarFkExiste` extraído para `athos-fk.util.ts` reutilizável; refactor sem mudança de comportamento; cobertura preservada pelos testes existentes do produto | Section "COMP-08 — validarFkExiste Extraction" |
| COMP-01 | GET /athos/produtos/:idprodutomaster/composicao retornando lista plana enriquecida; 404 quando master ausente; `[]` quando master existe sem componentes | Section "COMP-01 — GET Endpoint Implementation" |
</phase_requirements>

---

## Summary

Phase 39 delivers three tightly scoped deliverables that share a single constraint: zero write GRANT required. The phase proves the `produto_composto` module slot, extracts a reusable FK-validation utility, and ships the GET list endpoint — all on the existing SELECT GRANT already granted by the Athos DDL.

The technical complexity is low. Every pattern in this phase already exists in `athos-produto.service.ts` and its controller. The only genuine uncertainty lives in three unanswered questions about the reference DB (192.168.3.198): the base type and CHECK constraints of the `quantidade` DOMAIN, whether a UNIQUE constraint exists on `(idprodutomaster, idprodutodetail)`, and whether any triggers or rules fire on `produto_composto`. This research delivers exact, copy-pasteable SQL queries for each spike. The user runs them, pastes the results back, and the planner locks the DTO decorators and Phase 40 INSERT details accordingly.

Zero new npm dependencies are required. No new NestJS module is introduced. The new service and controller slot into the existing `AthosModule`. The test pattern mirrors `athos-produto.service.test.ts` exactly (jest.mock("pg") + mClient/mPool).

**Primary recommendation:** Write the three spike queries first (Wave 0), get user results, then implement COMP-08 util extraction and COMP-01 GET in a single Wave 1. The spike results do not gate the GET implementation (reads do not use `quantidade` in SQL filters), but they do gate the final `quantidade` DTO decorator choices for Phase 40 scaffolding.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DB introspection queries (COMP-07) | User (manual) | — | 192.168.3.198 unreachable from CI/executor; user runs SQL in psql and pastes back |
| FK util extraction (COMP-08) | API / Backend | — | Pure refactor; no HTTP surface; stays inside the Athos service layer |
| GET list enrichment via JOIN (COMP-01) | API / Backend | — | One parameterized SELECT with LEFT JOIN; no frontend/CDN involvement |
| Route security (API key guard) | API / Backend | — | Reuses existing `@ApiSecurity("InternalApiKey")` on the controller class |
| AthosModule wiring | API / Backend | — | Providers/controllers array update; no new module needed |
| DTO scaffold | API / Backend | — | class-validator decorators; `quantidade` constraints locked after spike (a) results |

---

## Standard Stack

### Core (zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` | `^8.20.0` | Pool + PoolClient; parameterized queries | Already proven against Athos; full SQL control; already in root package.json [VERIFIED: package.json] |
| `@nestjs/common` | `^11.1.19` | Injectable, Controller, HTTP exceptions, Logger | Existing module system; all decorators needed already available [VERIFIED: apps/backend/package.json] |
| `class-validator` | `^0.14.1` | DTO validation decorators | Wired via global ValidationPipe; `@IsNumber`, `@IsInt`, `@Min`, `@IsNotEmpty` all available [VERIFIED: apps/backend/package.json] |
| `class-transformer` | `^0.5.1` | `@Type(() => Number)` coercions for route params | Required for `ParseIntPipe` and numeric DTO fields [VERIFIED: apps/backend/package.json] |
| `@nestjs/swagger` | `^11.4.2` | `@ApiTags`, `@ApiOperation`, `@ApiParam`, `@ApiOkResponse` | All decorators used in `athos-produto.controller.ts` already available [VERIFIED: apps/backend/package.json] |

### Testing (devDependencies)

| Tool | Version | Purpose |
|------|---------|---------|
| `jest` | `^30.3.0` | Test runner — `jest.config.js` in apps/backend [VERIFIED: apps/backend/package.json] |
| `ts-jest` | `^29.4.9` | TypeScript transform; compatible with Jest 30 [VERIFIED: apps/backend/package.json] |
| `@nestjs/testing` | `^11.1.19` | `Test.createTestingModule` for unit tests [VERIFIED: apps/backend/package.json] |

**Installation:** No `npm install` required. All dependencies present.

---

## Package Legitimacy Audit

No new packages are installed in Phase 39. All libraries confirmed present via first-party package.json inspection. Audit not applicable.

| Package | Registry | Status |
|---------|----------|--------|
| `pg ^8.20.0` | npm | Already installed — no install action [VERIFIED: package.json] |
| `class-validator ^0.14.1` | npm | Already installed [VERIFIED: apps/backend/package.json] |
| All others | npm | Already installed [VERIFIED: respective package.json] |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## COMP-07 — Introspection Spike Queries

These three queries are the gating deliverable of Phase 39. The executor cannot reach `192.168.3.198`. The USER runs each query in psql (or any SQL client connected to `192.168.3.198`) and pastes the output below the query. Results are documented in the PLAN.md/SUMMARY before any DTO decorators or INSERT column lists are finalized.

### Spike (a) — quantidade DOMAIN: base type + CHECK clause

**What the result decides:**
- `base_type` = `integer` → DTO uses `@IsInt()`, `@Min(1)` (or whatever the CHECK floor is)
- `base_type` = `numeric` or `decimal` → DTO uses `@IsNumber()`, `@Min(0.001)` (or the CHECK floor)
- `check_clause` value (e.g., `CHECK (VALUE > 0)`) → sets the exact `@Min()` value and whether zero is allowed
- If `check_clause` is NULL → the DOMAIN has no CHECK; use `@IsNumber()`, `@Min(0.001)` as safe default

```sql
-- SPIKE (a): tipo-base + CHECK clause do domínio "quantidade"
SELECT
  t.typname                                                     AS domain_name,
  t2.typname                                                    AS base_type,
  pg_catalog.format_type(t.typbasetype, t.typtypmod)           AS base_type_full,
  pg_catalog.pg_get_constraintdef(c.oid)                       AS check_clause
FROM pg_type t
JOIN pg_type t2
  ON t2.oid = t.typbasetype
LEFT JOIN pg_constraint c
  ON c.contypid = t.oid
  AND c.contype = 'c'
WHERE t.typname = 'quantidade'
  AND t.typtype  = 'd';
```

**Paste user results here (required before Phase 40 DTO is finalized):**
```
-- RESULTADO SPIKE (a):
[AGUARDANDO RESULTADO DO USUÁRIO]
```

---

### Spike (b) — UNIQUE / PK constraint inventory on produto_composto

**What the result decides:**
- If a `UNIQUE` constraint exists on `(idprodutomaster, idprodutodetail)` → Phase 40's POST can catch pg error `23505` as a secondary guard (still add application-level pre-check regardless)
- If NO UNIQUE exists → application-level duplicate pre-check in Phase 40 is the ONLY guard against duplicate pairs; document this so the pre-check is never removed
- The PRIMARY KEY constraint confirms `idprodutocomposto` is the PK and its column name (used in RETURNING clause)

```sql
-- SPIKE (b): constraints UNIQUE e PRIMARY KEY na tabela produto_composto
SELECT
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints  tc
JOIN information_schema.key_column_usage   kcu
  ON  kcu.constraint_name = tc.constraint_name
  AND kcu.table_name      = tc.table_name
  AND kcu.table_schema    = tc.table_schema
WHERE tc.table_name    = 'produto_composto'
  AND tc.table_schema  = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY tc.constraint_name, tc.constraint_type
ORDER BY tc.constraint_type, tc.constraint_name;
```

**Paste user results here:**
```
-- RESULTADO SPIKE (b):
[AGUARDANDO RESULTADO DO USUÁRIO]
```

---

### Spike (c) — Triggers AND rules on produto_composto

**What the result decides:**
- If triggers exist that require additional columns (e.g., `idusuarioalteracao`, a timestamp, or an audit log) → Phase 40 INSERT must include those columns in its column list
- If an `ON INSERT DO INSTEAD` rule exists → INSERT behavior is redirected; the executor must read the rule body before writing any INSERT
- If the result is empty (no rows) → INSERT with only `(idprodutomaster, idprodutodetail, quantidade)` is safe
- Any trigger that stamps `dataultimaalteracao` or similar automatically is fine — the API need not include those columns

```sql
-- SPIKE (c-1): triggers na tabela produto_composto
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table  = 'produto_composto'
  AND event_object_schema = 'public'
ORDER BY trigger_name, event_manipulation;

-- SPIKE (c-2): rules na tabela produto_composto
SELECT
  rulename,
  ev_type,         -- 1=SELECT  2=UPDATE  3=INSERT  4=DELETE
  is_instead,
  pg_get_ruledef(oid) AS definition
FROM pg_rules
WHERE tablename  = 'produto_composto'
  AND schemaname = 'public'
ORDER BY rulename;
```

**Paste user results here:**
```
-- RESULTADO SPIKE (c-1) triggers:
[AGUARDANDO RESULTADO DO USUÁRIO]

-- RESULTADO SPIKE (c-2) rules:
[AGUARDANDO RESULTADO DO USUÁRIO]
```

---

## COMP-08 — validarFkExiste Extraction

### Current state

`validarFkExiste` is a **private** method in `AthosProdutoService` at lines 58–74 (`apps/backend/src/modules/integrations/athos/athos-produto.service.ts`). [VERIFIED: codebase]

```typescript
// Current private method in AthosProdutoService (lines 58-74)
private async validarFkExiste(
  client: PoolClient,
  tabela: string,
  coluna: string,
  id: number,
  nomeEntidade: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM "${tabela}" WHERE "${coluna}" = $1 LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new UnprocessableEntityException(
      `${nomeEntidade} com id ${id} nao encontrado no Athos`,
    );
  }
}
```

### Proposed athos-fk.util.ts

**File:** `apps/backend/src/modules/integrations/athos/athos-fk.util.ts` (NEW)

```typescript
import { UnprocessableEntityException } from "@nestjs/common";
import { PoolClient } from "pg";

/**
 * Valida que uma linha existe em `tabela` onde `coluna = id`.
 * Lança UnprocessableEntityException (422) se não encontrada.
 * Extraído de AthosProdutoService para ser reutilizável em todos os
 * serviços do módulo Athos (v2.5: AthosProdutoCompostoService).
 */
export async function validarFkExiste(
  client: PoolClient,
  tabela: string,
  coluna: string,
  id: number,
  nomeEntidade: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM "${tabela}" WHERE "${coluna}" = $1 LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new UnprocessableEntityException(
      `${nomeEntidade} com id ${id} nao encontrado no Athos`,
    );
  }
}
```

**Zero behavior change:** The function body is copied verbatim from `AthosProdutoService.validarFkExiste`. The only change is removing the `private` modifier and making it a module-level export. [ASSUMED: TypeScript module exports are semantically identical to class methods when the function has no `this` references — verified: the current implementation has no `this` reference]

### AthosProdutoService updated import

Replace the private method declaration with an import:

```typescript
// REMOVE (lines 58-74 in athos-produto.service.ts):
// private async validarFkExiste(...) { ... }

// ADD at top of file:
import { validarFkExiste } from "./athos-fk.util";

// All existing call-sites in AthosProdutoService stay identical:
// await this.validarFkExiste(client, ...) → await validarFkExiste(client, ...)
// (remove "this." prefix at each call site)
```

**Call sites in AthosProdutoService to update (use grep to confirm count):** [VERIFIED: lines 83, 87, 91 in athos-produto.service.ts — three calls with `this.validarFkExiste`]

### Zero-behavior-change verification

The existing tests in `athos-produto.service.test.ts` cover all three call-sites of `validarFkExiste`. After extraction:
- Run `cd apps/backend && npx jest athos-produto.service --no-coverage`
- All tests must stay green
- If any test fails after this refactor, the extraction changed behavior — stop and investigate

---

## COMP-01 — GET Endpoint Implementation

### Master existence check + 404 path

Before querying components, check that the master product exists in `produto`. This ensures:
- 404 when the idprodutomaster is not a real product (correct semantics per D-03)
- `[]` when the master exists but has no composition rows (correct per D-03)

```typescript
// Step 1: check master exists
const masterCheck = await client.query(
  `SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1`,
  [idprodutomaster],
);
if (masterCheck.rows.length === 0) {
  throw new NotFoundException(`Produto ${idprodutomaster} nao encontrado no Athos`);
}

// Step 2: fetch components (may return 0 rows = [])
const result = await client.query<ComposicaoItem>(
  `SELECT
     pc.idprodutocomposto,
     pc.idprodutodetail,
     p.descricaoproduto,
     p.statusproduto,
     pc.quantidade
   FROM produto_composto pc
   LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail
   WHERE pc.idprodutomaster = $1
   ORDER BY pc.idprodutocomposto`,
  [idprodutomaster],
);
return result.rows;
```

### LEFT JOIN rationale (Claude's Discretion)

The choice is LEFT vs INNER JOIN on `produto` by `idprodutodetail`. D-04 says return ALL components including those with inactive detail — this is satisfied by either JOIN type. The distinction is for **orphan rows** (idprodutodetail points to a produto row that no longer exists, which is possible because idprodutodetail has no database FK):

- **INNER JOIN** silently hides orphan composition rows from the caller. The caller cannot distinguish "component deleted" from "component never existed."
- **LEFT JOIN** exposes orphan rows with `descricaoproduto = null` and `statusproduto = null`. The caller sees the orphan and can flag it for cleanup.

**Recommendation: use LEFT JOIN.** Making data corruption visible is always better than hiding it. The null values in the response are a legible signal. This is consistent with D-04's philosophy of letting the caller decide.

If spike (b) reveals a DB FK constraint that prevents orphan detail rows, the LEFT/INNER choice becomes moot — both would return the same results. But LEFT JOIN is the safe default either way.

### Response type

```typescript
// Type for the GET response items (inline in service or in a response DTO file)
interface ComposicaoItem {
  idprodutocomposto: number;
  idprodutodetail: number;
  descricaoproduto: string | null;  // null if orphan row (detail produto was deleted)
  statusproduto: boolean | null;    // null if orphan row; false if inactive (D-04: not filtered)
  quantidade: string;               // pg returns DOMAIN/NUMERIC-backed columns as strings
}
```

Note: `quantidade` is returned as a string by the pg driver when the DOMAIN is NUMERIC-backed. The response shape matches what pg returns — no server-side coercion needed for the GET. The caller parses if needed. Spike (a) will confirm the exact type; if base type is `integer`, pg may return a JS number instead.

### New files

**`apps/backend/src/modules/integrations/athos/athos-produto-composto.service.ts`** (NEW)

```typescript
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InternalServerErrorException } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

interface ComposicaoItem {
  idprodutocomposto: number;
  idprodutodetail: number;
  descricaoproduto: string | null;
  statusproduto: boolean | null;
  quantidade: string;
}

@Injectable()
export class AthosProdutoCompostoService {
  private readonly logger = new Logger(AthosProdutoCompostoService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");
    if (!host || !database || !user || !password) {
      throw new InternalServerErrorException(
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
      );
    }
    return { host, database, user, password, port };
  }

  async listarPorMaster(idprodutomaster: number): Promise<ComposicaoItem[]> {
    const client: PoolClient = await this.getPool().connect();
    try {
      // 404 when master does not exist in produto
      const masterCheck = await client.query(
        `SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1`,
        [idprodutomaster],
      );
      if (masterCheck.rows.length === 0) {
        throw new NotFoundException(`Produto ${idprodutomaster} nao encontrado no Athos`);
      }

      // Fetch enriched component list (LEFT JOIN keeps orphan detail rows visible)
      const result = await client.query<ComposicaoItem>(
        `SELECT
           pc.idprodutocomposto,
           pc.idprodutodetail,
           p.descricaoproduto,
           p.statusproduto,
           pc.quantidade
         FROM produto_composto pc
         LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail
         WHERE pc.idprodutomaster = $1
         ORDER BY pc.idprodutocomposto`,
        [idprodutomaster],
      );

      this.logger.log(
        `listarPorMaster idprodutomaster=${idprodutomaster} count=${result.rows.length}`,
      );
      return result.rows;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Erro ao listar composicao: ${err}`);
      throw new InternalServerErrorException("Erro ao listar composicao do produto no Athos");
    } finally {
      client.release();
    }
  }
}
```

---

**`apps/backend/src/modules/integrations/athos/athos-produto-composto.controller.ts`** (NEW)

```typescript
import {
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";

@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoCompostoController {
  private readonly logger = new Logger(ProdutoCompostoController.name);

  constructor(
    private readonly athosProdutoCompostoService: AthosProdutoCompostoService,
  ) {}

  // Static segment "composicao" as sub-resource — two-segment path, no conflict
  // with ProdutoController's one-segment ":idproduto" routes.
  @ApiOperation({
    summary: "Listar componentes de um kit por produto master",
    description:
      "Retorna lista plana de componentes (produto_composto) do produto master indicado, " +
      "enriquecida com descricaoproduto e statusproduto do produto detail via JOIN. " +
      "Inclui componentes cujo detail esteja inativo (statusproduto=false). " +
      "404 quando o produto master não existe; [] quando existe mas não tem componentes.",
  })
  @ApiParam({ name: "idprodutomaster", example: "42", description: "ID do produto master (kit) no Athos" })
  @ApiOkResponse({
    description:
      "Array de componentes: { idprodutocomposto, idprodutodetail, descricaoproduto, statusproduto, quantidade }[]",
  })
  @Get(":idprodutomaster/composicao")
  async listarComposicao(
    @Param("idprodutomaster", ParseIntPipe) idprodutomaster: number,
  ) {
    this.logger.log(`listarComposicao idprodutomaster=${idprodutomaster}`);
    return this.athosProdutoCompostoService.listarPorMaster(idprodutomaster);
  }
}
```

**Route ordering note:** `ProdutoCompostoController` uses prefix `athos/produtos` (same as `ProdutoController`). NestJS merges routes from both controllers at module registration time. The new route `:idprodutomaster/composicao` (two path segments) cannot collide with `:idproduto` (one path segment). No ordering concern for Phase 39's single GET route.

---

### DTO Scaffolds (Phase 40 gates — decorators TBD pending spike (a))

**`apps/backend/src/modules/integrations/athos/dto/create-produto-composto.dto.ts`** (NEW — scaffold)

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,   // use @IsInt if spike (a) base_type = integer
  Min,
} from "class-validator";

export class CreateProdutoCompostoDto {
  @ApiProperty({ example: 42, description: "ID do produto detail (componente) no Athos" })
  @IsInt()
  @Type(() => Number)
  idprodutodetail!: number;

  // PENDING SPIKE (a): if base_type = integer → replace @IsNumber() with @IsInt()
  // and set @Min() to the CHECK floor (e.g. 1 if CHECK VALUE > 0).
  // Current safe default: @IsNumber() + @Min(0.001).
  @ApiProperty({ example: 2, description: "Quantidade do componente no kit" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
```

**`apps/backend/src/modules/integrations/athos/dto/update-produto-composto.dto.ts`** (NEW — scaffold)

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, Min } from "class-validator";

export class UpdateProdutoCompostoDto {
  // PENDING SPIKE (a): same decorator adjustment as CreateProdutoCompostoDto.quantidade
  @ApiProperty({ example: 3, description: "Nova quantidade do componente no kit" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
```

---

### AthosModule updated registration

**`apps/backend/src/modules/integrations/athos/athos.module.ts`** (MODIFIED)

```typescript
import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { EventsModule } from "../../events/events.module";
import { QuotesModule } from "../../quotes/quotes.module";
import { AthosController } from "./athos.controller";
import { AthosListenerService } from "./athos-listener.service";
import { AthosService } from "./athos.service";
import { AthosProdutoService } from "./athos-produto.service";
import { ProdutoController } from "./athos-produto.controller";
import { AthosDefaultsService } from "./athos-defaults.service";
// NEW — Phase 39
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";
import { ProdutoCompostoController } from "./athos-produto-composto.controller";

@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [
    AthosService,
    AthosListenerService,
    AthosProdutoService,
    AthosDefaultsService,
    AthosProdutoCompostoService,      // NEW
  ],
  controllers: [
    AthosController,
    ProdutoController,
    ProdutoCompostoController,        // NEW
  ],
  exports: [AthosService, AthosProdutoService, AthosDefaultsService],
  // AthosProdutoCompostoService not exported — no other module needs it in v2.5
})
export class AthosModule {}
```

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP GET /athos/produtos/:idprodutomaster/composicao
  (x-internal-api-key guard via @ApiSecurity)
              |
              v
ProdutoCompostoController         [NEW — athos-produto-composto.controller.ts]
  @Get(":idprodutomaster/composicao")
              |
              v
AthosProdutoCompostoService       [NEW — athos-produto-composto.service.ts]
  listarPorMaster(idprodutomaster)
              |
      +-------+-------+
      |               |
      v               v
 getPool()       getDbConfig()    [lazy singleton — same ATHOS_PG_* env vars]
      |
      v
pg.Pool → Athos PostgreSQL
  Step 1: SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1
           → 0 rows: NotFoundException (404)
  Step 2: SELECT pc.*, p.descricaoproduto, p.statusproduto
           FROM produto_composto pc
           LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail
           WHERE pc.idprodutomaster = $1
           ORDER BY pc.idprodutocomposto
           → rows: ComposicaoItem[]   (may be empty array)
              |
              v
       HTTP 200 JSON array (or 404)

athos-fk.util.ts                  [NEW — extract from AthosProdutoService]
  validarFkExiste(client, tabela, coluna, id, nomeEntidade)
  (NOT used in Phase 39 GET — used by AthosProdutoService today;
   critical for Phase 40 POST/PATCH pre-validation)

AthosModule                        [MODIFIED — add service + controller]
```

### Recommended Project Structure Changes

```
apps/backend/src/modules/integrations/athos/
├── athos.module.ts                              MODIFIED — add service + controller
├── athos-fk.util.ts                             NEW — extract validarFkExiste
├── athos-produto-composto.service.ts            NEW — listarPorMaster only (Phase 39)
├── athos-produto-composto.controller.ts         NEW — GET :idprodutomaster/composicao
├── athos-produto-composto.service.test.ts       NEW — Jest tests for listarPorMaster
├── dto/
│   ├── create-produto-composto.dto.ts           NEW — scaffold (decorators finalized after spike a)
│   └── update-produto-composto.dto.ts           NEW — scaffold (decorators finalized after spike a)
├── athos-produto.service.ts                     MODIFIED (minor) — remove private method, add import
└── (all other files untouched)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PK allocation for serial column | MAX+1 logic or `allocateNextContaPagarId` | `INSERT ... RETURNING idprodutocomposto` (omit PK from column list) | Serial column sequences are atomic; MAX+1 races with concurrent Athos desktop inserts (project hit this on `conta_pagar`) |
| FK validation for idprodutodetail | Custom SELECT + manual error check | `validarFkExiste` from `athos-fk.util.ts` | Already proven pattern; extracted util is reusable and testable in isolation |
| pg type parsing for DOMAIN columns | Custom type parser or pg-types registration | Plain `Number(row.quantidade)` if needed | pg handles DOMAIN columns like their base type over the wire; no type registration needed [VERIFIED: STACK.md] |
| New NestJS module for produto_composto | Separate `ProdutoCompostoModule` | Add service+controller to existing `AthosModule` | No other module needs the service; a sub-module would introduce `forwardRef` complexity for zero benefit |
| Error mapping | Generic 500 catch-all | Explicit `code === "23503"`, `"23505"`, `"23514"`, `"42501"` branches in catch | Each error code maps to a distinct HTTP status with a distinct actionable message |

**Key insight:** `produto_composto` is a 4-column table with no ambiguity about its schema (fixed column names, serial PK, one optional DOMAIN). The complexity here is entirely in the operational prerequisites (GRANT, spike results) and the FK-less `idprodutodetail` — not in the SQL itself.

---

## Common Pitfalls

### Pitfall 1: Including idprodutocomposto in the INSERT column list (Phase 40 preview)

**What goes wrong:** PostgreSQL raises duplicate-key error `23505` under concurrent Athos desktop usage.
**Why it happens:** `idprodutocomposto` is `serial` — developers copy-paste an INSERT and manually include the PK, causing a race with the sequence.
**How to avoid:** INSERT column list = `(idprodutomaster, idprodutodetail, quantidade)` only. Use `RETURNING idprodutocomposto`. Code review MUST reject any INSERT that includes `idprodutocomposto` in the column list.
**Warning signs:** Sporadic `23505` errors in staging but not in unit tests (unit tests run single-threaded).

### Pitfall 2: INNER JOIN hides orphan detail rows

**What goes wrong:** GET returns fewer rows than `produto_composto` actually has; data integrity issue becomes invisible.
**Why it happens:** Using `INNER JOIN produto` silently drops composition rows where `idprodutodetail` no longer exists in `produto` (no FK enforcement on this column).
**How to avoid:** Use `LEFT JOIN`. Return null `descricaoproduto`/`statusproduto` for orphans rather than hiding them.
**Warning signs:** `SELECT COUNT(*) FROM produto_composto WHERE idprodutomaster = X` returns more rows than the GET response.

### Pitfall 3: Writing DTO decorators before spike (a) results

**What goes wrong:** `@IsInt()` with `@Min(1)` fails silently for fractional quantities if the domain is NUMERIC; or `@IsNumber()` accepts 0.0001 but the DB rejects it with `23514`.
**Why it happens:** DOMAIN constraints are not publicly documented. Training-data assumptions about `quantidade` type are unreliable.
**How to avoid:** Leave `quantidade` scaffold with comment `PENDING SPIKE (a)` and finalize decorators after user pastes results. Phase 40 plan gated on spike results.
**Warning signs:** HTTP 422 from class-validator but not from DB (over-strict DTO), or HTTP 500 from DB `23514` but DTO validation passed (under-strict DTO).

### Pitfall 4: validarFkExiste removal from AthosProdutoService without fixing call sites

**What goes wrong:** TypeScript compile error (method not found) or runtime error if the `this.validarFkExiste(...)` calls are not updated to `validarFkExiste(...)`.
**Why it happens:** The private method has 3 call sites in `AthosProdutoService` (lines 83, 87, 91). Removing the method without updating each call site breaks existing `criarProduto` and `editarProduto` paths.
**How to avoid:** Use `grep -n "this.validarFkExiste" apps/backend/src/modules/integrations/athos/athos-produto.service.ts` to confirm count, then update all three. Run existing tests immediately after.
**Warning signs:** `tsc` compile errors on build; existing `athos-produto.service.test.ts` tests fail.

### Pitfall 5: Assuming write GRANT is not needed for Phase 39

**What goes wrong:** It isn't — Phase 39 is SELECT-only. This pitfall is the opposite: mistakenly testing the write path in Phase 39 before the GRANT exists.
**Why it matters:** SELECT GRANT is already present. Phase 39 GET works. Phase 40 POST/PATCH/DELETE will fail with `42501` until the DBA issues the write GRANT. Do not conflate the two phases.
**Warning signs:** Phase 39 GET tests pass; Phase 40 write tests fail with `permission denied for table produto_composto`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest ^30.3.0 + ts-jest ^29.4.9 |
| Config file | `apps/backend/jest.config.js` (rootDir: `src`, testRegex: `.*\.test\.ts$`) |
| Quick run command | `cd apps/backend && npx jest athos-produto-composto --no-coverage` |
| COMP-08 existing-tests run | `cd apps/backend && npx jest athos-produto.service --no-coverage` |
| Full suite command | `cd apps/backend && npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-07 | Spike queries return correct output on 192.168.3.198 | Manual (user runs SQL, pastes results) | N/A — not automatable from CI | N/A |
| COMP-08 | validarFkExiste extracted; AthosProdutoService call sites updated; zero behavior change | Regression (existing tests stay green) | `npx jest athos-produto.service --no-coverage` | YES (`athos-produto.service.test.ts`) |
| COMP-01-404 | GET returns 404 when idprodutomaster not in produto | Unit | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |
| COMP-01-empty | GET returns `[]` when master exists with no components | Unit | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |
| COMP-01-list | GET returns enriched list ordered by idprodutocomposto | Unit | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |
| COMP-01-inactive | GET includes components with statusproduto=false (D-04) | Unit | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |
| COMP-01-orphan | GET includes orphan rows with null descricaoproduto via LEFT JOIN | Unit | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |
| COMP-01-nopk | SELECT does NOT include idprodutocomposto in a WHERE (not relevant) — but verify no INSERT exists | Unit (negative) | `npx jest athos-produto-composto --no-coverage` | NO — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd apps/backend && npx jest athos-produto-composto athos-produto.service --no-coverage`
- **Per wave merge:** `cd apps/backend && npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Test Skeleton for athos-produto-composto.service.test.ts

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";

jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool  = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

describe("AthosProdutoCompostoService", () => {
  let service: AthosProdutoCompostoService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB   = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosProdutoCompostoService],
    }).compile();
    service = module.get<AthosProdutoCompostoService>(AthosProdutoCompostoService);
  });

  describe("listarPorMaster", () => {
    it("COMP-01-404: lança NotFoundException quando idprodutomaster não existe", async () => {
      const pool   = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      // master check returns empty
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.listarPorMaster(999)).rejects.toThrow(NotFoundException);
      expect(client.release).toHaveBeenCalled();
    });

    it("COMP-01-empty: retorna [] quando master existe mas não tem componentes", async () => {
      const pool   = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // master exists
        .mockResolvedValueOnce({ rows: [] });                  // no components

      const result = await service.listarPorMaster(42);
      expect(result).toEqual([]);
    });

    it("COMP-01-list: retorna lista enriquecida ordenada por idprodutocomposto", async () => {
      const pool   = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      const mockRow = {
        idprodutocomposto: 1,
        idprodutodetail:   10,
        descricaoproduto:  "Papel A4",
        statusproduto:     true,
        quantidade:        "5",
      };
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.listarPorMaster(42);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockRow);
    });

    it("COMP-01-inactive: inclui componentes com statusproduto=false (D-04)", async () => {
      const pool   = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [{ idprodutocomposto: 2, statusproduto: false, descricaoproduto: "Inativo" }] });

      const result = await service.listarPorMaster(42);
      expect(result[0].statusproduto).toBe(false);
    });

    it("COMP-01-sql-leftjoin: SQL usa LEFT JOIN (não INNER JOIN)", async () => {
      const pool   = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.listarPorMaster(42);

      const sqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql).toUpperCase());
      const joinSql = sqls.find((s) => s.includes("LEFT JOIN"));
      expect(joinSql).toBeDefined();
    });

    it("propagates error when pool.connect fails", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));
      await expect(service.listarPorMaster(1)).rejects.toThrow();
    });
  });
});
```

### Wave 0 Gaps

- [ ] `apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts` — skeleton above covers COMP-01-* cases
- [ ] `apps/backend/src/modules/integrations/athos/athos-fk.util.test.ts` — unit test for `validarFkExiste` in isolation (pure function, no DI)
- [ ] Framework install: none needed — jest.config.js exists; framework already installed

*(athos-produto.service.test.ts already covers COMP-08 regression — no new file needed for that requirement)*

---

## Security Domain

`security_enforcement` is not explicitly set to `false` in `.planning/config.json`. ASVS categories apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `x-internal-api-key` guard via `@ApiSecurity("InternalApiKey")` — reused from existing controllers |
| V3 Session Management | no | Stateless API; no sessions |
| V4 Access Control | yes | Single internal-key guard covers all Athos routes; no per-user RBAC needed |
| V5 Input Validation | yes | `ParseIntPipe` on `:idprodutomaster` route param; `ValidationPipe` on DTOs; parameterized queries |
| V6 Cryptography | no | No cryptographic operations in this phase |

### Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via route param | Tampering | `ParseIntPipe` rejects non-integer; parameterized `$1` in SQL — never string interpolation |
| Internal API key bypass | Spoofing | `@ApiSecurity("InternalApiKey")` on controller class applies guard to all routes |
| Over-fetching via large kit | Information Disclosure | Phase 39 GET has no LIMIT; acceptable at current scale (internal tool); note for Phase 40 if kits grow large |
| Data exposure from orphan rows | Information Disclosure | LEFT JOIN exposes null fields for orphans — acceptable and intentional (D-04 philosophy) |

---

## Risks and Open Questions

These items remain unresolved until the spike results come back:

### Q1: quantidade DOMAIN base type (spike a)

- **What we know:** DOMAIN named `quantidade` exists on `produto_composto`. The pg driver returns NUMERIC-backed DOMAINs as strings and integer-backed DOMAINs as JavaScript numbers.
- **What's unclear:** Is the base type `integer` (whole units only) or `numeric`/`decimal` (fractional quantities like 0.5 meters)?
- **Impact:** Determines DTO decorators in Phase 39 scaffold: `@IsInt()` vs `@IsNumber()`, and the exact `@Min()` floor value.
- **Safe default until resolved:** `@IsNumber()` + `@Min(0.001)` in DTO scaffold. Response type annotated as `string` (pessimistic, works for both types).

### Q2: UNIQUE constraint on (idprodutomaster, idprodutodetail) (spike b)

- **What we know:** The DDL as documented does not show a UNIQUE constraint.
- **What's unclear:** Whether one was added post-DDL in the Athos schema.
- **Impact on Phase 39:** None (no writes in Phase 39). Impact on Phase 40: if UNIQUE exists, `23505` is a DB-level guard; if absent, the application pre-check in POST is the only protection against duplicate pairs.
- **Action:** Document result in PLAN.md; no code change in Phase 39.

### Q3: Triggers and rules on produto_composto (spike c)

- **What we know:** Athos has triggers on `produto` (`tg_alterarproduto`, timestamp rules). Similar mechanisms may exist on `produto_composto`.
- **What's unclear:** Any trigger requiring extra columns in INSERT (e.g., `idusuarioalteracao`, status flag, audit log).
- **Impact on Phase 39:** None (no writes). Impact on Phase 40: if a trigger requires additional columns, the INSERT column list in `criarComponente` must include them.
- **Action:** Document result in PLAN.md. If triggers found requiring extra columns, add those columns to the Phase 40 INSERT allowlist.

### Q4: Whether quantidade is returned as string or number from pg (spike a secondary)

The pg driver returns NUMERIC-backed DOMAIN columns as JavaScript strings (to avoid float precision loss). If the DOMAIN is integer-backed, pg may return a JS number. The GET response type for `quantidade` should be documented once spike (a) results are known. Phase 39 returns whatever pg returns — no server-side coercion. This is a GET-only phase so no DTO write validation is exercised.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `validarFkExiste` in `AthosProdutoService` has zero `this` references — extraction to module-level function is semantically identical | COMP-08 | If any `this` reference exists, the extracted function would fail; mitigated by code inspection [VERIFIED: read lines 58-74] |
| A2 | `quantidade` DOMAIN decorator safe default is `@IsNumber()` + `@Min(0.001)` | DTO scaffold | If domain is integer-only with `CHECK VALUE >= 1`, the scaffold would allow fractional values that the DB rejects with 23514 |
| A3 | No triggers on `produto_composto` require additional INSERT columns beyond `(idprodutomaster, idprodutodetail, quantidade)` | Phase 40 preview, INSERT pattern | If wrong, Phase 40 INSERT fails with trigger constraint error; resolved by spike (c) |
| A4 | UNIQUE constraint absent on `(idprodutomaster, idprodutodetail)` — application pre-check is the only guard | COMP-01 / Phase 40 preview | If UNIQUE exists in Athos, it's a bonus guard; if absent (expected), application check in Phase 40 is critical |

**If this table is empty after spikes:** All ASSUMED claims were confirmed or superseded by spike results.

---

## Sources

### Primary (HIGH confidence — first-party codebase)

- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — `validarFkExiste` method (lines 58-74), `getPool` (22-29), `getDbConfig` (31-45), call sites (83, 87, 91) [VERIFIED: read in this session]
- `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` — controller pattern, `@ApiSecurity`, route ordering comment, `ParseIntPipe` usage [VERIFIED: read in this session]
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — providers and controllers arrays structure [VERIFIED: read in this session]
- `apps/backend/src/modules/integrations/athos/produto.types.ts` — `usaprodutocomposto`, `statusproduto`, `descricaoproduto` column types confirmed [VERIFIED: read in this session]
- `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` — jest.mock("pg") pattern, mClient/mPool structure, describe/beforeAll/beforeEach/afterEach layout [VERIFIED: read in this session]
- `apps/backend/jest.config.js` — rootDir, testRegex, transform config [VERIFIED: read in this session]
- `.planning/REQUIREMENTS.md` — COMP-01, COMP-07, COMP-08 definitions [VERIFIED: read in this session]
- `.planning/phases/39-scaffold-leitura-e-spikes-de-introspec-o/39-CONTEXT.md` — D-01..D-04, canonical refs, deferred items [VERIFIED: read in this session]
- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md` — milestone research, all cross-confirm the same patterns [VERIFIED: read in this session]

### Secondary (MEDIUM confidence — pg catalog documentation)

- PostgreSQL `pg_type`, `pg_constraint`, `information_schema.triggers`, `pg_rules` introspection queries — standard pg catalog SQL [ASSUMED: based on PostgreSQL documentation knowledge; confirmed equivalent patterns in PITFALLS.md]
- PostgreSQL error codes: `42501` (insufficient_privilege), `23503` (foreign_key_violation), `23505` (unique_violation), `23514` (check_violation) [ASSUMED: standard pg codes, cross-referenced with PITFALLS.md and athos-produto.service.ts catch blocks]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — versions read from package.json files in this session
- Architecture: HIGH — all patterns read from first-party source files; zero external lookups needed
- Spike SQL queries: MEDIUM — pg catalog introspection SQL is standard; exact column names in the Athos schema are ASSUMED
- Pitfalls: HIGH — sourced from prior production incidents (conta_pagar MAX+1) and direct code inspection

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (spike results may supersede DTO sections immediately upon receipt)
