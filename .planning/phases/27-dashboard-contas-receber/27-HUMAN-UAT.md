---
status: partial
phase: 27-dashboard-contas-receber
source: [27-VERIFICATION.md]
started: 2026-05-21T00:00:00Z
updated: 2026-05-21T00:00:00Z
---

## Current Test

[aguardando teste humano — iniciar o servidor e abrir o browser]

## Tests

### 1. Renderização dos Top Cards com dados reais
expected: Três cards exibem Total a Receber, Inadimplência Ativa e Clientes Devedores com valores formatados em BRL (R$ X.XXX,XX)
result: [pending]

### 2. Accordion lazy de títulos por cliente
expected: Fetch lazy para /api/athos/contas-receber/cliente/:id/titulos ocorre somente na primeira expansão do card; tabela exibe numerotitulo, datavencimento, valor, numeroordem e obs.
result: [pending]

### 3. Botão Atualizar
expected: Clicar em Atualizar re-executa fetchDashboard() e atualiza os dados sem reload de página
result: [pending]

### 4. Link de navegação em /status
expected: Link "Contas a Receber" visível ao lado dos botões Atualizar e Novo Orçamento no header; clicar navega para /contas-receber
result: [pending]

### 5. Botão WhatsApp condicional
expected: Link abre https://wa.me/55{ddd}{telefone} em nova aba para clientes com telefone cadastrado; clientes sem telefone não exibem o botão
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
