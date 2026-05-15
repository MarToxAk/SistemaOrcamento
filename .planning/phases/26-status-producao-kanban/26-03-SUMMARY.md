---
phase: 26-status-producao-kanban
plan: 03
subsystem: ui
tags: [frontend, filter, kanban, badge, cleanup, nextjs, bootstrap]

requires:
  - phase: 26-status-producao-kanban/26-02
    provides: renderQuoteCard com cards completos no kanban

provides:
  - Barra de filtro por tipo de pagamento (Todos | Pago Caixa | PIX | Aguardando) acima do kanban
  - visibleQuotes derivado de badgeFilter — filtra cards em todas as colunas e tabs mobile
  - Dead state removido: selectedStatusFilter, selectedBadgeFilter, onlyWithBadge eliminados
  - Filtro reseta para Todos a cada carregamento (D-14)
  - CSS responsivo para badge-filter-bar com layout 50%/50% em mobile

affects:
  - Kanban completo (fase 26 encerrada)

tech-stack:
  added: []
  patterns:
    - "badgeFilter state: 'TODOS' | 'PAGO_CAIXA' | 'PIX' | 'AGUARDANDO' — default TODOS sem persistencia"
    - "visibleQuotes = badgeFilter === 'TODOS' ? quotes : quotes.filter(getBadgeType match)"
    - "Contagens nos botoes de filtro usam quotes (total), nao visibleQuotes — mostra potencial de cada opcao"
    - "aria-pressed={active} para acessibilidade semantica dos botoes de filtro"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/status/page.tsx

key-decisions:
  - "Contagem nos botoes do filtro usa quotes inteiro (nao visibleQuotes) — cada botao mostra quantos cards entrariam se selecionado (D-12)"
  - "Filtro nao persiste em localStorage/sessionStorage (D-14)"
  - "visibleQuotes derivado via const (nao state) — recalcula sincronamente em cada render sem useEffect extra"
  - "Badge filter bar inserida fora do bloco loading/empty — sempre visivel, mesmo durante loading inicial"

requirements-completed: []

duration: 15min
completed: 2026-05-15
---

# Phase 26 Plan 03: Filtro de Carimbo e Limpeza de Dead State — Status Producao Kanban

**Barra de filtro Todos/Pago Caixa/PIX/Aguardando adicionada acima do kanban, conectada a visibleQuotes; dead states (selectedStatusFilter, selectedBadgeFilter, onlyWithBadge) removidos; build Next.js e TypeScript passam sem erros.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-15T16:25:00Z
- **Completed:** 2026-05-15T16:40:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- `badgeFilter` state adicionado com tipo discriminado `"TODOS" | "PAGO_CAIXA" | "PIX" | "AGUARDANDO"`
- `visibleQuotes` substituido de `quotes` puro para expressao filtrada por `getBadgeType(q)` — filtra automaticamente desktop e mobile (ambos usam `visibleQuotes`)
- 3 dead states removidos: `selectedStatusFilter`/`setSelectedStatusFilter`, `selectedBadgeFilter`/`setSelectedBadgeFilter`, `onlyWithBadge`/`setOnlyWithBadge`
- Barra de filtro renderizada com 4 botoes Bootstrap (`btn-sm`) acima do kanban, cada um com icone `bi-*`, label textual e contador de cards
- Contadores nos botoes refletem o total do universo completo (`quotes`) — cada botao mostra quantos cards entrariam se clicado
- Botao ativo usa `btn-primary`; inativos usam `btn-outline-secondary`; `aria-pressed` para acessibilidade
- CSS `.badge-filter-bar` com `inline-flex`, `align-items: center` e media query mobile (`flex: 1 1 calc(50% - 0.5rem)`)
- Verificacao CLEAN: nenhuma referencia remanescente a `production-table`, `row-highlighted`, `kanban-card-placeholder`, `selectedStatusFilter`, `selectedBadgeFilter`, `onlyWithBadge`
- TypeScript `--noEmit` sem erros; Next.js build completo com exit code 0

## Task Commits

1. **Task 1: Adicionar state badgeFilter + derivar visibleQuotes + remover dead state** - `9c5c283` (feat)
2. **Task 2: Renderizar barra de filtro acima do kanban** - `49fe6f0` (feat)
3. **Task 3: Adicionar CSS da barra de filtro e validar build final** - `d1a72b1` (feat)

## Files Created/Modified

- `apps/frontend/src/app/status/page.tsx` — badgeFilter state; visibleQuotes filtrado; dead state removido; badge-filter-bar JSX; CSS .badge-filter-bar com media query mobile

## Decisions Made

- Contagem nos botoes usa `quotes` (total), nao `visibleQuotes` — permite ver o potencial de cada filtro independente do filtro ativo
- Filtro nao persiste (D-14) — sem `localStorage.setItem` para `badgeFilter`
- `visibleQuotes` calculado como `const` derivado (nao `useState`) — sem lag de render, sempre sincronizado
- Badge-filter-bar inserida fora do bloco `loading ? ... : visibleQuotes.length === 0 ? ...` — visivel mesmo com spinner ativo

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — todos os dados exibidos vem de `QuoteRow` real. Filtro conectado ao estado real de `badgeFilter`.

## Threat Flags

Nenhuma nova superficie de seguranca introduzida — apenas filtragem client-side de dados ja carregados.

## Self-Check

- [x] `apps/frontend/src/app/status/page.tsx` existe e modificado
- [x] Commit `9c5c283` existe (Task 1)
- [x] Commit `49fe6f0` existe (Task 2)
- [x] Commit `d1a72b1` existe (Task 3)
- [x] `grep -c "selectedStatusFilter" page.tsx` = 0
- [x] `grep -c "badge-filter-bar" page.tsx` = 5
- [x] TypeScript sem erros
- [x] Next.js build passa

## Self-Check: PASSED

---
*Phase: 26-status-producao-kanban*
*Completed: 2026-05-15*
