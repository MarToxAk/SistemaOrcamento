---
quick_id: 260511-swg
slug: swagger-contas-pagar-anexos
phase: quick
plan: 260511-swg
subsystem: backend/integrations/athos
tags: [swagger, openapi, nestjs, documentation]
dependency_graph:
  requires: []
  provides: [openapi-docs-athos-endpoints]
  affects: [apps/backend/src/main.ts, apps/backend/src/modules/integrations/athos]
tech_stack:
  added: ["@nestjs/swagger@^11.4.2"]
  patterns: [OpenAPI 3.0 documentation via NestJS decorators]
key_files:
  created: []
  modified:
    - apps/backend/package.json
    - apps/backend/src/main.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
    - apps/backend/src/modules/integrations/athos/dto/upload-conta-pagar-anexo.dto.ts
decisions:
  - "Usada @nestjs/swagger@^11.4.2 em vez de ^8.1.0 do plano: v8 requer NestJS ^9 ou ^10, mas o projeto usa NestJS v11"
  - "swagger-ui-express removido: @nestjs/swagger v11 inclui swagger-ui-dist diretamente, sem necessidade de dependência separada"
metrics:
  duration: ~5min
  completed: 2026-05-11
  tasks_completed: 3
  tasks_total: 3
---

# Quick Task 260511-swg: Documentação OpenAPI (Swagger) — Contas a Pagar e Anexos

**One-liner:** Documentação OpenAPI completa para 4 endpoints do AthosController usando @nestjs/swagger v11 com autenticação ApiKey via x-api-token.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Instalar @nestjs/swagger e configurar Swagger em main.ts | 0b6b982 |
| 2 | @ApiProperty nos DTOs de conta-pagar e anexo | 4f69864 |
| 3 | @ApiOperation e decorators no AthosController | 271b9c9 |

## What Was Built

- **Swagger UI** disponível em `GET /api/docs` em ambiente não-produção
- **Autenticação** via `x-api-token` configurada como `ApiKey` no esquema `AthosApiToken`
- **4 endpoints documentados** no AthosController:
  - `GET /athos/contas-pagar` — filtros dataInicio, dataFinal, statusconta
  - `POST /athos/contas-pagar` — cria conta com body CreateContaPagarDto
  - `GET /athos/clientes` — busca paginada por nome/documento/idcliente
  - `POST /athos/contas-pagar/:id/anexo` — upload multipart/form-data
- **DTOs documentados:**
  - `CreateContaPagarDto`: @ApiProperty em 3 campos obrigatórios + @ApiPropertyOptional em 4 campos opcionais
  - `UploadContaPagarAnexoDto`: @ApiPropertyOptional em idfuncionario

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Versão incompatível de @nestjs/swagger**
- **Found during:** Task 1 (npm install)
- **Issue:** O plano especificou `@nestjs/swagger@^8.1.0`, que declara peerDependency `@nestjs/common@^9.0.0 || ^10.0.0`. O projeto usa NestJS v11 (`@nestjs/common@^11.1.19`), causando falha de resolução de dependência.
- **Fix:** Atualizado para `@nestjs/swagger@^11.4.2`, que declara `@nestjs/common@^11.0.1` como peer dependency.
- **Files modified:** `apps/backend/package.json`, `package-lock.json`
- **Commit:** 0b6b982

**2. [Rule 1 - Bug] swagger-ui-express desnecessário**
- **Found during:** Task 1 (análise de dependências)
- **Issue:** O plano incluiu `swagger-ui-express@^5.0.1`, mas @nestjs/swagger v11 inclui `swagger-ui-dist` como dependência direta, tornando o pacote separado redundante.
- **Fix:** Removido `swagger-ui-express` do package.json para evitar dependência desnecessária.
- **Files modified:** `apps/backend/package.json`
- **Commit:** 0b6b982

## Known Stubs

None — todos os campos documentados com exemplos reais.

## Threat Flags

None — apenas adição de decorators de documentação, sem novos endpoints ou mudanças de lógica.

## Self-Check

- [x] `@nestjs/swagger@^11.4.2` em apps/backend/package.json dependencies
- [x] Swagger configurado em main.ts (DocumentBuilder + SwaggerModule.setup em /api/docs)
- [x] CreateContaPagarDto tem @ApiProperty em todos os 7 campos
- [x] UploadContaPagarAnexoDto tem @ApiPropertyOptional em idfuncionario
- [x] AthosController tem @ApiTags("Athos") + @ApiSecurity("AthosApiToken") na classe
- [x] Todos os 4 métodos do controller têm @ApiOperation
- [x] TypeScript compila sem erros (npx tsc --noEmit: sem output = sucesso)

## Self-Check: PASSED
