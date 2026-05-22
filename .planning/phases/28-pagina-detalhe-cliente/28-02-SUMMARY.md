---
phase: 28-pagina-detalhe-cliente
plan: 02
subsystem: frontend
tags: [nextjs, react, typescript, contas-receber, client-component, route-handler]

# Dependency graph
requires:
  - phase: 28-01
    provides: "GET /athos/contas-receber/cliente/:idcliente/dados (backend pronto)"
  - phase: 27-contas-receber-dashboard
    provides: "GET /api/athos/contas-receber/cliente/[idcliente]/titulos (já existente)"
provides:
  - "GET /api/athos/contas-receber/cliente/[idcliente]/route.ts — proxy para dados cadastrais"
  - "/contas-receber/[idcliente]/page.tsx — página de detalhe com tabela de títulos e barra de ações"
  - "/contas-receber/page.tsx simplificada sem accordion"
affects:
  - 29-boleto-consolidado
  - 30-nfse-titulos

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React.use(params) para resolver params Promise em Client Component (Next.js 15)"
    - "Set<number> para selectedIds com handleToggle/handleToggleAll imutáveis"
    - "useRef + useEffect para propriedade indeterminate no checkbox thead"
    - "Barra de ações sticky bottom condicional — removida do DOM quando selectedIds.size === 0"

key-files:
  created:
    - apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
  modified:
    - apps/frontend/src/app/contas-receber/page.tsx

key-decisions:
  - "React.use(params) obrigatório em Client Components Next.js 15 (não await — hooks não aceitam async)"
  - "selectedIds como Set<number> imutável — novo Set criado a cada toggle para triggerar re-render"
  - "formatDate removida de /contas-receber/page.tsx (ficou órfã após remoção do accordion)"
  - "Barra de ações sticky bottom (não modal) — mantém tabela visível enquanto seleciona"

# Metrics
duration: 25min
completed: 2026-05-22
---

# Phase 28 Plan 02: Frontend Página de Detalhe do Cliente Summary

**Navegação /contas-receber → /contas-receber/[idcliente] com dados cadastrais PF/PJ, tabela de títulos AVC+VEN com checkboxes e barra de ações sticky para Gerar Boleto / Emitir NFS-e (Phase 29/30)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-22T16:15:00Z
- **Completed:** 2026-05-22T16:40:00Z
- **Tasks:** 2
- **Files modified/created:** 3

## Accomplishments

- `/contas-receber/page.tsx` simplificada: removidos `titulosMap`, `expandedId`, `handleToggleCliente`, interface `TituloReceber` e accordion inline; substituído por link `<a href="/contas-receber/[idcliente]">Ver Detalhe</a>`
- `GET /api/athos/contas-receber/cliente/[idcliente]/route.ts` criado como proxy server-side para `/athos/contas-receber/cliente/:id/dados` com `await params` (Next.js 15), validação `Number.isFinite`, `x-api-token` via `INTERNAL_API_KEY`
- `/contas-receber/[idcliente]/page.tsx` criado como Client Component com:
  - Dados cadastrais (nome, telefone, e-mail, limite de crédito, badge bloqueado)
  - Tabela de títulos com checkbox por linha, vencimento colorido (vermelho=VEN), badges AVC/VEN
  - Checkbox "Selecionar todos" com estado `indeterminate` via `useRef`
  - Rodapé de tabela com contagem e total em BRL em tempo real
  - Barra de ações sticky (position: sticky; bottom: 0) visível **somente** quando `selectedIds.size > 0`
  - Botões "Gerar Boleto" e "Emitir NFS-e" com `onClick` vazio (TODO Phase 29/30)
  - Breadcrumb "← Contas a Receber" para `/contas-receber`

## Task Commits

1. **Task 1: remover accordion e adicionar Ver Detalhe** - `0c16447` (feat)
2. **Task 2: proxy route handler + página de detalhe** - `32e156c` (feat)

## Files Created/Modified

- `apps/frontend/src/app/contas-receber/page.tsx` - Removido accordion inline, titulosMap, expandedId, handleToggleCliente; adicionado link "Ver Detalhe"
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` - Proxy para dados cadastrais com await params e x-api-token
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` - Client Component completo com dados do cliente, tabela de títulos, checkboxes e barra de ações

## Decisions Made

- `React.use(params)` usado em vez de `await params` no Client Component — hooks React não aceitam async/await diretamente em componentes client
- `formatDate` removida de `page.tsx` (ficou sem uso após remoção do accordion — TypeScript verificou)
- Barra de ações como `sticky bottom` em vez de modal flutuante — mantém a tabela visível enquanto o operador decide a ação

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removida função formatDate órfã de /contas-receber/page.tsx**
- **Found during:** Task 1 — TypeScript check pós-edição
- **Issue:** `formatDate` estava declarada mas não usada após remoção do accordion (que era o único consumidor)
- **Fix:** Removida a definição da função para evitar warning de TypeScript
- **Files modified:** `apps/frontend/src/app/contas-receber/page.tsx`
- **Commit:** `0c16447`

## Issues Encountered

Nenhum.

## Known Stubs

- `onClick` dos botões "Gerar Boleto" e "Emitir NFS-e" em `/contas-receber/[idcliente]/page.tsx` são vazios (com `TODO: Phase 29` e `TODO: Phase 30`). Estes são **intencionais** per D-15 — Phase 29 e Phase 30 implementam a lógica real.

## Threat Flags

Nenhuma nova superfície além do documentado no threat model do plano (T-28-05 e T-28-08 mitigados: `await params` + `Number.isFinite` no route handler, token `INTERNAL_API_KEY` adicionado server-side).

## Next Phase Readiness

- `/contas-receber/[idcliente]` pronta para receber implementação do botão "Gerar Boleto" na Phase 29
- `/contas-receber/[idcliente]` pronta para receber implementação do botão "Emitir NFS-e" na Phase 30
- `selectedIds: Set<number>` com `idcontareceber` dos títulos selecionados — interface de dados para Phase 29 e 30

## Self-Check

- [x] `apps/frontend/src/app/contas-receber/page.tsx` — 0 ocorrências de `titulosMap|expandedId|handleToggleCliente`; 1 ocorrência de "Ver Detalhe"
- [x] `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` — 1 ocorrência de `await params`; referencia `/dados`
- [x] `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — 9 ocorrências de `selectedIds`; 1 de `TODO: Phase 29`; 1 de `TODO: Phase 30`; 1 de `Contas a Receber` (breadcrumb)
- [x] `npx tsc --noEmit` sem erros
- [x] `npm run build` sem erros — rotas `ƒ /api/athos/contas-receber/cliente/[idcliente]` e `ƒ /contas-receber/[idcliente]` aparecem no output do build
- [x] Commits `0c16447` e `32e156c` existem no histórico

## Self-Check: PASSED

---
*Phase: 28-pagina-detalhe-cliente*
*Completed: 2026-05-22*
