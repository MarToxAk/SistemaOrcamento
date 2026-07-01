# Stack Research

**Domain:** NestJS write API — composite/kit products on an external Postgres (Athos ERP)
**Researched:** 2026-06-29
**Confidence:** HIGH — versions confirmed from package.json; patterns confirmed from athos-produto.service.ts

---

## Verdict: Zero new dependencies

Every library needed to build the `produto_composto` CRUD API is already installed.
`npm install` is not required. The section below documents what to reuse and how.

---

## Confirmed Library Versions

Sourced directly from `package.json` files (root and `apps/backend`).

### Core Technologies

| Technology | Version (semver range) | Location | Purpose |
|------------|------------------------|----------|---------|
| `pg` | `^8.20.0` | root `package.json` → dependencies | Raw Postgres driver — Pool + PoolClient pattern |
| `@types/pg` | `^8.20.0` | root `package.json` → devDependencies | TypeScript types for pg |
| `@nestjs/common` | `^11.1.19` | `apps/backend/package.json` | Injectable, Controller, guards, HTTP exceptions |
| `@nestjs/swagger` | `^11.4.2` | `apps/backend/package.json` | ApiProperty / ApiTags decorators |
| `class-validator` | `^0.14.1` | `apps/backend/package.json` | DTO validation decorators |
| `class-transformer` | `^0.5.1` | `apps/backend/package.json` | `@Type(() => Number)` coercions in DTOs |

### Testing (devDependencies, `apps/backend`)

| Tool | Version | Purpose |
|------|---------|---------|
| `jest` | `^30.3.0` | Test runner |
| `ts-jest` | `^29.4.9` | TypeScript transform for Jest |
| `@nestjs/testing` | `^11.1.19` | `Test.createTestingModule` for unit tests |
| `@types/jest` | `^30.0.0` | TypeScript types for Jest |

---

## How to Handle the `quantidade` DOMAIN Type

`quantidade` is a custom Postgres DOMAIN. The `pg` driver has no awareness of named
domains — it treats them identically to their underlying base type over the wire.

### On INSERT (writes)

Pass a JavaScript `number` as a parameterized query value (`$N`). Postgres accepts it
and applies domain constraints (e.g. `CHECK (VALUE > 0)`). No type casting needed in
the SQL string.

```sql
-- Correct: pg sends the JS number as a typed parameter
INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
VALUES ($1, $2, $3)
RETURNING idprodutocomposto
```

If the value violates a domain CHECK constraint, pg returns error code `23514`
(`check_violation`). Catch it alongside `23503` (FK violation) in the service's
catch block and throw `UnprocessableEntityException`.

### On SELECT (reads)

`pg` returns NUMERIC-backed domain values as JavaScript strings (to avoid float
precision loss). Parse with `Number(row.quantidade)` or return as string depending
on client needs. No pg type override registration needed.

### In the DTO

```typescript
@ApiPropertyOptional({ example: 2.5, description: "Quantidade do componente" })
@IsNumber()
@Min(0.001)
@Type(() => Number)
quantidade!: number;
```

Use `@IsNumber()` (not `@IsInt()`) to allow fractional quantities unless the domain
is confirmed integer-only on inspection of 192.168.3.198.

---

## How to Handle the `serial` PK

`idprodutocomposto serial PRIMARY KEY` is a sequence-backed auto-increment column.

**Correct approach:** omit the column from INSERT and use `RETURNING`.

```sql
INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
VALUES ($1, $2, $3)
RETURNING idprodutocomposto
```

Do NOT use the `allocateNextContaPagarId` sequence-resync pattern. That pattern
exists for `conta_pagar` because that table's PK may lack a sequence. `produto_composto`
declares `serial` explicitly — the standard RETURNING approach is correct and
avoids the LOCK TABLE overhead.

---

## `idprodutodetail` Has No FK — Manual Validation Required

The DDL declares `idprodutodetail integer` with no `REFERENCES` clause.
Postgres will not enforce referential integrity for this column. The service must
manually validate existence using the `validarFkExiste` pattern already present in
`AthosProdutoService`:

```typescript
await this.validarFkExiste(client, 'produto', 'idproduto', dto.idprodutodetail, 'Produto detail');
```

Validate both `idprodutomaster` (has a declared FK, but pre-validate anyway for a
better error message) and `idprodutodetail` before any write.

---

## Integration Points

### Existing Pool Pattern — Reuse As-Is

`AthosProdutoService` creates a lazy singleton Pool from `ATHOS_PG_*` env vars.
`AthosProdutoCompostoService` must follow the same pattern:

```typescript
private _pool: Pool | null = null;

private getPool(): Pool {
  if (!this._pool) {
    const cfg = this.getDbConfig();   // same private method
    this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
    this._pool.on('error', (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
  }
  return this._pool;
}
```

A separate Pool per service is fine — each service owns at most 5 connections and
the Athos DB accepts multiple pools from the same application.

### Module Registration

Add to `apps/backend/src/modules/integrations/athos/athos.module.ts`:
- `AthosProdutoCompostoService` → `providers` array
- `ProdutoCompostoController` → `controllers` array
- Export `AthosProdutoCompostoService` if other modules need it (not required for v2.5)

### Auth Guard

Reuse the existing `x-internal-api-key` guard — same decorator that `ProdutoController`
and `AthosController` already carry. No new auth work.

### Logging

Use `new Logger(AthosProdutoCompostoService.name)` — same NestJS structured logger
already in every other Athos service.

---

## Referencing 192.168.3.198 During Development

192.168.3.198 is a read-only Athos instance with real `produto_composto` rows.
Use it for schema inspection and data pattern discovery only — never for writes.

Inspect schema and sample data via psql:
```bash
psql -h 192.168.3.198 -U <ATHOS_PG_USER> -d <ATHOS_PG_DB> \
  -c "\d produto_composto"

psql -h 192.168.3.198 -U <ATHOS_PG_USER> -d <ATHOS_PG_DB> \
  -c "SELECT * FROM produto_composto LIMIT 10"
```

Use this to confirm:
1. The underlying type of the `quantidade` domain (`\dD quantidade`)
2. Whether fractional quantities exist in practice
3. Any CHECK constraints on the domain

The API itself always writes to `ATHOS_PG_*` env-configured DB.

---

## Operational Blocker (Not a Code Issue)

The DDL grants only `SELECT` to `usuario_leitura`. Before any write can succeed
at runtime, the DBA must run on the Athos DB:

```sql
GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto TO <write_user>;
-- If the serial sequence needs to be readable:
GRANT USAGE, SELECT ON SEQUENCE produto_composto_idprodutocomposto_seq TO <write_user>;
```

Without this, every INSERT/UPDATE/DELETE will fail with pg error code `42501`
(insufficient privilege). The service should catch `42501` and throw
`InternalServerErrorException` with a clear message pointing to this GRANT.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any ORM (TypeORM, Drizzle, Knex) for Athos | Athos is an external DB with undocumented schema; raw pg gives full control and already works | Existing `pg` Pool + parameterized queries |
| Prisma for Athos | Prisma is for the system's own DB; mixing it for Athos breaks the architectural separation | `pg` Pool pattern |
| `pg-types` type registration for `quantidade` | Parameterized query binding handles domain coercion transparently; adding custom type parsers adds complexity for no benefit | Plain `Number(row.quantidade)` |
| `allocateNextContaPagarId` for PK | `produto_composto.idprodutocomposto` is a `serial` — the sequence is native; the resync pattern is only for tables that may lack a sequence | `INSERT ... RETURNING idprodutocomposto` |
| Separate NestJS module for produto_composto | The existing `AthosModule` is the right home; a new module adds overhead with no benefit | Add service + controller to `AthosModule` |
| Any new npm package | Zero new dependencies are needed | Reuse existing stack |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Reuse `pg` Pool singleton per service | Shared pool across all Athos services | Each service managing its own lazy pool is simpler; shared pool requires a third service/token, adding complexity |
| `RETURNING idprodutocomposto` on INSERT | Pre-allocate ID with sequence resync | Unnecessary for `serial` PK; RETURNING is atomic and simpler |
| Manual FK check for `idprodutodetail` | Rely on Postgres to enforce | Postgres has no FK on this column — it will silently accept invalid IDs without the check |

---

## Version Compatibility Notes

| Pair | Status |
|------|--------|
| `pg ^8.20.0` + `@nestjs/common ^11.1.19` | Compatible — pg is a standalone driver, no NestJS version dependency |
| `class-validator ^0.14.1` + `class-transformer ^0.5.1` | Compatible — these versions have been validated together in this project since v2.2 |
| `jest ^30.3.0` + `ts-jest ^29.4.9` | Compatible — ts-jest 29.x supports Jest 30.x (verified by existing test suite) |

---

## Sources

- `package.json` (root) — `pg ^8.20.0`, `@types/pg ^8.20.0` confirmed
- `apps/backend/package.json` — `class-validator ^0.14.1`, `class-transformer ^0.5.1`, `@nestjs/common ^11.1.19`, `@nestjs/swagger ^11.4.2`, `jest ^30.3.0`, `ts-jest ^29.4.9` confirmed
- `athos-produto.service.ts` — Pool pattern, parameterized queries, `validarFkExiste`, RETURNING, error code handling confirmed
- `athos.service.ts` — `allocateNextContaPagarId` pattern inspected; confirmed it is NOT applicable to `serial` PKs
- `athos.module.ts` — Module structure, registration pattern confirmed
- `athos-produto.controller.ts` — Controller pattern, auth guard, Swagger decorators confirmed
- `dto/create-produto.dto.ts` — DTO pattern with `@IsNumber()`, `@Type(() => Number)`, `@Min()` confirmed
- `.planning/PROJECT.md` — v2.5 scope, `produto_composto` DDL, GRANT blocker, reference DB role confirmed

---
*Stack research for: produto_composto CRUD API (v2.5)*
*Researched: 2026-06-29*
