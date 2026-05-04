---
status: testing
phase: 08-ux-paginas-publicas-do-cliente
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
started: 2026-05-03T00:00:00Z
updated: 2026-05-03T00:00:00Z
---

## Current Test

number: 1
name: Badge de status com cor sólida e emoji
expected: |
  Abra a página de status de um orçamento (ex: /orcamento/{id}/status).
  O badge deve exibir um emoji + label com fundo colorido sólido (ex: fundo verde para "Aprovado",
  amarelo para "Em Produção"). NÃO deve aparecer como classe Bootstrap (badge bg-success).
  O estilo é inline no elemento <span>.
awaiting: user response

## Tests

### 1. Badge de status com cor sólida e emoji
expected: |
  Abra a página de status de um orçamento (ex: /orcamento/{id}/status).
  O badge deve exibir um emoji + label com fundo colorido sólido (ex: fundo verde para "Aprovado",
  amarelo para "Em Produção"). NÃO deve aparecer como classe Bootstrap (badge bg-success).
  O estilo é inline no elemento <span>.
result: [pending]

### 2. Descrição do status abaixo do badge
expected: |
  Na mesma página de status, abaixo do badge colorido, deve aparecer um parágrafo de texto
  com a descrição do status em português.
  Ex: status "em_producao" → "Seu pedido está sendo produzido pela nossa equipe."
  A descrição deve corresponder ao status atual do orçamento.
result: [pending]

### 3. Aprovação bem-sucedida — texto atualizado
expected: |
  Acesse /orcamento/{id}/approve?token={token} de um orçamento PENDENTE de aprovação.
  Clique em "Aprovar Orçamento". Após a confirmação, o estado "success" deve exibir:
  "Nossa equipe já foi notificada e em breve seu pedido entra em produção. Avisaremos assim que estiver pronto."
  (Não mais: "Recebemos sua aprovação. Em breve nossa equipe entrará em contato.")
result: [pending]

### 4. Estado "já aprovado" — orçamento aprovado anteriormente
expected: |
  Acesse /orcamento/{id}/approve?token={token} de um orçamento que JÁ foi aprovado anteriormente.
  A página deve exibir o estado "Orçamento já aprovado" (com ícone check verde e a mensagem:
  "Você já aprovou este orçamento anteriormente. Nossa equipe está cuidando do seu pedido.")
  e NÃO o estado de "Aprovação de Orçamento" (botão de aprovar).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
