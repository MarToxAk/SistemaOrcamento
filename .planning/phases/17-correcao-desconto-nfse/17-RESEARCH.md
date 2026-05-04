# Phase 17: Correcao do Calculo de Desconto no Modal NFS-e - Research

**Researched:** 2026-05-04
**Domain:** Frontend React/TypeScript — NFS-e discount modal, path bug, string/number coercion
**Confidence:** HIGH

---

## Summary

Phase 17 is a surgical bug-fix phase. The root cause is fully identified: four locations in
`apps/frontend/src/app/orcamento/[id]/page.tsx` read `quote?.totais?.valor` but the
`QuoteDetail` TypeScript type places `totais` inside `body`: `quote.body.totais.valor`. Because
`quote.totais` is always `undefined`, the numeric base for every discount calculation is `0`,
making all three discount input fields (%, R$, valor total) silently non-functional.

A second, independent bug was found during research: `handleEmitirNfse()` assembles the POST
body as `Record<string, string>` and sends `descontoPorcentagem` and `descontoValor` as plain
string values. The backend `EmitirNfseInput` is declared as an `interface` (not a class with
`@Transform` decorators), so NestJS's `ValidationPipe({ transform: true })` cannot coerce the
string values to numbers at the `@Body()` injection point. The backend discount logic then does
arithmetic on strings, producing `NaN`, so `descontoIncondicionado` resolves to `0` even when
the path bug is fixed and the user provides valid inputs. Both bugs must be fixed together for
NFSC-05 to pass.

**Primary recommendation:** Fix the four path reads (NFSC-01 through NFSC-04) AND the
string-to-number coercion at the submit site (NFSC-05). No backend or proxy changes are
required.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reading quote total from state | Frontend Client | — | `quote` state loaded via fetch; path must match `QuoteDetail` type |
| Discount calculation logic | Frontend Client | — | `syncDesconto()` runs entirely in browser |
| Populating discount fields on switch toggle | Frontend Client | — | `onChange` of `nfseDescontoSwitch` |
| Enforcing max on valor-total input | Frontend Client | — | `max` attribute derived from base |
| Displaying "Valor base" label | Frontend Client | — | Conditional render on `quote?.totais?.valor != null` |
| Sending discount to backend | Frontend Client (POST body) | Frontend API Proxy | Proxy is transparent; coercion must happen before JSON serialization |
| Applying discount, building SOAP XML | Backend (NfseService) | — | `descontoIncondicionado` computed from `desconoValor` / `descontoPorcentagem` |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFSC-01 | "Valor total" field pre-filled with real quote total when discount section opened | Fix `nfseDescontoSwitch.onChange` (line 833): `quote?.totais?.valor` → `quote?.body?.totais?.valor` |
| NFSC-02 | Typing % updates R$ and total correctly based on quote total | Fix `syncDesconto()` (line 304): `quote?.totais?.valor` → `quote?.body?.totais?.valor` |
| NFSC-03 | Typing R$ updates % and total correctly based on quote total | Same fix as NFSC-02 (syncDesconto covers all three input paths) |
| NFSC-04 | Typing total updates % and R$; cannot exceed quote total | Fix `max` attr (line 885) and `placeholder` (line 887): same path fix; clamping logic in syncDesconto already correct |
| NFSC-05 | Emitting NFS-e with discount active sends correct post-discount value to backend and SOAP | Fix `handleEmitirNfse()`: send `descontoPorcentagem` and `descontoValor` as `number` not `string`; also fix "Valor base" display (lines 894–896) |
</phase_requirements>

---

## Standard Stack

This phase touches only existing code. No new libraries are needed.

### Existing Stack (already installed)

| Layer | Technology | Relevant File |
|-------|-----------|---------------|
| Frontend | Next.js 14 App Router, React, TypeScript | `apps/frontend/` |
| Page | React functional component with `useState` | `page.tsx` |
| Backend | NestJS + TypeScript | `nfse.service.ts`, `nfse.controller.ts` |
| HTTP proxy | Next.js Route Handler | `apps/frontend/src/app/api/quotes/[id]/nfse/route.ts` |

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
User action (toggle/type)
        |
        v
syncDesconto(field, raw)  <-- reads: quote?.body?.totais?.valor  [FIXED]
        |
        v
setNfseDescontoPercent / setNfseDescontoValor / setNfseValorTotal
        |
        v
handleEmitirNfse()
        |
   Build POST body
   descontoValor: Number(nfseDescontoValor)    [FIXED — was string]
   descontoPorcentagem: Number(nfseDescontoPercent) [FIXED — was string]
        |
        v
POST /api/quotes/:id/nfse  (Next.js proxy — transparent)
        |
        v
POST /api/quotes/:id/nfse  (NestJS backend)
        |
        v
NfseService.emitir()
  descontoIncondicionado = base * descontoPorcentagem / 100  OR  descontoValor
        |
        v
buildRpsXml -> <DescontoIncondicionado>X.XX</DescontoIncondicionado>
        |
        v
enviarSoap -> iiBrasil SOAP endpoint
```

### All Occurrences of the Path Bug (verified by grep)

The grep search for `totais` in `page.tsx` returned these lines:

| Line | Code | Is Bug? | Fix Needed |
|------|------|---------|-----------|
| 44 | `totais?: { valor?: number; ... }` (inside `body` type) | No | Correct definition — `totais` lives under `body` |
| 304 | `const base = Number(quote?.totais?.valor ?? 0)` | **YES** | `quote?.body?.totais?.valor` |
| 601 | `{Number(body.totais?.valor ?? 0)...}` | No | Uses `body` variable (correctly aliased at line 414) |
| 602 | `{Number(body.totais?.desconto ?? 0)...}` | No | Uses `body` variable |
| 603 | `{Number(body.totais?.valoracrescimo ?? 0)...}` | No | Uses `body` variable |
| 833 | `setNfseValorTotal((quote?.totais?.valor ?? 0).toFixed(2))` | **YES** | `quote?.body?.totais?.valor` |
| 885 | `max={(quote?.totais?.valor ?? 0).toFixed(2)}` | **YES** | `quote?.body?.totais?.valor` |
| 887 | `placeholder={(quote?.totais?.valor ?? 0).toFixed(2)}` | **YES** | `quote?.body?.totais?.valor` |
| 894 | `{quote?.totais?.valor != null && (` | **YES** | `quote?.body?.totais?.valor` |
| 896 | `{Number(quote.totais.valor).toLocaleString(...)}` | **YES** | `quote.body?.totais?.valor` |

**Total path-bug occurrences: 6** (not 4 as initially estimated — lines 885 and 887 are both bugs,
and line 896 is an unsafe non-optional chained access in addition to the wrong path).

Line 601–603 are NOT bugs because they use `const body = quote?.body` (line 414), so they
already read the correct path.

### Second Bug: String-to-Number Coercion in handleEmitirNfse

`handleEmitirNfse()` at line 349 declares `body` as `Record<string, string>`. The discount
fields are assigned as strings:

```typescript
body.descontoAtivo = "true";            // string, not boolean
body.descontoPorcentagem = nfseDescontoPercent;  // string, e.g. "10.00"
body.descontoValor = nfseDescontoValor;          // string, e.g. "50.00"
```

`EmitirNfseInput` is an **interface**, not a class. NestJS `ValidationPipe` with `transform: true`
only auto-coerces types when the DTO is a **class** decorated with `class-transformer`. Since
`EmitirNfseInput` is a bare interface, no transformation occurs. The backend receives:

```json
{ "descontoAtivo": "true", "descontoPorcentagem": "10.00", "descontoValor": "50.00" }
```

The backend checks `input?.descontoAtivo === true` (strict equality) — `"true" !== true`, so
the entire discount block is skipped. Even if that check were loosened, `"true".toFixed(2)`
would throw a runtime error. The discount is never applied.

**Fix location:** `handleEmitirNfse()` — convert to typed payload before sending:

```typescript
// Correct approach — send a typed object, not Record<string, string>
const payload: Record<string, unknown> = { servicoCodigo: nfseServico };
// ...other fields...
if (nfseDescontoAtivo && nfseDescontoValor) {
  payload.descontoAtivo = true;                          // boolean
  payload.descontoPorcentagem = Number(nfseDescontoPercent);  // number
  payload.descontoValor = Number(nfseDescontoValor);          // number
}
```

Note: `totalPagoInformado` / `totalPago` is **NOT needed**. The backend comment says "if absent
uses valorServicos" (line 473–475), which is `quote.total` — the same total the frontend is
computing from `quote.body.totais.valor`. Sending `descontoValor` as a number is sufficient.

### Anti-Patterns to Avoid

- **Using `Record<string, string>` for a POST body that contains numbers/booleans:** JSON allows
  native number and boolean values; always type the body accurately.
- **Testing `=== true` against a string:** The backend guard `input?.descontoAtivo === true` is
  strict. Frontend must send `true` (boolean), not `"true"` (string).
- **Fixing only the first obvious occurrence:** The grep confirms 6 path-bug occurrences.
  Fixing only the 4 originally identified leaves lines 887 and 896 broken.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Type coercion on POST body | Custom middleware, backend DTO class | Fix at the source: send correct types from frontend |
| Additional discount endpoint | New route | Existing `/nfse` POST endpoint already accepts `descontoValor` and `descontoPorcentagem` |

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a code-only bug fix, not a rename/refactor/migration phase. No
stored data, live service config, OS-registered state, secrets, or build artifacts are affected
by fixing TypeScript property paths and JavaScript type coercions.

---

## Common Pitfalls

### Pitfall 1: Fixing 4 occurrences, missing 2

**What goes wrong:** The placeholder attribute (line 887) is fixed alongside `max` (line 885)
since they are adjacent. Line 896 (`quote.totais.valor` without optional chaining) is a runtime
crash risk in addition to being the wrong path.
**How to avoid:** Use the grep-verified list of 6 occurrences; do not rely on the original
count of 4.
**Warning signs:** Placeholder shows "0.00" instead of real total; TypeScript error on line 896
about accessing `.valor` on possibly-undefined `totais`.

### Pitfall 2: Forgetting the coercion bug after fixing the path bug

**What goes wrong:** After fixing the path, the UI shows correct values. The user applies a
discount and emits — but the SOAP XML contains `<DescontoIncondicionado>0.00</DescontoIncondicionado>`
because the backend skips the discount block (`"true" !== true`).
**How to avoid:** Fix both bugs in the same commit. NFSC-05 specifically tests end-to-end
emission with discount.
**Warning signs:** Modal UI looks correct; discount fields show non-zero values; but emitted
NFS-e has no discount applied (check backend log for `descontoIncondicionado=0`).

### Pitfall 3: Breaking the non-discount body type

**What goes wrong:** Refactoring `body` from `Record<string, string>` to `Record<string, unknown>`
may break TypeScript checks for string fields if done carelessly.
**How to avoid:** Use a union type `Record<string, string | number | boolean>` or keep separate
typed constant and spread. The simplest approach: change only the discount block assignment types
and add an explicit cast if needed.

### Pitfall 4: Unsafe access on line 896

**What goes wrong:** Line 896 uses `quote.totais.valor` (no optional chaining on `totais`).
After fixing the path to `quote.body?.totais?.valor`, the conditional on line 894 guards against
null but TypeScript still needs optional chaining inside the template expression.
**How to avoid:** Fix both the condition (line 894) and the access (line 896) together:
  - Line 894: `quote?.body?.totais?.valor != null`
  - Line 896: `Number(quote.body!.totais!.valor)`

---

## Code Examples

### Pattern 1: Correct path to quote total (verified from type definition at line 29-46)

```typescript
// Source: QuoteDetail type, page.tsx lines 29-46
// quote.body is the nested object; totais lives inside body
const base = Number(quote?.body?.totais?.valor ?? 0);
```

### Pattern 2: Correct switch onChange (replaces line 833)

```typescript
// Source: verified from QuoteDetail type
setNfseValorTotal((quote?.body?.totais?.valor ?? 0).toFixed(2));
```

### Pattern 3: Correct max/placeholder (replaces lines 885, 887)

```typescript
max={(quote?.body?.totais?.valor ?? 0).toFixed(2)}
placeholder={(quote?.body?.totais?.valor ?? 0).toFixed(2)}
```

### Pattern 4: Correct "Valor base" display (replaces lines 894-896)

```typescript
{quote?.body?.totais?.valor != null && (
  <small className="text-muted mt-1 d-block">
    Valor base: {Number(quote.body!.totais!.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
  </small>
)}
```

### Pattern 5: Correct POST body in handleEmitirNfse (replaces lines 349, 362-366)

```typescript
// Change body type from Record<string, string> to Record<string, string | number | boolean>
const body: Record<string, string | number | boolean> = { servicoCodigo: nfseServico };
// ... other string fields unchanged ...
if (nfseDescontoAtivo && nfseDescontoValor) {
  body.descontoAtivo = true;                                // boolean, not "true"
  body.descontoPorcentagem = Number(nfseDescontoPercent);   // number
  body.descontoValor = Number(nfseDescontoValor);           // number
}
```

---

## State of the Art

No library version changes or ecosystem shifts are relevant to this phase. It is pure bug-fix
code correction within existing patterns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NestJS `ValidationPipe` with `transform: true` does NOT coerce string-to-number when the DTO is an interface (not a decorated class) | Common Pitfalls / Second Bug | If NestJS somehow coerces via JSON.parse at the body parsing level, the coercion fix is still harmless but may not be needed for NFSC-05. Low risk — fix is correct regardless. |

**All other claims were verified directly from the source files in this session.**

---

## Open Questions (RESOLVED)

1. **TypeScript strict mode and the `body!` assertion on line 896**
   - What we know: `quote.body` is typed as optional. The guard `quote?.body?.totais?.valor != null`
     narrows the type but TypeScript may not narrow `quote.body` inside the JSX child expression.
   - What's unclear: Whether the project's `tsconfig.json` uses `strictNullChecks`.
   - Recommendation: Use `quote.body?.totais?.valor` with optional chaining throughout, or use a
     local `const base = quote?.body?.totais?.valor` variable to avoid repeated access and allow
     TypeScript narrowing.
   - **RESOLVED:** Plan uses `quote.body?.totais?.valor` with optional chaining throughout all 6
     occurrences. No non-null assertions (`!`) are used anywhere. This approach is safe regardless
     of whether `strictNullChecks` is enabled in tsconfig.json.

---

## Environment Availability

Step 2.6 SKIPPED — this phase makes no use of external tools, services, CLIs, runtimes, or
databases beyond the existing project stack already running. All changes are to TypeScript/TSX
source files that the developer will build and hot-reload locally.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual browser verification (no automated frontend test suite detected) |
| Config file | None for frontend component tests |
| Quick run command | Open modal in dev browser, verify field values |
| Full suite command | Manual end-to-end: apply discount, emit NFS-e, inspect backend log |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NFSC-01 | "Valor total" shows real quote total when switch is toggled on | Manual | Open modal, toggle switch, inspect field | N/A |
| NFSC-02 | Typing % updates R$ and total correctly | Manual | Type 10 in % field, verify R$ = base*0.1, total = base*0.9 | N/A |
| NFSC-03 | Typing R$ updates % and total correctly | Manual | Type a value in R$ field, verify % and total | N/A |
| NFSC-04 | Typing total > base clamps to base | Manual | Type value exceeding total, verify clamping | N/A |
| NFSC-05 | Emitting with discount sends correct value to SOAP | Manual + log inspection | Emit and check backend logs for `descontoIncondicionado` > 0 | N/A |

### Wave 0 Gaps

None — no test files need to be created. Validation is via manual browser walkthrough and
backend log inspection.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not changed |
| V3 Session Management | No | Not changed |
| V4 Access Control | No | Not changed |
| V5 Input Validation | Yes (minor) | Backend already validates `descontoPorcentagem` 0-100 range and `descontoValor >= 0`; fix sends correct types so validation path is actually reached |
| V6 Cryptography | No | Not changed |

No new security surface is introduced. The fix makes existing backend validation reachable
(previously bypassed by `"true" !== true`).

---

## Sources

### Primary (HIGH confidence)

- `apps/frontend/src/app/orcamento/[id]/page.tsx` — read in full; all occurrences verified by
  grep (10 grep matches for "totais"; 6 identified as bugs)
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — read in full; `EmitirNfseInput`
  is an `interface`; discount logic at lines 472-494 confirmed
- `apps/backend/src/modules/integrations/nfse/nfse.controller.ts` — read in full; no `@Transform`
  decorators; `EmitirNfseInput` passed directly as `@Body()`
- `apps/backend/src/main.ts` — confirmed `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`
- `apps/frontend/src/app/api/quotes/[id]/nfse/route.ts` — read in full; proxy is transparent
  (passes body verbatim)

### Secondary (MEDIUM confidence)

- NestJS documentation knowledge: `transform: true` in `ValidationPipe` requires class-transformer
  decorators on a class, not an interface, to coerce types — tagged `[ASSUMED: A1]` because it
  was not verified against NestJS source in this session. The fix is correct regardless.

---

## Metadata

**Confidence breakdown:**
- Bug locations: HIGH — directly read and grep-verified from source
- String coercion mechanism: MEDIUM — NestJS interface/class distinction is well-known but not
  re-verified from current NestJS docs in this session
- Pitfalls: HIGH — derived from direct code reading

**Research date:** 2026-05-04
**Valid until:** 2026-05-18 (stable codebase; no external dependencies)
