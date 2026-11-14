---
status: testing
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
source: 48-01-SUMMARY.md, 48-02-SUMMARY.md, 48-03-SUMMARY.md, 48-04-SUMMARY.md, 48-05-SUMMARY.md
started: 2026-11-14T12:00:00Z
updated: 2026-11-14T12:00:00Z
---

## Current Test

number: 1
name: Boletos - seletor, direção e cabeçalhos
expected: |
  Em /contas-receber/boletos aparece "Ordenar por" (Data, Nome, Pago) e botão ↑/↓. Trocar o critério ou a direção reordena a tabela e muda ?ordem=&dir= na URL. Clicar no cabeçalho também ordena.
awaiting: user response

## Tests

### 1. Boletos - seletor, direção e cabeçalhos
expected: Seletor Data/Nome/Pago + ↑/↓ em /contas-receber/boletos reordena e grava ?ordem=&dir=; cabeçalhos clicáveis também ordenam.
result: [pending]

### 2. F5 e link colado
expected: Com uma ordem escolhida, F5 mantém a ordem; colar o link em outra aba abre igual; ?ordem=xyz inválido cai no padrão (vencimento, mais próximo primeiro).
result: [pending]

### 3. Clientes por Pago
expected: Em /contas-receber a lista de clientes tem coluna "Pago" e critério Pago; o valor de um cliente bate com o "Total pago" da tela dele (ou mostra "—" se o backend não foi publicado).
result: [pending]

### 4. Notas com mais de uma página
expected: Em /contas-receber/notas, ordenar por Nome vale em todas as páginas; trocar a ordem volta à página 1; PDF/XML/ZIP continuam funcionando.
result: [pending]

### 5. Abas do cliente
expected: Na tela do cliente, aba Boletos mostra "Venc." e "Pago em" por grupo e oferece só Data e Pago; aba Notas oferece só Data; trocar de aba limpa a ordem.
result: [pending]

### 6. Backend publicado
expected: Com o backend da fase 48 na VPS, "Pago em" aparece nos boletos pagos e total_pago vem numérico.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
