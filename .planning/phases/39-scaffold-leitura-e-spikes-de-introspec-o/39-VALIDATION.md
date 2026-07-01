---
phase: 39
slug: scaffold-leitura-e-spikes-de-introspec-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest ^30.3.0 + ts-jest ^29.4.9 |
| **Config file** | apps/backend/jest.config (existente) |
| **Quick run command** | `cd apps/backend && npx jest athos-produto-composto` |
| **Full suite command** | `cd apps/backend && npx jest athos` |
| **Estimated runtime** | ~60 s (suíte athos completa) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest athos-produto-composto` (+ `athos-produto` para o refactor do util)
- **After every plan wave:** Run `npx jest athos`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-XX | TBD | 0 | COMP-07 | — | Spikes documentados (resultados do usuário colados no PLAN/SUMMARY) | manual | n/a (introspecção no 192.168.3.198) | ❌ W0 | ⬜ pending |
| 39-XX | TBD | 1 | COMP-08 | — | validarFkExiste extraído sem mudança de comportamento | unit | `npx jest athos-produto` | ✅ | ⬜ pending |
| 39-XX | TBD | 1 | COMP-01 | — | GET lista enriquecida; 404 master ausente; [] sem componentes | unit | `npx jest athos-produto-composto` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs e waves finais definidos pelo planner.*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/integrations/athos/athos-produto-composto.service.test.ts` — stubs para COMP-01 (GET)
- [ ] Resultados dos 3 spikes COMP-07 colados no PLAN.md/SUMMARY (verificação manual, não automatizável — DB de referência fora da rede do CI)

*Infra de teste (jest + pg mock) já existe em `athos-produto.service.test.ts` — reusar o padrão.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 spikes de introspecção | COMP-07 | DB de referência `192.168.3.198` fora da rede do executor/CI | Usuário roda as 3 queries do RESEARCH.md no `192.168.3.198` e cola os resultados no PLAN/SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
