---
phase: 36
slug: frontend-white-label
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Nenhum detectado — verificação visual/manual no browser |
| **Config file** | none — fase não requer test framework |
| **Quick run command** | N/A |
| **Full suite command** | N/A |
| **Estimated runtime** | ~5 min (manual UAT) |

---

## Sampling Rate

- **After every task commit:** Verificar build: `pnpm --filter frontend build` (0 erros TypeScript)
- **After every plan wave:** Build completo + inspeção visual das páginas modificadas
- **Before `/gsd-verify-work`:** UAT manual completo nas 7 páginas com `.env.local` customizado
- **Max feedback latency:** 5 min (build) / 15 min (UAT visual completo)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| globals.css | 36-01 | 1 | FRONT-04 | build | `pnpm --filter frontend build` | ❌ | pending |
| layout.tsx | 36-01 | 1 | FRONT-01, FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| orcamento/page.tsx | 36-02 | 1 | FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| orcamento/novo/page.tsx | 36-02 | 1 | FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| orcamento/[id]/page.tsx | 36-02 | 1 | FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| status/page.tsx | 36-02 | 1 | FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| contas-receber/page.tsx | 36-02 | 1 | FRONT-02 | build | `pnpm --filter frontend build` | ❌ | pending |
| orcamento/[id]/approve/page.tsx | 36-03 | 2 | FRONT-03 | build | `pnpm --filter frontend build` | ❌ | pending |
| orcamento/[id]/status/page.tsx | 36-03 | 2 | FRONT-03 | build | `pnpm --filter frontend build` | ❌ | pending |

---

## Wave 0 Gaps

Nenhum gap de test framework — fase é 100% visual/browser-only. Não requer instalação de test runner.

## UAT Manual Checklist

Execute com `NEXT_PUBLIC_EMPRESA_NOME="Outra Empresa"` e `NEXT_PUBLIC_EMPRESA_LOGO_URL="https://example.com/logo.png"` no `.env.local`:

- [ ] Título da aba do navegador exibe "Outra Empresa" nas 7 páginas
- [ ] Header das 5 páginas internas exibe "Outra Empresa" (não "Bom Custo")
- [ ] Header das 2 páginas públicas exibe logo e nome da empresa
- [ ] `grep -r "Bom Custo" apps/frontend/app/` retorna 0 resultados
- [ ] `grep -r "logo-primary" apps/frontend/app/` retorna 0 resultados
- [ ] `EMPRESA_COR_PRIMARIA=#e63946` — botões e bordas exibem vermelho
