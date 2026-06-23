---
phase: 36
plan: "01"
subsystem: frontend
tags: [white-label, theming, env-vars, css-custom-properties, next.js]
dependency_graph:
  requires: []
  provides:
    - apps/frontend/src/lib/empresa.ts (EMPRESA_NOME, EMPRESA_CNPJ, EMPRESA_ENDERECO, EMPRESA_EMAIL, EMPRESA_LOGO_URL, EMPRESA_COR_PRIMARIA)
    - apps/frontend/src/app/layout.tsx (generateMetadata, --cor-primaria CSS var injection)
    - apps/frontend/src/app/globals.css (theming via var(--cor-primaria))
    - apps/frontend/.env.example (documentação das 6 vars NEXT_PUBLIC_EMPRESA_*)
  affects:
    - Todos os Client Components que importam empresa.ts (plans 36-02..36-07)
    - Todos os elementos visuais que usam os 5 seletores CSS afetados
tech_stack:
  added: []
  patterns:
    - CSS custom properties via :root no layout.tsx Server Component
    - Módulo de constantes puras TypeScript com nullish coalescing (??)
    - generateMetadata() assíncrono no App Router Next.js
key_files:
  created:
    - apps/frontend/src/lib/empresa.ts
    - apps/frontend/.env.example
  modified:
    - apps/frontend/src/app/layout.tsx
    - apps/frontend/src/app/globals.css
decisions:
  - "Módulo empresa.ts usa nullish coalescing (??) com fallbacks concretos — zero risco de undefined chegando ao JSX"
  - "layout.tsx lê process.env diretamente (Server Component) — não importa de empresa.ts para evitar dependência circular"
  - "CSS custom property --cor-primaria injetada no <head> via <style> inline — Server Component lê env var antes do HTML ser enviado ao cliente"
  - "#0d6efd substituído por var(--cor-primaria) nos 5 seletores do globals.css — .btn-accent:hover (#084298) e .orcamento-status-pronto_para_entrega (#0d47a1) preservados intencionalmente"
metrics:
  duration: "8min"
  completed: "2026-06-22"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
status: complete
---

# Phase 36 Plan 01: Módulo Empresa + Theming CSS Summary

Módulo central empresa.ts com 6 exports NEXT_PUBLIC_EMPRESA_* criado; layout.tsx migrado para generateMetadata() dinâmico com injeção de --cor-primaria; globals.css com 5 substituições de #0d6efd por var(--cor-primaria); .env.example documentando todas as vars com valores BomCusto como defaults.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar módulo empresa.ts | a29c900 | apps/frontend/src/lib/empresa.ts (novo) |
| 2 | Modificar layout.tsx, globals.css e criar .env.example | a4059f0 | layout.tsx, globals.css, .env.example (novo) |

## Verification Results

| Check | Result |
|-------|--------|
| `#0d6efd` em globals.css | 0 ocorrências (OK) |
| `var(--cor-primaria)` em globals.css | 5 ocorrências (OK) |
| `NEXT_PUBLIC_EMPRESA_*` em empresa.ts | 6 exports (OK) |
| `generateMetadata` em layout.tsx | 1 ocorrência (OK) |
| `BomCusto` em layout.tsx | 0 ocorrências (OK) |
| `export const metadata` em layout.tsx | 0 ocorrências (OK) |

## Artifacts Produced

| Symbol | File | Tipo |
|--------|------|------|
| EMPRESA_NOME | apps/frontend/src/lib/empresa.ts | export const string |
| EMPRESA_CNPJ | apps/frontend/src/lib/empresa.ts | export const string |
| EMPRESA_ENDERECO | apps/frontend/src/lib/empresa.ts | export const string |
| EMPRESA_EMAIL | apps/frontend/src/lib/empresa.ts | export const string |
| EMPRESA_LOGO_URL | apps/frontend/src/lib/empresa.ts | export const string |
| EMPRESA_COR_PRIMARIA | apps/frontend/src/lib/empresa.ts | export const string |
| generateMetadata | apps/frontend/src/app/layout.tsx | export async function |
| RootLayout | apps/frontend/src/app/layout.tsx | export default function (modificado) |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Threat Flags

Nenhum novo endpoint, rota ou superfície de segurança introduzida. Injeção CSS via style inline e NEXT_PUBLIC_* baked at build estão dentro do threat model documentado no plano (T-36-01, T-36-02: ambos `accept`).

## Self-Check: PASSED

- apps/frontend/src/lib/empresa.ts: FOUND
- apps/frontend/src/app/layout.tsx: FOUND (modificado)
- apps/frontend/src/app/globals.css: FOUND (modificado)
- apps/frontend/.env.example: FOUND (criado)
- Commit a29c900: FOUND
- Commit a4059f0: FOUND
