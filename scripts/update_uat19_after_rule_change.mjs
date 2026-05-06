import { writeFileSync } from 'fs';

const path = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
const content = `---
status: testing
phase: 19-aprovacao-associada-caixa-athos
source:
  - 19-01-SUMMARY.md
  - 19-02-SUMMARY.md
started: 2026-05-05T00:00:00Z
updated: 2026-05-05T00:00:00Z
---

## Current Test

number: 1
name: Bloquear EM_PRODUCAO sem associacao e sem pagamento
expected: |
  Tentar avancar um orcamento para EM_PRODUCAO sem cliente associado ao Athos
  e sem pagamento confirmado (approved=false e saleExternalId ausente)
  deve retornar erro com mensagem de "confirmacao de pagamento".
awaiting: user response

## Tests

### 1. Bloquear EM_PRODUCAO sem associacao e sem pagamento
expected: Tentar avancar um orcamento para EM_PRODUCAO sem cliente associado e sem pagamento confirmado deve retornar erro com mensagem de confirmacao de pagamento.
result: [pending]

### 2. Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
result: [pending]

### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: [pending]

### 4. Permitir EM_PRODUCAO sem associacao quando pagamento foi confirmado
expected: Um orcamento sem associacao Athos deve conseguir avancar para EM_PRODUCAO se tiver approved=true ou saleExternalId preenchido.
result: [pending]

### 5. Conciliacao automatica ao abrir orcamento com ID Athos
expected: Ao abrir/buscar um orcamento com externalQuoteId, o sistema aciona em segundo plano a conciliacao com o Caixa Athos (relacao_orcamento_venda). Se houver idvenda, saleExternalId e preenchido sem bloquear a resposta do getById.
result: [pending]

### 6. Conciliacao nao reprocessa saleExternalId ja preenchido
expected: Se o orcamento ja tem saleExternalId definido, a conciliacao nao sobrescreve o valor (idempotencia).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
`;

writeFileSync(path, content, 'utf8');
console.log('UAT atualizado');
