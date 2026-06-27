---
status: testing
phase: 38-aplica-o-de-defaults-na-cria-o-de-produto
source: [38-VERIFICATION.md]
started: 2026-06-27
updated: 2026-06-27
---

## Current Test

number: 1
name: Defaults operacionais aplicados na criação (DOPR-01/02) — confirmar no Athos real
expected: |
  Criar um produto via API SEM informar statusproduto, vendeproduto, controlaestoque,
  baixarestoque nem estoqueloja. Buscar o idproduto retornado no banco Athos e confirmar:
  statusproduto=true, vendeproduto=true, controlaestoque=true, baixarestoque=true, estoqueloja='10'.
awaiting: user response

## Tests

### 1. Defaults operacionais na criação (DOPR-01/02)
expected: Produto criado sem status/estoque nasce com statusproduto=true, vendeproduto=true, controlaestoque=true, baixarestoque=true, estoqueloja='10' — confirmável buscando o produto recém-criado no Athos.
result: [pending]

### 2. Defaults fiscais por moda na criação (DFIS-01/02/03)
expected: Produto criado sem os campos fiscais recebe, no Athos, os valores de moda calculados pelo motor da Fase 37 para os campos com amostra; campos fiscais sem moda calculável ficam ausentes no registro (não "chutados").
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
