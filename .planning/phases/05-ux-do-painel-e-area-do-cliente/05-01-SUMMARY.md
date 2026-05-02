# 05-01 SUMMARY — Filter Pills + Toast + Paginated Fix

## What Was Built
- **Filter pills nav** in `orcamento/page.tsx` — 8 status options (Todos, Pendente, Enviado, Aprovado, Em Produção, Pronto, Entregue, Cancelado) stored as `FILTER_OPTIONS` constant
- **`activeFilter` state** — `useState<string>("")`, passed as `query.set("status", ...)` in fetch URL and added to useEffect deps
- **Paginated response fix** — `Array.isArray((data as any)?.data)` handles `{ total, data: [...] }` response from Phase 3
- **`showToast(message, type)`** — Bootstrap 5 Toast API, 3500ms delay, appended to `#toast-container`; called after status update (success) and in catch (danger)
- **`STATUS_CLASS`** module-level lookup — replaces inline substring matching for badge CSS
- **Extended CSS** — `.status-em_producao`, `.status-pronto_para_entrega`, `.status-entregue`, `.status-enviado`, `.status-cancelado`
- **`<div id="toast-container" ...>`** fixed bottom-right position

## Files Modified
- `apps/frontend/src/app/orcamento/page.tsx`

## Decisions
- Toast container appended dynamically (not pre-rendered) to avoid React hydration conflicts
- Filter state as empty string `""` = "all" for clean URL construction
