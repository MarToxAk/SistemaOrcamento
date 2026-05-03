---
status: complete
phase: 06-aprovacao-cliente-athos
source:
  - .planning/phases/06-aprovacao-cliente-athos/06-01-SUMMARY.md
  - .planning/phases/06-aprovacao-cliente-athos/06-02-SUMMARY.md
  - .planning/phases/06-aprovacao-cliente-athos/06-03-SUMMARY.md
started: 2026-05-03T00:00:00Z
updated: 2026-05-03T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Disparo automático ao criar orçamento com idorcamento Athos
expected: |
  Criar (ou editar) um orçamento informando um idorcamento do Athos.
  Sem nenhuma ação manual, o cliente deve receber uma mensagem no Chatwoot
  contendo o link de aprovação. O POST /api/quotes retorna 200 imediatamente
  sem aguardar o envio (fire-and-forget).
result: issue
reported: "Não deve manda sozinho eu tenho que aperta enviar."
severity: major

### 2. Link de aprovação no formato correto
expected: |
  A mensagem enviada ao cliente no Chatwoot contém um link no formato:
  https://<dominio>/orcamento/{uuid}/approve?token=...
  O link NÃO deve conter /api/quotes/ no caminho — deve apontar para a
  página Next.js do cliente, não para a rota da API.
result: pass

### 3. Página de aprovação exibe itens e total do orçamento
expected: |
  Acessar /orcamento/{id}/approve?token={token_valido} no navegador.
  A página deve exibir:
  - Nome do cliente e número do orçamento
  - Tabela com colunas: Item | Qtd | Unit. | Total
  - Pelo menos um item com valores preenchidos
  - Valor total do orçamento formatado em BRL (ex: R$ 1.234,56) abaixo da tabela
  - Botão "Aprovar Orçamento"
result: pass

### 4. Aprovação registrada no sistema
expected: |
  Na página /orcamento/{id}/approve, clicar em "Aprovar Orçamento".
  - A página muda imediatamente para o estado "Orçamento Aprovado!" sem recarregar
  - No painel interno (autenticado), o orçamento aparece com status APROVADO
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "O envio da mensagem de aprovação ao cliente deve ser disparado manualmente pelo operador (botão 'Enviar'), não automaticamente ao criar/editar o orçamento."
  status: failed
  reason: "User reported: Não deve manda sozinho eu tenho que aperta enviar."
  severity: major
  test: 1
  artifacts: []
  missing: []
