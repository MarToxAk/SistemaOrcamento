---
status: complete
reconciled: 2026-06-08 — os 10 testes ficaram pending (script de UAT gerado, nunca executado). Deferidos/skipped no ship do milestone v2.0 (feature Kanban /status em produção desde 2026-05-22, validada por verificação de código 12/12). Sessão encerrada na auditoria v2.1 — NÃO marcados como passed.
phase: 26-status-producao-kanban
source: [26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md]
started: 2026-05-15
updated: 2026-05-15
---

## Current Test

number: 1
name: Kanban 3-colunas no desktop
expected: |
  Em viewport >= 768px: 3 colunas aparecem lado a lado — APROVADO (verde) | EM PRODUÇÃO (azul) | PRONTO PARA ENTREGA (laranja). Cada coluna tem cabeçalho colorido com título e contagem de cards.
awaiting: user response

## Tests

### 1. Kanban 3-colunas no desktop
expected: Em viewport >= 768px: 3 colunas aparecem lado a lado — APROVADO (verde) | EM PRODUÇÃO (azul) | PRONTO PARA ENTREGA (laranja). Cada coluna tem cabeçalho colorido com título e contagem de cards.
result: [pending]

### 2. Mobile nav-tabs
expected: Em viewport < 768px (DevTools): aparece barra de tabs com APROVADO / EM PRODUÇÃO / PRONTO PARA ENTREGA. Cada tab mostra a contagem. Clicar em uma tab exibe apenas aquela coluna; as outras ficam ocultas.
result: [pending]

### 3. Badge de pagamento nos cards
expected: Cada card exibe um badge colorido: "Pago no Caixa #N" em verde, "PIX Confirmado" em azul, ou "Aguardando pagamento" em amarelo. Cada um tem um ícone Bootstrap correspondente.
result: [pending]

### 4. Conteúdo do card
expected: Card exibe número do orçamento, nome do cliente, valor total em BRL (ex: R$ 1.250,00), telefone como texto simples. Vendedor NÃO aparece. Botão "Avançar status" NÃO aparece.
result: [pending]

### 5. Ações do card
expected: Cards sem PDF mostram botão "Gerar PDF". Cards com PDF mostram botão "Abrir PDF". Chatwoot aparece apenas se há conversa. Botão "Detalhes" leva para /orcamento/[id].
result: [pending]

### 6. Barra de filtro visível
expected: Acima do kanban, 4 botões de filtro: Todos | Pago Caixa | PIX | Aguardando. Cada botão mostra a contagem de cards correspondente. "Todos" está ativo por padrão (destacado em azul).
result: [pending]

### 7. Filtro funciona
expected: Clicar "PIX" exibe apenas cards com pagamento PIX em todas as colunas. Clicar "Pago Caixa" exibe só pagos no caixa. Colunas vazias permanecem visíveis mas sem cards.
result: [pending]

### 8. Filtro reseta no reload
expected: Recarregar a página (F5) volta o filtro para "Todos", exibindo todos os cards novamente.
result: [pending]

### 9. Animação de highlight SSE
expected: Ao receber evento de pagamento via SSE (caixa confirmar pedido), o card correspondente exibe animação de destaque (box-shadow) por ~3 segundos, depois volta ao normal.
result: [pending]

### 10. Header e banner preservados
expected: Logo Bom Custo, título "Produção de Orçamentos", badge "Tempo real" (verde), botões "Atualizar" e "Novo Orçamento" presentes no topo. Banner de último pagamento no caixa aparece quando existe.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps
