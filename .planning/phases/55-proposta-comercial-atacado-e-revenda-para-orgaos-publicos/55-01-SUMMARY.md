---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 01
subsystem: backend/propostas
tags: [tdd, bigint, pricing, margin, pure-util]
requires: []
provides:
  - "propostas-calc.util.ts: CalcPropostaError, precoBaseParaCentavos, ajustarPrecoCentavos, parsePercentualMilli, parsePrecoDigitadoCentavos, resolverPrecoUnitarioCentavos, calcularLinhasProposta, calcularMargem, calcularItemProposta, MAX_LINHAS_PROPOSTA"
affects: [55-04, 55-06, 55-07]
tech-stack:
  added: []
  patterns: ["BigInt-only money math (milli / cents / milli-percent)", "pure util, no I/O", "typed error with zero-based item index"]
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas-calc.util.ts
    - apps/backend/src/modules/propostas/propostas-calc.util.test.ts
  modified: []
key-decisions:
  - "Adjustment starts from the exact base price in thousandths and applies a single ceil, not from the already-rounded base price."
  - "Typed value (tipo VALOR) replaces the base price (D-02a); it is never an R$ surcharge."
  - "Proposal lines carry no discount: valorItem is the final price, unlike calcularOrcamento (Phase 44), which stays untouched (D-03)."
requirements-completed: [P55-PRECO]
duration: 15 min
completed: 2026-11-27
status: complete
commits: 4
plan_head_before: 40ff1b1ac80df9fc1ca2d9b66d7cab2b5039426f
plan_head_after: 698459471a03caf9a074c8249a1d62f82ae54b26
actuals:
  tokens: 11500
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Base price with ceil to the cent, percentage adjust (BigInt) and typed value"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/backend/src/modules/propostas/propostas-calc.util.test.ts#precoBaseParaCentavos,ajustarPrecoCentavos,parsePercentualMilli,parsePrecoDigitadoCentavos,resolverPrecoUnitarioCentavos"
        status: pass
  - deliverable: "Lines and total without discount, limits, net margin and below-cost flag"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/backend/src/modules/propostas/propostas-calc.util.test.ts#calcularLinhasProposta,calcularMargem,calcularItemProposta"
        status: pass
---

# Phase 55 Plan 01: Proposal price arithmetic (pure util) Summary

BigInt-only pure util for proposal pricing: exact ceil to the cent (3.50 +10% = 3.85, where naive float gives 3.86), typed value that replaces the base price, discount-free lines/totals that contrast with the Phase 44 `calcularOrcamento`, and net margin with a below-cost flag.

## Accomplishments

- `precoBaseParaCentavos` / `ajustarPrecoCentavos`: ceil in BigInt (D-23, D-02); percentage at or below -100% is refused; anti-float proof in the test (`3.5 * 1.1 * 100 = 385.00000000000006`, naive ceil gives 386, util gives 385).
- `parsePercentualMilli` (strict decimal, up to 3 places, range (-100, 1000]) and `parsePrecoDigitadoCentavos` (>0, up to 2 places); exponent notation, NaN and free text refused with typed codes.
- `resolverPrecoUnitarioCentavos`: `VALOR` substitutes the base price (base 2000n + "2.90" = 290n, never 490n; D-02a).
- `calcularLinhasProposta`: final price becomes `valorItem`, discount 0, total = sum of half-up rounded lines; limits per line, quantity range, empty list and max 200 items with item index in the error.
- `calcularMargem`: (price - cost) / price in thousandths of percent, half-up away from zero; `abaixoDoCusto` only when price < cost (D-27, D-13).
- `calcularItemProposta`: server-side entry point for 55-06 composing the pieces.
- The contrast test shows `calcularOrcamento` (Phase 44) yields an implicit discount for the same below-catalog price while the proposal util keeps discount 0 (D-03). The Phase 44 files are unchanged (`git diff 8636fbe` empty).

## TDD Gate Compliance

| Gate | Commit | Note |
|------|--------|------|
| RED (task 1) | dffef71 `test(55-01)` | 16 target tests executed and failed against a throwing skeleton (`NAO_IMPLEMENTADO`): 16 failed / 16 total |
| GREEN (task 1) | 42bd74a `feat(55-01)` | 16 passed |
| RED (task 2) | 582b92f `test(55-01)` | 13 new target tests failed, 16 earlier tests still passed (13 failed / 29 total) |
| GREEN (task 2) | 6984594 `feat(55-01)` | 29 passed, `tsc --noEmit` clean |
| REFACTOR | none | no cleanup needed |

RED semantic assessment: the test module loaded and every target test ran; each failed because the skeleton throws instead of returning the planned values (an error, not an assertion mismatch, since the skeleton has no logic to assert against). Jest is not a TAP/JUnit reporter, so `gsd_run check tdd-red-evidence` was not applicable (and `workflow.tdd_mode` is not enabled in `.planning/config.json`); no evidence record was fabricated. The skeleton is included in the RED commits so the module resolves instead of failing at load.

## Task Commits

1. Task 1 RED: dffef71, GREEN: 42bd74a
2. Task 2 RED: 582b92f, GREEN: 6984594

## Deviations from Plan

None - plan executed exactly as written.

Environment note (not a deviation): `node_modules` was missing in the worktree, so `npm ci --ignore-scripts` ran once at the root (lockfile-pinned, no new packages). `prisma generate` was not needed: `tsc --noEmit` is clean without it.

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas/propostas-calc.util.test.ts`: 29 passed.
- `npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit`: no errors.
- Acceptance: one `export function` each for `ajustarPrecoCentavos`, `precoBaseParaCentavos`, `calcularLinhasProposta`, `calcularMargem`; imports from `../integrations/athos/athos-orcamento-calc.util` without redefining `paraMilli`/`paraCentavos`/`linhaCentavos`; no `Math.*` in the production file; no production import of `calcularOrcamento`.

## Known Stubs

None.

## Threat Flags

None. T-55-01 (rounding tampering) and T-55-02 (input parsing) are mitigated by BigInt-only math, golden cases and strict typed parsing; the util has no I/O, endpoints or auth surface.

## Next Phase Readiness

Ready for 55-04 (`criarOrcamentoProposta`), 55-06 (service) and 55-07 (PDF), which import from `apps/backend/src/modules/propostas/propostas-calc.util.ts`.

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/propostas/propostas-calc.util.ts
- FOUND: apps/backend/src/modules/propostas/propostas-calc.util.test.ts
- FOUND commits: dffef71, 42bd74a, 582b92f, 6984594
