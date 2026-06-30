---
status: complete
phase: 17-correcao-desconto-nfse
source: [17-01-SUMMARY.md]
started: 2026-05-04T00:00:00Z
updated: 2026-05-04T00:00:00Z
---

## Current Test

## Current Test

[testing complete]

## Tests

### 1. Valor total pre-preenchido ao ativar desconto
expected: Ao ativar o switch "Aplicar desconto" no modal NFS-e, o campo "Valor total" exibe o total real do orcamento, nao zero.
result: pass

### 2. Calculo bidirecional a partir do percentual
expected: Digitar 10 no campo "% desconto" atualiza "R$ desconto" e "Valor total" com base no total correto do orcamento (ex: total=500 → R$50 de desconto, valor total=450).
result: pass

### 3. Calculo bidirecional a partir do valor R$
expected: Digitar 100 em "R$ desconto" atualiza "% desconto" e "Valor total" corretamente (ex: total=500 → 20% de desconto, valor total=400).
result: pass

### 4. Clamping do valor total
expected: Digitar um valor total maior que o total do orcamento e automaticamente corrigido para o total maximo permitido.
result: pass

### 5. NFS-e emitida com desconto correto no SOAP
expected: Ao emitir NFS-e com desconto ativo (ex: 10%), o backend aplica o desconto corretamente — o XML SOAP contem descontoIncondicionado > 0 e o log do backend nao mostra descontoIncondicionado=0.
result: pass
note: XML SOAP confirmado com DescontoIncondicionado=0.10 (10% de R$2.00). Erro 400 E260/E43 e separado — NFSE_CNPJ_PRESTADOR e NFSE_INSCRICAO_MUNICIPAL vazios no env dev, nao relacionado ao desconto.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

