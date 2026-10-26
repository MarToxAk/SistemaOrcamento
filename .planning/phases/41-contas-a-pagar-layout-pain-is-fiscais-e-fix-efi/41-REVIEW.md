---
phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi
reviewed: 2026-09-05T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts
  - apps/backend/src/modules/cobranca/cobranca.service.ts
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts
  - apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts
  - apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts
  - apps/backend/src/modules/cobranca/cobranca.module.ts
  - apps/backend/src/modules/app.module.ts
  - apps/backend/package.json
  - .env.example
  - apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts
  - apps/frontend/src/app/contas-receber/page.tsx
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-09-05
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the new consolidated boletos-a-receber dashboard endpoint (`GET /cobranca/boleto/dashboard`), the new EFI reconciliation cron job (`CobrancaReconciliationJob`), and the fiscal-aggregate SQL added to `AthosService.buscarDashboardContasReceber` (aging / a-vencer / taxa de inadimplência / recebido no mês). I scoped the review to the actual diff introduced by phase 41 (commits `4eebfd3`..`2cfbf1c`), verified via `git diff 65dd20e..HEAD`, rather than every pre-existing line in the large `athos.service.ts` file.

The new endpoint is correctly covered by the global `InternalAuthGuard` (no stray `@Public()`), the raw SQL added in this phase is fully parameterized (no injection risk), and the reconciliation job correctly isolates per-item failures with a try/catch inside its loop so one broken boleto cannot abort the whole cycle (confirmed by both code inspection and the job's own unit tests, which pass).

However, I found one genuine correctness bug in the new fiscal-aggregate query error handling that will silently zero out **valid, already-computed** financial KPIs on a Simples Nacional accounting dashboard whenever an unrelated query later in the same try block fails — a real risk for a system whose entire purpose is producing trustworthy fiscal numbers. I also found two design gaps in the EFI reconciliation job's robustness at scale, and an inconsistency in the dashboard's headline totals that the phase's own code comments already acknowledge but did not fully resolve.

## Critical Issues

### CR-01: One query's failure erases another already-successful query's results in `buscarDashboardContasReceber`

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1969-2022`

**Issue:** The aging/a-vencer/taxa-de-inadimplência aggregation and the "recebido no mês" aggregation are two independent SQL queries wrapped in a **single** `try { ... } catch { ... }` block:

```ts
try {
  const agregadosResult = await client.query(`... aging/a_vencer/taxa ...`);
  // aging, a_vencer, taxa_inadimplencia are computed and assigned here — SUCCESSFULLY

  const recebidoMesResult = await client.query(`
    SELECT COALESCE(SUM(cre.valorpago), 0) AS total_recebido_mes
    FROM conta_recebida cre
    WHERE cre.datapagamento::date >= date_trunc('month', CURRENT_DATE)::date
      AND cre.datapagamento::date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
  `);
  total_recebido_mes = Number(...);
} catch (error) {
  this.logger.warn(`... retornando zeros ...`);
  total_recebido_mes = 0;
  taxa_inadimplencia = 0;
  aging = { d1_30: 0, d31_60: 0, d61_90: 0, d90_mais: 0 };
  a_vencer = { d7: 0, d15: 0, d30: 0 };
}
```

If the first query (`agregadosResult`) succeeds — populating `aging`, `a_vencer`, and `taxa_inadimplencia` with real, correct values — and only the **second**, unrelated query against `conta_recebida` fails (e.g. because that table/column name differs across Athos installs, exactly the kind of schema drift this codebase explicitly works around elsewhere with candidate-column resolution such as `findExistingTable`/`isSafeIdentifier`), the `catch` block discards the perfectly valid `aging`/`a_vencer`/`taxa_inadimplencia` values too and resets **everything** to zero. The dashboard will then render "0%", "R$ 0,00" for aging buckets, a-vencer buckets, and taxa de inadimplência — plausible-looking but factually wrong numbers — with no error surfaced to the end user (only a backend log warning). For an accounting/billing tool whose entire job is producing correct fiscal figures, silently showing incorrect zeros instead of either the correct partial data or a visible error is a data-integrity risk, not just a cosmetic bug.

This is also provably reachable: `conta_recebida`/`cre.valorpago`/`cre.datapagamento` are hardcoded (no candidate-name fallback), unlike almost every other Athos query in this file, so any mismatch on this one table wipes three additional, unrelated, correctly-computed metrics.

**Fix:** Give the two queries independent error handling so a failure in one cannot invalidate the other's results:

```ts
try {
  const agregadosResult = await client.query(`... aging/a_vencer/taxa ...`);
  const agregadosRow = (agregadosResult.rows as Row[])[0] ?? {};
  aging = { /* ... */ };
  a_vencer = { /* ... */ };
  taxa_inadimplencia = /* ... */;
} catch (error) {
  this.logger.warn(`buscarDashboardContasReceber: falha ao calcular aging/a_vencer/taxa — retornando zeros. Causa: ${String(error)}`);
  aging = { d1_30: 0, d31_60: 0, d61_90: 0, d90_mais: 0 };
  a_vencer = { d7: 0, d15: 0, d30: 0 };
  taxa_inadimplencia = 0;
}

try {
  const recebidoMesResult = await client.query(`... conta_recebida ...`);
  total_recebido_mes = Number((recebidoMesResult.rows as Row[])[0]?.["total_recebido_mes"] ?? 0);
} catch (error) {
  this.logger.warn(`buscarDashboardContasReceber: falha ao calcular recebido no mes — retornando zero. Causa: ${String(error)}`);
  total_recebido_mes = 0;
}
```

Also add a test case (the current `athos.service.dashboard.test.ts` only covers "first query succeeds, second query never runs because the whole block throws on the first call" — it does not cover "first query succeeds, second query throws", which is exactly the scenario that reveals this bug).

## Warnings

### WR-01: EFI reconciliation job re-authenticates with EFI once per boleto instead of once per cycle

**File:** `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts:52-65` (calling `apps/backend/src/modules/cobranca/cobranca.service.ts:750-778`)

**Issue:** `CobrancaReconciliationJob.reconciliarBoletosPendentes` loops over up to `RECONCILIACAO_MAX_POR_CICLO` (300) pending boletos and calls `cobrancaService.verificarPagamentoBoleto(id)` for each one. `verificarPagamentoBoleto` itself performs a fresh `POST /v1/authorize` (Basic auth) followed by `GET /v1/charge/:id` for every single call — there is no token caching/reuse across the loop. Every 30-minute cron run can therefore issue up to 300 separate OAuth handshakes against the EFI API in quick succession. The codebase already has to special-case EFI's own anti-abuse response (`efiCode === "4600210"`, "muitas tentativas com os mesmos dados") elsewhere in `criarBoleto`, which shows EFI does rate-limit/flag repeated calls — a 300x/cycle authorize storm is a realistic way to trip that same protection and make the whole reconciliation cycle fail for reasons unrelated to the actual payment status.

**Fix:** Fetch a single EFI access token once per cycle (in the job, or a new `CobrancaService` method that accepts/returns a cached token) and pass it into a lighter-weight per-boleto status check, instead of re-authenticating inside `verificarPagamentoBoleto` for every item:

```ts
// in the job, once per cycle:
const efiToken = await this.cobrancaService.obterTokenEfi();
for (const { id } of pendentes) {
  try {
    const resultado = await this.cobrancaService.verificarPagamentoBoleto(id, efiToken);
    ...
```

### WR-02: In-memory concurrency guard is not safe across multiple process instances

**File:** `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts:13, 28-31, 33, 72-74`

**Issue:** `this.running` is a plain instance boolean. It correctly prevents two overlapping cron ticks *within the same Node process* (covered by the "nao inicia um segundo ciclo..." unit test), but if the backend is ever deployed with more than one process/replica (PM2 cluster mode, multiple containers/pods, blue-green with both instances briefly alive), each instance has its own independent `running` flag and its own `@Cron` schedule. Two instances can run `reconciliarBoletosPendentes` concurrently against the same `cobrancaBoleto` rows, doubling EFI API calls and risking two processes racing to update the same boleto's status.

**Fix:** If horizontal scaling of the backend is planned or already in place, replace the in-memory flag with a DB-backed advisory lock (e.g. Postgres `pg_try_advisory_lock`) or a short-lived lock row/flag in Prisma, released in the same `finally` block. If the deployment is guaranteed single-instance, add a comment stating that assumption explicitly so a future infra change doesn't silently reintroduce the race.

### WR-03: New unlimited fiscal aggregates sit beside headline totals that are still capped at 100 clients

**File:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1907-1930` (main query, `LIMIT 100`) vs. `1958-1962` (`summaryLegado`) vs. `1969-1983` (new unlimited aggregates)

**Issue:** The method's own doc-comment (lines 1856-1868) explains that `aging`, `a_vencer`, `total_recebido_mes`, and `taxa_inadimplencia` were deliberately computed from *unlimited* full-table queries specifically because the `clientes` array is capped at `LIMIT 100` (decision D-08). That fix, however, was not applied to `summaryLegado.total_a_receber` / `summaryLegado.total_atrasado` — the two headline currency cards rendered at the very top of `contas-receber/page.tsx` ("Total a Receber" / "Inadimplência Ativa") are still `clientes.reduce(...)` over the same capped 100-row array. Once a client base grows past 100 open debtors, the dashboard will show an aging breakdown and a-vencer breakdown (both correct, full-portfolio) sitting directly above/below headline totals that undercount the same portfolio — numbers that will visibly fail to reconcile with each other on the same screen.

**Fix:** Compute `total_a_receber` / `total_atrasado` from the same unlimited `agregadosResult`-style query (e.g. `SUM(cr.valor)` / `SUM(CASE WHEN statusconta='VEN' ...)` over all of `conta_receber`, not just the top-100-by-sort `clientes` rows), so all summary KPIs share the same "full portfolio" semantics that D-07/D-09 already established.

## Info

### IN-01: `EFI_RECONCILIACAO_CRON_MINUTOS` documented in `.env.example` has no effect

**File:** `.env.example` (Reconciliação automática de boletos EFI section)

**Issue:** The example env file documents `# EFI_RECONCILIACAO_CRON_MINUTOS=30` with the comment "Apenas informativa — cadencia efetiva definida em codigo (CronExpression.EVERY_30_MINUTES)". This is self-aware and not incorrect, but listing a variable name in `.env.example` that does nothing if set is a minor trap for an operator who reasonably assumes anything in that file is configurable — they could set `EFI_RECONCILIACAO_CRON_MINUTOS=5` in production and see no change, with no runtime warning.

**Fix:** Either wire the cron expression to read this value dynamically (`CronExpression` doesn't support this directly with `@Cron`, but `SchedulerRegistry` + `CronJob` can), or remove the variable name entirely from `.env.example` and keep only the prose note that cadence is fixed in code.

---

_Reviewed: 2026-09-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
