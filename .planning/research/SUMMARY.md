# Project Research Summary

**Project:** SistemaOrcamento BomCusto - Milestone v2.5 API de Produtos Compostos (Kits)
**Domain:** NestJS write API - bill-of-materials / kit composition on external Athos PostgreSQL ERP
**Researched:** 2026-06-29
**Confidence:** HIGH

---

## Executive Summary

Milestone v2.5 expands the Athos write surface to a second table (produto_composto) using exactly the same patterns established in v2.2/v2.4 for the produto table. All four researchers converge on a zero-new-dependencies verdict: pg 8.20, nestjs/common 11, class-validator 0.14, and class-transformer 0.5 already cover the full implementation. No npm install is required. The new service (AthosProdutoCompostoService) and controller register into the existing AthosModule -- no new NestJS module, no ORM, no separate Pool provider.

The recommended build is four endpoints on a nested sub-resource route: GET list enriched with descricaoproduto, POST add component, PATCH update quantidade, DELETE physical remove. Two implementation details are non-negotiable across all four research files: (1) PK insertion must use INSERT ... RETURNING idprodutocomposto -- never MAX+1 -- because idprodutocomposto is a serial; and (2) idprodutodetail has no database FK, so the service must pre-validate both IDs manually using the validarFkExiste pattern before any write. The usaprodutocomposto boolean on produto must be toggled transactionally on first-add and last-remove.

The single hard operational prerequisite -- GRANT INSERT, UPDATE, DELETE ON produto_composto -- is a blocking dependency before any write endpoint can pass verification. Three open questions require introspecting the reference DB (192.168.3.198): the exact base type and CHECK constraints of the quantidade DOMAIN, whether a UNIQUE (idprodutomaster, idprodutodetail) constraint exists, and whether any triggers/rules fire on produto_composto. These must be resolved as the first action in the scaffold phase.

---

## Key Findings

### Recommended Stack

All needed libraries are present in package.json. Zero new dependencies.

| Technology | Version | Role | Rationale |
|------------|---------|------|-----------|
| pg | ^8.20.0 | Raw Postgres driver (Pool + PoolClient) | Already proven against Athos; full parameterized query control; no ORM overhead |
| @nestjs/common | ^11.1.19 | Injectable, guards, HTTP exceptions | Existing module system; no migration friction |
| class-validator | ^0.14.1 | DTO validation decorators | Already wired via global ValidationPipe |
| class-transformer | ^0.5.1 | @Type coercions | Required for numeric route params and body fields |
| jest + ts-jest | ^30.3.0 / ^29.4.9 | Unit testing | Existing test suite uses this pair; confirmed compatible |

Critical note: The quantidade DOMAIN is transmitted by pg as its base type over the wire. No pg-types registration required -- pass a JavaScript number as a parameterized value and catch error 23514 if the domain CHECK is violated.

What NOT to add: ORM (TypeORM/Drizzle/Prisma) for Athos, allocateNextContaPagarId sequence pattern for this serial PK, a separate NestJS module, or any new npm package.

### Expected Features

**Must have -- table stakes (missing = API unusable):**
- GET /athos/produtos/:idprodutomaster/composicao -- list components enriched with descricaoproduto from produto via JOIN
- POST /athos/produtos/:idprodutomaster/composicao -- add component with dual FK pre-validation, self-reference rejection, and duplicate rejection
- PATCH /athos/produtos/:idprodutomaster/composicao/:idprodutodetail -- update quantidade with existence check (404 if not found)
- DELETE /athos/produtos/:idprodutomaster/composicao/:idprodutodetail -- physical delete with existence check (physical delete is correct -- distinct from produto soft-delete rule)
- usaprodutocomposto flag auto-management: set true on first-component POST, set false on last-component DELETE, within the same transaction as the write on produto_composto
- All edge-case HTTP mappings: 404 (master not found), 422 (detail not found / self-reference / domain violation), 409 (duplicate pair), 500 with actionable message for pg error 42501

**Should have -- differentiators:**
- Enriched GET response includes descricaoproduto and statusproduto from detail product (eliminates N+1 lookups by caller)
- Actionable GRANT error: 42501 mapped to HTTP 500 with message pointing to missing GRANT
- athos-fk.util.ts extraction of validarFkExiste (removes duplication between services; testable in isolation)

**Defer to post-v2.5:**
- Cycle detection -- no practical case reported; Athos POS handles explosion at sale time
- Bulk/batch component add -- add when operator tooling requires it
- Recursive BOM explosion endpoint -- Athos handles at sale time

### Architecture Approach

The new code slots entirely inside the existing AthosModule at apps/backend/src/modules/integrations/athos/. Two new files (service + controller), two new DTOs, and one extracted utility function. Modifications: athos.module.ts (add to providers/controllers arrays) and a minor refactor of athos-produto.service.ts to import validarFkExiste from the extracted util.

| File | Status |
|------|--------|
| athos-produto-composto.service.ts | NEW -- full CRUD: listarPorMaster, criarComponente, atualizarQuantidade, removerComponente |
| athos-produto-composto.controller.ts | NEW -- 4 endpoints; static routes declared before parametric |
| athos-produto-composto.service.test.ts | NEW -- Jest unit tests mirroring existing test pattern |
| dto/create-produto-composto.dto.ts | NEW -- idprodutodetail (int, required), quantidade (number gt 0, required) |
| dto/update-produto-composto.dto.ts | NEW -- quantidade (number gt 0, required) |
| athos-fk.util.ts | NEW -- validarFkExiste extracted from AthosProdutoService |
| athos.module.ts | MODIFIED -- add service to providers, controller to controllers |
| athos-produto.service.ts | MODIFIED (minor) -- replace private method with import from util |

Key patterns:
1. Lazy Pool singleton per service -- private _pool initialized on first getPool() call; same ATHOS_PG_* env vars; max 5 connections
2. Serial PK via RETURNING -- INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade) VALUES (param1, param2, param3) RETURNING idprodutocomposto -- column list NEVER includes idprodutocomposto
3. Dual manual FK pre-validation -- validarFkExiste for both idprodutomaster and idprodutodetail against produto -- because idprodutodetail has no DB FK
4. Physical DELETE -- DELETE FROM produto_composto WHERE idprodutomaster=param1 AND idprodutodetail=param2 after existence check -- the no-physical-delete rule is scoped to produto only
5. Transactional flag management -- UPDATE produto SET usaprodutocomposto = param1 WHERE idproduto = param2 inside the same BEGIN/COMMIT block as the INSERT or DELETE on produto_composto

### Critical Pitfalls

All four research files are unanimous on the same top risks:

1. **Missing write GRANT (pg error 42501) -- hard operational blocker.** GRANT SELECT is present; GRANT INSERT, UPDATE, DELETE is not. Every write fails at runtime with HTTP 500. Resolution: DBA runs GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto before Phase 40 verification begins. Also grant USAGE, SELECT ON SEQUENCE produto_composto_idprodutocomposto_seq. Service must catch 42501 explicitly and return an actionable 500.

2. **MAX+1 PK allocation -- race condition already proven in production.** The project was burned by this on conta_pagar. idprodutocomposto is serial -- use INSERT ... RETURNING. The allocateNextContaPagarId pattern is NOT applicable here. Code review must reject any INSERT that includes idprodutocomposto in the column list.

3. **idprodutodetail orphan insertion -- silent data corruption.** No DB FK enforces referential integrity for the detail side. Postgres accepts any integer. Pre-validate with validarFkExiste against produto before every INSERT. A composition row pointing to a nonexistent product silently corrupts kit reports in Athos.

4. **quantidade DOMAIN constraints unknown -- DTO/DB mismatch risk.** The exact base type (NUMERIC vs INTEGER) and CHECK clauses are not externally documented. Boundary values pass DTO validation but raise pg error 23514 at the DB if DTO decorators do not match. Resolution: introspect on 192.168.3.198 before writing the DTO. Map 23514 to 422 regardless.

5. **Unknown triggers/rules on produto_composto fire unexpectedly.** Athos has documented triggers on produto. A trigger requiring extra columns on produto_composto will roll back every INSERT with a cryptic error. Resolution: run trigger/rule introspection queries on 192.168.3.198 before any code is written.

---

## Implications for Roadmap

Based on combined research, the suggested build order is 3 phases starting at Phase 39. FEATURES.md suggested one phase with two waves; ARCHITECTURE.md suggested 3 separate phases. The roadmapper should choose based on the write GRANT timeline: if the GRANT can be confirmed immediately, collapse to 2 waves; if the timeline is uncertain, keep 3 phases so Phase 39 ships while waiting for DBA action.

### Phase 39: Scaffold + Read + Research Spikes

**Rationale:** Prove module slot and Pool wiring before any write grant is needed. Execute three mandatory research spikes first so implementation decisions are grounded in reference DB facts. Read endpoints need only the existing SELECT grant.

**Delivers:**
- Three research spike outputs: (a) quantidade DOMAIN type + CHECK constraints, (b) UNIQUE constraint presence on (idprodutomaster, idprodutodetail), (c) trigger/rule list on produto_composto
- athos-fk.util.ts extracted (zero behavior change to existing service; covered by existing tests)
- AthosProdutoCompostoService with listarPorMaster only (SELECT)
- AthosProdutoCompostoController with GET /athos/produtos/:idprodutomaster/composicao
- DTOs scaffolded with constraints derived from spike (a)
- Module wired; GET returns real rows from reference DB
- Error codes 23503, 23505, 23514, 42501 documented in service catch block stubs

**Must avoid:** Writing DTOs before quantidade domain is inspected. Writing INSERT before trigger introspection. Including idprodutocomposto in any INSERT column list.

**Research flag:** NEEDS RESEARCH-PHASE -- three spikes require live DB introspection on 192.168.3.198. Flag for /gsd-plan-phase --research-phase 39.

---

### Phase 40: Write CRUD (POST + PATCH + DELETE + usaprodutocomposto flag)

**Gate:** GRANT INSERT, UPDATE, DELETE ON produto_composto must be confirmed in Athos DB before verification begins. Document as hard prerequisite in the phase plan.

**Rationale:** Create, update, and delete share the same dual-FK validation setup and the transactional usaprodutocomposto flag management. This is the core deliverable of v2.5.

**Delivers:**
- criarComponente (POST): dual FK pre-validation, self-reference rejection, duplicate rejection, serial PK via RETURNING, usaprodutocomposto = true if first component (same transaction)
- atualizarQuantidade (PATCH): existence check to 404; UPDATE quantidade; structured log
- removerComponente (DELETE): existence check to 404; physical DELETE; usaprodutocomposto = false if last component (same transaction)
- Full error mapping: 42501 to 500 actionable, 23503 to 422 with constraint name, 23505 to 409, 23514 to 422

**Must avoid:** MAX+1 PK allocation. Skipping idprodutodetail pre-validation. usaprodutocomposto update outside the transaction. Soft-delete on produto_composto.

**Research flag:** Standard patterns -- Phase 39 spikes resolve all unknowns. Skip additional research phase.

---

### Phase 41: Tests

**Rationale:** Tests last -- write to match what was actually implemented in Phase 40, not a pre-implementation spec.

**Delivers:**
- athos-produto-composto.service.test.ts -- Jest unit tests for all four service methods
- Key cases: FK not found to 422; record not found to 404; serial PK absent from INSERT column list; RETURNING returns idprodutocomposto; validarFkExiste called for both master and detail; 42501 to 500 actionable; 23514 to 422; self-reference to 422; duplicate to 409
- validarFkExiste util tested in isolation (pure function, no DI needed)

**Research flag:** Standard patterns -- mirrors athos-produto.service.test.ts. No research phase needed.

---

### Phase Ordering Rationale

- Spikes first: quantidade domain type directly determines DTO decorators -- writing DTOs before introspection causes a DTO/DB mismatch only visible at runtime.
- Read before write: GET requires only the existing SELECT GRANT; proves Pool wiring before the write GRANT blocks progress.
- Write GRANT as explicit gate between Phase 39 and 40: makes the external DBA dependency visible in the roadmap.
- Tests last: avoids spec-vs-implementation drift.

### Research Flags

**Needs /gsd-plan-phase --research-phase:**
- Phase 39 -- three DB introspection spikes: quantidade DOMAIN definition, UNIQUE constraint on (master, detail), trigger/rule inventory on produto_composto. Cannot be answered from the codebase; require live access to 192.168.3.198.

**Standard patterns (skip research phase):**
- Phase 40 -- all decisions flow from Phase 39 spike outputs and existing codebase patterns.
- Phase 41 -- unit tests mirror athos-produto.service.test.ts. Well-documented Jest + pg mock pattern already in use.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions sourced directly from package.json; patterns confirmed from athos-produto.service.ts line-by-line |
| Features | HIGH | Endpoints derived from existing controller pattern; BOM conventions well-established for single-level kits |
| Architecture | HIGH | All components derived from first-party codebase reading; no external sources required |
| Pitfalls | HIGH | Sourced from prior production incidents (conta_pagar MAX+1 bug), DDL inspection (missing FK on idprodutodetail), and DDL grants (only SELECT confirmed) |

**Overall confidence: HIGH**

### Gaps to Address (Open Research Questions -- Phase 39 Spikes)

1. **quantidade DOMAIN definition** -- base type (NUMERIC vs INTEGER) and CHECK constraints. Resolution: introspect on 192.168.3.198. Safe default until confirmed: @IsNumber() + @Min(0.001).

2. **UNIQUE constraint on (idprodutomaster, idprodutodetail)** -- may or may not exist. Resolution: introspect on 192.168.3.198. Application-level duplicate check (pre-SELECT) is implemented unconditionally regardless of DB constraint.

3. **Triggers and rules on produto_composto** -- Resolution: query information_schema.triggers and pg_rules on 192.168.3.198; run BEGIN; INSERT valid test row; ROLLBACK to observe trigger effects.

Stakeholder confirmation recommended: Is an inactive (statusproduto = false) idprodutodetail a 422 error or a documented warning? Research recommends 422, but this is a business rule call.

---

## Sources

### Primary (HIGH confidence -- first-party codebase)

- apps/backend/src/modules/integrations/athos/athos-produto.service.ts -- Pool pattern, validarFkExiste, FK error mapping, RETURNING pattern, error code catch block
- apps/backend/src/modules/integrations/athos/athos.service.ts -- allocateNextContaPagarId (lines 48-82) -- confirmed NOT applicable to serial PKs; MAX+1 production bug documented here
- apps/backend/src/modules/integrations/athos/athos-produto.controller.ts -- controller structure, static-before-parametric route ordering, x-internal-api-key guard
- apps/backend/src/modules/integrations/athos/athos.module.ts -- registration pattern for providers/controllers
- package.json (root) -- pg ^8.20.0, @types/pg ^8.20.0
- apps/backend/package.json -- class-validator ^0.14.1, class-transformer ^0.5.1, @nestjs/common ^11.1.19, @nestjs/swagger ^11.4.2, jest ^30.3.0, ts-jest ^29.4.9
- .planning/PROJECT.md -- v2.5 scope, produto_composto DDL, GRANT status, physical DELETE confirmation, reference DB role, phase numbering from 39
- .planning/DATABASE_SCHEMA.md -- usaprodutocomposto boolean on produto table

### Secondary (MEDIUM confidence -- domain conventions)

- BOM/kit API conventions -- standard ERP single-level composition pattern; single-level API cannot create cycles by design
- PostgreSQL error code reference -- 42501 (insufficient_privilege), 23503 (foreign_key_violation), 23505 (unique_violation), 23514 (check_violation)

---

*Research completed: 2026-06-29*
*Ready for roadmap: yes*
