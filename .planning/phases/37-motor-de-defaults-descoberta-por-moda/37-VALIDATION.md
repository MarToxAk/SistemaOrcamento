---
phase: 37
slug: motor-de-defaults-descoberta-por-moda
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest (existente) |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd apps/backend && npx jest athos-defaults --no-coverage` |
| **Full suite command** | `cd apps/backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 segundos (subset athos-defaults) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend && npx jest athos-defaults --no-coverage`
- **After every plan wave:** Run `cd apps/backend && npx jest --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-XX | 01 | 1 | DEFD-01 | — | Retorna o valor mais frequente de cada campo configurável | unit (função pura) | `npx jest athos-defaults.util.test --no-coverage` | ❌ W0 | ⬜ pending |
| 37-01-XX | 01 | 1 | DEFD-02 | — | Ignora null e string vazia na contagem da moda | unit (função pura) | `npx jest athos-defaults.util.test --no-coverage` | ❌ W0 | ⬜ pending |
| 37-01-XX | 01 | 1 | DEFD-03 | — | Segunda chamada não dispara nova query ao banco (cache TTL 24h) | unit (serviço com mock pg) | `npx jest athos-defaults.service.test --no-coverage` | ❌ W0 | ⬜ pending |
| 37-01-XX | 01 | 1 | DEFD-04a | — | Campo fiscal sem amostra: campo omitido do mapa, sem exceção | unit (função pura) | `npx jest athos-defaults.util.test --no-coverage` | ❌ W0 | ⬜ pending |
| 37-01-XX | 01 | 1 | DEFD-04b | — | Campo de estoque sem amostra: retorna `false`, sem exceção | unit (função pura) | `npx jest athos-defaults.util.test --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finais (37-01-NN) serão atribuídos pelo planner no PLAN.md.*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts` — testes da função pura `computeModeFromRows` / `computeDefaults` (DEFD-01, DEFD-02, DEFD-04a, DEFD-04b)
- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts` — testes do serviço singleton com mock do `pg` Pool (DEFD-03 cache)
- [ ] Jest + ts-jest já instalados — sem instalação de framework necessária

*A função pura e o serviço são criados na implementação; os arquivos de teste acima cobrem todos os requisitos da fase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tipo real retornado pelo `pg` para `origem`/`origemnfe` em produção | DEFD-01 | Depende do schema real do banco Athos em produção (open question da pesquisa) | Rodar o serviço contra o banco Athos real e inspecionar o mapa de defaults retornado para os campos `origem`/`origemnfe` |

*Demais comportamentos da fase têm verificação automatizada via Jest.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
