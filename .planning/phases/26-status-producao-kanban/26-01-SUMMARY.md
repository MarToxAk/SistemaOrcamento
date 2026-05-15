---
phase: 26-status-producao-kanban
plan: 01
subsystem: ui
tags: [frontend, kanban, bootstrap, react, nextjs]

requires:
  - phase: quick/260515-001-remover-edicao-status-pagina-publica
    provides: Remoção do botão avançar-status — decisão mantida no redesign
  - phase: quick/260514-003-status-page-realtime-dashboard
    provides: SSE, banner persistente, badge pago no caixa — base do page.tsx

provides:
  - Layout kanban 3-colunas substituindo tabela plana em /status
  - Bootstrap nav-tabs para mobile (uma coluna visível por vez)
  - Cabeçalhos de coluna coloridos por status com contagem
  - CSS kanban (kanban-board, kanban-column, kanban-card-placeholder)
  - Animação card-highlighted com box-shadow migrada de row-highlighted

affects:
  - 26-02 (cards reais — expandirá kanban-card-placeholder)
  - 26-03 (filtro de carimbo — usará visibleQuotes filtrado)

tech-stack:
  added: []
  patterns:
    - "Bootstrap responsive utilities: d-none d-md-flex (desktop) / d-md-none (mobile)"
    - "Bootstrap nav-tabs controlados por estado React (activeMobileTab)"
    - "PRODUCTION_STATUSES.map para gerar colunas kanban de forma declarativa"
    - "Animação CSS via @keyframes sobre className condicional (card-highlighted)"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/status/page.tsx

key-decisions:
  - "Kanban 3-colunas com PRODUCTION_STATUSES.map — coluna por statusKey, cards filtrados em tempo de render"
  - "Mobile usa Bootstrap nav-tabs (activeMobileTab state) — não scroll horizontal nem accordion"
  - "Cards são placeholders #numero no Plan 01 — Plan 02 expandirá para card completo"
  - "card-highlighted usa box-shadow em vez de background-color para ficar correto sobre card branco"
  - "CSS inline via <style> preservado — sem Tailwind ou CSS modules (padrão existente)"

patterns-established:
  - "Kanban: PRODUCTION_STATUSES.map + visibleQuotes.filter(q => q.statusKey === statusKey)"
  - "Mobile tabs: activeMobileTab state + PRODUCTION_STATUSES.map para ul.nav.nav-tabs"

requirements-completed: []

duration: 4min
completed: 2026-05-15
---

# Phase 26 Plan 01: Layout Kanban Base — Status Produção

**Tabela de produção substituída por kanban Bootstrap 3-colunas (desktop) + nav-tabs (mobile) com cabeçalhos coloridos por status e placeholder de cards**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-15T15:47:56Z
- **Completed:** 2026-05-15T15:51:38Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Tabela `production-table` removida completamente (zero `<table>` na página)
- Kanban 3-colunas renderiza no desktop com cabeçalho colorido (verde/azul/laranja) e contagem de cards por coluna
- Mobile renderiza Bootstrap nav-tabs com contagem; troca de aba atualiza a coluna visível
- Animação de highlight migrada de `.row-highlighted` (background-color) para `.card-highlighted` (box-shadow)
- Build Next.js passa sem erros; TypeScript compila sem erros novos

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Substituir tabela por kanban 3-colunas (desktop)** - `492f1e7` (feat)
2. **Task 2: Adicionar Bootstrap nav-tabs para mobile** - `a408b15` (feat)
3. **Task 3: Atualizar CSS inline para kanban + animacao card-highlighted** - `116d53f` (feat)

## Files Created/Modified

- `apps/frontend/src/app/status/page.tsx` - Tabela removida; kanban 3-colunas desktop + nav-tabs mobile; CSS kanban adicionado; animação card-highlighted atualizada

## Decisions Made

- Cards são placeholder simples `#numero` — Plan 02 expandirá para card completo com cliente, badge, valor, telefone e ações (D-05 a D-11)
- CSS da tabela (`production-table th`) removido na Task 1 junto com o JSX (acceptance criteria exigia `grep -c "production-table" = 0`)
- `.row-highlighted` renomeado para `.card-highlighted` na Task 1 (JSX) e atualizado na Task 3 (CSS com box-shadow)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removidas regras CSS de production-table antecipadamente na Task 1**
- **Found during:** Task 1 (Substituir tabela por kanban)
- **Issue:** Acceptance criteria da Task 1 exigia `grep -c "production-table" = 0`, mas o plano dizia remover o CSS apenas na Task 3. Com 2 ocorrências CSS restantes, o critério teria falhado.
- **Fix:** Removidas as regras `.production-table th` do bloco `<style>` dentro da Task 1.
- **Files modified:** apps/frontend/src/app/status/page.tsx
- **Verification:** grep retorna 0 ocorrências após a edição
- **Committed in:** 492f1e7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — conflito entre acceptance criteria da Task 1 e ação planejada para Task 3)
**Impact on plan:** Sem impacto no resultado final. CSS obsoleto removido na Task 1 em vez da Task 3 — Task 3 adicionou novos estilos kanban conforme planejado.

## Known Stubs

| Stub | File | Line (aprox.) | Reason |
|------|------|----------------|--------|
| `kanban-card-placeholder` mostrando apenas `#numero` | `apps/frontend/src/app/status/page.tsx` | ~310, ~338 | Intencional — Plan 02 expandirá para card completo com cliente, badge, valor, telefone, ações |

Estes stubs não impedem o objetivo do Plan 01 (estrutura visual kanban). Plan 02 substituirá `kanban-card-placeholder` por um componente de card completo.

## Issues Encountered

None - TypeScript compilou sem erros; build Next.js passou em todas as etapas.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Estrutura kanban base pronta para Plan 02 (cards reais com conteúdo completo)
- `kanban-card-placeholder` é o ponto de extensão — Plan 02 substitui por componente rico
- `visibleQuotes` permanece como `= quotes` — Plan 03 adicionará filtro de carimbo funcional
- Estado morto (`selectedStatusFilter`, `onlyWithBadge`, `selectedBadgeFilter`) ainda presente — Plan 03 limpará conforme D-15

---

*Phase: 26-status-producao-kanban*
*Completed: 2026-05-15*
