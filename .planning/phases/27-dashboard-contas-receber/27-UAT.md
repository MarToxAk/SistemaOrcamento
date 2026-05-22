---
status: complete
phase: 27-dashboard-contas-receber
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md]
started: 2026-05-22T00:00:00Z
updated: 2026-05-22T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Página carrega com dados reais
expected: Abrir /contas-receber mostra os 3 Top Cards com valores em R$ (Total a Receber, Inadimplência Ativa, Clientes Devedores). Cards de clientes aparecem abaixo.
result: pass

### 2. Filtro padrão mostra AVC + VEN
expected: Por padrão o botão "Todos (abertos)" está ativo (sólido) e mostra clientes com títulos A Vencer e Vencidos.
result: pass

### 3. Filtro por Vencidos
expected: Clicar em "Vencidos" recarrega os dados mostrando só clientes com status VEN. O botão fica sólido, os demais ficam em outline.
result: pass

### 4. Filtro por A Vencer
expected: Clicar em "A Vencer" mostra só clientes com status AVC. Clicar em "Todos (abertos)" volta ao padrão.
result: pass

### 5. Card de cliente — informações
expected: Cada card mostra nome do cliente, total devido em R$, quantidade de títulos, e badge de criticidade (verde/amarelo/laranja/vermelho conforme dias de atraso).
result: pass

### 6. Accordion de títulos — abre inline no card
expected: Clicar em "Títulos" num card expande uma tabela dentro do próprio card mostrando número do título, vencimento, valor e número do pedido.
result: pass

### 7. Accordion lazy — só busca na primeira abertura
expected: Ao abrir um accordion, aparece um spinner brevemente. Fechar e reabrir o mesmo card não faz nova requisição (dados já em cache).
result: pass

### 8. Botão WhatsApp
expected: Clientes com telefone cadastrado mostram botão WhatsApp verde. Clicar abre https://wa.me/55{numero} em nova aba.
result: pass
notes: usuário solicitou remoção do botão

### 9. Botão Atualizar
expected: Clicar no ícone de refresh (⟳) recarrega os dados, fecha acordeons abertos e limpa cache de títulos.
result: pass

### 10. Link de navegação em /status
expected: Na página /status, há um botão "Contas a Receber" no header ao lado de "Atualizar" e "Novo Orçamento". Clicar navega para /contas-receber.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
