# Phase 8: UX das Páginas Públicas — Research

**Phase:** 08 — UX das Páginas Públicas do Cliente
**Date:** 2026-05-03
**Status:** Complete

---

## Stack Confirmada

- **Framework:** Next.js 14.2.35, App Router, `"use client"` em todas as páginas públicas
- **CSS:** Inline `<style>` tags com classes customizadas + Bootstrap 5 via CDN (classes `badge`, `alert`, `spinner-border`, `d-flex`, `text-center`, etc.)
- **Ícones:** Bootstrap Icons (`bi bi-check-lg` já usado na approve page)
- **Sem componentes compartilhados** — as páginas são self-contained, sem importações de outros componentes do projeto

## Estrutura dos Arquivos

| Arquivo | Tamanho estimado | Complexidade |
|---------|-----------------|--------------|
| `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` | ~270 linhas | Média — 5 estados, tabela de itens |
| `apps/frontend/src/app/orcamento/[id]/status/page.tsx` | ~180 linhas | Baixa — 3 estados, exibe badge |

## Achados por Página

### Página `/status`

- `statusKey` já chega em lowercase do backend (ex: `"em_producao"`)
- `statusLabel` chega do backend (ex: `"Em producao"`) — mas será sobrescrito pelo mapa local com emoji
- `STATUS_CLASS` atual mapeia para classes Bootstrap (`badge bg-success`, etc.) — substituir por `STATUS_INFO` com `{ emoji, label, description, color }`
- `.status-pill` CSS já existe — reusar com cor dinâmica via `style={{ backgroundColor }}`
- **Gap:** `PAGAMENTO_PARCIAL` existe no backend mas não tem entry no mapa atual — adicionar ao `STATUS_INFO`

### Página `/approve`

- Estado `"success"` já tem círculo verde + `bi-check-lg` (foi melhorado em fase anterior)
- Texto atual: "Recebemos sua aprovação. Em breve nossa equipe entrará em contato."
- **D-03** requer: "Nossa equipe já foi notificada e em breve seu pedido entra em produção. Avisaremos assim que estiver pronto."
- **D-04** requer novo state `"already-approved"` — hoje quando `data?.approved === true` no carregamento, o código entra direto em `"success"`, não há distinção

## Padrão de Implementação

### STATUS_INFO (substituição do STATUS_CLASS)

```typescript
const STATUS_INFO: Record<string, { emoji: string; label: string; description: string; color: string }> = {
  pendente:             { emoji: "🕐", label: "Pendente",            description: "Seu orçamento foi recebido e está aguardando confirmação.",                          color: "#6c757d" },
  enviado:              { emoji: "📤", label: "Enviado",             description: "O orçamento foi enviado para análise. Aguardando sua aprovação.",                    color: "#0d6efd" },
  aprovado:             { emoji: "✅", label: "Aprovado",            description: "Orçamento aprovado! Em breve seu pedido entra em produção.",                        color: "#198754" },
  pagamento_parcial:    { emoji: "💰", label: "Pagamento Parcial",   description: "Recebemos parte do pagamento. Aguardando quitação para iniciar a produção.",        color: "#fd7e14" },
  em_producao:          { emoji: "🎨", label: "Em Produção",         description: "Seu pedido está sendo produzido pela nossa equipe.",                                color: "#ffc107" },
  pronto_para_entrega:  { emoji: "📦", label: "Pronto para Retirada",description: "Seu pedido está pronto! Pode passar na loja quando quiser.",                       color: "#0dcaf0" },
  entregue:             { emoji: "🎉", label: "Entregue",            description: "Pedido entregue. Obrigado pela preferência!",                                       color: "#6f42c1" },
  cancelado:            { emoji: "❌", label: "Cancelado",           description: "Este orçamento foi cancelado. Dúvidas? Fale conosco.",                              color: "#dc3545" },
};
```

### State Union para approve page

```typescript
type ApproveState = "loading-quote" | "idle" | "submitting" | "success" | "already-approved" | "error" | "no-token";
```

`already-approved` é definido no `useEffect` quando `data?.approved === true`.

## Pitfalls

- Não remover `statusLabel` do state — ainda usado como fallback quando `statusKey` não está no mapa
- Cores dos badges: usar `style={{ backgroundColor, color: "#fff" }}` inline para não depender de Bootstrap classes — mais fácil de manter
- Bootstrap Icons já carregado via CDN no layout global — `bi bi-check-lg` disponível sem import adicional

## Arquivos Afetados

Apenas 2 arquivos de apresentação pura — sem alteração de APIs, backend ou schema:
1. `apps/frontend/src/app/orcamento/[id]/status/page.tsx`
2. `apps/frontend/src/app/orcamento/[id]/approve/page.tsx`
