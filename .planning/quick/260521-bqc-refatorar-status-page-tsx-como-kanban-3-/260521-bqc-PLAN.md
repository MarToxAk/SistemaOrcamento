---
phase: quick
plan: 260521-bqc
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/frontend/src/app/status/page.tsx
autonomous: true
requirements:
  - Kanban 3 colunas com design system Bom Custo
  - Manter SSE pagamentos e toast ✅
  - Highlight de card ao mudar status
  - Badge de pagamento por card
  - Layout responsivo (desktop colunas, mobile abas)

must_haves:
  truths:
    - "Página exibe 3 colunas Kanban: Aprovado, Em Produção, Pronto p/ Entrega"
    - "Cabeçalho de cada coluna tem cor distinta e contador de itens"
    - "Cards com pagamento confirmado (caixa ou PIX) têm fundo #effaf3 e borda verde"
    - "SSE /api/events/pagamentos continua funcionando e dispara toast ✅"
    - "Highlight de card (animação pulse verde) ao mudar de status permanece"
    - "Body usa background #f9f7ed e header usa gradiente pastel 5-stops"
    - "Em mobile, colunas viram abas navegáveis"
  artifacts:
    - path: "apps/frontend/src/app/status/page.tsx"
      provides: "Componente de página Kanban refatorado"
  key_links:
    - from: "SSE EventSource"
      to: "/api/events/pagamentos"
      via: "useEffect com es.onmessage"
    - from: "fetchQuotes"
      to: "/api/quotes"
      via: "fetch com URLSearchParams status=APROVADO,EM_PRODUCAO,PRONTO_PARA_ENTREGA"
---

<objective>
Refinar o layout Kanban já presente em status/page.tsx com as cores corretas do design system Bom Custo, fundo #f9f7ed no body, cabeçalhos coloridos por coluna, e fundo especial (#effaf3) nos cards com pagamento confirmado. Toda a lógica reativa (SSE, polling, highlight, toast, filtro de badge) permanece intacta.

Purpose: A página /status é o painel público de produção — os colaboradores precisam identificar visualmente o status de cada pedido de relance. As cores das colunas sinalizam o estágio do pedido.
Output: apps/frontend/src/app/status/page.tsx reescrito com CSS atualizado e função renderQuoteCard aprimorada.
</objective>

<execution_context>
@/home/user/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/frontend/src/app/status/page.tsx

Tokens do design system Bom Custo (extraídos do README e SKILL.md):

Body background: #f9f7ed
Header gradient: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%)
Surface: #ffffff com box-shadow: 0 2px 8px rgba(0,0,0,0.06)
Paid row background: #effaf3 (--success-soft-bg)
Border radius: 6px (cards/badges) → 8px (header band/buttons)

Status colors definidos (por coluna Kanban):
  APROVADO       → bg header: #e9f8ef  | texto: #1f7a44  | border-top card: #1f7a44
  EM_PRODUCAO    → bg header: #eef4ff  | texto: #2457a6  | border-top card: #2457a6
  PRONTO_PARA_ENTREGA → bg header: #f3eeff | texto: #6f42c1 | border-top card: #6f42c1

Ícones Bootstrap por coluna:
  APROVADO              → bi-check2-circle
  EM_PRODUCAO           → bi-gear-fill (com spin suave opcional)
  PRONTO_PARA_ENTREGA   → bi-box-seam

Card pago (PAGO_CAIXA ou PIX_CONFIRMADO):
  background: #effaf3
  border-top: 3px solid #1f7a44 (independente da coluna onde estiver)
  badge: bg-success (PAGO_CAIXA) ou bg-primary (PIX_CONFIRMADO)

Card aguardando:
  background: #fff
  border-top: 3px solid (cor da coluna)
  badge: bg-warning text-dark
</context>

<tasks>

<task type="auto">
  <name>Tarefa 1: Atualizar CSS inline e renderQuoteCard em status/page.tsx</name>
  <files>apps/frontend/src/app/status/page.tsx</files>
  <action>
Editar apenas o bloco `<style>` inline e a função `renderQuoteCard` dentro do componente `StatusPage`. Não alterar nenhum useEffect, handler, tipo TypeScript, ou lógica de estado.

**Mudanças no bloco `<style>` (substituir o bloco existente por inteiro):**

1. `body` → `background: #f9f7ed` (era `#f7f1e3` — corrigir para o token oficial)

2. `.kanban-column` → remover `background: #f8f9fa`, deixar transparente (as colunas não precisam de bg próprio; o fundo #f9f7ed da página aparece)

3. `.kanban-column-header` → remover a regra genérica de cor; as cores virão das classes específicas por status:

```
.kanban-col-header-aprovado {
  background: #e9f8ef; color: #1f7a44;
}
.kanban-col-header-em_producao {
  background: #eef4ff; color: #2457a6;
}
.kanban-col-header-pronto_para_entrega {
  background: #f3eeff; color: #6f42c1;
}
```

4. `.kanban-card` → manter `background: #fff` e `border-top: 3px solid #ccc` como fallback. Adicionar:

```
.kanban-card.card-paid {
  background: #effaf3;
  border-top-color: #1f7a44;
}
```

5. Manter todas as classes `.status-border-*` existentes (usadas quando card NÃO é pago, para pintar a borda da coluna correspondente).

6. `.kanban-card-total` → cor `#1f7a44` (já correto — confirmar está presente)

7. `.card-highlighted` e `@keyframes highlight-pulse` → manter sem alteração

8. Adicionar `.kanban-col-icon` para os ícones de coluna (tamanho `1.1rem`, `me-2`)

**Mudanças na função `renderQuoteCard`:**

1. Calcular `isPaid`: `const isPaid = badgeType === "PAGO_CAIXA" || badgeType === "PIX_CONFIRMADO";`

2. Adicionar `${isPaid ? "card-paid" : ""}` na className do `<div>` raiz do card (já tem `kanban-card status-border-${...}`):
   `className={\`kanban-card ${isPaid ? "card-paid" : \`status-border-\${quote.statusKey.toLowerCase()}\`} \${isHighlighted ? "card-highlighted" : ""}\`}`
   — quando pago, não aplicar `status-border-*` (o `card-paid` define a borda verde); quando não pago, aplicar `status-border-*` da coluna.

3. A estrutura interna do card (número, nome, valor, telefone, ações) permanece igual.

**Mudanças no JSX do Kanban desktop (dentro do `.kanban-board`):**

No `<div className={`kanban-column-header status-${statusKey.toLowerCase()}`}>`, substituir a className por:
`className={\`kanban-column-header kanban-col-header-\${statusKey.toLowerCase()}\`}`

Adicionar ícone no header da coluna antes do título:
- APROVADO → `<i className="bi bi-check2-circle kanban-col-icon" />`
- EM_PRODUCAO → `<i className="bi bi-gear-fill kanban-col-icon" />`
- PRONTO_PARA_ENTREGA → `<i className="bi bi-box-seam kanban-col-icon" />`

Implementar via objeto de mapa no topo da função do map:
```
const COLUMN_META: Record<string, { label: string; icon: string }> = {
  APROVADO: { label: "APROVADO", icon: "bi-check2-circle" },
  EM_PRODUCAO: { label: "EM PRODUÇÃO", icon: "bi-gear-fill" },
  PRONTO_PARA_ENTREGA: { label: "PRONTO PARA ENTREGA", icon: "bi-box-seam" },
};
```
Usar `COLUMN_META[statusKey]` para label e icon no lugar dos ternários existentes. Aplicar tanto no kanban desktop quanto nas abas mobile.

**Mudança no orcamento-section:**
Adicionar `border-radius: 0 0 8px 8px` e `box-shadow: 0 2px 8px rgba(0,0,0,0.06)` (já pode existir — confirmar e manter).

Nenhuma outra mudança. Todos os useEffect, handlers (handlePdf, dismissBanner, fetchQuotes), estado, tipos e scripts CDN permanecem inalterados.
  </action>
  <verify>
    <automated>cd apps/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - TypeScript compila sem erros em status/page.tsx
    - Coluna "Aprovado" tem header verde (#e9f8ef / #1f7a44) com ícone bi-check2-circle
    - Coluna "Em Produção" tem header azul (#eef4ff / #2457a6) com ícone bi-gear-fill
    - Coluna "Pronto p/ Entrega" tem header roxo (#f3eeff / #6f42c1) com ícone bi-box-seam
    - Cards com pagamento confirmado têm background #effaf3 e borda superior verde
    - Cards aguardando têm background branco e borda da cor da coluna
    - Body usa #f9f7ed
    - Todos os useEffect e handlers existentes permanecem sem alteração
  </done>
</task>

</tasks>

<verification>
Após a tarefa:
1. `npx tsc --noEmit` em apps/frontend — sem erros de tipo
2. Abrir /status no navegador e verificar visualmente as 3 colunas coloridas
3. Confirmar que o SSE ainda conecta (Network tab — EventSource /api/events/pagamentos ativo)
4. Confirmar que o toast de pagamento dispara ao receber evento SSE
5. Redimensionar para mobile — verificar que as abas aparecem e alternam corretamente
</verification>

<success_criteria>
- Kanban com 3 colunas coloridas em desktop, 3 abas em mobile
- Cards pagos visualmente distintos com fundo #effaf3
- Design system Bom Custo aplicado (body #f9f7ed, gradiente pastel no header)
- Zero regressão de funcionalidade (SSE, toast, highlight, filtro de badge, PDF, Chatwoot)
- TypeScript sem erros
</success_criteria>

<output>
Criar .planning/quick/260521-bqc-refatorar-status-page-tsx-como-kanban-3-/260521-bqc-SUMMARY.md quando concluído.
</output>
