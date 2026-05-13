---
status: complete
date: 2026-05-11
---

# Summary - Patch Athos V2 (Pagamento Triplo)

## Entrega

✓ PATCH de conta a pagar agora roda em transação (`BEGIN/COMMIT/ROLLBACK`)
✓ Quando `statusconta = PAG`, o backend grava automaticamente:
- `livro_registro_io` (valorsaida, idcontapagar, idfuncionario e metadados disponíveis)
- `caixa_saida` (idcaixacentral, idcontapagar, valor e metadados disponíveis)
✓ Validações de liquidação adicionadas:
- `idcaixacentral` obrigatório para `PAG`
- `idfuncionario` obrigatório para `PAG`
✓ DTO de update expandido com `idcaixacentral`
✓ README_ATHOS atualizado com fluxo de liquidação automática
✓ Suíte Athos atualizada e aprovada

## Arquivos Modificados

- apps/backend/src/modules/integrations/athos/athos.service.ts
- apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts
- apps/backend/src/modules/integrations/athos/athos.service.test.ts
- .planning/README_ATHOS.md

## Validação Final

npm --workspace @bomcusto/backend run test -- athos --no-coverage
✓ 3 suites passed
✓ 41 tests passed

npm --workspace @bomcusto/backend run build
✓ Success
