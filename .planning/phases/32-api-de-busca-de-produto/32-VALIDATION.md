---
phase: 32
slug: api-de-busca-de-produto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd apps/backend && npx jest --testPathPattern="athos-produto" --passWithNoTests` |
| **Full suite command** | `cd apps/backend && npx jest` |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend && npx jest --testPathPattern="athos-produto" --passWithNoTests`
- **After every plan wave:** Run `cd apps/backend && npx jest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | BPROD-01 | T-32-01 | Queries parametrizadas (sem interpolação de string) | unit | `cd apps/backend && npx jest --testPathPattern="athos-produto" --testNamePattern="descricao"` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | BPROD-02 | T-32-01 | Match exato de código de barras (sem ILIKE) | unit | `cd apps/backend && npx jest --testPathPattern="athos-produto" --testNamePattern="codigobarra"` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | BPROD-03 | — | N/A | unit | `cd apps/backend && npx jest --testPathPattern="athos-produto" --testNamePattern="departamento"` | ❌ W0 | ⬜ pending |
| 32-01-04 | 01 | 1 | BPROD-04 | T-32-02 | imagemproduto retorna null (não bytea) | unit | `cd apps/backend && npx jest --testPathPattern="athos-produto" --testNamePattern="paginacao"` | ❌ W0 | ⬜ pending |
| 32-01-05 | 01 | 1 | BPROD-05 | — | 404 para produto inexistente | unit | `cd apps/backend && npx jest --testPathPattern="athos-produto" --testNamePattern="idproduto"` | ❌ W0 | ⬜ pending |
| 32-01-06 | 01 | 1 | SPROD-02 | — | 401 sem x-internal-api-key | unit | Coberto por testes existentes do InternalAuthGuard | ✅ existente | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts` — stubs para BPROD-01 a BPROD-05
- [ ] Mock do `AthosService` com métodos: `buscarProdutos`, `buscarProdutoPorId`, `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Consulta real ao banco Athos de produção retorna 28k+ produtos paginados | BPROD-04 | Banco de produção não disponível em CI | `curl -H "x-internal-api-key: $KEY" http://localhost:3333/athos/produtos?page=1&take=10` e verificar `total >= 28836` |
| Lookups retornam dados reais (departamentos/grupos/marcas) | BPROD-03 | Banco de produção não disponível em CI | `curl -H "x-internal-api-key: $KEY" http://localhost:3333/athos/produtos/lookup/departamentos` e verificar array com `{id, nome}` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
