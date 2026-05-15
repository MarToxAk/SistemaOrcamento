# Phase 26: Status Página Produção — Layout Kanban - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 26-status-producao-kanban
**Areas discussed:** Visual e layout, Informações exibidas, Ações por status, Filtros funcionando

---

## Visual e layout

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela (como está agora) | Compacta, vários orçamentos visíveis. Melhorar cores e pills. | |
| Cards agrupados por status | Kanban: APROVADO \| EM PRODUÇÃO \| PRONTO — estilo kanban. | ✓ |

**User's choice:** Cards agrupados por status (kanban)

---

### Cards — Informações de destaque

| Option | Description | Selected |
|--------|-------------|----------|
| Número + Cliente + Carimbo de pagamento | Compacto. Número grande, nome do cliente, badge PAGO/PIX/AGUARDANDO. | ✓ |
| Número + Cliente + Total + Ações | Mais completo. Valor total e botões no card. | |
| Tudo visível | Vendedor, total, telefone, data, ações — card maior. | |

**User's choice:** Número + Cliente + Carimbo de pagamento (Recomendado)

---

### Colunas — Cabeçalho

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, com contagem e cor por status | Ex: EM PRODUÇÃO (3) com fundo azul-claro. | ✓ |
| Só título sem contagem | Mais limpo. | |

**User's choice:** Sim, com contagem e cor por status

---

### Mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Uma coluna por vez com abas (swipe ou tabs) | Tabs com APROVADO \| EM PRODUÇÃO \| PRONTO. | ✓ |
| Scroll horizontal entre colunas | Colunas lado a lado com scroll horizontal. | |
| Tudo empilhado verticalmente | As 3 colunas uma embaixo da outra. | |

**User's choice:** Uma coluna por vez com abas (tabs)

---

## Informações exibidas

### Total no card

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, visível no card | R$ 1.250,00 abaixo do nome do cliente. | ✓ |
| Não — manter card compacto | Total omitido. | |

**User's choice:** Sim, visível no card

---

### Telefone

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, link para WhatsApp | Clicar abre wa.me/55... em nova aba. | |
| Mostrar mas não clicável | Texto simples. | ✓ |
| Ocultar telefone | Não mostrar no card. | |

**User's choice:** Mostrar mas não clicável

---

### Vendedor

| Option | Description | Selected |
|--------|-------------|----------|
| Não — omitir do card | Reduz ruído. Focado em cliente e pagamento. | ✓ |
| Sim, mostrar vendedor | Visibilidade de quem fez o orçamento. | |

**User's choice:** Não — omitir do card

---

## Ações por status

| Option | Description | Selected |
|--------|-------------|----------|
| PDF (gerar/abrir) | Já existe — manter. | ✓ |
| Chatwoot | Já existe — link para a conversa. | ✓ |
| Avançar status | Botão contextual: APROVADO → EM PRODUÇÃO → PRONTO → ENTREGUE. | |
| Abrir detalhes do orçamento | Link para /orcamento/[id]. | ✓ |

**User's choice:** PDF, Chatwoot, Abrir detalhes (sem avançar status)

---

### URL de detalhes

| Option | Description | Selected |
|--------|-------------|----------|
| /orcamento/[id] (página interna existente) | Link para a página de detalhe/edição interna. | ✓ |
| /orcamento/[id]/view (somente leitura) | Versão read-only separada. | |

**User's choice:** /orcamento/[id]

---

## Filtros funcionando

### Filtro de carimbo com kanban

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — filtrar por carimbo dentro de cada coluna | Barra de filtro: Todos \| Pago Caixa \| PIX \| Aguardando. | ✓ |
| Não — kanban já filtra por status | Remover estados mortos e simplificar. | |

**User's choice:** Sim — filtro por carimbo ativo

---

### Persistência do filtro

| Option | Description | Selected |
|--------|-------------|----------|
| Não — resetar ao abrir a página | Simples, sempre começa em Todos. | ✓ |
| Sim — salvar no localStorage | Lembra o último filtro. | |

**User's choice:** Não persistente

---

## Claude's Discretion

- Estilo visual dos cards (padding, sombra, borda) — manter consistência com `orcamento-section` e `orcamento-header` existentes.
- Animação de highlight adaptada para cards.
- Ordenação dentro de cada coluna: mais recente primeiro.

## Deferred Ideas

- Avançar status pelo card — não selecionado, criar fase separada se necessário.
- Telefone clicável para WhatsApp — optou por manter simples.
- Campo de busca por cliente/número — não discutido, potencial melhoria futura.
- Persistência do filtro de carimbo no localStorage — optou por resetar sempre.
