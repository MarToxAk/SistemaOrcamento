# Phase 26: Status Página Produção — Layout Kanban - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesenhar a página `/status` (produção de orçamentos) de tabela plana para layout kanban com cards agrupados por status, filtro de carimbo funcional, e ações contextuais. Escopo restrito ao arquivo `apps/frontend/src/app/status/page.tsx`.

</domain>

<decisions>
## Implementation Decisions

### Visual e Layout
- **D-01:** Layout kanban com 3 colunas fixas: APROVADO | EM PRODUÇÃO | PRONTO PARA ENTREGA (substituir tabela atual).
- **D-02:** Cabeçalhos de coluna com título + contagem + cor por status (ex: "EM PRODUÇÃO (3)" com fundo azul-claro).
- **D-03:** Mobile — uma coluna por vez com abas (tabs): usuário troca de etapa via tab. Não scroll horizontal nem empilhado.
- **D-04:** Highlight de linha existente (`row-highlighted` / `highlight-pulse`) deve ser adaptado para cards.

### Cards
- **D-05:** Card exibe: número do orçamento (destaque), nome do cliente, badge de pagamento (PAGO_CAIXA / PIX_CONFIRMADO / AGUARDANDO), valor total, telefone do cliente (texto simples — sem link WhatsApp).
- **D-06:** Vendedor omitido do card.
- **D-07:** Card compacto — sem coluna de "Atualizado" em destaque (pode ficar como texto secundário pequeno se couber).

### Informações
- **D-08:** Valor total formatado em BRL (`toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`).
- **D-09:** Telefone visível mas não clicável (sem `wa.me/` link).

### Ações no Card
- **D-10:** Ações presentes: PDF (gerar se não tem, abrir se tem), Chatwoot (se houver URL), link "Detalhes" → `/orcamento/[id]`.
- **D-11:** SEM botão de avançar status — ação removida intencionalmente (consistente com quick task 260515-001).

### Filtros
- **D-12:** Barra de filtro por carimbo acima do kanban: **Todos | Pago Caixa | PIX | Aguardando**.
- **D-13:** Filtro aplica dentro de cada coluna kanban (filtra globalmente os cards visíveis).
- **D-14:** Filtro NÃO persistente — reseta para "Todos" a cada abertura de página.
- **D-15:** Remover estados mortos: `selectedStatusFilter` e `onlyWithBadge` não são usados em `visibleQuotes = quotes` — limpar ao refatorar.

### Claude's Discretion
- Estilo visual dos cards (padding, sombra, borda) — manter consistência com `orcamento-section` e `orcamento-header` já existentes.
- Animação de highlight no card pode usar a mesma `@keyframes highlight-pulse` já definida.
- Ordem dos cards dentro de cada coluna: mais recente primeiro (mesma lógica atual de `updatedAt`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código fonte
- `apps/frontend/src/app/status/page.tsx` — Página atual completa. Contém tipos (`QuoteRow`, `StatusOption`), funções auxiliares (`getBadgeType`, `hasBadge`, `getQuoteIdentifier`), lógica SSE, e estilos inline. Ponto de partida do redesign.

### Referências de estado do projeto
- `.planning/quick/260515-001-remover-edicao-status-pagina-publica/` — Quick task que removeu o controle de edição de status (avançar status). Decisão mantida: sem botão de status no redesign.
- `.planning/quick/260515-002-menu-carimbos-status-page/` — Quick task que adicionou filtro por carimbo (incompleto — não conectado em `visibleQuotes`). O redesign deve consolidar e completar esse filtro.

### Sem specs externas
No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getBadgeType(quote)` → retorna `"PAGO_CAIXA" | "PIX_CONFIRMADO" | "AGUARDANDO"` — reusar para determinar cor/label do badge no card.
- `hasBadge(quote)` → retorna boolean — útil para filtro D-12/D-13.
- `getQuoteIdentifier(quote)` → retorna string com número do orçamento — reusar para construir o link `/orcamento/[id]`.
- `showToast(message, type)` → toast Bootstrap — manter sem alteração.
- `fetchQuotes()` e lógica SSE — manter sem alteração (só muda a renderização).
- `PRODUCTION_STATUSES = ["APROVADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"]` — reusar como chaves das colunas kanban.

### Established Patterns
- Bootstrap 5 via CDN (`<Script>`) — estilo inline via `<style>` no final do componente. Sem Tailwind ou biblioteca de UI. Manter esse padrão.
- `"use client"` + React state + `useEffect` — padrão de todos os componentes interativos do frontend.
- Fetch nativo via `/api/quotes?status=...` — sem mudança no backend.
- `fetchRef.current` para SSE chamar `fetchQuotes` atualizado — manter padrão.

### Integration Points
- SSE: `new EventSource("/api/events/pagamentos")` já atualiza a lista ao receber pagamento — o novo layout kanban deve reagir ao mesmo evento.
- Link para detalhes: `/orcamento/[id]` — verificar se a rota `/orcamento/[id]` existe no App Router (`apps/frontend/src/app/orcamento/[id]/page.tsx`).
- Link Chatwoot: `quote.chatwootConversationUrl` — externo, abre em `_blank`.
- PDF: `quote.latestPdfUrl` e endpoint `POST /api/quotes/[id]/pdf` — lógica existente preservada.

### Dead Code to Remove
- `selectedStatusFilter` state — definido mas não usado.
- `onlyWithBadge` state — definido mas não usado.
- `selectedBadgeFilter` state — definido mas não usado (será substituído pelo filtro D-12 funcional).

</code_context>

<specifics>
## Specific Ideas

- O header da coluna deve ter a cor do status correspondente: APROVADO → verde, EM PRODUÇÃO → azul, PRONTO → laranja (consistente com `.status-aprovado`, `.status-em_producao`, `.status-pronto_para_entrega` já definidos).
- Mobile tabs: usar Bootstrap 5 tabs (`<ul class="nav nav-tabs">`) para trocar coluna. Incluir contagem na aba.
- Cards: leve sombra (`box-shadow: 0 1px 4px rgba(0,0,0,0.08)`), borda superior colorida por status (3px sólido da cor da coluna).

</specifics>

<deferred>
## Deferred Ideas

- **Avançar status pelo card** — usuário não selecionou. Se necessário no futuro, criar fase separada com máquina de estados e confirmação.
- **Telefone clicável para WhatsApp** — optou por manter simples por ora.
- **Campo de busca por cliente/número** — não discutido, potencial melhoria futura.
- **Persistência do filtro de carimbo no localStorage** — optou por resetar sempre.

</deferred>

---

*Phase: 26-status-producao-kanban*
*Context gathered: 2026-05-15*
