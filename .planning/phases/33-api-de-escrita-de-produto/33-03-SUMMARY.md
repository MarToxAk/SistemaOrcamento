---
plan: 33-03
phase: 33
subsystem: backend/integrations/athos
tags: [nestjs, postgresql, produto, toggle-status, unit-tests]
dependency_graph:
  requires: [33-01, 33-02]
  provides: [alterarStatusProduto-tests]
  affects: [athos-produto.service.test.ts]
tech_stack:
  added: []
  patterns: [pg-pool-connect-release, jest-mock-pg, structured-logging]
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
decisions:
  - "alterarStatusProduto ja implementado em 33-01 (commit b55b3ea) — tarefa 33-03-01 confirmada completa sem novo commit"
  - "5 casos de teste adicionados em describe(alterarStatusProduto) cobrindo DPROD-01..03 e SPROD-01"
metrics:
  duration: "8 min"
  completed: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 33 Plan 03: Endpoint PATCH /:idproduto/status (Desativar/Reativar) Summary

Toggle de status de produto via UPDATE (nunca DELETE) com 5 testes unitarios cobrindo DPROD-01..03 e SPROD-01.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 33-03-01 | Implementar alterarStatusProduto no AthosProdutoService | b55b3ea (wave 1) | athos-produto.service.ts |
| 33-03-02 | Testes unitarios de alterarStatusProduto | 5e74a09 | athos-produto.service.test.ts |

## What Was Built

### Task 33-03-01: alterarStatusProduto (ja implementado em wave 1)

O metodo `alterarStatusProduto(idproduto: number, ativo: boolean)` foi implementado no commit `b55b3ea` da wave 1 (plan 33-01). A implementacao segue exatamente o padrao especificado:

- Verificacao de existencia: `SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1`
- Lanca `NotFoundException` (`Produto ${idproduto} nao encontrado`) se nao existir
- UPDATE atomico: `UPDATE produto SET statusproduto = $1, vendeproduto = $1, idusuarioalteracao = $2 WHERE idproduto = $3`
- Mesmo `$1` (ativo) aplicado a `statusproduto` e `vendeproduto` — garantindo consistencia (D-07)
- Nunca emite DELETE (DPROD-03)
- Log estruturado: `deactivate idproduto=N idusuario=N` ou `reactivate idproduto=N idusuario=N`
- `client.release()` chamado no `finally` em todos os caminhos

### Task 33-03-02: Testes unitarios

Adicionado `describe("alterarStatusProduto")` ao `athos-produto.service.test.ts` com 5 casos:

1. **deactivate seta statusproduto e vendeproduto false** (DPROD-01) — verifica retorno `{ idproduto: 7, ativo: false }` e que `params[0] === false`
2. **reactivate seta statusproduto e vendeproduto true** (DPROD-02) — verifica retorno `{ idproduto: 7, ativo: true }` e que `params[0] === true`
3. **produto inexistente lanca NotFoundException (404)** — SELECT retorna `rows: []`; asserido nenhum UPDATE emitido; `client.release` chamado
4. **nunca emite DELETE** (DPROD-03) — verificado em deactivate e reactivate; todos os SQLs inspecionados
5. **escreve apenas na tabela produto** (SPROD-01) — UPDATE com alvo `UPDATE PRODUTO SET` verificado; apenas 1 write emitido

Total de testes no arquivo: **19 passando** (14 pre-existentes + 5 novos).

## Verification

```
npx jest athos-produto.service.test.ts --no-coverage
Tests: 19 passed, 19 total
```

TypeScript: `npx tsc --noEmit` exits 0.

## Deviations from Plan

### Pre-implementado em wave anterior

**Tarefa 33-03-01 (Implementar alterarStatusProduto):** O metodo ja estava implementado no commit `b55b3ea feat(33-01): criar AthosProdutoService com criarProduto/editarProduto/alterarStatusProduto` da wave 1. O agente de 33-01 implementou todos os tres metodos de escrita em um unico commit. Nenhuma reimplementacao foi necessaria — verificado que o codigo esta correto segundo todos os criterios de aceitacao do plano 33-03-01.

## Known Stubs

Nenhum stub identificado. O metodo `alterarStatusProduto` esta completamente implementado e testado.

## Threat Flags

Nenhuma nova superficie de segurança introduzida neste plano. O endpoint ja foi registrado no plano 33-04 (controller).

## Self-Check: PASSED

- [x] athos-produto.service.test.ts modificado — FOUND
- [x] Commit 5e74a09 existe: `git log --oneline | grep 5e74a09` — FOUND
- [x] 19 testes passando — VERIFIED
- [x] TypeScript compila sem erros — VERIFIED
- [x] describe("alterarStatusProduto") com 5 casos presente — VERIFIED
