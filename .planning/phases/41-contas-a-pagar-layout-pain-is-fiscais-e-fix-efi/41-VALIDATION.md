---
phase: "41"
slug: "contas-a-pagar-layout-pain-is-fiscais-e-fix-efi"
status: planned
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-04"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (backend), tsc --noEmit (frontend type-check, no test runner configured for `apps/frontend`) |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd apps/backend && npx jest <module> --no-coverage` |
| **Full suite command** | `cd apps/backend && npx jest --no-coverage` |
| **Estimated runtime** | ~90 seconds (full backend suite, per 41-RESEARCH.md observations of similar-scope phases) |

---

## Sampling Rate

- **After every task commit:** Run targeted Jest suite for the module touched (e.g. `npx jest cobranca --no-coverage`) and `npx tsc --noEmit` for frontend changes
- **After every plan wave:** Run full backend suite (`npx jest --no-coverage`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

*Populated by gsd-planner during PLAN.md authoring — one row per task, cross-referencing task ID, plan, wave, and the automated verify command from that task's `<verify><automated>`.*

| Plan | Wave | Task | Decisões | Automated verify | Fails when |
|------|------|------|----------|------------------|------------|
| 41-01 | 1 | T1 — Painel consolidado de boletos ponta a ponta (tracer) | D-06 | `npm --prefix apps/backend run test -- cobranca.service.dashboard --no-coverage` · `grep -v '^[[:space:]]*//' apps/backend/src/modules/cobranca/cobranca.controller.ts \| grep -c '@Public()'` · `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit ≠ 0 / "No tests found" · contagem ≠ 3 · linha com "error TS" |
| 41-01 | 1 | T2 — Indicador NFS-e por boleto | D-08 | `npm --prefix apps/backend run test -- cobranca.service.dashboard --no-coverage` · `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit ≠ 0 / "No tests found" · linha com "error TS" |
| 41-02 | 1 | T1 — Gate de legitimidade `@nestjs/schedule` (checkpoint bloqueante) | D-05 | — (human-check: `<what-built>` / `<how-to-verify>` / `<resume-signal>`) | operador reprova a instalação |
| 41-02 | 1 | T2 — Instalar `@nestjs/schedule` + `ScheduleModule.forRoot()` | D-05 | `node -e "…dependencies['@nestjs/schedule']…"` · `npm --prefix apps/backend run build` | "MISSING @nestjs/schedule" · linha com "error TS" |
| 41-02 | 1 | T3 — `CobrancaReconciliationJob` | D-03, D-04 | `npm --prefix apps/backend run test -- cobranca-reconciliation --no-coverage` · `npm --prefix apps/backend run test -- cobranca --no-coverage` · `npm --prefix apps/backend run build` | exit ≠ 0 / "No tests found" · linha iniciando com "FAIL " · linha com "error TS" |
| 41-03 | 2 | T1 — Agregados fiscais no `buscarDashboardContasReceber` | D-02, D-07, D-09 | `npm --prefix apps/backend run test -- athos.service.dashboard --no-coverage` · `npm --prefix apps/backend run test -- athos --no-coverage` · `npm --prefix apps/backend run build` | exit ≠ 0 / "No tests found" · linha iniciando com "FAIL " · linha com "error TS" |
| 41-03 | 2 | T2 — Cards de resumo, aging e a vencer | D-02, D-07, D-09 | `npx tsc --noEmit -p apps/frontend/tsconfig.json` · `npm --prefix apps/frontend run build` | linha com "error TS" · "Failed to compile" |
| 41-04 | 3 | T1 — Ordenação multi-critério + destaque 90+ dias | D-01, D-10 | `npx tsc --noEmit -p apps/frontend/tsconfig.json` · `npm --prefix apps/frontend run build` · `<human-check>` (roteiro de aceite da fase, colhido no fim) | linha com "error TS" · "Failed to compile" · bloco do roteiro reprovado |

**Continuidade de amostragem:** nenhuma sequência de 3 tarefas sem verificação automatizada — as 7 tarefas `auto`/`tracer` têm todas ao menos um `<automated>`; a única tarefa sem comando é o checkpoint de supply chain do 41-02, cercado por tarefas verificadas antes e depois.

**Latência de feedback:** o comando mais lento da tabela é `npm --prefix apps/frontend run build` (~60-90s medidos nesta sessão); todos os demais ficam abaixo de 30s. Máximo dentro do teto de 120s.

---

## Wave 0 Requirements

- [x] `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts` — criado pela Task 3 do 41-02 (mesma tarefa que implementa o job, com `<behavior>` escrito antes da implementação); cobre loop, isolamento de erro por item, guard de sobreposição, liberação do guard, desligamento por ambiente e teto por ciclo
- [x] `apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts` — criado pela Task 1 do 41-01 (tracer, `tdd="true"`) e ampliado pela Task 2; cobre lote de nomes, fallback de nome, filtro de status, dias para vencer, ordenação e os quatro casos de NFS-e
- [x] `apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts` — criado pela Task 1 do 41-03; confirmado nesta sessão que `buscarDashboardContasReceber` **não tem** cobertura existente (`grep` por `buscarDashboardContasReceber` em `apps/backend/src` só encontra o método e o controller), portanto é arquivo novo e não extensão de suite existente
- [x] Framework de teste do frontend: confirmado nesta sessão que `apps/frontend/package.json` tem apenas `dev`/`build`/`start` — **não há test runner**. O substituto automatizado adotado para todas as tarefas de frontend é `npx tsc --noEmit -p apps/frontend/tsconfig.json` mais `npm --prefix apps/frontend run build`, ambos executados com sucesso nesta sessão contra a árvore atual
- [x] Instalação de `@nestjs/schedule`: é a Task 2 do 41-02, precedida pelo checkpoint bloqueante de legitimidade (Task 1)

*Existing test infrastructure (Jest + ts-jest) covers all other phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard visual layout (summary cards, boletos panel placement, aging colors) | D-01, D-02, D-06, D-07, D-10 | Visual/UX judgment — Jest cannot assert pixel layout or color perception | Roteiro consolidado no `<verify><human-check>` da Task 1 do `41-04-PLAN.md`, blocos 1 a 4 |
| EFI reconciliation cron actually fires on schedule in a running server | D-03 | Requires a live NestJS process with `@nestjs/schedule` wired and time passing — not practical as a unit test | Roteiro consolidado no `<verify><human-check>` da Task 1 do `41-04-PLAN.md`, bloco 5 — inclui registrar a contagem real de boletos pendentes que valida a cadência de 30 min |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`test:watch` do backend nunca é invocado; todos os comandos usam `--no-coverage` em modo single-run)
- [x] Feedback latency < 120s (pior caso medido: build do frontend, ~60-90s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (2026-09-04, gsd-planner)
