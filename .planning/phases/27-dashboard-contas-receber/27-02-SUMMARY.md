---
phase: 27-dashboard-contas-receber
plan: 02
subsystem: frontend
tags: [nextjs, react, bootstrap, contas-receber, dashboard]

# Dependency graph
requires:
  - phase: 27-dashboard-contas-receber
    plan: 01
    provides: GET /api/athos/contas-receber/dashboard + GET /api/athos/contas-receber/cliente/:id/titulos
provides:
  - "Página /contas-receber: Top Cards + Grid de Cards + Accordion de títulos (lazy)"
  - "Next.js API Routes: /api/athos/contas-receber/dashboard e /api/athos/contas-receber/cliente/[idcliente]/titulos"
  - "Link de navegação /contas-receber no header de /status"
affects:
  - apps/frontend/src/app/status/page.tsx

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js API Route como proxy server-side para endpoints Athos (adiciona x-api-token via ATHOS_API_TOKEN server-side)"
    - "Accordion lazy: titulosMap[idcliente] = 'loading' | 'error' | TituloReceber[] — fetch only on first expand"
    - "getBadgeClass/getBadgeLabel por maior_atraso_dias: verde(0) / amarelo(1-30) / laranja(31-90) / vermelho(>90)"
    - "Barra de progresso de crédito: pct = Math.min(100, (total_devido/limitecredito)*100) — oculta quando limitecredito=0"

key-files:
  created:
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts
    - apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts
  modified:
    - apps/frontend/src/app/status/page.tsx

key-decisions:
  - "Next.js API Routes usados como proxy (não rewrites em next.config.mjs) — padrão existente no codebase (/api/athos/clientes usa a mesma abordagem)"
  - "x-api-token adicionado server-side no route handler (ATHOS_API_TOKEN) — nunca exposto no bundle client-side (T-27F-03)"
  - "telefone_completo.replace(/\\D/g, '') sanitiza número antes de montar URL wa.me — mitiga T-27F-02"
  - "Accordion fecha ao clicar no mesmo card (toggle); cache em titulosMap evita refetch ao reabrir"

# Metrics
duration: 25min
completed: 2026-05-21
---

# Phase 27 Plan 02: Dashboard Contas a Receber — Frontend Summary

**Página /contas-receber com Top Cards de totais BRL, Grid de Cards por cliente com badge de criticidade e barra de progresso de limite, e Accordion lazy de títulos individuais via fetch ao expandir**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-21T00:18:00Z
- **Completed:** 2026-05-21T00:43:00Z
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments

- Criados dois Next.js API Route handlers server-side (`/api/athos/contas-receber/dashboard` e `/api/athos/contas-receber/cliente/[idcliente]/titulos`) que fazem proxy para o backend NestJS adicionando `x-api-token` via `ATHOS_API_TOKEN` (padrão igual ao `/api/athos/clientes/route.ts` já existente)
- Criada página `/contas-receber/page.tsx` como Client Component com: 3 tipos TypeScript (`DashboardSummary`, `ClienteDevedor`, `TituloReceber`), Top Cards formatados em BRL, Grid de Cards com badge de criticidade por `maior_atraso_dias`, barra de progresso de limite de crédito (oculta quando `limitecredito=0`), botão WhatsApp (oculto quando `telefone_completo` nulo), Accordion com fetch lazy ao expandir
- Adicionado link "Contas a Receber" (`btn-outline-warning + bi-receipt`) no header de `/status/page.tsx` entre os botões "Atualizar" e "Novo Orçamento"
- Build TypeScript sem erros (`npx tsc --noEmit` retornou exit 0)

## Task Commits

1. **Task 1: Proxy routes Next.js para contas-receber + link no header /status** — `e249e78` (feat)
2. **Task 2: Criar página /contas-receber com Top Cards, Grid e Accordion de títulos** — `55661ef` (feat)

## Files Created/Modified

- `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` — criado: GET proxy com x-api-token server-side
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts` — criado: GET proxy com validação numérica de idcliente
- `apps/frontend/src/app/contas-receber/page.tsx` — criado: 372 linhas, Client Component completo com 3 seções
- `apps/frontend/src/app/status/page.tsx` — modificado: link /contas-receber inserido no header action div

## Decisions Made

- **Next.js API Routes como proxy (não rewrites):** O codebase já usa `/api/athos/clientes/route.ts` com `backendFetch` e `x-api-token`. Seguido o mesmo padrão — `next.config.mjs` não foi modificado.
- **Token adicionado server-side:** `ATHOS_API_TOKEN` lido em `process.env` dentro do Route Handler (server-side); nunca enviado ao cliente — mitiga T-27F-03 conforme threat model.
- **Sanitização de telefone:** `telefone_completo.replace(/\D/g, "")` aplicada antes de montar URL `wa.me/55...` — mitiga T-27F-02.
- **Cache de títulos em `titulosMap`:** Accordion não faz refetch ao reabrir o mesmo cliente; estado `"loading" | "error" | TituloReceber[]` evita duplicidade de requests.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Criados Next.js API Route handlers para o proxy**

- **Found during:** Task 1 (análise do padrão de chamadas no codebase)
- **Issue:** O plano descrevia `fetch("/api/athos/contas-receber/dashboard")` na página client-side e assumia que `next.config.mjs` precisaria de rewrites. Ao analisar o codebase, foi identificado que as chamadas `/api/athos/*` são interceptadas por Next.js API Routes server-side (não por rewrites) — padrão documentado em `/api/athos/clientes/route.ts`. Sem criar os route handlers, as chamadas 404 no frontend.
- **Fix:** Criados dois Route Handlers server-side que fazem proxy para o NestJS com autenticação — arquitetura idêntica ao padrão existente.
- **Files modified:** `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts`, `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts`
- **Commits:** `e249e78`

## Threat Surface Scan

Nenhuma superfície nova não coberta pelo threat model do plano. Os Route Handlers criados seguem o mesmo padrão de `/api/athos/clientes/route.ts` — autenticação server-side, sem exposição de token no bundle client-side.

## Known Stubs

Nenhum — todos os dados são wire-a partir dos endpoints do backend (Plano 01). Sem hardcoded values, placeholders ou TODO no código de produção.

## Self-Check: PASSED

- `apps/frontend/src/app/contas-receber/page.tsx` — EXISTS
- `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` — EXISTS
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts` — EXISTS
- commit `e249e78` — EXISTS (`git log`)
- commit `55661ef` — EXISTS (`git log`)
- `href="/contas-receber"` em `status/page.tsx` — PRESENT (linha 319)
- `npx tsc --noEmit` — PASSED (exit 0)

---
*Phase: 27-dashboard-contas-receber*
*Completed: 2026-05-21*
