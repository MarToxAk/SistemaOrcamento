# Architecture Research

**Domain:** produto_composto CRUD API — NestJS/raw-pg integration into existing Athos module
**Researched:** 2026-06-29
**Confidence:** HIGH (derived entirely from first-party source reading of the existing codebase)

## Standard Architecture

### System Overview

```
HTTP (x-internal-api-key guard)
         |
         v
ProdutoCompostoController          (athos-produto-composto.controller.ts)
 GET  /athos/produtos-compostos?idprodutomaster=:id
 POST /athos/produtos-compostos
 PATCH /athos/produtos-compostos/:idprodutocomposto
 DELETE /athos/produtos-compostos/:idprodutocomposto
         |
         v
AthosProdutoCompostoService        (athos-produto-composto.service.ts)
  listarPorMaster(idprodutomaster)
  criarComponente(dto)
  atualizarQuantidade(id, dto)
  removerComponente(id)
         |
    +---------+
    |         |
    v         v
athos-fk.util.ts            pg.Pool → Athos PostgreSQL (ATHOS_PG_*)
validarFkExiste()            produto_composto table
(shared with AthosProdutoService)

AthosModule
  providers: [..., AthosProdutoCompostoService]
  controllers: [..., ProdutoCompostoController]
```

### Component Responsibilities

| Component | Responsibility | Mirrors |
|-----------|----------------|---------|
| `ProdutoCompostoController` | REST surface, request parsing, Swagger docs, route ordering (static before parametric) | `ProdutoController` in athos-produto.controller.ts |
| `AthosProdutoCompostoService` | Business logic, FK pre-validation, dynamic SQL building, pool management, structured logging | `AthosProdutoService` in athos-produto.service.ts |
| `athos-fk.util.ts` (new shared util) | `validarFkExiste(client, tabela, coluna, id, nomeEntidade)` extracted from AthosProdutoService | Private method in AthosProdutoService (to be extracted) |
| `dto/create-produto-composto.dto.ts` | Validates idprodutomaster (required int), idprodutodetail (required int), quantidade (required positive number) | CreateProdutoDto pattern |
| `dto/update-produto-composto.dto.ts` | Validates quantidade (required positive number) | UpdateProdutoDto pattern |
| `AthosModule` | Wires new service + controller; no new imports needed | Modified: add to providers/controllers arrays |

## Recommended Project Structure

```
apps/backend/src/modules/integrations/athos/
├── athos.module.ts                          MODIFIED — add service + controller
├── athos-fk.util.ts                         NEW — extract validarFkExiste from AthosProdutoService
├── athos-produto-composto.service.ts        NEW
├── athos-produto-composto.service.test.ts   NEW
├── athos-produto-composto.controller.ts     NEW
├── dto/
│   ├── create-produto-composto.dto.ts       NEW
│   └── update-produto-composto.dto.ts       NEW
│   (existing dto/ files untouched)
└── (all existing files untouched)
```

### Structure Rationale

- **No separate module:** produto_composto is a subordinate entity within the Athos integration. Adding a sub-module would introduce `forwardRef` complexity with no benefit at this scale.
- **athos-fk.util.ts extraction:** `validarFkExiste` is currently private to `AthosProdutoService`. Both services need to validate FKs against `produto`. Extracting it avoids duplication and keeps the function testable in isolation. This is a minor, safe refactor to `AthosProdutoService` (replace the private method with a call to the util).
- **No util file like athos-conta-pagar.util.ts:** That util handles a wide table with many column name aliases. `produto_composto` has only 4 columns with fixed, known names. Inline SQL building inside the service (as done in `AthosProdutoService.criarProduto`) is sufficient.

## Architectural Patterns

### Pattern 1: Shared Pool per Service (mirror of AthosProdutoService)

**What:** Each service holds its own `_pool: Pool | null` initialized lazily on first use via `getPool()`. `getDbConfig()` reads from `ATHOS_PG_*` env vars and throws `InternalServerErrorException` if any are missing.

**When to use:** Always — this is the established pattern across all Athos services.

**Trade-offs:** Two Pool instances exist at runtime (one in AthosProdutoService, one in AthosProdutoCompostoService). At `max: 5` each this is negligible. Sharing a pool across services would require injecting it via a dedicated PoolProvider — complexity not justified here.

**Example:**
```typescript
@Injectable()
export class AthosProdutoCompostoService {
  private readonly logger = new Logger(AthosProdutoCompostoService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on('error', (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }
  // getDbConfig() identical to AthosProdutoService
}
```

### Pattern 2: Serial PK via RETURNING (no manual sequence allocation)

**What:** `idprodutocomposto` is a PostgreSQL `serial` column (backed by a sequence). The INSERT simply omits the PK column and uses `RETURNING idprodutocomposto` to retrieve the generated value. This differs from `allocateNextContaPagarId` in `athos.service.ts`, which was needed because `conta_pagar.idcontapagar` is not a serial and requires explicit sequence consultation.

**When to use:** Whenever the PK is a `serial`/`bigserial`/`generated always as identity` column.

**Example:**
```typescript
const sql = `INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
             VALUES ($1, $2, $3::quantidade)
             RETURNING idprodutocomposto`;
const result = await client.query<{ idprodutocomposto: number }>(sql, [
  dto.idprodutomaster, dto.idprodutodetail, dto.quantidade
]);
return { idprodutocomposto: result.rows[0].idprodutocomposto };
```

Note: `::quantidade` cast handles the custom domain type. If the domain is simply `NUMERIC`, a plain `$3` with a numeric JS value also works — verify against the reference DB schema.

### Pattern 3: FK Pre-Validation with validarFkExiste

**What:** Before any INSERT, run a `SELECT 1 FROM "tabela" WHERE "coluna" = $1 LIMIT 1` for each FK-like field that is provided. If no row is found, throw `UnprocessableEntityException` (HTTP 422) with a descriptive message. Catch PostgreSQL error code `23503` as a fallback for FKs not explicitly pre-validated.

**When to use:** Both `idprodutomaster` and `idprodutodetail` must be validated against `produto` on create. `idprodutodetail` has no database FK (intentional schema decision), so pre-validation is the only guard.

**Example (using extracted util):**
```typescript
// athos-fk.util.ts
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

// Usage in criarComponente:
await validarFkExiste(client, 'produto', 'idproduto', dto.idprodutomaster, 'Produto master');
await validarFkExiste(client, 'produto', 'idproduto', dto.idprodutodetail, 'Produto detail');
```

### Pattern 4: Physical DELETE (new capability, distinct from produto soft-delete)

**What:** `produto_composto` rows represent a composition relationship, not business entities with history. The PROJECT.md constraint "Nunca apagar fisicamente (sem DELETE)" applies only to the `produto` table. The milestone spec explicitly states: "'Remover componente' = DELETE fisico da linha de produto_composto".

**When to use:** Only for `produto_composto`. Never for `produto`.

**Example:**
```typescript
async removerComponente(idprodutocomposto: number): Promise<{ idprodutocomposto: number }> {
  const client = await this.getPool().connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM produto_composto WHERE idprodutocomposto = $1 LIMIT 1',
      [idprodutocomposto],
    );
    if (exists.rows.length === 0) {
      throw new NotFoundException(`Componente ${idprodutocomposto} nao encontrado`);
    }
    await client.query(
      'DELETE FROM produto_composto WHERE idprodutocomposto = $1',
      [idprodutocomposto],
    );
    this.logger.log(`removerComponente idprodutocomposto=${idprodutocomposto}`);
    return { idprodutocomposto };
  } finally {
    client.release();
  }
}
```

## Data Flow

### Create Component Flow

```
POST /athos/produtos-compostos
  Body: { idprodutomaster, idprodutodetail, quantidade }
         |
         v
ProdutoCompostoController.criarComponente(dto)
         |
         v
AthosProdutoCompostoService.criarComponente(dto)
  1. getPool().connect()
  2. validarFkExiste(client, 'produto', 'idproduto', idprodutomaster, 'Produto master')
  3. validarFkExiste(client, 'produto', 'idproduto', idprodutodetail, 'Produto detail')
  4. INSERT INTO produto_composto (...) VALUES (...) RETURNING idprodutocomposto
  5. logger.log(...)
  6. client.release()
         |
         v
Response: { idprodutocomposto: number }   HTTP 201
```

### List by Master Flow

```
GET /athos/produtos-compostos?idprodutomaster=42
         |
         v
ProdutoCompostoController.listarPorMaster(idprodutomaster)
         |
         v
AthosProdutoCompostoService.listarPorMaster(idprodutomaster)
  1. getPool().connect()
  2. SELECT pc.*, p.descricaoproduto FROM produto_composto pc
     JOIN produto p ON p.idproduto = pc.idprodutodetail
     WHERE pc.idprodutomaster = $1
     ORDER BY pc.idprodutocomposto
  3. client.release()
         |
         v
Response: ProdutoCompostoItem[]   HTTP 200
```

### Update Quantidade Flow

```
PATCH /athos/produtos-compostos/:idprodutocomposto
  Body: { quantidade }
         |
         v
AthosProdutoCompostoService.atualizarQuantidade(id, dto)
  1. SELECT 1 ... existence check → 404 if not found
  2. UPDATE produto_composto SET quantidade = $1::quantidade WHERE idprodutocomposto = $2
  3. logger.log(...)
         |
         v
Response: { idprodutocomposto: number }   HTTP 200
```

## Integration Points

### Controlled Write Exception Expansion

`produto_composto` becomes the second Athos table with write access (after `produto`). The constraint in PROJECT.md is "Escrita no Athos ampliada para produto_composto (nova excecao controlada)". The code enforcement is the column allowlist inside the service — only `idprodutomaster`, `idprodutodetail`, and `quantidade` are ever written.

### GRANT Prerequisite

The Athos database currently has only `GRANT SELECT` on `produto_composto`. The DBA must run `GRANT INSERT, UPDATE, DELETE ON produto_composto TO <ATHOS_PG_USER>` before any write endpoint can succeed in production. This is a pre-deploy operational step, not a code step. Phase 40 (or whichever phase introduces writes) should flag this as a prerequisite.

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Athos PostgreSQL (ATHOS_PG_*) | raw `pg.Pool`, parameterized queries, `client.release()` in finally | Same pool pattern as AthosProdutoService; max 5 connections |
| Reference DB (192.168.3.198) | Read-only; use only for schema inspection during development | Never written to; API writes go to ATHOS_PG_HOST |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `ProdutoCompostoController` → `AthosProdutoCompostoService` | Direct NestJS DI injection | No events, no Prisma |
| `AthosProdutoCompostoService` → `athos-fk.util.ts` | Plain function call | Stateless util, no injection needed |
| `AthosProdutoService` → `athos-fk.util.ts` | Plain function call (after extraction refactor) | Replace private method with util call; no behavior change |
| `AthosModule` → Athos DB | pg.Pool per service | Both produto and produto_composto pools use same ATHOS_PG_* config |

## New vs Modified Components

| File | Status | Change |
|------|--------|--------|
| `athos-fk.util.ts` | NEW | Extract `validarFkExiste` function (currently private in AthosProdutoService) |
| `athos-produto-composto.service.ts` | NEW | Full CRUD: listarPorMaster, criarComponente, atualizarQuantidade, removerComponente |
| `athos-produto-composto.service.test.ts` | NEW | Jest tests mirroring athos-produto.service.test.ts pattern |
| `athos-produto-composto.controller.ts` | NEW | GET, POST, PATCH, DELETE endpoints; static routes before parametric |
| `dto/create-produto-composto.dto.ts` | NEW | idprodutomaster (required int), idprodutodetail (required int), quantidade (required number >0) |
| `dto/update-produto-composto.dto.ts` | NEW | quantidade (required number >0) |
| `athos.module.ts` | MODIFIED | Add AthosProdutoCompostoService to providers; ProdutoCompostoController to controllers |
| `athos-produto.service.ts` | MODIFIED (minor) | Replace `private validarFkExiste(...)` with `import { validarFkExiste } from './athos-fk.util'` |

## Suggested Phase Build Order

Starting at phase 39 (per PROJECT.md — "Numeracao de fases continua a partir de 39"):

### Phase 39: Scaffold + Read

**Goal:** Prove the new module slot works before any write touches production.

- Extract `validarFkExiste` to `athos-fk.util.ts`; update `AthosProdutoService` to use it (zero behavior change — covered by existing tests)
- Create DTOs (`create-produto-composto.dto.ts`, `update-produto-composto.dto.ts`)
- Create `AthosProdutoCompostoService` with `listarPorMaster` only (SELECT, no writes)
- Create `ProdutoCompostoController` with `GET /athos/produtos-compostos?idprodutomaster=:id` only
- Wire into `AthosModule` (providers + controllers)
- Verify: GET returns rows from reference DB; module loads without error

**Rationale:** Read-first builds confidence in pool setup, FK util extraction, and module wiring before any write grants are needed.

### Phase 40: Write CRUD (Create + Delete + Update)

**Gate:** GRANT INSERT, UPDATE, DELETE on `produto_composto` must be issued in Athos DB before this phase can be verified end-to-end.

- Add `criarComponente` (POST) — both FK validations, serial PK via RETURNING
- Add `removerComponente` (DELETE) — existence check + physical DELETE
- Add `atualizarQuantidade` (PATCH) — existence check + UPDATE quantidade
- Structured logging for all write operations (same format: `operation id=X`)

**Rationale:** Create and delete are the core write capability; bundled because they share the FK validation setup. Update is simple enough to include in the same phase.

### Phase 41: Tests

- Jest unit tests for all four service methods, mirroring `athos-produto.service.test.ts`
- Mock `pg` using `jest.mock('pg')` pattern already established
- Key cases: FK not found → 422; record not found → 404; successful insert returns idprodutocomposto; DELETE only runs after existence check; serial PK does NOT appear in INSERT column list (only in RETURNING)
- Verify `validarFkExiste` util is exercised for both master and detail on create

**Rationale:** Tests last because the service logic is straightforward and follows proven patterns. The team can adjust based on what was actually implemented in Phase 40.

## Anti-Patterns

### Anti-Pattern 1: Manual ID Allocation for produto_composto

**What people do:** Copy the `allocateNextContaPagarId` pattern from `athos.service.ts` to allocate the next `idprodutocomposto` via a sequence query before INSERT.

**Why it's wrong:** `idprodutocomposto` is a `serial` column (PostgreSQL auto-increments it). Manual allocation duplicates work the DB does automatically and introduces a race condition between sequence read and INSERT.

**Do this instead:** Omit `idprodutocomposto` from the INSERT column list and use `RETURNING idprodutocomposto`. The DB assigns the ID atomically.

### Anti-Pattern 2: Soft-Delete for produto_composto

**What people do:** Apply the `statusproduto/vendeproduto = false` pattern from `produto` to "remove" a composition component.

**Why it's wrong:** `produto_composto` has no `statusproduto` column. More importantly, the milestone spec is explicit: "Remover componente = DELETE fisico da linha de produto_composto". The no-physical-delete rule is specific to `produto`.

**Do this instead:** `DELETE FROM produto_composto WHERE idprodutocomposto = $1` after confirming the record exists.

### Anti-Pattern 3: Validating idprodutodetail as FK at DB Level Only

**What people do:** Skip the `validarFkExiste` pre-check for `idprodutodetail` because "there's no DB FK — it'll just insert any integer".

**Why it's wrong:** The schema deliberately has no FK for `idprodutodetail` (the Athos design decision), so the DB will not reject invalid IDs. A component can be created pointing to a nonexistent product, silently corrupting the composition data.

**Do this instead:** Always pre-validate both `idprodutomaster` and `idprodutodetail` against `produto` using `validarFkExiste` before INSERT, even though only `idprodutomaster` has a DB-level FK.

### Anti-Pattern 4: Placing Static Routes After Parametric Routes

**What people do:** Declare `GET /athos/produtos-compostos/:idprodutocomposto` (if added later) before `GET /athos/produtos-compostos` (list) in the controller.

**Why it's wrong:** NestJS matches routes top-to-bottom. A literal segment like `?idprodutomaster=X` is a query param, not a path segment, so this isn't an issue for list vs. get-by-id. But if a `GET /:id` route is added, it must come after any static segments. The comment in `athos-produto.controller.ts` ("Rotas estáticas declaradas ANTES da rota paramétrica") documents this exact pitfall.

**Do this instead:** Always declare fully-static routes before `:param` routes in the controller file.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (internal tool, <10 concurrent users) | Single Pool per service (max 5) is fine; no caching needed |
| Future (if multi-tenant or high read volume) | Extract shared PoolProvider injectable; add a read-through cache for `listarPorMaster` |
| If Athos DB is ever replaced | The pg.Pool is encapsulated in each service — swap connection details in one place (getDbConfig) |

---
*Architecture research for: produto_composto CRUD API — NestJS Athos module integration*
*Researched: 2026-06-29*
