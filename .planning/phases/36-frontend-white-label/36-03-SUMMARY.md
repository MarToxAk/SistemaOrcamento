---
phase: 36-frontend-white-label
plan: "03"
subsystem: frontend
tags: [white-label, dehardcode, public-pages, empresa-ts]
status: complete

dependency_graph:
  requires:
    - 36-01  # empresa.ts criado
  provides:
    - FRONT-03  # páginas públicas approve e status white-label
  affects:
    - apps/frontend/src/app/orcamento/[id]/approve/page.tsx
    - apps/frontend/src/app/orcamento/[id]/status/page.tsx

tech_stack:
  added: []
  patterns:
    - "Import de módulo empresa.ts em Client Component público"
    - "Padrão simplificado páginas públicas: somente logo + nome (sem CNPJ/endereço/email)"

key_files:
  modified:
    - apps/frontend/src/app/orcamento/[id]/approve/page.tsx
    - apps/frontend/src/app/orcamento/[id]/status/page.tsx

decisions:
  - "Padrão simplificado para páginas públicas: somente EMPRESA_LOGO_URL e EMPRESA_NOME — sem CNPJ, endereço ou email"
  - "Telefones hardcoded mantidos como texto estático — fora do escopo FRONT-03 (sem EMPRESA_TELEFONE no módulo)"

metrics:
  duration: "6min"
  completed_date: "2026-06-22"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
---

# Phase 36 Plan 03: Dehardcode Páginas Públicas (approve + status) Summary

Dehardcode das 2 páginas públicas de orçamento: logo e nome da empresa substituídos por imports do módulo empresa.ts, aplicando padrão simplificado (somente logo + nome).

## What Was Built

Adicionado import `{ EMPRESA_NOME, EMPRESA_LOGO_URL }` de `@/lib/empresa` em ambas as páginas públicas. Substituídas as strings hardcoded `"Bom Custo Papelaria & Gráfica Rápida"` e `/media/logo-primary.png` pelos tokens de env var. Padrão simplificado aplicado: páginas públicas exibem somente logo + nome (sem CNPJ, endereço ou email).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Dehardcode header das 2 páginas públicas | a2a8c23 | approve/page.tsx, status/page.tsx |

## Verification Results

```
grep -rn "logo-primary.png|Bom Custo Papelaria|BomCusto" approve/page.tsx status/page.tsx
→ 0 resultados (PASS)

grep -rn 'from.*@/lib/empresa' approve/page.tsx status/page.tsx
→ 2 linhas (PASS)

grep -rn 'EMPRESA_LOGO_URL' approve/page.tsx status/page.tsx
→ 2 linhas src={EMPRESA_LOGO_URL} (PASS)

grep -rn '{EMPRESA_NOME}' approve/page.tsx status/page.tsx
→ 4 linhas: 2x alt={EMPRESA_NOME} + 2x texto div (PASS)
```

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None — os valores são lidos de NEXT_PUBLIC_EMPRESA_* com fallback definido no módulo empresa.ts. Nenhum stub ou placeholder introduzido.

## Threat Flags

None — T-36-05 e T-36-06 documentados no plano: páginas já eram públicas antes da mudança; NEXT_PUBLIC_* são baked no bundle sem diferença de exposição vs texto hardcoded anterior.

## Self-Check: PASSED

- FOUND: apps/frontend/src/app/orcamento/[id]/approve/page.tsx
- FOUND: apps/frontend/src/app/orcamento/[id]/status/page.tsx
- FOUND: commit a2a8c23 — feat(36-03): dehardcode header das 2 páginas públicas de orçamento
