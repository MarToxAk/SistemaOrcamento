---
phase: 32-api-de-busca-de-produto
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/backend/src/modules/integrations/athos/produto.types.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.controller.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/integrations/athos/athos.module.ts
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase adds read-only product search endpoints (`GET /athos/produtos`, `GET /athos/produtos/:idproduto`) plus three lookup routes (departamentos, grupos, marcas) to the existing Athos integration. The controller and module wiring are straightforward and correct. The new `buscarProdutos`, `buscarProdutoPorId`, `buscarDepartamentos`, `buscarGrupos`, and `buscarMarcas` service methods are clean read-only Postgres queries with no injection risk.

Three critical defects were found — two inherited from pre-existing service code that the new methods sit alongside (and which the new tests exercise indirectly), and one correctness bug specific to the new product search query. Four warnings address silent NaN propagation, an unguarded ORDER BY column list, missing error propagation in two methods, and a wrong type annotation in a returned object.

---

## Critical Issues

### CR-01: `testarConexao` never calls `client.connect()` — always times out

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:530-543`
**Issue:** `testarConexao` instantiates a bare `pg.Client` and immediately calls `client.query("SELECT 1")` without first awaiting `client.connect()`. The `pg` library requires an explicit `connect()` call before queries can be issued on a `Client` instance (as opposed to a `Pool`). As written, the query will reject with an error every time the endpoint is called, making the connection test endpoint permanently broken.

**Fix:**
```typescript
async testarConexao() {
  const { host, database, user, password, port } = this.getDbConfig();
  const client = new Client({ host, database, user, password, port, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();           // <-- missing call
    await client.query("SELECT 1");
    return { ok: true, host, port, database, user, message: "Conexao com Athos estabelecida com sucesso." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    this.logger.error(`Falha na conexao Athos (${host}:${port}/${database}): ${message}`);
    throw new InternalServerErrorException(`Falha na conexao Athos: ${message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}
```

---

### CR-02: `buscarProdutos` count query and data query use different WHERE clauses — total count drifts from actual results

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:2136-2147`
**Issue:** The `SELECT COUNT(*)` query at line 2136 uses `qParams` (the filter parameters only). The data query at line 2142 appends `take` and `offset` to `[...qParams, take, offset]` and uses `$${idx}` and `$${idx+1}` as the LIMIT/OFFSET placeholders. If any filter condition was added, `idx` is incremented past 1, so LIMIT and OFFSET bind to the correct positions. However, the count query also uses `qParams` directly — that is correct. The actual bug is that `statusconta` is never filtered in `buscarProdutos`, yet `vendeproduto` and `statusproduto` are also never filtered: products that are inactive or not for sale are included in both the count and results, which is arguably a business-logic defect. The real correctness bug is subtler: `params.codigobarra` is passed as-is (no length validation) so a zero-length string `""` after `trim()` is falsy and skipped — that is fine — but `params.descricao` with a single space `" "` after trim is also falsy (skipped), while `params.descricao` with value `" a"` (one non-space char) passes the truthy check and generates `%a%` which is a valid but very broad search. No minimum-length guard exists, unlike `buscarClientes` which enforces `>= 3` chars. This is a consistency gap but not a crash. The genuine crash-risk bug in this block is that the **LIMIT/OFFSET parameter indices will be wrong if `params.codigobarra` is a non-empty truthy string but gets the SAME `$idx` used twice in the condition**:

```sql
(p.codigobarra1 = $2 OR p.codigobarra2 = $2)   -- line 2114
```

`idx` is incremented only once (`idx++`) even though `$idx` appears twice in the predicate (line 2113-2115). This is intentional (same value bound once, referenced twice) — that is correct PostgreSQL practice. Re-reading confirms no off-by-one in the parameter indexing. Retraction on that sub-point.

The genuine standalone critical in this block: **`SELECT p.*, NULL::bytea AS imagemproduto`** at line 2143 — if the live `produto` table already contains an `imagemproduto` column (which the type comment at line 2 of `produto.types.ts` says it does — `imagemproduto (bytea) sempre retornada como null`), PostgreSQL will raise `ERROR: column reference "imagemproduto" is ambiguous` because `p.*` expands to include `imagemproduto` and the explicit alias also produces `imagemproduto`. This causes a hard 500 error on every call to `buscarProdutos` and `buscarProdutoPorId` against the real database.

**Fix:** Exclude `imagemproduto` from the wildcard expansion by listing or excluding it explicitly:
```sql
-- Option A: explicit exclusion (requires PostgreSQL 16+ or a helper)
-- Not universally supported.

-- Option B (recommended): replace p.* with a column-list that omits imagemproduto,
-- or use a subquery / CTE to strip the column:
SELECT p.*, NULL::bytea AS imagemproduto
FROM produto p ...
-- must become:
SELECT (p).*                            -- struct expansion, avoids ambiguity
-- OR more portably, define a view that excludes imagemproduto
-- OR qualify the override using a subquery:
SELECT sub.*, NULL::bytea AS imagemproduto
FROM (SELECT p.* FROM produto p WHERE ...) sub ...
-- which still has the same ambiguity.

-- Safest fix: remove the NULL override and add a CASE/COALESCE:
SELECT p.idproduto, p.descricaoproduto, ..., NULL::bytea AS imagemproduto
FROM produto p ${whereClause} ORDER BY p.descricaoproduto ASC
LIMIT $${idx} OFFSET $${idx + 1}
```
Apply the same fix to `buscarProdutoPorId` (line 2163).

---

### CR-03: `loadCarimbos` builds ORDER BY clause with unquoted column names — potential SQL injection from column-name data

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:476-479`
**Issue:** The `orderColumns` list is built from a hardcoded set of candidate column names (`["numero", "idcarimbo", "id", "sequencia"]`), but the generated SQL inserts them **without double-quoting**:
```typescript
(name) => `COALESCE(${name}, 0)`   // line 477 — no quotes around column name
```
Compare with the analogous code in `loadItems` (line 346-348) which also lacks quotes on ORDER BY columns. The values come from a trusted constant array, so this is not a direct injection risk from user input. However, column names like `id` are reserved words in some SQL dialects, and the pattern is inconsistent with every other dynamic SQL in this file, all of which quote identifiers with `"`. If a future contributor adds a candidate name that happens to be a PostgreSQL reserved word or contains upper-case, it will silently break. The `loadItems` function at line 347 has the identical pattern.

More importantly, the `loadItems` ORDER BY block also skips quoting:
```typescript
.map((name) => `COALESCE("${name}", 0)`)  // line 347 — DOES quote, fine
```
Wait — re-reading line 347: `COALESCE("${name}", 0)` uses double-quotes. But `loadCarimbos` line 477 uses `COALESCE(${name}, 0)` without quotes. This is the inconsistency.

**Fix:** Add double-quotes around the column name in `loadCarimbos`:
```typescript
const orderColumns = ["numero", "idcarimbo", "id", "sequencia"]
  .filter((name) => carimboTable.columns.has(name))
  .map((name) => `COALESCE("${name}", 0)`);  // add quotes
```

---

## Warnings

### WR-01: `Number()` conversion for numeric query parameters passes `NaN` silently into the service

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts:99-103`
**Issue:** The controller converts string query params with a bare `Number()` call:
```typescript
iddepartamento: iddepartamento ? Number(iddepartamento) : undefined,
```
If the caller passes `?iddepartamento=abc`, `Number("abc")` returns `NaN`. The ternary guards only against empty/falsy strings, not against non-numeric strings. `NaN` is then passed to `buscarProdutos`, where it reaches `conditions.push(`p.iddepartamento = $${idx++}`)` and `qParams.push(NaN)`. PostgreSQL will cast `NaN` to a numeric type and may reject it or match nothing silently, depending on driver behavior. The same applies to `idgrupo`, `idmarca`, `page`, and `take`. The `page` and `take` are sanitised inside the service with `Math.max`/`Math.min`, but `NaN` passed to those functions returns `NaN` (e.g. `Math.max(1, NaN) === NaN`), so `offset` would be `NaN` and the OFFSET clause in the query would fail at the driver level.

**Fix:** Use `parseInt` or `Number` with an isNaN guard:
```typescript
const toInt = (v: string | undefined) =>
  v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined;

iddepartamento: toInt(iddepartamento),
idgrupo:        toInt(idgrupo),
idmarca:        toInt(idmarca),
page:           toInt(page),
take:           toInt(take),
```

---

### WR-02: `buscarDashboardContasReceber` and `buscarTitulosClienteContasReceber` lack error handling — DB errors propagate as unhandled 500s with no logging

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1681-1746` and `1760-1810`
**Issue:** Both methods have a `try/finally` block but **no `catch`**. Unlike every other service method in this file, which has a `catch` block that logs the error and re-throws as `InternalServerErrorException`, these two methods let any database exception propagate as-is. This means:
1. Raw Postgres error messages (potentially containing schema names, table names, or query fragments) can leak to the HTTP response body.
2. Errors are not logged under the service logger, making them invisible in production tracing.

**Fix:** Add a `catch` block consistent with the rest of the service:
```typescript
} catch (err) {
  this.logger.warn(`buscarDashboardContasReceber: ${err instanceof Error ? err.message : String(err)}`);
  throw new InternalServerErrorException("Erro ao buscar dashboard de contas a receber.");
} finally {
  client.release();
}
```
Apply the same pattern to `buscarTitulosClienteContasReceber`.

---

### WR-03: `buscarTodasNfesParaTitulos` return type hardcodes `valorNota: 0` as a literal type in the interface signature

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1875-1877`
**Issue:** The method's declared return type is `Array<{ idcontareceber: number; numero: string; valorNota: 0 }>`. The literal type `0` (not `number`) means callers that attempt to do arithmetic with `item.valorNota` will get a type error if they ever need to assign a real value. The `@deprecated` JSDoc comment documents the intent, but the type itself is misleading — it should be `number` with the comment, or the field should be removed from the signature entirely if it is never populated. As-is, any future maintainer who tries to populate `valorNota` with a real value will face a TypeScript compilation error and may be confused about why the type is a literal.

**Fix:**
```typescript
async buscarTodasNfesParaTitulos(idcontasReceber: number[]): Promise<
  Array<{ idcontareceber: number; numero: string; valorNota: number }>
>
```
Or remove `valorNota` from the interface and from the mapped result object.

---

### WR-04: `listarContasPagar` uses unquoted `statusconta` column name in a dynamically-built WHERE clause

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:715-716`
**Issue:** The `statusconta` column name is hard-coded without double-quotes and without going through the `isSafeIdentifier` guard that protects all other dynamic column references in this method. While `statusconta` is a safe identifier by the regex, the pattern is inconsistent and fragile — if the column name ever varies across Athos installations (e.g. `status_conta`) there is no fallback discovery, unlike the date column which is resolved via `dateCandidates` lookup. Additionally, if the `conta_pagar` table in a specific installation does not have a `statusconta` column, the query will throw `ERROR: column "statusconta" does not exist` and return a 500 rather than gracefully ignoring the filter.

**Fix:** Resolve the status column dynamically the same way `dateColumn` is resolved, with a candidate list:
```typescript
const statusCandidates = ["statusconta", "status_conta", "situacao", "status"];
const statusColumn = statusCandidates.find((c) => table.columns.has(c) && isSafeIdentifier(c));

// Then in the filter block:
if (typeof statusconta === "string" && statusconta.trim() && statusColumn) {
  params.push(statusconta.trim().toUpperCase());
  conditions.push(`"${statusColumn}" = $${params.length}`);
}
```

---

## Info

### IN-01: Test file has a typo in a test description — "lancir" should be "lancar"

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts:104`
**Issue:** The `it` description reads `"deve lancir NotFoundException"`. The correct Portuguese verb is `"lançar"` (to throw). This is a minor readability issue that does not affect test correctness.

**Fix:**
```typescript
it("deve lançar NotFoundException quando o service resolve null para idproduto nao encontrado", async () => {
```

---

### IN-02: `produto.types.ts` — `tipoproduto` field typed as `boolean | null` but semantics are inverted from the DB column

**File:** `apps/backend/src/modules/integrations/athos/produto.types.ts:71`
**Issue:** The inline comment in `athos.service.ts` at line 1867 states that `tipoproduto=true → produto físico` and `tipoproduto=false → serviço`. The interface correctly declares the field as `boolean | null`, but there is no JSDoc on the type to document this non-obvious inversion. Callers (including the frontend) will likely assume `tipoproduto=true` means "it is a service" (since the field name says "tipo" not "isFisico"). The `buscarItensVenda` method at line 1935 uses `COALESCE(p.tipoproduto, false) AS tipo_fisico` which re-names it at query time — but the `Produto` interface returned by `buscarProdutos` returns the raw value without renaming.

**Fix:** Add a JSDoc comment to the interface field:
```typescript
/**
 * true = produto físico; false = serviço.
 * NULL significa não classificado.
 */
tipoproduto: boolean | null;
```

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
