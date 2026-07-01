# Feature Research — produto_composto Write API (v2.5)

**Domain:** Bill-of-materials / kit composition API — internal ERP integration (NestJS + Athos PostgreSQL)
**Researched:** 2026-06-29
**Confidence:** HIGH (codebase-derived) / MEDIUM (BOM conventions)

---

## Context

`produto_composto` is a join table between two `produto` rows:

```
produto_composto
  idprodutomaster  integer  FK -> produto.idproduto
  idprodutodetail  integer  FK -> produto.idproduto
  quantidade       quantidade  (custom PostgreSQL domain, same type as produto.quantidadecaixa)
```

The `produto` table has `usaprodutocomposto boolean` — a flag the Athos ERP reads to know
a product should be exploded into its components at point-of-sale. This flag must be kept
consistent with the composition table.

The existing `AthosProdutoService` + `ProdutoController` (v2.2/v2.4) defines the patterns
every new Athos write service must follow: raw pg Pool, FK pre-validation, field allowlist,
x-internal-api-key, structured Logger, ParseIntPipe on route params, static routes before
parametric routes.

---

## Feature Landscape

### Table Stakes (Must Have — Missing = API is unusable)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List components of a kit | Without this, callers cannot inspect current composition before writing | LOW | `SELECT pc.*, p.descricaoproduto FROM produto_composto pc JOIN produto p ON p.idproduto = pc.idprodutodetail WHERE pc.idprodutomaster = $1` — return all rows enriched with detail product name |
| Add a component | Core write operation; the whole milestone is about building composition | MEDIUM | POST body: `{ idprodutodetail, quantidade }`. Must validate both FKs exist in `produto` before INSERT. Must reject duplicate (idprodutomaster, idprodutodetail). |
| Update component quantity | Edit existing composition line | LOW | PATCH by (idprodutomaster, idprodutodetail). Must verify the row exists first (404 if not). |
| Remove a component | Physical DELETE — explicitly confirmed in PROJECT.md (distinct from produto soft-delete) | LOW | DELETE by (idprodutomaster, idprodutodetail). Must verify the row exists (404 if not). |
| FK integrity validation on add | Both idprodutomaster and idprodutodetail must exist in `produto` | MEDIUM | Reuse the `validarFkExiste` pattern from `AthosProdutoService`. Validate master first, then detail. Return 422 with clear message for each case. |
| Self-reference rejection | master == detail would create a circular single-row kit | LOW | Validate at service layer before DB call: if `idprodutomaster === idprodutodetail` → 422 `"Produto nao pode ser componente de si mesmo"`. |
| x-internal-api-key auth | All Athos write endpoints require it; the existing guard is module-level | LOW | Inherited automatically — no new code needed; just register the new controller in AthosModule. |
| Structured logging | All Athos services log operation + key IDs | LOW | Follow existing pattern: `this.logger.log("addComponente idprodutomaster=X idprodutodetail=Y quantidade=Z")` |

### Differentiators (Valuable for Internal API, Not Strictly Required)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `usaprodutocomposto` flag auto-management | Athos uses this flag at POS to explode kits; without it, adding components via API creates a "dead" composition the ERP ignores | MEDIUM | On ADD of first component: `UPDATE produto SET usaprodutocomposto = true WHERE idproduto = $1`. On REMOVE of last component: `UPDATE produto SET usaprodutocomposto = false WHERE idproduto = $1`. Both in the SAME transaction as the INSERT/DELETE on `produto_composto`. Requires write access to `produto` (already granted in v2.2). |
| Enriched component list response | Callers get `descricaoproduto`, `statusproduto`, `vendeproduto` from the detail product in a single call | LOW | `JOIN produto p ON p.idproduto = pc.idprodutodetail` — avoids N+1 lookups by the caller. Return: `[ { idprodutodetail, quantidade, descricaoproduto, statusproduto } ]` |
| Validation that master exists on all write operations | Return 404 before touching `produto_composto` if the master product does not exist in `produto` | LOW | Check master exists before add/patch/delete. Prevents orphan operations; gives a better error than a DB constraint violation. |
| Idempotent-friendly duplicate handling on ADD | If caller retries a POST and the row already exists, return 409 Conflict with existing row data instead of a cryptic DB error | LOW | Catch PostgreSQL unique constraint violation (code `23505`) → 409. But only if the table has a unique constraint on (idprodutomaster, idprodutodetail) — which it likely does. Otherwise: pre-check via SELECT. |

### Anti-Features (Out of Scope — Do Not Build)

| Anti-Feature | Why Requested | Why Problematic / Why Avoid | Alternative |
|--------------|---------------|------------------------------|-------------|
| Multi-level BOM (recursive kits) | A component that is itself a kit | Requires recursive CTE, cycle detection, graph traversal — order-of-magnitude more complex; not needed for v2.5 use case | Single-level only; document the limitation. A detail product CAN itself have its own composition in `produto_composto` (Athos decides how deep to explode), but this API does not traverse it. |
| BOM explosion / flattening endpoint | "Give me all leaf-level components recursively" | Complex, Athos already handles explosion at POS | Not our job; Athos POS handles kit explosion at sale time |
| Bulk/batch component import | CSV or array-of-components in one call | Complicates validation, error handling, rollback semantics; not needed for internal operator use | Add components one at a time; caller loops if needed |
| Pagination on component list | Consistent with produto search API | A kit's component count is always small (< 100 in any real product catalog); pagination adds complexity with zero benefit here | Return all components in one response; add pagination only if a real kit exceeds 100 items (has never happened in practice) |
| Frontend | Out of scope per PROJECT.md for v2.5 | — | API-only; Swagger docs serve as the UI |
| Cycle detection (A contains B, B contains A) | Theoretical correctness | Single-level API can't create cycles by design; cycle would require two separate API calls in the wrong order, which Athos's own constraints may or may not prevent | Document: not validated by this API; Athos ERP is responsible for runtime explosion logic |
| Validate that detail product is NOT a kit | "You can't put a kit inside a kit" | This rule depends on Athos business logic we cannot verify from the schema; over-constraining the API may break legitimate use cases | Let Athos enforce; our API only validates that both products EXIST in `produto` |
| Stock recalculation | Update component stock when kit is created/modified | Athos manages stock; this is the ERP's job, not the API's | Read-only for stock; Athos handles kit stock at transaction time |
| Soft-delete for composition rows | Match the produto soft-delete pattern | `produto_composto` is a pure join table; there is no "inactive" composition row concept in Athos — if a component is removed, the row is deleted | Physical DELETE is correct and confirmed in PROJECT.md |

---

## Endpoint Design

Following the existing `ProdutoController` at `athos/produtos`, the new controller
should use nested sub-resource routing:

```
GET    /athos/produtos/:idprodutomaster/composicao
POST   /athos/produtos/:idprodutomaster/composicao
PATCH  /athos/produtos/:idprodutomaster/composicao/:idprodutodetail
DELETE /athos/produtos/:idprodutomaster/composicao/:idprodutodetail
```

**Controller class:** `AthosProdutoCompostoController` in
`athos-produto-composto.controller.ts` — separate file, separate class, same module.
NestJS allows two controller classes with the same `@Controller('athos/produtos')` prefix
registered in the same module; routes are merged at startup.

**Service class:** `AthosProdutoCompostoService` in
`athos-produto-composto.service.ts` — replicates the Pool management pattern from
`AthosProdutoService` (same `ATHOS_PG_*` env vars, same idleTimeout/max settings).

**DTOs:**
- `AddComponenteDto`: `{ idprodutodetail: number (required, IsInt), quantidade: number (required, IsNumber, Min(0.001)) }`
- `UpdateComponenteQuantidadeDto`: `{ quantidade: number (required, IsNumber, Min(0.001)) }`

---

## Edge Cases — Required Handling

| Edge Case | Detection | Response |
|-----------|-----------|----------|
| `idprodutomaster` does not exist in `produto` | Pre-validate with SELECT before any write | 404 `"Produto master X nao encontrado"` |
| `idprodutodetail` does not exist in `produto` | Pre-validate with SELECT before INSERT | 422 `"Produto detail Y nao encontrado"` |
| Self-reference: `idprodutomaster == idprodutodetail` | Service-layer check before DB call | 422 `"Produto nao pode ser componente de si mesmo"` |
| Duplicate component (same pair already exists) | DB unique constraint (code 23505) or pre-SELECT | 409 `"Componente Y ja existe na composicao do produto X"` |
| PATCH/DELETE row not found | SELECT before UPDATE/DELETE | 404 `"Componente Y nao encontrado na composicao do produto X"` |
| `quantidade` domain type mismatch | PostgreSQL type cast error (code 22P02 or similar) | 422 `"Valor de quantidade invalido"` — wrap DB error |
| GRANT not yet applied (permission denied on INSERT/UPDATE/DELETE) | PostgreSQL error code 42501 | 500 `"Permissao negada — GRANT INSERT/UPDATE/DELETE em produto_composto nao concedido"` — actionable error message, not generic 500 |
| DB connection failure | Pool connect timeout | 500 with structured log — same pattern as existing services |
| Inactive product as master or detail | Not validated by API — existence check only | Document in Swagger: API validates existence, not status. Athos ERP handles inactive-product behavior at sale time. |

---

## Feature Dependencies

```
List components (GET)
    └──reads──> produto_composto table (SELECT GRANT — already present)

Add component (POST)
    ├──requires──> produto_composto table (INSERT GRANT — must be added)
    ├──requires──> produto table read (SELECT on produto — already present)
    └──enhances──> usaprodutocomposto flag (UPDATE on produto — already granted in v2.2)

Update quantity (PATCH)
    └──requires──> produto_composto table (UPDATE GRANT — must be added)

Remove component (DELETE)
    ├──requires──> produto_composto table (DELETE GRANT — must be added)
    └──enhances──> usaprodutocomposto flag (UPDATE on produto — already granted in v2.2)

All write operations
    └──require──> ATHOS_SISTEMA_USUARIO_ID (existing env var — for logging context)
```

**Dependency notes:**
- The GRANT for INSERT/UPDATE/DELETE on `produto_composto` is a hard blocker for writes.
  This must be granted BEFORE the API is tested. Read (SELECT) already works.
- `usaprodutocomposto` flag management depends on write access to `produto` (already
  granted since v2.2). This is a single UPDATE alongside the INSERT/DELETE transaction.
- The existing `AthosProdutoService.validarFkExiste()` pattern can be duplicated or
  extracted to a shared util — both approaches work; duplication is simpler for now.

---

## MVP Definition

### Launch With (v2.5)

- [x] `GET /athos/produtos/:idprodutomaster/composicao` — list components enriched with `descricaoproduto`
- [x] `POST /athos/produtos/:idprodutomaster/composicao` — add component with FK validation + self-reference check + duplicate rejection
- [x] `PATCH /athos/produtos/:idprodutomaster/composicao/:idprodutodetail` — update `quantidade`
- [x] `DELETE /athos/produtos/:idprodutomaster/composicao/:idprodutodetail` — physical remove
- [x] `usaprodutocomposto` flag auto-management (set on first add, clear on last remove) — treat as table stake because kit won't work in Athos without it
- [x] All edge cases from the table above handled with appropriate HTTP status codes
- [x] Swagger docs (`@ApiOperation`, `@ApiParam`, `@ApiBody`, `@ApiOkResponse`) matching existing controller style

### Defer (Post-v2.5)

- [ ] Cycle detection (A contains B, B contains A) — no practical case reported; add if needed
- [ ] Bulk add components — add when operator tooling demands batch import
- [ ] Validation that detail is not itself a kit master — add if Athos business rules require it

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|---------------|---------------------|----------|
| List components (GET) | HIGH | LOW | P1 |
| Add component (POST) with FK validation | HIGH | MEDIUM | P1 |
| Update quantity (PATCH) | HIGH | LOW | P1 |
| Remove component (DELETE) | HIGH | LOW | P1 |
| Self-reference rejection | HIGH | LOW | P1 (safety) |
| Duplicate rejection (409) | HIGH | LOW | P1 (data integrity) |
| `usaprodutocomposto` flag auto-management | HIGH | MEDIUM | P1 (Athos correctness) |
| Enriched list (with `descricaoproduto`) | MEDIUM | LOW | P1 (saves N+1 lookups) |
| Actionable GRANT error message | MEDIUM | LOW | P1 (ops support) |
| Cycle detection | LOW | HIGH | P3 |
| Bulk import | LOW | MEDIUM | P3 |

---

## Phase Structure Recommendation

**Single phase** is sufficient for this scope:

- The four CRUD operations share one service and one controller — splitting across phases creates no benefit and adds coordination overhead.
- `usaprodutocomposto` flag management is a small addition to the add/remove operations — not a separate phase.
- Total estimated LOC: ~300 lines (controller ~80, service ~180, DTOs ~40) — well within one phase capacity.

**Suggested phase name:** `39-api-produto-composto-crud`

**One phase, two PLAN files (waves):**
- Wave 1: GET (list) + DTOs + service scaffolding + DB connection
- Wave 2: POST (add) + PATCH (update qty) + DELETE (remove) + flag management + tests

---

## Sources

- Codebase: `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` (HIGH — direct read)
- Codebase: `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` (HIGH — direct read)
- Codebase: `apps/backend/src/modules/integrations/athos/athos.module.ts` (HIGH — direct read)
- Codebase: `.planning/DATABASE_SCHEMA.md` — `usaprodutocomposto boolean` on `produto` table (HIGH — direct read)
- Project context: `.planning/PROJECT.md` — v2.5 scope, table structure, GRANT status, DELETE semantics (HIGH — direct read)
- BOM/kit API conventions: standard ERP pattern (MEDIUM — domain knowledge, well-established)

---
*Feature research for: produto_composto write API (v2.5 — BomCusto SistemaOrcamento)*
*Researched: 2026-06-29*
