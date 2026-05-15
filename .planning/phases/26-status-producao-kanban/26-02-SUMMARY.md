---
phase: 26-status-producao-kanban
plan: 02
subsystem: ui
tags: [frontend, kanban, card, badge, react, nextjs, bootstrap]

requires:
  - phase: 26-status-producao-kanban/26-01
    provides: Kanban 3-colunas base com kanban-card-placeholder como ponto de extensão

provides:
  - Componente interno renderQuoteCard com layout completo por card
  - Badge de pagamento colorido (PAGO_CAIXA/PIX_CONFIRMADO/AGUARDANDO) com ícone Bootstrap
  - Valor total formatado em BRL via toLocaleString
  - Ações por card: Gerar PDF, Abrir PDF, Chatwoot (condicional), Detalhes
  - CSS kanban-card com borda superior colorida por status (aprovado/em_producao/pronto_para_entrega)
  - Animação card-highlighted preservada e funcional nos novos cards

affects:
  - 26-03 (filtro de carimbo — visibleQuotes alimentará os mesmos cards)

tech-stack:
  added: []
  patterns:
    - "renderQuoteCard(quote): ReactNode como função interna do componente — reuso entre desktop e mobile"
    - "badge colorido por getBadgeType(): PAGO_CAIXA=bg-success, PIX_CONFIRMADO=bg-primary, AGUARDANDO=bg-warning"
    - "borda superior do card por classe CSS dinâmica: status-border-${statusKey.toLowerCase()}"
    - "telefone renderizado como <span> de texto simples — sem link wa.me (D-09)"
    - "link Detalhes usa <a> simples (não next/link) — consistência com padrão existente da página"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/status/page.tsx

key-decisions:
  - "renderQuoteCard definida como função interna (não componente React separado) para capturar pdfLoadingId e highlightedId do closure sem prop drilling"
  - "Telefone como <span> simples sem link wa.me — decisão D-09 mantida"
  - "Vendedor omitido completamente — decisão D-06 mantida"
  - "Botão avançar status ausente — decisão D-11 mantida (consistente com quick-task 260515-001)"
  - "kanban-card-placeholder CSS removido totalmente — substituído por .kanban-card com border-top colorido"

patterns-established:
  - "Badge de pagamento: getBadgeType() → class Bootstrap + ícone bi-* + label textual"
  - "BRL: total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })"
  - "Card highlight: className condicional card-highlighted quando highlightedId === quote.id"

requirements-completed: []

duration: 8min
completed: 2026-05-15
---

# Phase 26 Plan 02: Cards Completos do Kanban — Status Produção

**kanban-card-placeholder substituído por renderQuoteCard com cliente, badge de pagamento, valor BRL, telefone e ações PDF/Chatwoot/Detalhes, com CSS de borda superior colorida por status**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-15T16:05:00Z
- **Completed:** 2026-05-15T16:13:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Função `renderQuoteCard(quote)` definida como closure dentro de `StatusPage`, capturando `pdfLoadingId` e `highlightedId` sem prop drilling
- Desktop e mobile usam a mesma função: `columnQuotes.map((quote) => renderQuoteCard(quote))` em ambos os blocos
- Badge de pagamento com 3 variantes: Pago no Caixa #N (verde), PIX Confirmado (azul), Aguardando pagamento (amarelo) — cada um com ícone Bootstrap correspondente
- Ações contextuais: Gerar PDF (quando sem PDF), Abrir PDF (quando disponível), Chatwoot (condicional por URL), Detalhes (link permanente)
- CSS `.kanban-card` com `border-top: 3px solid` colorido por `.status-border-{statusKey}` — verde/azul/laranja por coluna
- `.kanban-card-placeholder` totalmente removido do JSX e do CSS
- Build Next.js e TypeScript sem erros

## Task Commits

1. **Task 1: Criar componente interno QuoteCard com layout completo** - `e533485` (feat)
2. **Task 2: Conectar renderQuoteCard em desktop e mobile** - `78d4420` (feat)
3. **Task 3: Adicionar CSS do kanban-card e remover kanban-card-placeholder** - `db630ee` (feat)

## Files Created/Modified

- `apps/frontend/src/app/status/page.tsx` - renderQuoteCard adicionado; placeholders substituídos; CSS kanban-card completo; kanban-card-placeholder removido

## Decisions Made

- Função interna (não componente externo) para evitar prop drilling de `pdfLoadingId`, `highlightedId`, `handlePdf`
- `<a>` simples para link Detalhes (não `next/link`) — consistência com restante da página que já usa `<a href="/orcamento/novo#condPagamento">`
- `canOpenPdf = Boolean(quote.latestPdfUrl)` controla qual botão PDF exibir: "Gerar" vs "Abrir"

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - todos os campos do card estão conectados a dados reais de `QuoteRow`. Campos opcionais (`chatwootConversationUrl`, `latestPdfUrl`) usam renderização condicional adequada.

## Threat Flags

Nenhuma nova superfície de segurança introduzida — apenas renderização de dados já existentes em `QuoteRow`.

## Issues Encountered

None - TypeScript compilou sem erros; Next.js build passou em todas as etapas.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Kanban visualmente completo: estrutura (Plan 01) + cards com conteúdo (Plan 02)
- Plan 03 adicionará filtro de carimbo funcional em `visibleQuotes` (D-12 a D-15)
- Estado morto (`selectedStatusFilter`, `onlyWithBadge`, `selectedBadgeFilter`) ainda presente — Plan 03 limpará conforme D-15
- `visibleQuotes = quotes` sem filtro — Plan 03 substituirá por filtro por badge

---
*Phase: 26-status-producao-kanban*
*Completed: 2026-05-15*
