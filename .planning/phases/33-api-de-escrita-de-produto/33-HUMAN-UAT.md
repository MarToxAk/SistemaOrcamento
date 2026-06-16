---
status: partial
phase: 33-api-de-escrita-de-produto
source: [33-VERIFICATION.md]
started: 2026-06-16T13:00:00Z
updated: 2026-06-16T13:00:00Z
---

## Current Test

[aguardando verificação humana]

## Tests

### 1. Permissões de Escrita do ATHOS_PG_USER
expected: has_table_privilege retorna true para INSERT e UPDATE em produto; SELECT em produto_departamento, produto_grupo, produto_marca
result: [pending]

### 2. ATHOS_SISTEMA_USUARIO_ID configurado com idfuncionariousuario válido
expected: SELECT 1 FROM funcionario_usuario WHERE idfuncionariousuario = <valor> retorna uma linha
result: [pending]

### 3. Swagger exibe os 3 endpoints de escrita sob a tag Athos (SPROD-04)
expected: POST /athos/produtos, PATCH /athos/produtos/{idproduto}, PATCH /athos/produtos/{idproduto}/status visíveis em /api/docs na ordem correta (status antes de :id)
result: [pending]

### 4. Teste end-to-end em homologação: criar produto, editar preço, desativar, confirmar sem DELETE físico
expected: POST retorna idproduto; PATCH edita sem erro; PATCH status desativa; produto permanece no banco com statusproduto/vendeproduto=false
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
