---
phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi
fixed_at: 2026-09-05T10:27:40Z
review_path: .planning/phases/41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi/41-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 2
skipped: 2
status: partial
---

# Phase 41: Code Review Fix Report

**Fixed at:** 2026-09-05T10:27:40Z
**Source review:** .planning/phases/41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi/41-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03 — `fix_scope: critical_warning`, IN-01 excluded)
- Fixed: 2 (CR-01, WR-02)
- Skipped: 2 (WR-01, WR-03 — both documented as accepted/won't-fix per explicit scope locks, not code defects)

**Verification environment:** All edits, TypeScript checks, and Jest runs for this report were performed inside an isolated git worktree (`.claude/worktrees/rf-41-*`) on a temporary branch, then fast-forwarded onto `main`. Commit hashes below are reachable from `main` after the fast-forward merge.

## Fixed Issues

### CR-01: One query's failure erases another already-successful query's results in `buscarDashboardContasReceber`

**Files modified:** `apps/backend/src/modules/integrations/athos/athos.service.ts`, `apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts`
**Commit:** `5166000`
**Applied fix:** Split the single `try/catch` wrapping both the aging/a-vencer/taxa-inadimplencia query and the independent `conta_recebida` (recebido no mês) query into two separate `try/catch` blocks. Each query now degrades only its own fields to zero on failure — a failure in `conta_recebida` (hardcoded table/columns, no candidate-name fallback) no longer discards already-successful `aging`/`a_vencer`/`taxa_inadimplencia` values, and vice versa.

Updated `athos.service.dashboard.test.ts`:
- Rewrote the existing "degrada para zeros" test to assert the `conta_recebida` query now runs independently (3 `client.query` calls instead of 2) and its result is not discarded by an earlier failure.
- Added a new regression test for the exact CR-01 scenario: aggregates query succeeds (aging/a_vencer/taxa populated with real values), `recebido_mes` query fails — asserts the valid aggregates are preserved and only `total_recebido_mes` degrades to zero.

**Test results:** `npx jest athos --no-coverage` → 14 suites, 232/232 tests passed (was 231 before, +1 new regression test). `npx tsc --noEmit` reported no errors in the modified file.

### WR-02: In-memory concurrency guard is not safe across multiple process instances

**Files modified:** `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts`
**Commit:** `f6688f9`
**Applied fix:** This is architecturally expected for the current single-instance deployment (already accepted and documented as a residual risk in `41-02-PLAN.md`'s risk table, T-41-02-02, at plan time). A distributed lock (e.g. Postgres `pg_try_advisory_lock`) was judged out of scope for this fix pass — introducing one is an architectural change, not a minimal correctness fix, and the deployment is confirmed single-instance today. Per the review's own suggested fallback ("If the deployment is guaranteed single-instance, add a comment stating that assumption explicitly"), added an inline doc-comment on the `running` guard explaining the single-instance assumption and pointing to the advisory-lock alternative for whoever scales the backend horizontally in the future. No behavior change.

**Test results:** `npx jest cobranca --no-coverage` → 6 suites, 40/40 tests passed. `npx tsc --noEmit` reported no errors in the modified file.

## Skipped Issues

### WR-01: EFI reconciliation job re-authenticates with EFI once per boleto instead of once per cycle

**File:** `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts:52-65` (calling `apps/backend/src/modules/cobranca/cobranca.service.ts:750-778`)
**Reason:** Skipped — no minimal fix is possible without violating the phase's locked decision D-04. `41-CONTEXT.md:33`, `41-02-PLAN.md:27/282/289`, and `41-PATTERNS.md:53` all explicitly lock this: *"reaproveita `CobrancaService.verificarPagamentoBoleto()` sem duplicar cliente EFI e sem alterar `cobranca.service.ts`"* — `cobranca.service.ts` is required to remain byte-for-byte untouched by the reconciliation job's Task 3, and `verificarPagamentoBoleto()` must be reused exactly as-is (no new parameters, no new overload). Any token-caching fix requires either (a) changing `verificarPagamentoBoleto()`'s signature to accept/return a token, which alters its public contract and touches `cobranca.service.ts`, or (b) writing a second EFI HTTP client in the job to fetch a token independently, which duplicates the EFI client D-04 explicitly forbids. Both options violate the locked decision as it is written. Doing a "minimal, scoped" version of this fix is therefore not possible without either amending D-04 first (a scope/architecture decision beyond what a code-review-fix pass should make unilaterally) or accepting one of the two contract violations above. Recommend revisiting D-04 explicitly in a future phase/plan revision if EFI rate-limiting from the 300x/cycle authorize storm becomes an observed production problem — this is a real risk (per the review's own reasoning about the existing `efiCode === "4600210"` anti-abuse handling elsewhere in the codebase) but resolving it correctly requires a plan-level decision change, not a fixer-level patch.
**Original issue:** `CobrancaReconciliationJob.reconciliarBoletosPendentes` loops over up to 300 pending boletos and calls `verificarPagamentoBoleto(id)` per item, which performs a fresh `POST /v1/authorize` for every single call — up to 300 separate OAuth handshakes against the EFI API per 30-minute cron cycle, risking triggering EFI's anti-abuse rate limiting.

### WR-03: New unlimited fiscal aggregates sit beside headline totals that are still capped at 100 clients

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1907-1930` (main query, `LIMIT 100`) vs. `1958-1962` (`summaryLegado`) vs. `1969-1983`/`2005-2013` (new unlimited aggregates, post-CR-01 split)
**Reason:** Skipped — this matches the plan's explicit, documented scope boundary rather than being an unintended gap. `41-03-SUMMARY.md` (requirements-completed: D-02, D-07, D-09) documents that `aging`, `a_vencer`, and `taxa_inadimplencia` were *deliberately* built as unlimited full-portfolio queries specifically because the pre-existing `clientes`/`summaryLegado` array was already capped at `LIMIT 100` (a decision — D-08 — that predates and is outside phase 41's scope: it is only referenced, not owned, by this phase's JSDoc at `athos.service.ts:1856-1868`). `summaryLegado.total_a_receber`/`total_atrasado` are the pre-existing legacy summary fields, not something phase 41 introduced or was scoped to fix — expanding phase 41's SQL to also make the headline totals unlimited would be a scope expansion beyond D-02/D-07/D-09 (which is exactly what the review itself frames the fix as: "so all summary KPIs share the same full-portfolio semantics that D-07/D-09 already established" — an explicit widening of intent, not a bug fix within the delivered scope). No trivial, safe, in-scope fix exists: the correct fix is a new `SUM(cr.valor)` / `SUM(CASE WHEN statusconta='VEN'...)` aggregate query over all of `conta_receber`, which is the same shape of change as CR-01/D-02/D-07/D-09 and should go through the same plan-and-review process as those decisions did, rather than being silently added during a fix pass. Recommend filing this as a follow-up phase/plan item (e.g., extending D-08's 100-client cap discussion) once the client base is expected to approach 100 open debtors.
**Original issue:** The dashboard's headline "Total a Receber" / "Inadimplência Ativa" cards are computed via `clientes.reduce(...)` over the same `LIMIT 100` array as the client list, while the aging/a-vencer breakdowns directly above/below them on the same screen are computed from unlimited full-table queries — once the client base exceeds 100 open debtors, the numbers will visibly fail to reconcile with each other on the same screen.

---

_Fixed: 2026-09-05T10:27:40Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
