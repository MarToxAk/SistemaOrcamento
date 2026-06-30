---
phase: quick
plan: 260521-bqc
subsystem: frontend/status
tags: [kanban, design-system, css, bootstrap]
key-files:
  modified:
    - apps/frontend/src/app/status/page.tsx
decisions:
  - COLUMN_META centraliza label e ícone por coluna em vez de ternários espalhados
  - Borda de PRONTO_PARA_ENTREGA corrigida de laranja (#a65b12) para roxo (#6f42c1) conforme design system
metrics:
  duration: "~10min"
  completed: "2026-05-21"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260521-bqc: Refatorar status/page.tsx como Kanban 3 Colunas — Summary

**One-liner:** Kanban /status com cabeçalhos coloridos por coluna (verde/azul/roxo), fundo #f9f7ed e fundo #effaf3 para cards com pagamento confirmado, mantendo SSE e toda a lógica reativa intacta.

## O que foi feito

### Tarefa 1: Atualizar CSS inline e renderQuoteCard em status/page.tsx

**Commit:** `b3bd9b8`

**CSS — bloco `<style>`:**
- `body` background: `#f7f1e3` → `#f9f7ed` (token oficial do design system)
- `.kanban-column`: removido `background: #f8f9fa` — colunas agora transparentes sobre o fundo da página
- `.kanban-column-header`: regra genérica de cor removida; substituída por 3 classes específicas:
  - `.kanban-col-header-aprovado` — `#e9f8ef` / `#1f7a44`
  - `.kanban-col-header-em_producao` — `#eef4ff` / `#2457a6`
  - `.kanban-col-header-pronto_para_entrega` — `#f3eeff` / `#6f42c1`
- `.kanban-card.card-paid` adicionado: `background: #effaf3; border-top-color: #1f7a44`
- `.status-border-pronto_para_entrega` corrigido: `#a65b12` → `#6f42c1` (alinhado ao design system)
- `.kanban-col-icon` adicionado: `font-size: 1.1rem; margin-right: 0.5rem`
- `.kanban-column-title` recebeu `display: flex; align-items: center`
- `.orcamento-section` recebeu `box-shadow: 0 2px 8px rgba(0,0,0,0.06)` explícito

**JSX — `renderQuoteCard`:**
- `isPaid` calculado: `badgeType === "PAGO_CAIXA" || badgeType === "PIX_CONFIRMADO"`
- className do card: quando pago → `kanban-card card-paid`; quando não pago → `kanban-card status-border-{coluna}`
- Highlight animation preservada em ambos os ramos

**JSX — Kanban desktop:**
- `COLUMN_META` definido como `Record<string, {label, icon}>` com as 3 colunas
- Header `className` atualizado de `status-${statusKey.toLowerCase()}` para `kanban-col-header-${statusKey.toLowerCase()}`
- Ícone Bootstrap inserido antes do label via `COLUMN_META[statusKey].icon`

**JSX — abas mobile:**
- `COLUMN_META` reutilizado para ícones nas abas
- Ícone adicionado antes do shortLabel em cada aba

## Deviations from Plan

**1. [Rule 1 - Bug] Borda de PRONTO_PARA_ENTREGA corrigida**
- **Found during:** Task 1
- **Issue:** CSS original usava `#a65b12` (laranja) para `.status-border-pronto_para_entrega`, mas o design system define `#6f42c1` (roxo) para essa coluna
- **Fix:** Atualizado para `#6f42c1` consistente com os tokens de cor do plano e `kanban-col-header-pronto_para_entrega`
- **Files modified:** `apps/frontend/src/app/status/page.tsx`
- **Commit:** `b3bd9b8`

## Known Stubs

Nenhum. Todos os dados são carregados via `/api/quotes` e exibidos dinamicamente.

## Threat Flags

Nenhuma nova superfície de segurança introduzida. Arquivo puramente de UI/CSS.

## Self-Check: PASSED

- `apps/frontend/src/app/status/page.tsx` — presente e modificado
- Commit `b3bd9b8` — verificado via git log
- `npx tsc --noEmit` — zero erros
- Todos os `useEffect`, SSE (`/api/events/pagamentos`), `fetchQuotes`, `handlePdf`, `dismissBanner`, `getBadgeType`, `hasBadge` — preservados sem alteração
