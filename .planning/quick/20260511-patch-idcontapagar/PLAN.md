---
slug: patch-idcontapagar
task: Patch de retorno de ID
description: Adicionar idcontapagar ao método listarContasPagar do AthosService
created: 2026-05-11
---

# Quick Task: Patch - Inclusão de idcontapagar no GET /contas-pagar

## Objetivo

Incluir a coluna `idcontapagar` no retorno da listagem de contas a pagar, viabilizando operações de upload e update vinculadas.

## Trabalho

1. Alterar AthosService.ts - método `listarContasPagar()`
   - Adicionar `idcontapagar` ao mapper de saída
   - Usar `pickNumber()` para extrair de forma tolerante

2. Atualizar README_ATHOS.md
   - Marcar como completo
   - Documentar a mudança

## Verificação

- [x] Build do backend: OK
- [x] Testes Athos: 36 passaram
- [x] Sem regressões
