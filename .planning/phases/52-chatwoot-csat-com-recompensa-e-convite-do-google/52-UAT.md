---
status: testing
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
source: [52-VERIFICATION.md]
started: 2026-11-22T20:26:17Z
updated: 2026-11-22T20:26:17Z
---

## Current Test

number: 1
name: Homologação em Chatwoot de teste (Passos 0-17)
expected: |
  Um único link no fechamento; input_csat privada invisível ao cliente; nota no relatório nativo; nota privada, atributos e etiquetas; SAIR suprime e reabre; segunda conversa sem segunda input_csat; cupom e convite separados; resgate e revogação; backstops de UI.
awaiting: user response

## Tests

### 1. Homologação em Chatwoot de teste (Passos 0-17)
expected: Um único link no fechamento; input_csat privada invisível ao cliente; nota no relatório nativo; nota privada, atributos e etiquetas; SAIR suprime e reabre; segunda conversa sem segunda input_csat; cupom e convite separados; resgate e revogação; backstops de UI.
result: [pending]

### 2. Pré-condição de ativação: csat_survey_enabled desligado nas inboxes WhatsApp
expected: Todas as inboxes WhatsApp com false antes de ativar; sem dois links.
result: [pending]

### 3. Parecer jurídico antes de produção
expected: Parecer registrado; retenção continua desligada (PESQUISA_RETENCAO_ATIVA=false) até lá.
result: [pending]

### 4. UAT visual/acessibilidade (UI review 15/24)
expected: Telas aderentes ao UI-SPEC ou desvios aceitos documentalmente.
result: [pending]

### 5. Ativação em produção por empresa (Passo 18) e reversão
expected: Ativação por etapa, reversível sem deploy.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
