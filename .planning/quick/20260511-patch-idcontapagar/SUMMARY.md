---
status: complete
date: 2026-05-11
---

# Summary - Patch idcontapagar

## Entrega

✓ Adicionado `idcontapagar` ao mapper do método `listarContasPagar()` em AthosService.ts
✓ Campo agora retorna como primeiro item do objeto JSON mapeado
✓ README_ATHOS.md atualizado para refletir conclusão
✓ Build validado com sucesso
✓ Testes Athos passaram (36 testes, 3 suites)

## Arquivos Modificados

- `apps/backend/src/modules/integrations/athos/athos.service.ts`
- `.planning/README_ATHOS.md`

## Validação Final

```
npm --workspace @bomcusto/backend run build
✓ Success

npm --workspace @bomcusto/backend run test -- athos --no-coverage
✓ 3 suites passed
✓ 36 tests passed
```

Pronto para commit e merge.
