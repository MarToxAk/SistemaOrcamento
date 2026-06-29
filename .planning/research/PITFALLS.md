# Pitfalls Research

**Domain:** Athos ERP — produto_composto write API (NestJS + pg driver)
**Researched:** 2026-06-29
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Missing write GRANT causes runtime permission failure on every write

**What goes wrong:**
The PostgreSQL user configured in `ATHOS_PG_USER` only holds `SELECT` on `produto_composto` (the DDL ran `GRANT SELECT ... TO usuario_leitura`). Any INSERT, UPDATE, or DELETE will immediately raise `ERROR: permission denied for table produto_composto` (pg error code `42501`). NestJS will catch this as an unhandled DB error and return HTTP 500. The API appears to work (module loads, endpoint registers) until the first actual write attempt — making the failure invisible until exercised in staging or production.

**Why it happens:**
The milestone deliberately scoped this as an unresolved dependency: "a GRANT de escrita (INSERT/UPDATE/DELETE) em `produto_composto` ainda precisa ser concedido no banco Athos — o DDL so tem `GRANT SELECT`." The write exception that was previously opened for `produto` in v2.2 covered only that table. `produto_composto` is a new surface — the GRANT infrastructure was not pre-built.

**How to avoid:**
Before any write path is exercised (even in a local/staging environment), run the following on the Athos DB:

```sql
GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto TO <athos_pg_user>;
```

Where `<athos_pg_user>` is the value of `ATHOS_PG_USER` in the deployment env. Verify with `\dp produto_composto` in psql. Treat this as a hard prerequisite — block Phase 39 implementation from merging until the GRANT is confirmed. Add a startup health-check or smoke test that attempts a dry-run write in a transaction that is immediately rolled back, surfacing the permission error in the deployment log rather than in the first production API call.

**Warning signs:**
- pg error `code: "42501"` with message `permission denied for table produto_composto`
- Every write endpoint returns HTTP 500 regardless of payload
- SELECT endpoints continue to work (SELECT grant is present)

**Phase to address:**
Phase 39 (primeira fase de escrita) — the GRANT must be confirmed as a setup prerequisite before implementation begins. Document it as a blocked dependency in the phase plan and add an integration smoke test to CI.

---

### Pitfall 2: Custom DOMAIN type `quantidade` raises check constraint violations on INSERT/UPDATE

**What goes wrong:**
`quantidade` is a PostgreSQL DOMAIN — a named type alias wrapping a base type (likely `NUMERIC` or `INTEGER`) with one or more `CHECK` constraints. When the API passes a value that violates the domain's constraint (e.g., zero or negative quantity if the domain enforces `VALUE > 0`, or a fractional value if the domain restricts to integers), PostgreSQL raises error code `23514` (`check_violation`). The error message references the domain name (`domain "quantidade"`), not the column name, which is harder to map to a user-friendly response. If uncaught, it produces HTTP 500.

**Why it happens:**
The pg driver transmits DOMAIN column values like their base type — it does not automatically introspect the domain's constraints. NestJS/class-validator DTO validation can only enforce rules that developers explicitly declare. Without first inspecting the domain definition, the DTO validation and the DB constraint diverge. The exact constraints of this domain are not documented externally; they must be discovered from `pg_catalog`.

**How to avoid:**
1. Before writing the DTO, introspect the domain definition on the reference DB (192.168.3.198):
   ```sql
   SELECT pg_catalog.pg_get_constraintdef(c.oid) AS constraint_def
   FROM pg_constraint c
   WHERE c.contype = 'c'
     AND c.contypid = (SELECT oid FROM pg_type WHERE typname = 'quantidade');
   ```
   Also check the base type:
   ```sql
   SELECT typname, typbasetype::regtype FROM pg_type WHERE typname = 'quantidade';
   ```
2. Mirror the discovered constraints in the DTO with matching `class-validator` decorators (e.g., `@IsNumber()`, `@Min(0.001)` or `@IsInt()` + `@Min(1)` depending on domain rules). This catches violations at the API boundary before they reach the DB.
3. Map error code `23514` explicitly in the service catch block to `UnprocessableEntityException` (422) with a clear message: `"Quantidade invalida: valor nao satisfaz a restricao do dominio 'quantidade'."` — mirroring the pattern used for FK errors in `athos-produto.service.ts`.

**Warning signs:**
- pg error `code: "23514"` with message containing `domain "quantidade"`
- Writes with quantity values near boundary values (0, negative, fractional) fail at DB but pass DTO validation

**Phase to address:**
Phase 39 — introspect domain definition before writing the DTO; add `@Min`/`@IsInt` decorators that match discovered constraints. Phase verification — integration tests must include boundary values (0, negative, fractional if relevant) to prove the domain constraint is mirrored correctly.

---

### Pitfall 3: Manual PK allocation via MAX+1 causes duplicate-key errors

**What goes wrong:**
`idprodutocomposto` is a `serial` PK managed by a PostgreSQL sequence. If the API allocates IDs by computing `MAX(idprodutocomposto) + 1`, it will race with concurrent inserts from the Athos desktop application (which calls `nextval` on the sequence directly). Two concurrent requests — or one API request racing with an Athos desktop insert — will read the same MAX, both compute the same next ID, and one will fail with `ERROR: duplicate key value violates unique constraint "produto_composto_pkey"` (code `23505`). **The project already hit this exact bug on `conta_pagar`**, which motivated the `allocateNextContaPagarId` function in `athos.service.ts` (lines 48–82).

**Why it happens:**
Developers copy the insert pattern without adopting the sequence-aware fix. MAX+1 appears correct in isolation but is fundamentally unsafe when the sequence and the table's data can diverge — especially after direct Athos desktop activity, imports, or any operation that advances the sequence without updating visible rows.

**How to avoid:**
Use one of two approaches, in order of preference:

- **Preferred — omit the PK from INSERT entirely**: Do not include `idprodutocomposto` in the column list. The sequence's default populates it automatically via `nextval`. Use `RETURNING idprodutocomposto` to retrieve the allocated ID. This is simpler and correct by construction:
  ```sql
  INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
  VALUES ($1, $2, $3)
  RETURNING idprodutocomposto;
  ```

- **Fallback — if the PK must be set manually**: Use the full `allocateNextContaPagarId` pattern from `athos.service.ts`: call `pg_get_serial_sequence`, acquire `LOCK TABLE produto_composto IN EXCLUSIVE MODE`, run `setval` to sync with `MAX`, then `nextval` to get the next ID — all within a single transaction.

Do not copy the MAX+1 fallback path without the table lock. The lock path without `pg_get_serial_sequence` is a last resort only when no sequence exists.

**Warning signs:**
- pg error `code: "23505"` with constraint name `produto_composto_pkey`
- Errors appear sporadically under concurrent Athos desktop usage, not in single-request tests
- The error is absent in isolated test environments (no concurrent writes from Athos desktop)

**Phase to address:**
Phase 39 — mandate "omit PK from INSERT, use RETURNING" as the implementation pattern in the task description. Code review must reject any INSERT that includes `idprodutocomposto` in the column list without the full sequence-resync pattern.

---

### Pitfall 4: `idprodutodetail` has no FK — orphan rows accumulate silently

**What goes wrong:**
Because `idprodutodetail` has no declared FK in the `produto_composto` DDL, PostgreSQL accepts any integer value without validation. The API can insert composition rows pointing to nonexistent product IDs, IDs of soft-deleted products, or arbitrary integers. There is no DB-level safeguard — the orphan rows are inserted silently and accumulate over time. Athos reports that depend on `produto_composto` for kit assembly, BOM, or pricing will then process incomplete or nonsensical data without raising an error.

**Why it happens:**
The FK was omitted in the original Athos schema (possibly intentional — some ERPs allow composition of external/catalog items). Developers assume that because the master FK exists and is enforced, the detail side is also validated. It is not. The absence of a DB constraint makes application-level validation more important, not less.

**How to avoid:**
1. Before any INSERT or UPDATE that sets `idprodutodetail`, perform an explicit existence check using the same `validarFkExiste` pattern from `athos-produto.service.ts`:
   ```typescript
   await this.validarFkExiste(client, 'produto', 'idproduto', dto.idprodutodetail, 'ProdutoDetail');
   ```
   Throw `UnprocessableEntityException` (422) if the product does not exist.
2. Decide and document whether `idprodutodetail` referencing a soft-deleted product (inactive `statusproduto`) is an error or a warning. Recommendation: treat it as a 422 error — composing a kit with an inactive component is likely a data entry mistake.
3. Validate both `idprodutomaster` and `idprodutodetail` in the same pre-insert block, before acquiring any locks or beginning the transaction, to give fast feedback.

**Warning signs:**
- Composition rows where `idprodutodetail` does not appear in `produto` — detectable via:
  ```sql
  SELECT * FROM produto_composto pc
  WHERE NOT EXISTS (SELECT 1 FROM produto p WHERE p.idproduto = pc.idprodutodetail);
  ```
- No error at insert time despite invalid IDs (the DB accepted the row)

**Phase to address:**
Phase 39 — mandatory pre-insert validation for both IDs, with distinct error messages for master vs. detail. Include the orphan-detection query as part of the phase verification UAT.

---

## Moderate Pitfalls

### Pitfall 5: ON DELETE RESTRICT on `idprodutomaster` → uncaught 500 when a kit-master product is deleted

**What goes wrong:**
The FK `idprodutomaster → produto(idproduto) ON DELETE RESTRICT` blocks any physical DELETE of a `produto` row that is referenced as a master in `produto_composto`. This FK is enforced by PostgreSQL. If such a delete is attempted (from the Athos desktop, a cleanup utility, or a bug in the API), the DB raises error code `23503` (`foreign_key_violation`). If the `produto_composto` service does not map this error code explicitly, it propagates as HTTP 500.

**Why it happens:**
The `produto` API uses soft-delete (never issues physical DELETE), so the RESTRICT constraint is not normally triggered by the system. But Athos desktop operators can attempt physical deletes, and future maintenance scripts may attempt cleanup. The error is rare enough that it is easy to forget to handle in the `produto_composto` error catch block.

**How to avoid:**
1. Map `code: "23503"` in the `produto_composto` service catch block to `UnprocessableEntityException` (422) with a message identifying whether the FK is on master or detail side. Inspect `(err as any).constraint` to distinguish:
   - Constraint on `idprodutomaster` → "Produto master ainda possui composicoes em produto_composto. Remova as composicoes antes de excluir."
   - Constraint on other FKs → generic FK violation message.
2. Any future utility that deletes `produto` rows must first check `SELECT 1 FROM produto_composto WHERE idprodutomaster = $1 LIMIT 1` and return a clear error listing the blocking compositions.
3. Document that the `produto` soft-delete API is safe (it never issues DELETE), but direct DB manipulation is not.

**Warning signs:**
- pg error `code: "23503"` with constraint name referencing `produto_composto`
- Athos desktop operators report opaque errors when trying to delete a product that is a kit master

**Phase to address:**
Phase 39 — include `23503` in the FK error mapping block of `athos-produto-composto.service.ts`. Mirror the pattern from `athos-produto.service.ts` lines 241–256.

---

### Pitfall 6: Duplicate composition rows and self-reference (master == detail) not blocked by DB

**What goes wrong:**
If no UNIQUE constraint exists on `(idprodutomaster, idprodutodetail)` in the Athos schema, the API can insert the same component multiple times for the same master. This inflates kit quantities in every Athos report that uses `produto_composto`. Additionally, if the caller sends the same ID for both `idprodutomaster` and `idprodutodetail`, the composition is a circular self-reference (product composed of itself) — semantically invalid and a source of infinite recursion in any BOM traversal.

**Why it happens:**
The DB may not declare a UNIQUE constraint on the pair. Application code that does not check for existing rows before INSERT silently creates duplicates. Self-reference is an easy mistake when the caller passes the master's own ID as the detail.

**How to avoid:**
1. Validate `idprodutomaster !== idprodutodetail` in the service before any DB operation. Return 422 with "Um produto nao pode ser componente de si mesmo."
2. Before INSERT, check whether the `(idprodutomaster, idprodutodetail)` pair already exists:
   ```sql
   SELECT idprodutocomposto FROM produto_composto
   WHERE idprodutomaster = $1 AND idprodutodetail = $2
   LIMIT 1;
   ```
   If it exists, return 409 Conflict or update the `quantidade` (document the chosen behavior clearly).
3. Verify whether a UNIQUE constraint already exists on the pair in the reference DB before deciding whether to rely on it or add application-level duplication prevention.

**Warning signs:**
- Multiple rows in `produto_composto` with identical `(idprodutomaster, idprodutodetail)` pairs
- Kit total quantity doubles on each add-same-component call
- Self-reference row: `idprodutomaster = idprodutodetail`

**Phase to address:**
Phase 39 — business-logic validation block before INSERT. Do not rely on the DB constraint because it may not exist; add the application check unconditionally.

---

### Pitfall 7: Unknown Athos triggers or rules on `produto_composto` fire unexpectedly

**What goes wrong:**
Athos applies triggers and rules to several tables (confirmed: `tg_alterarproduto`, `rules atualizardatahora*` on `produto`). Similar mechanisms may exist on `produto_composto` — for example, triggers that auto-stamp a modification timestamp, log changes to an audit table, enforce that `quantidade > 0` at the trigger level, or call stored procedures that fail when certain fields are missing. If the API's INSERT or UPDATE payload omits a field that a trigger requires, the trigger may raise an exception and roll back the entire transaction with a cryptic server-generated error.

**Why it happens:**
Athos is a closed ERP. Its internal trigger infrastructure is not externally documented and must be discovered empirically. Developers building against its DB assume the schema is "just a table" without hidden server-side logic.

**How to avoid:**
Before writing any Phase 39 code, introspect `produto_composto` on the reference DB (192.168.3.198):

```sql
-- Triggers
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'produto_composto'
ORDER BY trigger_name;

-- Rules
SELECT rulename, ev_type, definition
FROM pg_rules
WHERE tablename = 'produto_composto';
```

Test a minimal INSERT and DELETE against the reference DB in a transaction (then ROLLBACK) to see what the triggers do:
```sql
BEGIN;
INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
VALUES (<valid_master_id>, <valid_detail_id>, 1);
ROLLBACK;
```

If a trigger requires additional columns (e.g., `idusuarioalteracao`, a timestamp, or a status flag), include them in the INSERT allowlist. Document the trigger effects in the phase plan.

**Warning signs:**
- INSERT/DELETE fails with messages originating from a function (e.g., `ERROR: new row violates trigger constraint` or messages from a PL/pgSQL function body)
- Error message does not match any explicit constraint name in the DDL
- The error occurs only on the Athos write DB but not on isolated test DBs

**Phase to address:**
Phase 39 — trigger/rule introspection must be completed before writing the service implementation. Treat undocumented triggers as a Phase 39 research spike item, not something to discover in production.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| MAX+1 PK allocation without sequence sync | Quick to write | Duplicate-key errors under concurrent Athos desktop usage — already hit in conta_pagar | Never — use omit-PK-from-INSERT or the full `allocateNextContaPagarId` pattern |
| Skip `idprodutodetail` existence check because "no FK in schema" | Less code | Silent orphan rows; Athos kit reports produce wrong data with no error | Never — absence of DB FK makes app validation mandatory |
| Skip trigger introspection, assume no triggers on `produto_composto` | Faster start | First production write fails if a trigger fires; cryptic 500 for operators | Never before first real write to Athos production DB |
| Catch all pg errors as 500 without checking error codes | Simple catch block | GRANT errors (42501), FK violations (23503), domain check failures (23514), duplicates (23505) all surface as opaque 500s | Never in a write path — at minimum map 42501, 23503, 23505, 23514 |
| Reuse single-pool pattern across all Athos services | Simple | Pool exhaustion under concurrent load for deeply nested composition queries | Acceptable at current scale (internal tool); revisit if concurrent usage grows |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Athos GRANT management | Assuming the write user already has all needed GRANTs because `produto` writes work | Each new write-enabled table needs its own explicit `GRANT INSERT, UPDATE, DELETE`. Verify with `\dp produto_composto` before deploying |
| Reference DB vs write DB | Accidentally pointing integration tests at `192.168.3.198` (read-only reference) | All writes go to `ATHOS_PG_*` env-configured DB. Reference DB is inspect-only. Never test writes against it |
| Physical DELETE on composition rows | Applying the produto soft-delete rule to `produto_composto` rows | "Remover componente" = physical DELETE from `produto_composto`. Soft-delete applies only to `produto` rows |
| DOMAIN type `quantidade` in DTO | Treating it as a plain `number` without checking constraints | Introspect `pg_type`/`pg_constraint` on the domain; mirror constraints in DTO decorators |
| Error response for `idprodutodetail` validation | Returning 404 "product not found" because it queries by the detail ID | Return 422 `UnprocessableEntityException` — the ID is syntactically valid but semantically unresolvable, consistent with existing FK validation pattern |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `LOCK TABLE IN EXCLUSIVE MODE` on every PK allocation | Acceptable for `conta_pagar` (low concurrency); serializes all writes | Omit PK from INSERT entirely — let the sequence handle it without a table lock | If write volume increases beyond a few inserts/minute |
| Pre-insert validation queries without indexes | Each validation does a full table scan on `produto` | `produto.idproduto` is the PK — indexed by default. No additional action needed | Not a concern at current scale |
| Loading all compositions for a master without LIMIT | Large kit could return thousands of rows if data is messy | Add a reasonable `LIMIT` (e.g., 500) with pagination for list endpoints | At ~100+ components per master product |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Interpolating `idprodutomaster` or `idprodutodetail` directly into SQL strings | SQL injection | Always use parameterized queries (`$1`, `$2`); never string-concatenate IDs into SQL. Same rule as existing services |
| Accepting arbitrary column names from the request body for dynamic UPDATE | Identifier injection | Use an explicit allowlist (same `ALLOWED_UPDATE_FIELDS` pattern from `athos-produto.service.ts`) — only `quantidade` is updatable on a composition row |
| Exposing the full Athos `produto_composto` row in the response | Internal Athos internals leak | Return only the API-defined fields: `idprodutocomposto`, `idprodutomaster`, `idprodutodetail`, `quantidade` |

---

## "Looks Done But Isn't" Checklist

- [ ] **write GRANT**: GRANT SELECT works (reads return data) but INSERT/UPDATE/DELETE fail at runtime — verify `\dp produto_composto` shows the write user in the ACL before closing Phase 39
- [ ] **DOMAIN constraint mirrored**: DTO `@Min` / `@IsInt` decorators match the actual domain definition — verify by sending boundary values (0, negative, fractional) and confirming 422 not 500
- [ ] **PK omitted from INSERT**: The INSERT column list does not include `idprodutocomposto` — code review must reject any manual PK assignment without the full sequence-resync pattern
- [ ] **idprodutodetail validated**: A composition insert with a nonexistent `idprodutodetail` returns 422, not a silent success — verified by integration test
- [ ] **Self-reference blocked**: A composition where `idprodutomaster == idprodutodetail` returns 422 — verified by integration test
- [ ] **Triggers discovered**: Trigger/rule introspection has been run on reference DB and results documented in the phase plan before any code is written
- [ ] **FK error mapping complete**: `23503` (FK violation), `23505` (duplicate key), `23514` (domain check), `42501` (permission denied) are all explicitly caught and mapped to 4xx responses

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing write GRANT discovered in production | LOW | Run `GRANT INSERT, UPDATE, DELETE ON produto_composto TO <user>` on the Athos DB — no code change needed; takes effect immediately |
| Orphan rows from missing `idprodutodetail` validation | MEDIUM | Identify orphans with `SELECT pc.* FROM produto_composto pc LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail WHERE p.idproduto IS NULL`; manually delete or reassign after business review; add missing validation to service |
| Duplicate composition rows | MEDIUM | Deduplicate by keeping the row with highest `quantidade` or latest `idprodutocomposto` per `(idprodutomaster, idprodutodetail)` pair; requires Athos DB access and business review |
| Duplicate-key from MAX+1 (serial conflict) | LOW | The failed insert simply errors — no data corruption. Fix: switch to omit-PK pattern; no data migration needed |
| Trigger constraint discovered mid-phase | MEDIUM | Pause implementation; introspect trigger body; add required fields to INSERT allowlist; retest on reference DB |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing write GRANT (P1) | Phase 39 setup prerequisite | `\dp produto_composto` shows write user in ACL before merge; smoke test at startup |
| DOMAIN type constraints (P2) | Phase 39 DTO design | Integration tests with boundary quantity values confirm 422 not 500 |
| Serial PK / sequence drift (P3) | Phase 39 INSERT implementation | Code review: `idprodutocomposto` absent from INSERT column list; test concurrent inserts |
| `idprodutodetail` orphan validation (P4) | Phase 39 service pre-insert block | Integration test: nonexistent `idprodutodetail` → 422; orphan-detection query returns 0 rows |
| ON DELETE RESTRICT error mapping (P5) | Phase 39 catch block | Unit test: FK violation on master delete → 422 not 500 |
| Duplicate rows and self-reference (P6) | Phase 39 business-logic validation | Integration test: same pair twice → 409; self-reference → 422 |
| Unknown triggers/rules (P7) | Phase 39 research spike (before coding) | Trigger introspection documented in phase plan; test INSERT ROLLBACK on reference DB |

---

## Sources

- Project context: `.planning/PROJECT.md` — milestone v2.5 constraints, write-GRANT dependency, DOMAIN type annotation, FK DDL, soft-delete rule for `produto`
- Prior duplicate-key fix: `apps/backend/src/modules/integrations/athos/athos.service.ts` lines 48–82 (`allocateNextContaPagarId` — the conta_pagar MAX+1 bug and its sequence-based fix)
- FK validation and error mapping pattern: `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` (`validarFkExiste`, `23503` catch block with constraint-name discrimination)
- PostgreSQL error code reference: standard pg codes — `42501` (insufficient_privilege), `23503` (foreign_key_violation), `23505` (unique_violation), `23514` (check_violation)
- PostgreSQL DOMAIN introspection: `pg_type`, `pg_constraint`, `pg_catalog.pg_get_constraintdef`

---
*Pitfalls research for: produto_composto write API — Athos ERP integration (v2.5)*
*Researched: 2026-06-29*
