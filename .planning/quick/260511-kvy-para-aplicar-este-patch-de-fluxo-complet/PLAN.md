---
slug: patch-athos-v2-pagamento-triplo
task: Implementar Fluxo Completo de Pagamento e GED (Patch Athos V2)
description: Expandir PATCH de conta_pagar para liquidação transacional com lançamentos em livro_registro_io e caixa_saida
created: 2026-05-11
---

# Quick Task: Patch Athos V2 - Pagamento Triplo

## Objetivo

Implementar a liquidação automática no PATCH de contas a pagar para que, ao marcar uma conta como paga, o sistema lance os registros financeiros filhos em transação única.

## Escopo

1. PATCH /athos/contas-pagar/:id com transação SQL (`BEGIN/COMMIT/ROLLBACK`)
2. Regra de negócio: quando `statusconta = PAG`, inserir em `livro_registro_io` e `caixa_saida`
3. Exigir `idcaixacentral` no fluxo `PAG`
4. Atualizar documentação operacional em README_ATHOS.md
5. Cobrir cenários de sucesso e validação em testes Athos

## Verificação Planejada

- `npm --workspace @bomcusto/backend run test -- athos --no-coverage`
- `npm --workspace @bomcusto/backend run build`
