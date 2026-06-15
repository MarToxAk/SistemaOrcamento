# Phase 33: API de Escrita de Produto - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 8 (4 novos + 4 modificados)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` | service | CRUD (write) | `apps/backend/src/modules/integrations/athos/athos.service.ts` (métodos `criarContaPagar` / `updateContaPagar`) | exact |
| `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts` | DTO | request-response | `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` | exact |
| `apps/backend/src/modules/integrations/athos/dto/update-produto.dto.ts` | DTO | request-response | `apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts` | exact |
| `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` | test | — | `apps/backend/src/modules/integrations/athos/athos.service.test.ts` (blocos `criarContaPagar`) | exact |
| `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` | controller | request-response | si mesmo (acrescentar endpoints) | self |
| `apps/backend/src/modules/integrations/athos/athos.module.ts` | config/module | — | si mesmo (acrescentar provider/export) | self |
| `apps/backend/src/modules/app.module.ts` | config | — | si mesmo (acrescentar REQUIRED_ENV_VARS) | self |
| `apps/backend/.env.example` + `deploy/stack.env.example` | config | — | arquivo existente (acrescentar linha) | self |

---

## Pattern Assignments

---

### `athos-produto.service.ts` (service, CRUD write)

**Analog primário:** `apps/backend/src/modules/integrations/athos/athos.service.ts`
**Seções de referência:** L500–528 (pool lazy-init), L1209–1268 (`criarContaPagar`), L1271–1313 (`updateContaPagar`)

#### Imports pattern (replicar do topo de `athos.service.ts`)

```typescript
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CreateProdutoDto } from "./dto/create-produto.dto";
import { UpdateProdutoDto } from "./dto/update-produto.dto";
```

#### Pool lazy-init pattern (`athos.service.ts` L500–528)

```typescript
@Injectable()
export class AthosProdutoService {
  private readonly logger = new Logger(AthosProdutoService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      throw new InternalServerErrorException(
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
      );
    }

    return { host, database, user, password, port };
  }
}
```

**Diferença do `AthosService`:** `AthosProdutoService` cria pool próprio (mesma estratégia que `AthosListenerService`). Não recebe injeção de pool externo.

#### criarContaPagar como referência de write pattern (`athos.service.ts` L1209–1268)

```typescript
// Padrão: pool.connect() → client.query() → client.release() no finally
// Para produto: SEM BEGIN/COMMIT/LOCK TABLE pois idproduto é serial
async criarContaPagar(dto: CreateContaPagarDto): Promise<{ idcontapagar: number }> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    // ... INSERT ...
    const result = await client.query<{ idcontapagar: number }>(
      `INSERT INTO "conta_pagar" (...) VALUES (...) RETURNING "idcontapagar" as "idcontapagar"`,
      paramsWithId,
    );
    // await client.query("COMMIT");   ← NÃO USAR para produto (serial elimina necessidade)
    this.logger.log(`[Athos] conta_pagar criada: idcontapagar=${idcontapagar}`);
    return { idcontapagar };
  } catch (error) {
    // await client.query("ROLLBACK"); ← NÃO USAR para produto
    this.logger.error(`Erro ao criar conta a pagar no Athos: ${error}`);
    if (error instanceof BadRequestException || error instanceof InternalServerErrorException || error instanceof NotFoundException) throw error;
    throw new InternalServerErrorException("Erro ao criar conta a pagar no Athos");
  } finally {
    client.release();   // ← OBRIGATÓRIO no finally
  }
}
```

#### INSERT para produto — padrão adaptado (serial + RETURNING, sem LOCK TABLE)

```typescript
async criarProduto(dto: CreateProdutoDto): Promise<{ idproduto: number }> {
  const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    // Pre-validação FK (se informadas)
    if (dto.iddepartamento !== undefined) {
      await this.validarFkExiste(client, "produto_departamento", "iddepartamento", dto.iddepartamento, "Departamento");
    }
    // ... idem para idgrupo, idmarca ...

    const result = await client.query<{ idproduto: number }>(
      `INSERT INTO produto (
         descricaoproduto, datacadastro, idusuariocadastro, idusuarioalteracao
         -- ... demais campos do DTO com $n ...
       ) VALUES (
         $1, NOW(), $2, $2
         -- ... $n ...
       ) RETURNING idproduto`,
      [dto.descricaoproduto, sistemaUsuarioId /* ... */],
    );
    const idproduto = result.rows[0].idproduto;
    this.logger.log(`criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
    return { idproduto };
  } catch (err) {
    this.logger.error(`Erro ao criar produto: ${err}`);
    if (err instanceof BadRequestException || err instanceof UnprocessableEntityException || err instanceof NotFoundException) throw err;
    // FK violation do sistemaUsuarioId mal configurado
    if ((err as any).code === "23503") {
      throw new InternalServerErrorException("ATHOS_SISTEMA_USUARIO_ID invalido — usuario nao encontrado em funcionario_usuario");
    }
    throw new InternalServerErrorException("Erro ao criar produto no Athos");
  } finally {
    client.release();
  }
}
```

#### UPDATE parcial pattern — adaptado de `updateContaPagar` (`athos.service.ts` L1271–1313)

```typescript
// updateContaPagar usa assignments dinâmicos — para produto: mesmo padrão
async editarProduto(idproduto: number, dto: UpdateProdutoDto): Promise<{ idproduto: number }> {
  const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const exists = await client.query("SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1", [idproduto]);
    if (exists.rows.length === 0) throw new NotFoundException(`Produto ${idproduto} nao encontrado`);

    // Pre-validação FK se campos FK estão no dto...

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // idusuarioalteracao SEMPRE incluído (Pitfall 2 do RESEARCH.md)
    setClauses.push(`idusuarioalteracao = $${paramIndex++}`);
    params.push(sistemaUsuarioId);

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        setClauses.push(`"${key}" = $${paramIndex++}`);
        params.push(value);
      }
    }

    params.push(idproduto);
    await client.query(
      `UPDATE produto SET ${setClauses.join(", ")} WHERE idproduto = $${paramIndex}`,
      params,
    );
    this.logger.log(`editarProduto idproduto=${idproduto} campos=[${Object.keys(dto).join(",")}] idusuario=${sistemaUsuarioId}`);
    return { idproduto };
  } catch (err) {
    // mesma estrutura de catch de criarContaPagar
    if (err instanceof BadRequestException || err instanceof UnprocessableEntityException || err instanceof NotFoundException) throw err;
    throw new InternalServerErrorException("Erro ao editar produto no Athos");
  } finally {
    client.release();
  }
}
```

#### Pre-validação FK (helper privado — sem analog direto, padrão recomendado)

```typescript
private async validarFkExiste(
  client: PoolClient,
  tabela: string,
  coluna: string,
  id: number,
  nomeEntidade: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM "${tabela}" WHERE "${coluna}" = $1 LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new UnprocessableEntityException(
      `${nomeEntidade} com id ${id} nao encontrado no Athos`,
    );
  }
}
```

#### Toggle de status

```typescript
async alterarStatusProduto(idproduto: number, ativo: boolean): Promise<{ idproduto: number; ativo: boolean }> {
  const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const exists = await client.query("SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1", [idproduto]);
    if (exists.rows.length === 0) throw new NotFoundException(`Produto ${idproduto} nao encontrado`);

    await client.query(
      "UPDATE produto SET statusproduto = $1, vendeproduto = $1, idusuarioalteracao = $2 WHERE idproduto = $3",
      [ativo, sistemaUsuarioId, idproduto],
    );
    const operacao = ativo ? "reactivate" : "deactivate";
    this.logger.log(`${operacao} idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
    return { idproduto, ativo };
  } catch (err) {
    if (err instanceof NotFoundException) throw err;
    throw new InternalServerErrorException("Erro ao alterar status do produto no Athos");
  } finally {
    client.release();
  }
}
```

---

### `dto/create-produto.dto.ts` (DTO, request-response)

**Analog:** `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` (L1–213)

#### Imports pattern (L1–14 de `create-conta-pagar.dto.ts`)

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
```

#### Campo obrigatório — pattern (L17–20 de `create-conta-pagar.dto.ts`)

```typescript
export class CreateProdutoDto {
  @ApiProperty({ example: "Papel A4 75g Resma 500fls", description: "Descricao do produto (obrigatorio)" })
  @IsString()
  @IsNotEmpty()
  descricaoproduto!: string;
```

#### Campo opcional string com MaxLength — pattern (L62–67)

```typescript
  @ApiPropertyOptional({ example: "Papel A4", description: "Descricao curta" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  descricaocurta?: string;
```

#### Campo opcional inteiro FK — pattern (L32–37)

```typescript
  @ApiPropertyOptional({ example: 2, description: "ID do departamento no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  iddepartamento?: number;
```

#### Campo opcional numérico com range — pattern (`descontomaximo`, decisão D-09)

```typescript
  @ApiPropertyOptional({ example: 15.0, description: "Desconto maximo permitido (0 a 100)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  descontomaximo?: number;
```

#### Campo opcional booleano — pattern (L131–134)

```typescript
  @ApiPropertyOptional({ example: true, description: "Produto ativo" })
  @IsOptional()
  @IsBoolean()
  statusproduto?: boolean;
```

**Campos a incluir no DTO (D-04):** `descricaoproduto` (obrigatório), `descricaocurta`, `codigobarra1`, `codigobarra2`, `referencia`, `ncm`, `idunidade`, `iddepartamento`, `idgrupo`, `idmarca`, `idfornecedor`, `tipoproduto`, `valorvenda1`, `valorvenda2`, `valorvenda3`, `valorvenda4`, `valorvenda5`, `valorvenda6`, `valorvendapromocao`, `valorvendaatacado1`, `descontomaximo`, `valorcustounitario`, `controlaestoque`, `vendeproduto`, `statusproduto`, `informacaoadicional`, `observacao`

**Campos excluídos do DTO:** `idproduto`, `datacadastro`, `idusuariocadastro`, `idusuarioalteracao`, `dataultimaalteracao`, `horaultimaalteracao`, e todos os campos de grade / composição / série / cardápio / NBS / tributação IBS/CBS

---

### `dto/update-produto.dto.ts` (DTO partial, request-response)

**Analog:** `apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts` (L1–16)

#### Padrão completo (copiar literalmente, ajustando nomes)

```typescript
import { PartialType } from "@nestjs/swagger";
import { CreateProdutoDto } from "./create-produto.dto";

export class UpdateProdutoDto extends PartialType(CreateProdutoDto) {}
```

**Nota:** `PartialType` de `@nestjs/swagger` (não de `@nestjs/mapped-types`) — como no analog. Todos os campos de `CreateProdutoDto` ficam opcionais automaticamente.

---

### `athos-produto.controller.ts` (controller modificado, request-response)

**Analog:** si mesmo — `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` (L1–106, já lido)

#### Imports a acrescentar (com base nos imports existentes L1–17)

```typescript
// Novos imports a adicionar ao bloco @nestjs/common existente:
import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
// Novos imports @nestjs/swagger a adicionar:
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
// Imports do service novo e DTOs:
import { AthosProdutoService } from "./athos-produto.service";
import { CreateProdutoDto } from "./dto/create-produto.dto";
import { UpdateProdutoDto } from "./dto/update-produto.dto";
```

#### Constructor com dois services injetados

```typescript
// Substituir constructor existente (linha 26-27):
constructor(
  private readonly athosService: AthosService,
  private readonly athosProdutoService: AthosProdutoService,
) {}
```

#### Ordem de declaração de rotas (Pitfall 1 do RESEARCH.md)

```typescript
// PATCH :idproduto/status DEVE vir ANTES de PATCH :idproduto
// (segmento literal "status" capturado antes do paramétrico)
// Exatamente como já é feito com GET lookup/* antes de GET :idproduto (linha 28-29 do controller)

@Patch(":idproduto/status")   // ← primeiro
@Patch(":idproduto")          // ← segundo
```

#### Padrão de endpoint Swagger (baseado em GET :idproduto L55–68)

```typescript
@ApiOperation({ summary: "Criar produto no Athos" })
@ApiBody({ type: CreateProdutoDto })
@ApiOkResponse({ description: "{ idproduto: number }" })
@Post()
async criarProduto(@Body() dto: CreateProdutoDto) {
  this.logger.log(`criarProduto descricao="${dto.descricaoproduto}"`);
  return this.athosProdutoService.criarProduto(dto);
}

@ApiOperation({ summary: "Desativar ou reativar produto no Athos" })
@ApiParam({ name: "idproduto", example: "123" })
@ApiBody({ schema: { type: "object", properties: { ativo: { type: "boolean" } }, required: ["ativo"] } })
@ApiOkResponse({ description: "{ idproduto: number, ativo: boolean }" })
@Patch(":idproduto/status")
async alterarStatusProduto(
  @Param("idproduto", ParseIntPipe) id: number,
  @Body("ativo") ativo: boolean,
) {
  this.logger.log(`alterarStatusProduto idproduto=${id} ativo=${ativo}`);
  return this.athosProdutoService.alterarStatusProduto(id, ativo);
}

@ApiOperation({ summary: "Editar produto no Athos (partial update)" })
@ApiParam({ name: "idproduto", example: "123", description: "ID do produto no Athos" })
@ApiBody({ type: UpdateProdutoDto })
@ApiOkResponse({ description: "{ idproduto: number }" })
@Patch(":idproduto")
async editarProduto(
  @Param("idproduto", ParseIntPipe) id: number,
  @Body() dto: UpdateProdutoDto,
) {
  this.logger.log(`editarProduto idproduto=${id}`);
  return this.athosProdutoService.editarProduto(id, dto);
}
```

---

### `athos.module.ts` (config modificado)

**Analog:** si mesmo — `apps/backend/src/modules/integrations/athos/athos.module.ts` (L1–17, já lido)

#### Modificação necessária (adicionar 1 provider + 1 export)

```typescript
// Estado atual (L13–15):
providers: [AthosService, AthosListenerService],
exports: [AthosService],

// Estado final:
providers: [AthosService, AthosListenerService, AthosProdutoService],
exports: [AthosService, AthosProdutoService],
```

**Import a adicionar no topo:** `import { AthosProdutoService } from "./athos-produto.service";`

---

### `app.module.ts` (config modificado)

**Analog:** si mesmo — `apps/backend/src/modules/app.module.ts` L22–29

#### Modificação necessária (adicionar 1 item ao array)

```typescript
// Estado atual (L22–29):
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
] as const;

// Estado final (D-02 fail-fast):
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
  "ATHOS_SISTEMA_USUARIO_ID",
] as const;
```

---

### `athos-produto.service.test.ts` (test, novo)

**Analog:** `apps/backend/src/modules/integrations/athos/athos.service.test.ts` L1–100 e L369–468

#### Estrutura base de mock pg (L1–39 do analog)

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { AthosProdutoService } from "./athos-produto.service";

// Mock do módulo pg — deve vir antes dos imports do serviço
jest.mock("pg", () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
```

#### Setup de env vars (L44–51 do analog, adaptado)

```typescript
beforeAll(() => {
  process.env.ATHOS_PG_HOST = "localhost";
  process.env.ATHOS_PG_DB = "athos";
  process.env.ATHOS_PG_USER = "user";
  process.env.ATHOS_PG_PASS = "pass";
  process.env.ATHOS_PG_PORT = "5432";
  process.env.ATHOS_SISTEMA_USUARIO_ID = "1";  // nova env var
});
```

#### Padrão de beforeEach com módulo de teste (L53–59 do analog)

```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [AthosProdutoService],
  }).compile();
  service = module.get<AthosProdutoService>(AthosProdutoService);
});

afterEach(() => jest.clearAllMocks());
```

#### Padrão de mock de client por teste (L391–393 do analog)

```typescript
it("deve criar produto e retornar idproduto do RETURNING", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);

  // Sequência de queries:
  // [0] pre-query FK departamento (se informado)
  // [1] INSERT RETURNING idproduto
  client.query
    .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })   // FK válida
    .mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });   // INSERT RETURNING

  const result = await service.criarProduto({ descricaoproduto: "Papel A4" });

  expect(result).toEqual({ idproduto: 42 });
  expect(client.release).toHaveBeenCalled();           // verificar release obrigatório
  // Verificar que nenhuma query contém DELETE ou DISABLE TRIGGER:
  const allCalls = client.query.mock.calls.map(([sql]: [string]) => sql);
  expect(allCalls.every((sql: string) => !sql.includes("DELETE"))).toBe(true);
  expect(allCalls.every((sql: string) => !sql.includes("DISABLE TRIGGER"))).toBe(true);
});
```

#### Padrão de teste de FK inválida (422) — ver L438–455 do analog adaptado

```typescript
it("deve lancar UnprocessableEntityException (422) quando FK invalida informada", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);

  client.query.mockResolvedValueOnce({ rows: [] });  // pre-query FK retorna vazio

  await expect(
    service.criarProduto({ descricaoproduto: "Papel A4", iddepartamento: 9999 }),
  ).rejects.toThrow("Departamento com id 9999 nao encontrado no Athos");

  expect(client.release).toHaveBeenCalled();
});
```

#### Padrão de teste de pool.connect falha (L457–468 do analog)

```typescript
it("deve lancar erro quando pool.connect falha", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

  await expect(
    service.criarProduto({ descricaoproduto: "Papel A4" }),
  ).rejects.toThrow();
});
```

---

## Shared Patterns

### Pool connect/release obrigatório

**Source:** `athos.service.ts` — padrão repetido em todos os ~25 métodos de acesso ao banco
**Apply to:** Todos os métodos de `AthosProdutoService` (`criarProduto`, `editarProduto`, `alterarStatusProduto`)

```typescript
const client: PoolClient = await pool.connect();
try {
  // ... operação ...
} catch (err) {
  // ... re-throw após log ...
} finally {
  client.release();   // NUNCA omitir
}
```

### Logger estruturado

**Source:** `athos.service.ts` L501, L1255 / `athos-produto.controller.ts` L24, L36
**Apply to:** `AthosProdutoService` e métodos adicionados ao `ProdutoController`

```typescript
private readonly logger = new Logger(AthosProdutoService.name);  // no service
// Formato de log no service:
this.logger.log(`criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
this.logger.log(`editarProduto idproduto=${idproduto} campos=[${Object.keys(dto).join(",")}] idusuario=${sistemaUsuarioId}`);
this.logger.log(`deactivate idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
this.logger.log(`reactivate idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
this.logger.error(`Erro ao criar produto: ${err}`);
```

### Hierarquia de exceções HTTP

**Source:** `athos.service.ts` padrão catch em `criarContaPagar` (L1257–1265), `buscarVendaCaixa` (L1201–1203)
**Apply to:** todos os métodos de `AthosProdutoService`

| Situação | Exceção |
|----------|---------|
| Params inválidos (ex: id negativo) | `BadRequestException` (400) |
| FK inválida (pre-query) | `UnprocessableEntityException` (422) |
| Produto não encontrado | `NotFoundException` (404) |
| Falha de pool/banco/config | `InternalServerErrorException` (500) |

```typescript
// Padrão de re-throw seletivo (não engolir exceções já tipadas):
if (err instanceof BadRequestException || err instanceof UnprocessableEntityException || err instanceof NotFoundException) throw err;
throw new InternalServerErrorException("Erro ao ... no Athos");
```

### Autenticação — herança automática

**Source:** `apps/backend/src/modules/app.module.ts` L2, L17, L65–70 — `APP_GUARD` global com `InternalAuthGuard`
**Apply to:** Nenhuma ação necessária — todos os novos endpoints do `ProdutoController` ficam protegidos automaticamente por herança. SPROD-02 satisfeito sem código adicional.

### Logging de requisições mutantes — herança automática

**Source:** `apps/backend/src/modules/common/logging.interceptor.ts` via `APP_INTERCEPTOR` global
**Apply to:** Nenhuma ação necessária — POST e PATCH são automaticamente logados pelo `LoggingInterceptor` (método, URL, status, ms, IP). Não duplicar log no controller para o mesmo efeito.

### Swagger Security decorator

**Source:** `athos-produto.controller.ts` L20–22

```typescript
@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoController { ... }
```

Estes decorators já estão na classe — não remover ao modificar o controller.

---

## No Analog Found

Nenhum arquivo sem analog identificado nesta fase. Todos os novos artefatos têm correspondência direta no codebase existente.

---

## Metadata

**Analog search scope:** `apps/backend/src/modules/integrations/athos/` (leitura direta de todos os arquivos canônicos)
**Files scanned:** 8 arquivos lidos integralmente ou por seções não-sobrepostas
**Pattern extraction date:** 2026-06-15

**Pitfalls críticos extraídos do RESEARCH.md a documentar explicitamente para o planner:**

1. **Pitfall 1 — ordem de rotas PATCH:** `PATCH :idproduto/status` DEVE ser declarado antes de `PATCH :idproduto`. O controller existente já documenta esse princípio no comentário L28–29 ("Rotas estáticas declaradas ANTES da rota paramétrica").
2. **Pitfall 2 — idusuarioalteracao ausente no UPDATE:** `idusuarioalteracao` SEMPRE incluído no SET do UPDATE (injetado via env var, não via DTO).
3. **Pitfall 3 — datacadastro:** Usar `NOW()` diretamente no SQL; não passar como parâmetro `$n`.
4. **Anti-pattern — LOCK TABLE:** NÃO usar para produto. `idproduto` é serial — sequence é thread-safe. `criarContaPagar` usa LOCK TABLE apenas porque `conta_pagar` não tem serial.
