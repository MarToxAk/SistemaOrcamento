---
status: partial
phase: 05-ux-do-painel-e-area-do-cliente
source: [05-VERIFICATION.md]
started: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Filter pills live behavior
expected: Clicar em pill de status (ex: APROVADO) → tabela atualiza mostrando apenas orçamentos com aquele status e URL inclui `?status=APROVADO`
result: [pending]

### 2. Toast feedback
expected: Alterar status de um orçamento → toast Bootstrap aparece com mensagem de sucesso e some automaticamente após ~3,5s
result: [pending]

### 3. Form validation visual
expected: Submeter formulário de novo orçamento vazio → bordas vermelhas e mensagens de erro inline aparecem nos campos obrigatórios; bordas verdes NÃO aparecem em campos válidos não tocados
result: [pending]

### 4. Integration badges with DB data
expected: Orçamento com NFS-e emitida exibe badge "NFS-e #XXX" com link. Orçamento com PIX confirmado exibe badge "PIX Confirmado". Orçamento aprovado pelo cliente exibe badge "Aprovado pelo Cliente".
result: [pending]

### 5. Customer approval flow
expected: Acessar `/orcamento/{id}/approve?token={token_valido}` → página carrega dados do orçamento → clicar "Aprovar Orçamento" → estado muda para "Orçamento Aprovado!" sem reload de página
result: [pending]

### 6. Status page unauthenticated access
expected: Acessar `/orcamento/{id}/status` sem autenticação → página carrega com status atual do orçamento (não redireciona para login)
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
