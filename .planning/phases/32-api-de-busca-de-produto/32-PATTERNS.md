# Phase 32: API de Busca de Produto - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 3 (1 novo + 2 modificações)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` | controller | request-response | `apps/backend/src/modules/integrations/athos/athos.controller.ts` | role-match (sem validateAthosToken) |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` (modificar) | service | CRUD / request-response | `apps/backend/src/modules/integrations/athos/athos.service.ts` (métodos existentes) | exact |
| `apps/backend/src/modules/integrations/athos/athos.module.ts` (modificar) | config/module | — | `apps/backend/src/modules/integrations/athos/athos.module.ts` (existente) | exact |

---

## Pattern Assignments

### `athos-produto.controller.ts` (controller, request-response)

**Analog:** `apps/backend/src/modules/integrations/athos/athos.controller.ts`

**Diferenca critica do analog:** O `AthosController` usa `validateAthosToken` (autenticacao manual legada via `ATHOS_API_TOKEN`). O `ProdutoController` **NAO usa esse padrao** — o `APP_GUARD` global (`InternalAuthGuard`) protege automaticamente todos os endpoints via header `x-internal-api-key`. Nao injetar `@Headers("authorization")` nem chamar `validateAthosToken`.

**Imports pattern** (athos.controller.ts linhas 1-36 — adaptar removendo imports nao usados):
```typescript
import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosService } from "./athos.service";
```

**Classe e construtor** (athos.controller.ts linhas 41-45):
```typescript
@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoController {
  private readonly logger = new Logger(ProdutoController.name);

  constructor(private readonly athosService: AthosService) {}
  // SEM validateAthosToken — APP_GUARD global cuida disso
}
```

**Padrao de endpoint GET com @Query** (athos.controller.ts linhas 92-122 — buscarClientes):
```typescript
@ApiOperation({
  summary: "Buscar produtos no Athos",
  description: "Busca produtos com filtros opcionais. Sem filtro retorna todos paginados.",
})
@ApiQuery({ name: "descricao", required: false, example: "papel" })
@ApiQuery({ name: "codigobarra", required: false, example: "7891234567890" })
@ApiQuery({ name: "iddepartamento", required: false, example: "1" })
@ApiQuery({ name: "idgrupo", required: false, example: "2" })
@ApiQuery({ name: "idmarca", required: false, example: "3" })
@ApiQuery({ name: "page", required: false, example: "1" })
@ApiQuery({ name: "take", required: false, example: "20" })
@ApiOkResponse({ description: "Lista paginada de produtos" })
@Get()
async buscarProdutos(
  @Query("descricao") descricao?: string,
  @Query("codigobarra") codigobarra?: string,
  @Query("iddepartamento") iddepartamento?: string,
  @Query("idgrupo") idgrupo?: string,
  @Query("idmarca") idmarca?: string,
  @Query("page") page?: string,
  @Query("take") take?: string,
) {
  this.logger.log(`buscarProdutos descricao="${descricao ?? ""}" codigobarra="${codigobarra ?? ""}"`);
  return this.athosService.buscarProdutos({
    descricao,
    codigobarra,
    iddepartamento: iddepartamento ? Number(iddepartamento) : undefined,
    idgrupo: idgrupo ? Number(idgrupo) : undefined,
    idmarca: idmarca ? Number(idmarca) : undefined,
    page: page ? Number(page) : undefined,
    take: take ? Number(take) : undefined,
  });
}
```

**Padrao de endpoint GET com @Param e 404** (athos.controller.ts linhas 294-314 — dadosCadastraisClienteContasReceber):
```typescript
@ApiOperation({ summary: "Consultar produto por ID" })
@ApiParam({ name: "idproduto", example: "123", description: "ID do produto no Athos" })
@ApiOkResponse({ description: "Linha completa do produto ou 404 se nao encontrado" })
@Get(":idproduto")
async buscarProdutoPorId(
  @Param("idproduto", ParseIntPipe) idproduto: number,
) {
  this.logger.log(`buscarProdutoPorId idproduto=${idproduto}`);
  const produto = await this.athosService.buscarProdutoPorId(idproduto);
  if (!produto) {
    throw new NotFoundException(`Produto ${idproduto} nao encontrado no Athos`);
  }
  return produto;
}
```

**Padrao de endpoint GET de lookup simples** (athos.controller.ts linhas 124-148 — listarLivrosRegistro):
```typescript
@ApiOperation({ summary: "Lookup de departamentos" })
@ApiOkResponse({ description: "Array de departamentos { id, nome }[]" })
@Get("lookup/departamentos")
async lookupDepartamentos() {
  this.logger.log("lookupDepartamentos");
  return this.athosService.buscarDepartamentos();
}
```

**Ordem de declaracao dos handlers** (RESEARCH.md Pattern 6):
```typescript
@Controller("athos/produtos")
export class ProdutoController {
  @Get("lookup/departamentos")  // 1o — rota estatica
  async lookupDepartamentos() {}

  @Get("lookup/grupos")         // 2o — rota estatica
  async lookupGrupos() {}

  @Get("lookup/marcas")         // 3o — rota estatica
  async lookupMarcas() {}

  @Get(":idproduto")            // 4o — rota parametrica (depois das estaticas)
  async buscarProdutoPorId() {}

  @Get()                        // 5o — sem parametro
  async buscarProdutos() {}
}
```

---

### `athos.service.ts` — novos métodos (service, CRUD / request-response)

**Analog:** `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarClientes()` (linhas 1024-1185) e `buscarNotasFiscaisCliente()` (linhas 2037-2081)

**Imports ja existentes no service** (athos.service.ts linhas 1-30 — verificar quais faltam):
```typescript
import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
```

**Logger declarado na classe** (athos.service.ts linha 501):
```typescript
private readonly logger = new Logger(AthosService.name);
```

**getPool() — acesso ao pool** (athos.service.ts linhas 505-512):
```typescript
private getPool(): Pool {
  if (!this._pool) {
    const cfg = this.getDbConfig();
    this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
    this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
  }
  return this._pool;
}
```

**Padrao de paginacao** (athos.service.ts linhas 1049-1051):
```typescript
const take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50);
const page = Math.max(1, Number(params.page ?? 1) || 1);
const offset = (page - 1) * take;
```

**Padrao de construcao dinamica de filtros** (athos.service.ts linhas 1071-1095):
```typescript
const conditions: string[] = [];
const qParams: (string | number)[] = [];
let idx = 1;

if (nomeFilter && nomeFilter.length >= 3) {
  conditions.push(`(cf.nome ILIKE $${idx} OR cj.nomefantasia ILIKE $${idx} OR cj.razaosocial ILIKE $${idx})`);
  qParams.push(`%${nomeFilter}%`);
  idx++;
}
// ... demais filtros analogamente

const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
```

**Padrao de duas queries separadas para COUNT + dados** (athos.service.ts linhas 1109-1131):
```typescript
const countResult = await client.query(`SELECT COUNT(*) AS total ${baseJoins}`, qParams);
const total = Number(countResult.rows[0]?.total ?? 0);

const dataResult = await client.query(
  `SELECT ... ${baseJoins} ORDER BY ... LIMIT $${idx} OFFSET $${idx + 1}`,
  [...qParams, take, offset],
);

return { total, page, take, items: dataResult.rows };
```

**Padrao de try/finally com client.release()** (athos.service.ts linhas 1068-1184):
```typescript
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  // queries...
  return { total, page, take, items };
} catch (err) {
  if (err instanceof BadRequestException) throw err;
  this.logger.warn(
    `Falha ao buscar X no Athos: ${err instanceof Error ? err.message : String(err)}`,
  );
  throw new InternalServerErrorException("Erro ao buscar X no Athos. Tente novamente.");
} finally {
  client.release();
}
```

**Padrao de metodo simples sem paginacao** (athos.service.ts linhas 2037-2081 — buscarNotasFiscaisCliente):
```typescript
async buscarDepartamentos(): Promise<LookupItem[]> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const result = await client.query(
      "SELECT iddepartamento AS id, nome FROM produto_departamento ORDER BY nome ASC",
    );
    return result.rows as LookupItem[];
  } catch (err) {
    this.logger.warn(`buscarDepartamentos: ${err instanceof Error ? err.message : String(err)}`);
    throw new InternalServerErrorException("Erro ao buscar departamentos no Athos.");
  } finally {
    client.release();
  }
}
// buscarGrupos: SELECT idgrupo AS id, nome FROM produto_grupo ORDER BY nome ASC
// buscarMarcas: SELECT idmarca AS id, nome FROM produto_marca ORDER BY nome ASC
```

**Query de busca de produto — variacao critica: SELECT excluindo bytea** (RESEARCH.md Pattern 1 e Pitfall 1):
```typescript
// NAO usar SELECT * literal — codigobarra imagemproduto e bytea
// Usar: SELECT p.*, NULL::bytea AS imagemproduto
const dataResult = await client.query(
  `SELECT p.*, NULL::bytea AS imagemproduto
   FROM produto p ${whereClause}
   ORDER BY p.descricaoproduto ASC
   LIMIT $${idx} OFFSET $${idx + 1}`,
  [...qParams, take, offset],
);
```

**Busca por ID com NotFoundException** (RESEARCH.md Pitfall 2 e padrao dadosCadastraisClienteContasReceber):
```typescript
async buscarProdutoPorId(idproduto: number): Promise<Produto | null> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    this.logger.log(`buscarProdutoPorId idproduto=${idproduto}`);
    const result = await client.query(
      "SELECT p.*, NULL::bytea AS imagemproduto FROM produto p WHERE p.idproduto = $1 LIMIT 1",
      [idproduto],
    );
    return (result.rows[0] as Produto) ?? null;
  } catch (err) {
    this.logger.warn(`buscarProdutoPorId: ${err instanceof Error ? err.message : String(err)}`);
    throw new InternalServerErrorException("Erro ao buscar produto no Athos.");
  } finally {
    client.release();
  }
}
```

---

### `athos.module.ts` (config/module)

**Analog:** `apps/backend/src/modules/integrations/athos/athos.module.ts` (existente)

**Modificacao cirurgica** (athos.module.ts linhas 1-16 — adicionar import e entrada em controllers):
```typescript
// Adicionar import:
import { ProdutoController } from "./athos-produto.controller";

// Modificar linha 13:
controllers: [AthosController, ProdutoController],
// providers e exports permanecem inalterados
```

---

## Shared Patterns

### Autenticacao (nao requer acao no novo controller)

**Fonte:** `apps/backend/src/modules/app.module.ts` linhas 82-85
**Aplica-se a:** ProdutoController — protegido automaticamente por heranca
```typescript
{
  provide: APP_GUARD,
  useClass: InternalAuthGuard,
}
// Header validado: x-internal-api-key (security.constants.ts)
// O ProdutoController herda essa protecao sem codigo adicional.
// NAO copiar validateAthosToken do AthosController — esse e o padrao legado.
```

### Error Handling

**Fonte:** `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 1176-1184
**Aplica-se a:** Todos os novos metodos de service
```typescript
} catch (err) {
  if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
  this.logger.warn(
    `Falha no metodo: ${err instanceof Error ? err.message : String(err)}`,
  );
  throw new InternalServerErrorException("Erro ao acessar Athos.");
} finally {
  client.release(); // SEMPRE liberar client
}
```

### Logger pattern

**Fonte:** `apps/backend/src/modules/integrations/athos/athos.service.ts` linha 501
**Aplica-se a:** Controller novo e service (ja tem)
```typescript
// No controller:
private readonly logger = new Logger(ProdutoController.name);
// No service (ja existe):
private readonly logger = new Logger(AthosService.name);
// Uso:
this.logger.log(`metodo param="${valor ?? ""}"`);
this.logger.warn(`metodo: ${err instanceof Error ? err.message : String(err)}`);
```

### Interfaces TypeScript

**Fonte:** RESEARCH.md secao "Code Examples" — verificadas contra o banco real
```typescript
export interface Produto {
  idproduto: number;
  iddepartamento: number | null;
  // ... (161 campos — ver RESEARCH.md para lista completa)
  imagemproduto: null; // bytea — sempre null na resposta
}

export interface LookupItem {
  id: number;
  nome: string;
}
```

### Pattern de teste (controller)

**Fonte:** `apps/backend/src/modules/integrations/athos/athos.controller.test.ts` linhas 1-30
**Aplica-se a:** `athos-produto.controller.test.ts` (Wave 0 — criar)
```typescript
import { ProdutoController } from "./athos-produto.controller";

describe("ProdutoController", () => {
  let controller: ProdutoController;
  let athosServiceMock: {
    buscarProdutos: jest.Mock;
    buscarProdutoPorId: jest.Mock;
    buscarDepartamentos: jest.Mock;
    buscarGrupos: jest.Mock;
    buscarMarcas: jest.Mock;
  };

  beforeEach(() => {
    athosServiceMock = {
      buscarProdutos: jest.fn(),
      buscarProdutoPorId: jest.fn(),
      buscarDepartamentos: jest.fn(),
      buscarGrupos: jest.fn(),
      buscarMarcas: jest.fn(),
    };
    controller = new ProdutoController(athosServiceMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  // Testes sem mock de ATHOS_API_TOKEN — autenticacao e global, nao do controller
});
```

---

## No Analog Found

Nenhum arquivo sem analog. Todos os tres arquivos tem correspondencia direta no modulo Athos existente.

| Arquivo | Observacao |
|---------|-----------|
| `athos-produto.controller.ts` | Analog e `athos.controller.ts`, mas com padrao de auth diferente (APP_GUARD vs validateAthosToken) |
| Novos metodos em `athos.service.ts` | Analogos exatos em `buscarClientes()` (paginacao) e `buscarNotasFiscaisCliente()` (lookup simples) |

---

## Anti-Patterns Documentados

| Anti-pattern | Por que evitar | Alternativa |
|-------------|----------------|-------------|
| `validateAthosToken` no ProdutoController | Padrao legado do AthosController — duplica autenticacao com o APP_GUARD | Nenhum codigo de auth no ProdutoController |
| `SELECT *` sem tratar `imagemproduto` | Coluna bytea serializa como `{type:"Buffer",data:[...]}` no JSON | `SELECT p.*, NULL::bytea AS imagemproduto` |
| `COUNT(*) OVER()` em window function | Fora do padrao estabelecido pelo projeto | Duas queries separadas: COUNT + dados |
| `@Get(":idproduto")` antes dos lookups | NestJS captura "/lookup/departamentos" como param e ParseIntPipe lanca 400 | Declarar handlers de rota estatica antes dos parametricos |
| Criar `ProdutoService` separado | D-02 locked — metodos ficam em AthosService | Adicionar metodos em `AthosService` |
| Tabelas `departamento`/`grupo`/`marca` | Nao existem no banco BomCusto | `produto_departamento`, `produto_grupo`, `produto_marca` |
| Coluna `descricaodepartamento` nos lookups | Nao existe — nome especulativo do CONTEXT.md | Coluna real: `nome` em todas as tabelas de lookup |

---

## Metadata

**Analog search scope:** `apps/backend/src/modules/integrations/athos/`
**Files scanned:** 6 (athos.controller.ts, athos.service.ts, athos.module.ts, athos.controller.test.ts, athos.service.test.ts, athos-notas-fiscais.test.ts)
**Pattern extraction date:** 2026-06-15
