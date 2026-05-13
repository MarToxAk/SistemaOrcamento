---
status: complete
date: 2026-05-11
---

# Summary - Schema Completo Athos

## Entrega

✓ GET /athos/contas-pagar agora retorna o conjunto expandido de campos de conta_pagar via mapper centralizado
✓ CreateContaPagarDto expandido com os campos do DDL relevante
✓ Novo UpdateContaPagarDto criado
✓ Novo PATCH /athos/contas-pagar/:id implementado com retorno do registro atualizado
✓ idcontapagar mantido nos retornos de listagem, criação e atualização
✓ Testes do módulo Athos ampliados para GET expandido e PATCH

## Arquivos Modificados

- apps/backend/src/modules/integrations/athos/athos-conta-pagar.util.ts
- apps/backend/src/modules/integrations/athos/athos.service.ts
- apps/backend/src/modules/integrations/athos/athos.controller.ts
- apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
- apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts
- apps/backend/src/modules/integrations/athos/athos.service.test.ts
- apps/backend/src/modules/integrations/athos/athos.controller.test.ts

## Validação Final

npm --workspace @bomcusto/backend run build
✓ Success

npm --workspace @bomcusto/backend run test -- athos --no-coverage
✓ 3 suites passed
✓ 40 tests passed
