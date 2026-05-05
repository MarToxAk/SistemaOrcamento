---
status: diagnosed
phase: 08-ux-paginas-publicas-do-cliente
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
started: 2026-05-03T00:00:00Z
updated: 2026-05-05T02:04:20Z
---

## Current Test

[testing complete]

## Tests

### 1. Badge de status com cor sólida e emoji
expected: |
  Abra a página de status de um orçamento (ex: /orcamento/{id}/status).
  O badge deve exibir um emoji + label com fundo colorido sólido (ex: fundo verde para "Aprovado",
  amarelo para "Em Produção"). NÃO deve aparecer como classe Bootstrap (badge bg-success).
  O estilo é inline no elemento <span>.
result: pass

### 2. Descrição do status abaixo do badge
expected: |
  Na mesma página de status, abaixo do badge colorido, deve aparecer um parágrafo de texto
  com a descrição do status em português.
  Ex: status "em_producao" → "Seu pedido está sendo produzido pela nossa equipe."
  A descrição deve corresponder ao status atual do orçamento.
result: pass

### 3. Aprovação bem-sucedida — texto atualizado
expected: |
  Acesse /orcamento/{id}/approve?token={token} de um orçamento PENDENTE de aprovação.
  Clique em "Aprovar Orçamento". Após a confirmação, o estado "success" deve exibir:
  "Nossa equipe já foi notificada e em breve seu pedido entra em produção. Avisaremos assim que estiver pronto."
  (Não mais: "Recebemos sua aprovação. Em breve nossa equipe entrará em contato.")
result: issue
reported: "O link de aprovação é para somente cliente associados com id no idcliente no orçamento nos deimais sem não precisa de link de aprovação e tambem nem esta enviando para cliente aprovação do cliente seria o pagamento."
severity: major

### 4. Estado "já aprovado" — orçamento aprovado anteriormente
expected: |
  Acesse /orcamento/{id}/approve?token={token} de um orçamento que JÁ foi aprovado anteriormente.
  A página deve exibir o estado "Orçamento já aprovado" (com ícone check verde e a mensagem:
  "Você já aprovou este orçamento anteriormente. Nossa equipe está cuidando do seu pedido.")
  e NÃO o estado de "Aprovação de Orçamento" (botão de aprovar).
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Aprovação por link deve ocorrer no contexto correto e acionar comunicação esperada ao cliente"
  status: failed
  reason: "User reported: O link de aprovação é para somente cliente associados com id no idcliente no orçamento nos deimais sem não precisa de link de aprovação e tambem nem esta enviando para cliente aprovação do cliente seria o pagamento."
  severity: major
  test: 3
  root_cause: "Regra de envio em enviarParaCliente usa somente clienteId para anexar approvalLink e nao considera explicitamente customer.isAssociated nem diferencia fluxo de aprovacao por pagamento para nao associados."
  artifacts:
    - path: "apps/backend/src/modules/quotes/quotes.service.ts"
      issue: "Bloco de approvalLink em enviarParaCliente (clienteId) sem gate por customer.isAssociated e sem separar aprovacao por pagamento."
    - path: "apps/frontend/src/app/orcamento/[id]/approve/page.tsx"
      issue: "Fluxo de aprovacao por token sempre apresentado quando ha token, sem regra de elegibilidade por associado."
  missing:
    - "Aplicar gate do approvalLink: enviar somente quando customer.isAssociated=true e idcliente valido."
    - "Para nao associados, remover dependencia de link de aprovacao e manter aprovacao via pagamento confirmado (webhook/conciliacao)."
    - "Adicionar testes cobrindo associado x nao associado no envio da mensagem e presenca/ausencia de approvalLink."
  debug_session: ".planning/phases/08-ux-paginas-publicas-do-cliente/08-UAT.md"
  implementation_status: "fixed-in-branch"
  fix_refs:
    - "apps/backend/src/modules/quotes/quotes.service.ts"
    - "apps/backend/src/modules/quotes/quotes.service.unit.test.ts"
