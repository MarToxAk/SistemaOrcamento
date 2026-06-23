---
status: partial
phase: 32-api-de-busca-de-produto
source: [32-VERIFICATION.md]
started: 2026-06-15T00:00:00Z
updated: 2026-06-15T00:00:00Z
---

## Current Test

[aguardando testes humanos]

## Tests

### 1. 401 sem x-internal-api-key
expected: APP_GUARD bloqueia ProdutoController — `curl http://localhost:3333/athos/produtos` (sem header) retorna HTTP 401
result: [pending]

### 2. Busca por descrição retorna dados reais do Athos
expected: `curl -H "x-internal-api-key: $KEY" "http://localhost:3333/athos/produtos?descricao=papel&page=1&take=5"` retorna 200 com `total >= 1` e `items.length == 5`
result: [pending]

### 3. Campo imagemproduto é null na resposta HTTP
expected: Um item de qualquer busca tem `imagemproduto: null` — não `{type:"Buffer",...}`. Confirmar que NULL::bytea não serializa como Buffer.
result: [pending]

### 4. Lookups retornam arrays do banco real
expected: `curl -H "x-internal-api-key: $KEY" "http://localhost:3333/athos/produtos/lookup/departamentos"` retorna 200 com array `[{ id: number, nome: string }, ...]`
result: [pending]

### 5. Rota /lookup/* não conflita com /:idproduto
expected: `GET /athos/produtos/lookup/departamentos` retorna o array de departamentos, NÃO uma 400 de ParseIntPipe tentando converter "lookup" para inteiro
result: [pending]

### 6. Busca sem filtro com take capado
expected: `curl -H "x-internal-api-key: $KEY" "http://localhost:3333/athos/produtos?page=1&take=10"` retorna 200 com `total >= 28836` e `items.length == 10`
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
