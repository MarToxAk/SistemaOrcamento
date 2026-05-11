---
quick_id: 260511-swg
slug: swagger-contas-pagar-anexos
type: quick
autonomous: true
files_modified:
  - apps/backend/package.json
  - apps/backend/src/main.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.ts
  - apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
  - apps/backend/src/modules/integrations/athos/dto/upload-conta-pagar-anexo.dto.ts
---

# Quick Task 260511-swg: Documentação OpenAPI (Swagger) — Contas a Pagar e Anexos

**Objetivo:** Adicionar documentação OpenAPI/Swagger aos endpoints `/athos/contas-pagar` (GET/POST) e `/athos/contas-pagar/:id/anexo` (POST) usando `@nestjs/swagger`.

## Task 1: Instalar @nestjs/swagger e configurar Swagger em main.ts

**Arquivos:** `apps/backend/package.json`, `apps/backend/src/main.ts`

**Action:**

1. Adicionar ao `package.json` em `dependencies`:
   ```json
   "@nestjs/swagger": "^8.1.0",
   "swagger-ui-express": "^5.0.1"
   ```

2. Rodar instalação:
   ```bash
   npm install --workspace=apps/backend
   ```

3. Em `main.ts`, após `app.useGlobalPipes(...)` e antes de `app.listen(port)`, adicionar:
   ```typescript
   import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

   // Swagger — disponível apenas fora de produção
   if (process.env.NODE_ENV !== "production") {
     const config = new DocumentBuilder()
       .setTitle("BomCusto API")
       .setDescription("API interna do Sistema de Orçamento BomCusto")
       .setVersion("2.0")
       .addApiKey({ type: "apiKey", name: "x-api-token", in: "header" }, "AthosApiToken")
       .build();
     const document = SwaggerModule.createDocument(app, config);
     SwaggerModule.setup("api/docs", app, document);
   }
   ```

**Verify:**
```bash
cd apps/backend && npx tsc --noEmit
# Confirmar que @nestjs/swagger está em node_modules
ls node_modules/@nestjs/swagger/dist/index.d.ts
```

## Task 2: Decorators @ApiProperty nos DTOs

**Arquivos:**
- `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts`
- `apps/backend/src/modules/integrations/athos/dto/upload-conta-pagar-anexo.dto.ts`

**Action para CreateContaPagarDto** — adicionar `@ApiProperty` / `@ApiPropertyOptional` de `@nestjs/swagger`:

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateContaPagarDto {
  @ApiProperty({ example: "Aluguel escritório maio/2026", description: "Descrição da conta a pagar" })
  @IsString()
  @IsNotEmpty()
  descricaoconta!: string;

  @ApiProperty({ example: "2026-05-31", description: "Data de vencimento (YYYY-MM-DD)" })
  @IsDateString()
  datavencimento!: string;

  @ApiProperty({ example: 4500.00, description: "Valor da conta (maior que 0)" })
  @IsNumber()
  @Min(0.01)
  valorconta!: number;

  @ApiPropertyOptional({ example: "2026-05-01", description: "Data de emissão (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  dataemissao?: string;

  @ApiPropertyOptional({ example: "Referente ao contrato #123", description: "Observação livre" })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ example: 42, description: "ID do fornecedor no Athos" })
  @IsOptional()
  @IsInt()
  idfornecedor?: number;

  @ApiPropertyOptional({ example: "NF-001234", description: "Número do documento (max 50 chars)" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numerodocumento?: string;
}
```

**Action para UploadContaPagarAnexoDto:**

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class UploadContaPagarAnexoDto {
  @ApiPropertyOptional({ example: 1, description: "ID do funcionário responsável pelo upload (default: 1)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idfuncionario?: number;
}
```

**Verify:**
```bash
grep -c "ApiProperty" apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
# esperado: >= 3
```

## Task 3: Decorators no AthosController

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos.controller.ts`

**Action:** Adicionar imports de `@nestjs/swagger` e decoradores nos 4 métodos:

```typescript
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
```

No controller, adicionar `@ApiTags("Athos")` e `@ApiSecurity("AthosApiToken")`:
```typescript
@ApiTags("Athos")
@ApiSecurity("AthosApiToken")
@Controller("athos")
export class AthosController {
```

Em `listarContasPagar`:
```typescript
@ApiOperation({ summary: "Listar contas a pagar do Athos", description: "Retorna contas a pagar filtradas por data de vencimento e/ou status. Padrão: últimos 30 dias até +30 dias." })
@ApiQuery({ name: "dataInicio", required: false, example: "2026-05-01", description: "Início do filtro de vencimento (YYYY-MM-DD)" })
@ApiQuery({ name: "dataFinal", required: false, example: "2026-05-31", description: "Fim do filtro de vencimento (YYYY-MM-DD)" })
@ApiQuery({ name: "statusconta", required: false, example: "ABE", description: "Filtro por status: ABE (aberto), PAG (pago), CAN (cancelado)" })
@ApiOkResponse({ description: "Lista de contas a pagar normalizadas" })
@ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
@Get("contas-pagar")
async listarContasPagar(...)
```

Em `criarContaPagar`:
```typescript
@ApiOperation({ summary: "Criar conta a pagar no Athos", description: "Insere novo registro na tabela conta_pagar do banco Athos e retorna o ID gerado." })
@ApiResponse({ status: 201, description: "Conta criada com sucesso", schema: { example: { idcontapagar: 42 } } })
@ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
@Post("contas-pagar")
async criarContaPagar(...)
```

Em `buscarClientes`:
```typescript
@ApiOperation({ summary: "Buscar clientes no Athos", description: "Busca clientes por nome (mín. 3 chars), CPF/CNPJ ou idcliente com paginação." })
@ApiQuery({ name: "nome", required: false, example: "BomCusto" })
@ApiQuery({ name: "documento", required: false, example: "62391927000157" })
@ApiQuery({ name: "idcliente", required: false, example: "123" })
@ApiQuery({ name: "page", required: false, example: "1" })
@ApiQuery({ name: "take", required: false, example: "20" })
@ApiOkResponse({ description: "Lista paginada de clientes" })
@Get("clientes")
async buscarClientes(...)
```

Em `anexarContaPagar`:
```typescript
@ApiOperation({ summary: "Anexar arquivo a uma conta a pagar", description: "Envia arquivo (PDF/PNG/JPG, max 10MB) e grava em \\\\192.168.3.203\\html\\Anexo\\contapagar\\{id}\\. Registra path na tabela anexo." })
@ApiConsumes("multipart/form-data")
@ApiParam({ name: "id", description: "ID da conta a pagar no Athos", example: 42 })
@ApiResponse({ status: 201, description: "Anexo criado", schema: { example: { idanexo: 7, caminhoanexo: "\\\\192.168.3.203\\html\\Anexo\\contapagar\\42\\fatura.pdf" } } })
@ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
@Post("contas-pagar/:id/anexo")
@UseInterceptors(FileInterceptor(...))
async anexarContaPagar(...)
```

**Verify:**
```bash
grep -c "ApiOperation" apps/backend/src/modules/integrations/athos/athos.controller.ts
# esperado: 4

cd apps/backend && npx tsc --noEmit
# esperado: sem erros
```

## must_haves

- `@nestjs/swagger` instalado e TypeScript compila sem erros
- Swagger UI acessível em `GET /api/docs` em ambiente de desenvolvimento
- 4 endpoints do AthosController documentados com `@ApiOperation`
- DTOs com `@ApiProperty` / `@ApiPropertyOptional` em todos os campos
- Autenticação via `x-api-token` configurada como `ApiKey` no esquema Swagger
