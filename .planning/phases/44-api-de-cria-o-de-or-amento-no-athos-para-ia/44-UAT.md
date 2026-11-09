---
status: testing
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
source: [44-VERIFICATION.md]
started: 2026-11-09T15:02:21Z
updated: 2026-11-09T15:02:21Z
---

## Current Test

number: 1
name: A1 - Permissoes do usuario da API no Athos de producao
expected: |
  Passo 1 do 44-ROTEIRO-VERIFICACAO-MANUAL.md (so SELECT): has_table_privilege / has_sequence_privilege verdadeiros para INSERT em orcamento, orcamento_item, orcamento_forma_pagamento; DELETE em orcamento_forma_pagamento; USAGE nas 4 sequences. SELECT version() mostra 9.0.5.
awaiting: user response

## Tests

### 1. A1 - Permissoes (GRANTs) do usuario ATHOS_PG_USER em producao
expected: todas as permissoes acima verdadeiras (DBA concede o que faltar)
result: [pending]

### 2. A4 - SQL roda no PostgreSQL 9.0.5 real
expected: Passos 3 e 4 do roteiro (busca, leitura e simulacao) respondem sem erro em producao; POST sem simular responde 503 com ATHOS_ORCAMENTO_ESCRITA=false
result: [pending]

### 3. A2/A3 - Orcamento criado pela API aparece no Balcao
expected: Passos 5-7: com ATHOS_ORCAMENTO_ESCRITA=true e ids de funcionario/vendedor/terminal definidos, UM orcamento de teste aparece no Balcao.exe com senha, itens, total e PIX, independente do terminal. Registrar idorcamento/senhabalcao.
result: [pending]

### 4. Idempotencia real
expected: Passo 8: repetir o POST com a mesma Idempotency-Key nao cria outro orcamento (migration 20261109120000_add_athos_orcamento_ia aplicada antes)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
