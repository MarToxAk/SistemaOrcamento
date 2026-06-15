# Phase 33: API de Escrita de Produto - Research

**Researched:** 2026-06-15
**Domain:** NestJS — escrita PostgreSQL direta (pg pool) na tabela `produto` do Athos; class-validator DTOs; Swagger; log estruturado
**Confidence:** HIGH — todas as descobertas baseadas em leitura direta do codebase existente e do schema do banco

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Criar env var `ATHOS_SISTEMA_USUARIO_ID` (integer) — usada em `idusuariocadastro` (INSERT) e `idusuarioalteracao` (PATCH).
- **D-02:** `ATHOS_SISTEMA_USUARIO_ID` é variável **obrigatória** — fail-fast na inicialização junto com `ATHOS_PG_HOST`, `ATHOS_PG_DB`, `ATHOS_PG_USER`, `ATHOS_PG_PASS`.
- **D-03:** Criar **`AthosProdutoService`** para todos os métodos de escrita. Métodos de leitura existentes permanecem no `AthosService`. `ProdutoController` injeta ambos. `AthosModule` registra e exporta `AthosProdutoService`.
- **D-04:** DTO de criação com campos curados (ver CONTEXT.md). Obrigatório: `descricaoproduto`. Preenchidos pelo sistema: `idproduto`, `datacadastro`, `idusuariocadastro`. Excluídos: grade, composição, série, cardápio, NBS, tributação avançada IBS/CBS, campos da trigger.
- **D-05:** PATCH aceita subset parcial. `idusuarioalteracao` preenchido pelo sistema. `idproduto`, `datacadastro`, `idusuariocadastro` imutáveis.
- **D-06:** Escrita exclusivamente na tabela `produto`.
- **D-07:** Endpoint separado `PATCH /athos/produtos/:idproduto/status` — body: `{ ativo: boolean }`. Nunca executa DELETE físico.
- **D-08:** Validação de FK (departamento/grupo/marca) via **pre-query** antes do INSERT/UPDATE — retorna `UnprocessableEntityException` (HTTP 422) se ID inválido.
- **D-09:** `descontomaximo` validado no DTO via `@Min(0) @Max(100)` — retorna 400 se fora do range.
- **D-10:** Log estruturado via `this.logger.log(...)` no `AthosProdutoService`. Sem tabela de auditoria dedicada.
- **D-11:** Decorar todos os novos endpoints com `@ApiOperation`, `@ApiBody`, `@ApiOkResponse`, `@ApiParam`.

### Claude's Discretion

- Nomenclatura dos endpoints: `POST /athos/produtos`, `PATCH /athos/produtos/:idproduto`, `PATCH /athos/produtos/:idproduto/status`
- `idproduto` no INSERT via `SELECT nextval(...)` ou `RETURNING idproduto` — researcher verifica o nome da sequence
- Transação explícita (`BEGIN/COMMIT`) no INSERT se necessário
- `dataultimaalteracao` e `horaultimaalteracao` gerenciados pela trigger — não enviados nos queries
- Tests co-locados com o service (`athos-produto.service.test.ts`)

### Deferred Ideas (OUT OF SCOPE)

- Filtro por `statusproduto` na busca (Fase 34)
- Tabela de auditoria persistente `produto_audit`
- Importação em massa de produtos
- Gestão de grade/composição/série (v2 PADV-01..03)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte da Pesquisa |
|----|-----------|---------------------|
| CPROD-01 | Operador pode criar um novo produto informando os campos de cadastro | DTO `CreateProdutoDto` com campos curados; `POST /athos/produtos` |
| CPROD-02 | `idproduto` gerado pelo Athos (serial); `datacadastro` e `idusuariocadastro` preenchidos automaticamente | `idproduto serial` confirmado no DDL; sequence name é `produto_idproduto_seq`; alternativa: `INSERT ... RETURNING idproduto` com DEFAULT |
| CPROD-03 | Criação dispara/respeita `tg_alterarproduto` e rules `atualizardatahora*` sem desabilitá-los | Rules operam em nível de statement (UPDATE em `conf_inicial`); trigger `BEFORE INSERT OR UPDATE FOR EACH ROW` — disparam automaticamente com qualquer INSERT padrão |
| CPROD-04 | Validação de constraints (descontomaximo 0–100, FKs) com erro claro | `@Min(0) @Max(100)` no DTO para descontomaximo; pre-queries para FKs de departamento/grupo/marca |
| EPROD-01 | Editar preços de venda (valorvenda1..6, promoção, atacado) | Campos incluídos no `UpdateProdutoDto` via `PartialType(CreateProdutoDto)` |
| EPROD-02 | Editar informações de cadastro (descrição, NCM, unidade, referência, etc.) | Campos incluídos no `UpdateProdutoDto` |
| EPROD-03 | `dataultimaalteracao` / `idusuarioalteracao` atualizados a cada edição | `tg_alterarproduto` cuida de `dataultimaalteracao`; `idusuarioalteracao` enviado no UPDATE via env var |
| EPROD-04 | Edição persiste exclusivamente na tabela `produto` | `AthosProdutoService` só emite SQL para a tabela `produto` |
| DPROD-01 | Desativar produto (`statusproduto`/`vendeproduto` = false) sem DELETE físico | `PATCH /athos/produtos/:idproduto/status` com `{ ativo: false }` |
| DPROD-02 | Reativar produto desativado | Mesmo endpoint com `{ ativo: true }` |
| DPROD-03 | Sistema nunca executa DELETE físico na tabela `produto` | Nenhum método do `AthosProdutoService` emite DELETE |
| SPROD-01 | Escrita no Athos permitida exclusivamente na tabela `produto` | `AthosProdutoService` isola todos os INSERTs/UPDATEs; nenhum outro service emite writes no Athos exceto `criarContaPagar`/`updateContaPagar` em `conta_pagar` |
| SPROD-03 | Operações de escrita registradas em log estruturado (quem, quando, o quê) | `this.logger.log(...)` no service + `LoggingInterceptor` global para mutating methods |
| SPROD-04 | Endpoints documentados no Swagger | `@ApiOperation`, `@ApiBody`, `@ApiParam`, `@ApiOkResponse` em todos os novos endpoints |
</phase_requirements>

---

## Summary

A Fase 33 implementa três endpoints REST de escrita na tabela `produto` do banco Athos (PostgreSQL externo), usando o mesmo padrão `pg pool` já estabelecido no `AthosService`. Todo o trabalho é 100% backend (NestJS) — sem frontend. Os artefatos centrais são: `AthosProdutoService` (novo), dois DTOs (`CreateProdutoDto`, `UpdateProdutoDto`), e extensão do `ProdutoController` e `AthosModule` existentes.

A pesquisa confirmou no DDL real do banco que `idproduto` é `serial` — o PostgreSQL cria automaticamente a sequence `produto_idproduto_seq`. A estratégia mais simples e segura para o INSERT é **não enviar `idproduto` no payload** e deixar o DEFAULT da coluna (`nextval('produto_idproduto_seq')`) gerar o valor, recuperando-o via `RETURNING idproduto`. Isso elimina a necessidade de `BEGIN/LOCK TABLE/COMMIT` que o `criarContaPagar` usa (pois lá o ID não é serial). A trigger `tg_alterarproduto` (BEFORE INSERT OR UPDATE) e as rules `atualizardatahorainsert`/`atualizardatahoraupdate` disparam automaticamente com qualquer SQL padrão — nenhum workaround necessário.

A validação de env vars em `app.module.ts` usa `validateEnv()` com `REQUIRED_ENV_VARS` — `ATHOS_SISTEMA_USUARIO_ID` deve ser adicionado a esse array para garantir fail-fast na inicialização, respeitando a decisão D-02. Os métodos `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas` do `AthosService` retornam listas completas — a pre-query de FK deve usar `SELECT 1 FROM produto_departamento WHERE iddepartamento = $1 LIMIT 1` (query direta por ID) em vez de chamar os métodos de lista, para evitar trazer todos os registros só para validar existência.

**Recomendação principal:** INSERT sem `idproduto` explícito + `RETURNING idproduto`. Pool compartilhado via instância separada no `AthosProdutoService` (mesmo padrão lazy-init que o `AthosService`). `UpdateProdutoDto extends PartialType(CreateProdutoDto)`.

---

## Architectural Responsibility Map

| Capability | Tier Primário | Tier Secundário | Racional |
|------------|--------------|-----------------|----------|
| Criar produto (POST) | API Backend (NestJS) | — | Escrita no banco externo (Athos pg), validação, log |
| Editar produto (PATCH) | API Backend (NestJS) | — | Partial update com validação FK e log |
| Desativar/Reativar (PATCH /status) | API Backend (NestJS) | — | Toggle de campos booleanos; nunca DELETE |
| Validação de DTO | API Backend (NestJS) — ValidationPipe global | — | class-validator + class-transformer já configurados |
| Geração de `idproduto` | Banco Athos (PostgreSQL) | — | `serial` / sequence — banco é a fonte de verdade |
| Trigger `tg_alterarproduto` | Banco Athos (PostgreSQL) | — | BEFORE INSERT OR UPDATE — automático |
| Rules `atualizardatahora*` | Banco Athos (PostgreSQL) | — | Statement-level rules — automático |
| Log de auditoria | API Backend (NestJS) — Logger + LoggingInterceptor | — | Sem tabela dedicada, consistente com o projeto |
| Documentação Swagger | API Backend (NestJS) — decorators | — | Segue padrão `ProdutoController` existente |
| Autenticação | API Backend (NestJS) — APP_GUARD global `InternalAuthGuard` | — | SPROD-02 já satisfeito por herança (Fase 32) |

---

## Standard Stack

### Core (já presente no projeto — sem instalação)

| Biblioteca | Versão no Projeto | Propósito | Por que é padrão |
|------------|------------------|-----------|-----------------|
| `@nestjs/common` | já instalado | Decorators de controller, exceções HTTP, Logger | Framework base do projeto |
| `@nestjs/swagger` | já instalado | `@ApiOperation`, `@ApiBody`, `@ApiParam`, `@ApiOkResponse` | Padrão Swagger já em uso no `ProdutoController` |
| `class-validator` | já instalado | `@IsString`, `@IsNotEmpty`, `@IsOptional`, `@Min`, `@Max`, `@IsInt`, `@IsNumber`, `@IsBoolean`, `@MaxLength` | Padrão de validação de DTO em todo o projeto |
| `class-transformer` | já instalado | `@Type(() => Number)`, `PartialType` | Necessário para coerção de tipos no ValidationPipe |
| `pg` (node-postgres) | já instalado | Pool de conexão com o PostgreSQL do Athos | Único driver de acesso ao banco Athos no projeto |

**Nenhum pacote novo precisa ser instalado.** Esta fase usa exclusivamente dependências já presentes.

### Arquivos novos a criar

| Arquivo | Tipo | Propósito |
|---------|------|-----------|
| `athos-produto.service.ts` | Service NestJS | Métodos `criarProduto`, `editarProduto`, `alterarStatusProduto` |
| `dto/create-produto.dto.ts` | DTO | Campos curados para criação (D-04) |
| `dto/update-produto.dto.ts` | DTO | `PartialType(CreateProdutoDto)` para edição parcial |
| `athos-produto.service.test.ts` | Testes unitários | Cobertura do service com mocks de pool |

### Arquivos a modificar

| Arquivo | Modificação |
|---------|-------------|
| `athos-produto.controller.ts` | Adicionar `POST`, dois `PATCH`, injetar `AthosProdutoService` |
| `athos.module.ts` | Adicionar `AthosProdutoService` em `providers` e `exports` |
| `app.module.ts` | Adicionar `ATHOS_SISTEMA_USUARIO_ID` ao array `REQUIRED_ENV_VARS` |
| `.env.example` | Adicionar `ATHOS_SISTEMA_USUARIO_ID=` |
| `deploy/stack.env.example` | Adicionar `ATHOS_SISTEMA_USUARIO_ID=` |

---

## Package Legitimacy Audit

> Nenhum pacote externo novo será instalado nesta fase. Todas as dependências já estão presentes no projeto.

**Pacotes removidos por slopcheck:** nenhum (nenhum pacote novo).
**Pacotes sinalizados como suspeitos:** nenhum.

---

## Architecture Patterns

### Diagrama de Fluxo

```
Cliente (x-internal-api-key)
        |
        v
InternalAuthGuard (APP_GUARD global)
        |
        v
ThrottlerGuard
        |
        v
LoggingInterceptor (loga POST/PATCH automaticamente)
        |
        v
ProdutoController
  POST  /athos/produtos           → criarProduto(dto)
  PATCH /athos/produtos/:id       → editarProduto(id, dto)
  PATCH /athos/produtos/:id/status → alterarStatusProduto(id, { ativo })
        |
        v
[ValidationPipe] class-validator valida DTO
        |
        v
AthosProdutoService
  ├── pre-query FK (se iddepartamento/idgrupo/idmarca informados)
  │     SELECT 1 FROM produto_departamento WHERE iddepartamento = $1
  │     → UnprocessableEntityException(422) se não encontrado
  ├── INSERT com DEFAULT para idproduto + RETURNING idproduto
  │     → disparado: tg_alterarproduto (BEFORE INSERT)
  │     → disparado: rule atualizardatahorainsert (UPDATE em conf_inicial)
  ├── UPDATE SET ... WHERE idproduto = $n + idusuarioalteracao via env
  │     → disparado: tg_alterarproduto (BEFORE UPDATE)
  │     → disparado: rule atualizardatahoraupdate (UPDATE em conf_inicial)
  └── logger.log(operacao, idproduto, campos, idusuario)
        |
        v
PostgreSQL Athos (banco externo — pool direto via pg)
  Tabela: produto (ÚNICA tabela modificada)
```

### Estrutura de Arquivos (apenas novos/modificados)

```
apps/backend/src/modules/integrations/athos/
├── athos-produto.controller.ts        [MODIFICAR] — adicionar 3 endpoints
├── athos-produto.service.ts           [CRIAR] — métodos de escrita
├── athos-produto.service.test.ts      [CRIAR] — testes unitários
├── athos.module.ts                    [MODIFICAR] — registrar AthosProdutoService
├── dto/
│   ├── create-produto.dto.ts          [CRIAR]
│   └── update-produto.dto.ts          [CRIAR]
apps/backend/src/modules/
└── app.module.ts                      [MODIFICAR] — REQUIRED_ENV_VARS
```

### Pattern 1: Pool Lazy-Init (replicar do AthosService)

**O que é:** Pool de conexão PostgreSQL criado sob demanda na primeira chamada, com tratamento de erro global.

**Quando usar:** Todo método que precisa de acesso ao banco Athos.

```typescript
// Source: apps/backend/src/modules/integrations/athos/athos.service.ts L505-511
@Injectable()
export class AthosProdutoService {
  private readonly logger = new Logger(AthosProdutoService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
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
      this._pool = new Pool({ host, database, user, password, port, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }
}
```

**Nota:** `AthosProdutoService` instancia seu próprio pool (não recebe injeção do `AthosService`). Isso é consistente com o padrão existente — o `AthosListenerService` também tem pool próprio.

### Pattern 2: INSERT com Serial (RETURNING) — SEM transação explícita

**O que é:** Inserção que deixa o PostgreSQL gerar `idproduto` via DEFAULT da coluna serial, recuperando o valor gerado via `RETURNING`.

**Por que não usar LOCK TABLE:** O `criarContaPagar` usa `LOCK TABLE + MAX(id)+1` porque a tabela `conta_pagar` do Athos **não tem serial** — o ID precisa ser alocado manualmente. A tabela `produto` tem `idproduto serial NOT NULL` confirmado no DDL — o banco gerencia a sequence de forma thread-safe. `LOCK TABLE` seria desnecessário e prejudicial à performance.

```typescript
// Padrão recomendado para criarProduto
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  const result = await client.query<{ idproduto: number }>(
    `INSERT INTO produto (
       descricaoproduto, datacadastro, idusuariocadastro,
       -- ... demais campos do DTO ...
       idusuarioalteracao
     ) VALUES (
       $1, NOW(), $2,
       -- ... $n ...
       $2
     ) RETURNING idproduto`,
    [dto.descricaoproduto, sistemaUsuarioId, /* ... */],
  );
  const idproduto = result.rows[0].idproduto;
  this.logger.log(`criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);
  return { idproduto };
} catch (err) {
  this.logger.error(`Erro ao criar produto: ${err}`);
  if (err instanceof BadRequestException || err instanceof UnprocessableEntityException) throw err;
  throw new InternalServerErrorException("Erro ao criar produto no Athos");
} finally {
  client.release();
}
```

**Importante:** `datacadastro` é do tipo `dmdata` (mapeado para date no pg). Usar `NOW()` diretamente no SQL é mais simples e correto que passar como parâmetro.

### Pattern 3: Pre-validação de FK (SELECT EXISTS por ID)

**O que é:** Antes de qualquer INSERT/UPDATE que inclua FK opcional, verificar existência do ID informado com query direta — NÃO chamar `buscarDepartamentos()` (que retorna lista completa).

```typescript
// Pre-query de FK — eficiente: busca por ID, sem trazer lista completa
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

// Uso:
if (dto.iddepartamento !== undefined) {
  await this.validarFkExiste(client, "produto_departamento", "iddepartamento", dto.iddepartamento, "Departamento");
}
if (dto.idgrupo !== undefined) {
  await this.validarFkExiste(client, "produto_grupo", "idgrupo", dto.idgrupo, "Grupo");
}
if (dto.idmarca !== undefined) {
  await this.validarFkExiste(client, "produto_marca", "idmarca", dto.idmarca, "Marca");
}
```

**Nota:** As FKs verificadas por pre-query são apenas as que têm lookup visível ao operador: departamento, grupo, marca. Para `idfornecedor` e `idunidade` — incluídos no DTO — a estratégia adotada (Q3 das Open Questions) é deixar a constraint do banco gerar o erro e tratá-lo como 422 via catch de `error.code === '23503'`, distinguindo pelo `error.constraint` para emitir mensagem indicando o campo FK violado.

### Pattern 4: UPDATE parcial (PATCH)

**O que é:** Construção dinâmica de SET baseada nos campos presentes no DTO, usando $n parâmetros.

```typescript
// Padrão de UPDATE parcial
async editarProduto(idproduto: number, dto: UpdateProdutoDto): Promise<{ idproduto: number }> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    // Verificar que o produto existe
    const exists = await client.query(
      "SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1",
      [idproduto],
    );
    if (exists.rows.length === 0) {
      throw new NotFoundException(`Produto ${idproduto} nao encontrado`);
    }

    // Pre-validações FK (se informadas)
    // ...

    // Construir SET dinamicamente
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // idusuarioalteracao SEMPRE atualizado
    setClauses.push(`idusuarioalteracao = $${paramIndex++}`);
    params.push(sistemaUsuarioId);

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        setClauses.push(`"${key}" = $${paramIndex++}`);
        params.push(value);
      }
    }

    params.push(idproduto); // último parâmetro para WHERE
    await client.query(
      `UPDATE produto SET ${setClauses.join(", ")} WHERE idproduto = $${paramIndex}`,
      params,
    );

    this.logger.log(
      `editarProduto idproduto=${idproduto} campos=[${Object.keys(dto).join(",")}] idusuario=${sistemaUsuarioId}`,
    );
    return { idproduto };
  } catch (err) {
    // ...
  } finally {
    client.release();
  }
}
```

### Pattern 5: Toggle de Status

```typescript
// PATCH /athos/produtos/:idproduto/status
async alterarStatusProduto(idproduto: number, ativo: boolean): Promise<{ idproduto: number; ativo: boolean }> {
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
  } finally {
    client.release();
  }
}
```

### Pattern 6: Fail-fast de Env Vars (modificar app.module.ts)

```typescript
// Source: apps/backend/src/modules/app.module.ts L22-29
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
  "ATHOS_SISTEMA_USUARIO_ID",  // ADICIONAR — decisão D-02
] as const;
```

### Pattern 7: Padrão de DTO (replicar create-conta-pagar.dto.ts)

```typescript
// Source: apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
// Source para PartialType: apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts

// create-produto.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateProdutoDto {
  @ApiProperty({ example: "Papel A4 75g Resma 500fls", description: "Descrição do produto" })
  @IsString()
  @IsNotEmpty()
  descricaoproduto!: string;

  @ApiPropertyOptional({ example: "Papel A4", description: "Descrição curta" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  descricaocurta?: string;

  // ... demais campos opcionais ...

  @ApiPropertyOptional({ example: 15.0, description: "Desconto máximo permitido (0–100)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  descontomaximo?: number;

  // Campos excluídos: idproduto, datacadastro, idusuariocadastro, idusuarioalteracao,
  // dataultimaalteracao, horaultimaalteracao, e todos os campos grade/composição/série/cardápio/NBS/IBS
}

// update-produto.dto.ts
import { PartialType } from "@nestjs/swagger";
import { CreateProdutoDto } from "./create-produto.dto";

export class UpdateProdutoDto extends PartialType(CreateProdutoDto) {}
```

### Pattern 8: Controller com dois services injetados

```typescript
// athos-produto.controller.ts — modificado
@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoController {
  constructor(
    private readonly athosService: AthosService,
    private readonly athosProdutoService: AthosProdutoService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Criar produto no Athos" })
  @ApiBody({ type: CreateProdutoDto })
  @ApiOkResponse({ description: "{ idproduto: number }" })
  async criarProduto(@Body() dto: CreateProdutoDto) { ... }

  @Patch(":idproduto")
  @ApiOperation({ summary: "Editar produto no Athos (partial update)" })
  @ApiParam({ name: "idproduto", example: "123" })
  @ApiBody({ type: UpdateProdutoDto })
  async editarProduto(@Param("idproduto", ParseIntPipe) id: number, @Body() dto: UpdateProdutoDto) { ... }

  @Patch(":idproduto/status")
  @ApiOperation({ summary: "Desativar ou reativar produto no Athos" })
  @ApiParam({ name: "idproduto", example: "123" })
  @ApiBody({ schema: { properties: { ativo: { type: "boolean" } }, required: ["ativo"] } })
  async alterarStatusProduto(@Param("idproduto", ParseIntPipe) id: number, @Body() body: AlterarStatusProdutoDto) { ... }
}
```

**ATENÇÃO de roteamento:** A rota `PATCH :idproduto/status` deve ser declarada **antes** de `PATCH :idproduto` — no NestJS, o path mais específico com segmento literal `status` precisa vir antes do paramétrico para não ser capturado como ID. (Mesmo princípio já aplicado nas rotas GET estáticas do controller existente — Pitfall 2 do CONTEXT.md.)

### Anti-Patterns a Evitar

- **Não usar LOCK TABLE para produto:** A tabela tem `serial` — a sequence é thread-safe pelo PostgreSQL. `LOCK TABLE` seria um gargalo desnecessário.
- **Não omitir `client.release()` no finally:** Vazar conexões esgota o pool. Sempre `try/finally { client.release() }`.
- **Não misturar builds dinâmicos para produto:** O DTO de produto é fixo (campos conhecidos). SQL estático com $n explícitos é mais legível e seguro que build dinâmico de colunas.
- **Não capturar erro de FK do PostgreSQL como substituto da pre-query (para departamento/grupo/marca):** O código 23503 (foreign_key_violation) gera mensagem em inglês interna. A pre-query explícita permite mensagem clara em português (decisão D-08). Para `idfornecedor`/`idunidade` (sem lookup visível), o catch de 23503 com distinção via `error.constraint` é aceitável (Q3).
- **Não incluir `observacao` no CREATE TABLE DDL antigo como fonte de verdade:** A coluna existe no banco real (confirmado em `produto.types.ts`, verificado contra banco em 2026-06-15) mas não aparece no snapshot do DDL de DATABASE_SCHEMA.md (arquivo mais antigo).

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez | Por que |
|----------|--------------|-------------|---------|
| Validação de DTO | Validação manual no controller/service | `class-validator` + `ValidationPipe` global | Já configurado globalmente no projeto; cuida de 400, mensagens detalhadas |
| PartialType para PATCH | Copiar todos os campos como `@IsOptional` | `PartialType(CreateProdutoDto)` de `@nestjs/swagger` | Mantém consistência, evita duplicação |
| Log de requisições mutantes | Logger manual no controller | `LoggingInterceptor` (já em `APP_INTERCEPTOR`) | Já registra automaticamente POST/PATCH/PUT/DELETE com método, URL, status, ms, IP |
| Autenticação | Verificação manual de header | `InternalAuthGuard` via `APP_GUARD` global | Já protege todos os endpoints automaticamente |
| Identificação de coluna nullable | Verificar `undefined` vs `null` | Enviar `undefined` → omitir do SET; enviar `null` → setar NULL no banco | Padrão TypeScript/pg natural |

**Insight:** A regra `atualizardatahorainsert` e `atualizardatahoraupdate` fazem `UPDATE conf_inicial SET datahora = now()` — isso é um efeito colateral esperado do Athos, não um problema. O sistema de orçamento não precisa se preocupar com isso; acontece automaticamente.

---

## Fatos Verificados no Schema do Banco

### Sequence do `idproduto`

**VERIFICADO [CITED: .planning/DATABASE_SCHEMA.md L594]:** A coluna `idproduto` é declarada como `serial NOT NULL` na tabela `produto`. PostgreSQL cria automaticamente a sequence `produto_idproduto_seq` para colunas `serial`.

**Estratégia de INSERT:** Não incluir `idproduto` no payload do INSERT — o DEFAULT será aplicado automaticamente via `nextval('produto_idproduto_seq')`. Usar `RETURNING idproduto` para obter o ID gerado.

```sql
-- Forma correta para produto (serial):
INSERT INTO produto (descricaoproduto, datacadastro, idusuariocadastro, ...)
VALUES ($1, NOW(), $2, ...)
RETURNING idproduto;

-- NÃO USAR: SELECT nextval('produto_idproduto_seq') + LOCK TABLE (desnecessário para serial)
```

### Trigger e Rules

**VERIFICADO [CITED: .planning/DATABASE_SCHEMA.md L999-1003]:**
```sql
CREATE TRIGGER tg_alterarproduto
  BEFORE INSERT OR UPDATE
  ON produto
  FOR EACH ROW
  EXECUTE PROCEDURE alterarproduto();
```
Dispara em cada linha antes de INSERT ou UPDATE. Não há necessidade de desabilitar ou contornar — qualquer INSERT/UPDATE padrão o acionará.

**VERIFICADO [CITED: .planning/DATABASE_SCHEMA.md L984-992]:**
```sql
-- Rule atualizardatahorainsert: ON INSERT TO produto → UPDATE conf_inicial SET datahora = now()
-- Rule atualizardatahoraupdate: ON UPDATE TO produto → UPDATE conf_inicial SET datahora = now()
```
As rules operam em nível de statement (não por linha). Elas fazem um UPDATE na tabela `conf_inicial` do Athos — efeito colateral gerenciado pelo próprio Athos.

### Constraints relevantes para validação

**VERIFICADO [CITED: .planning/DATABASE_SCHEMA.md L812-851]:**

```sql
-- CHECK constraint nativa:
CONSTRAINT ckc_descontomaximo_produto CHECK (descontomaximo IS NULL OR descontomaximo >= 0 AND descontomaximo <= 100)

-- FK constraints que impactam o DTO:
CONSTRAINT fk_produto_produto_d_produto_ FOREIGN KEY (iddepartamento) REFERENCES produto_departamento(iddepartamento)
CONSTRAINT fk_produto_produto_g_produto_ FOREIGN KEY (idgrupo) REFERENCES produto_grupo(idgrupo)
CONSTRAINT fk_produto_produto_m_produto_ FOREIGN KEY (idmarca) REFERENCES produto_marca(idmarca)
CONSTRAINT fk_produto_funcionar_funciona FOREIGN KEY (idusuarioalteracao) REFERENCES funcionario_usuario(idfuncionariousuario)
CONSTRAINT fk_produto_relations_funciona FOREIGN KEY (idusuariocadastro) REFERENCES funcionario_usuario(idfuncionariousuario)
CONSTRAINT fk_produto_fornecedo_forneced FOREIGN KEY (idfornecedor) REFERENCES fornecedor(idfornecedor)
CONSTRAINT fk_produto_produto_u_produto_ FOREIGN KEY (idunidade) REFERENCES produto_unidade(idunidade)
```

**Implicação para `ATHOS_SISTEMA_USUARIO_ID`:** O valor configurado nesta env var será usado em `idusuariocadastro` (INSERT) e `idusuarioalteracao` (PATCH). Deve corresponder a um `idfuncionariousuario` válido na tabela `funcionario_usuario` do Athos. Se o ID for inválido, o INSERT/UPDATE falhará com violação FK (código 23503) nas constraints `fk_produto_relations_funciona`/`fk_produto_funcionar_funciona` — isso será uma falha de configuração, não de validação de DTO. O sistema captura esse caso específico (distinguindo pelo `error.constraint`) e lança `InternalServerErrorException` com mensagem orientada à configuração. Violações de FK de `idfornecedor`/`idunidade` (outras constraints) são tratadas como input inválido (422).

### Coluna `observacao`

**VERIFICADO [CITED: produto.types.ts L220]:** A coluna `observacao` existe no banco real (verificado contra a instância BomCusto em 2026-06-15) e deve ser incluída no DTO. O DDL em `DATABASE_SCHEMA.md` não a mostra por ser um snapshot desatualizado.

---

## Common Pitfalls

### Pitfall 1: Rota PATCH :idproduto/status capturada como ID

**O que dá errado:** NestJS tenta parsear a string "status" como inteiro para `ParseIntPipe` se a rota `PATCH :idproduto/status` for declarada **depois** de `PATCH :idproduto`.

**Por que acontece:** NestJS registra rotas na ordem de declaração. Um route handler paramétrico `/:idproduto` captura qualquer segmento, incluindo "status".

**Como evitar:** Declarar `@Patch(":idproduto/status")` **antes** de `@Patch(":idproduto")` no controller — exatamente como o controller existente já faz com as rotas GET estáticas (comentário "Rotas estáticas declaradas ANTES da rota paramétrica").

**Sinal de alerta:** Erro 400 "Validation failed (numeric string is expected)" ao chamar `PATCH /athos/produtos/123/status`.

### Pitfall 2: `idusuarioalteracao` ausente no UPDATE causa violação FK

**O que dá errado:** Se `idusuarioalteracao` não for incluído no UPDATE, a trigger `tg_alterarproduto` (BEFORE UPDATE) pode tentar atualizá-lo com NULL — violando a FK para `funcionario_usuario`.

**Por que acontece:** A trigger `alterarproduto()` provavelmente define `idusuarioalteracao` — mas a função PL/pgSQL pode depender do valor enviado no statement. Sem acesso à função `alterarproduto()`, o comportamento exato é incerto.

**Como evitar:** Sempre incluir `idusuarioalteracao = $n` no SET do UPDATE (valor da env var `ATHOS_SISTEMA_USUARIO_ID`). O DTO de edição não deve incluir `idusuarioalteracao` — o service o injeta obrigatoriamente.

**Sinal de alerta:** Erro 23503 (foreign_key_violation) em `idusuarioalteracao` durante UPDATE.

### Pitfall 3: `datacadastro` com tipo `dmdata` (domain PostgreSQL)

**O que dá errado:** Enviar `datacadastro` como string ISO (`YYYY-MM-DD`) pode funcionar, mas `NOW()` no SQL é mais confiável — o driver pg converte `NOW()` para o tipo correto.

**Por que acontece:** `dmdata` é um domain type do Athos (provavelmente `date`). O driver `pg` interpreta domains como o tipo base.

**Como evitar:** Usar `NOW()` diretamente no SQL para `datacadastro`. Não passar como parâmetro `$n`.

### Pitfall 4: Campos de preço como `monetario` (numeric string no driver pg)

**O que dá errado:** As colunas `valorvenda1..6`, `valorcustounitario` etc. são do tipo `monetario` (domain do Athos, provavelmente `numeric(10,2)`). O driver `pg` retorna numerics como strings. Ao **inserir**, passar como `number` do JavaScript funciona; ao ler de volta, o campo retorna como string.

**Como evitar:** No DTO, aceitar `number` com `@IsNumber()` + `@Type(() => Number)`. O `pg` aceita `number` JavaScript como parâmetro para colunas `numeric`. Não é necessário serializar manualmente para string.

### Pitfall 5: Pool duplicado entre AthosService e AthosProdutoService

**O que dá errado:** Dois pools separados conectando ao mesmo banco Athos pode resultar em mais conexões do que o esperado (ex: 5 + 5 = 10 conexões no banco externo).

**Por que acontece:** Cada pool tem seu próprio `max: 5`.

**Como mitigar:** O pool do Athos aceita múltiplas conexões — esta abordagem é aceitável para o volume atual do BomCusto (uso interno, poucos operadores simultâneos). Se futuramente surgir problema de limite de conexões no Athos, a solução é exportar o pool do `AthosService` como provider. Isso não é necessário nesta fase.

### Pitfall 6: Erro 23503 (FK violation) de `idusuariocadastro` mal configurado

**O que dá errado:** `ATHOS_SISTEMA_USUARIO_ID` configurado com ID que não existe em `funcionario_usuario` faz o INSERT falhar com `error.code === '23503'`.

**Como evitar:** Documentar claramente no `.env.example` e no `deploy/stack.env.example` que o valor deve ser o ID de um usuário existente na tabela `funcionario_usuario` do Athos. No catch do service, distinguir a constraint violada via `error.constraint`: para as FKs de usuário (`fk_produto_relations_funciona`/`fk_produto_funcionar_funciona`) tratar com mensagem clara de configuração: `"ATHOS_SISTEMA_USUARIO_ID inválido — usuário não encontrado em funcionario_usuario"` (`InternalServerErrorException`). Para outras FKs (`idfornecedor`/`idunidade`), lançar `UnprocessableEntityException` (422) — ver Pitfall 7.

### Pitfall 7: Catch genérico de 23503 mascarando FK de input do operador

**O que dá errado:** Tratar todo `error.code === '23503'` como erro de configuração de `ATHOS_SISTEMA_USUARIO_ID` retorna 500 com mensagem enganosa quando, na verdade, o operador informou um `idfornecedor`/`idunidade` inexistente — o que é input inválido (deveria ser 422).

**Por que acontece:** O código 23503 é o mesmo para qualquer violação de FK; só o campo `error.constraint` (preenchido pelo driver `pg`) distingue qual FK foi violada.

**Como evitar:** No catch de 23503, ler `error.constraint`. Se for a FK de usuário do sistema → `InternalServerErrorException` (500, config). Para qualquer outra constraint (ou `constraint` ausente) → `UnprocessableEntityException` (422) com mensagem citando o campo/constraint FK violado.

---

## Runtime State Inventory

> Esta fase não é de rename/refactor/migration. Nenhuma renomeação de string ou migração de dados existentes está sendo feita.

**Nenhum estado de runtime afetado:** Esta fase cria novos endpoints e um novo service. Não altera nomes de tabelas, colunas, ou configurações existentes. O único estado novo é a env var `ATHOS_SISTEMA_USUARIO_ID` que deve ser adicionada ao `.env` do servidor de produção antes do deploy.

**Checklist de deploy para produção:**
- Adicionar `ATHOS_SISTEMA_USUARIO_ID=<id_usuario_athos>` ao `.env` de produção
- Verificar que o usuário Athos com esse ID tem permissão de escrita na tabela `produto`
- Confirmar que o usuário da connection string (`ATHOS_PG_USER`) tem permissão de INSERT/UPDATE em `produto` (e SELECT em `produto_departamento`, `produto_grupo`, `produto_marca`)

---

## Validation Architecture

> `workflow.nyquist_validation` não está explicitamente configurado em `.planning/config.json` — tratado como habilitado.

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | Jest + ts-jest |
| Config file | `apps/backend/jest.config.js` |
| Comando rápido | `cd apps/backend && npx jest athos-produto.service.test.ts --no-coverage` |
| Suite completa | `cd apps/backend && npx jest --no-coverage` |

### Mapa de Requisitos → Testes

| Req ID | Comportamento | Tipo de Teste | Comando automatizado | Arquivo existe? |
|--------|--------------|---------------|---------------------|-----------------|
| CPROD-01 | `criarProduto` aceita DTO válido e retorna `{ idproduto }` | unit | `npx jest athos-produto.service.test.ts -t "criarProduto"` | ❌ Wave 0 |
| CPROD-02 | `idproduto` retornado do INSERT RETURNING (não enviado no payload) | unit | `npx jest athos-produto.service.test.ts -t "idproduto gerado"` | ❌ Wave 0 |
| CPROD-03 | INSERT não desabilita trigger — nenhuma query `DISABLE TRIGGER` é emitida | unit | verificação de mock: `client.query` nunca chamado com `DISABLE TRIGGER` | ❌ Wave 0 |
| CPROD-04 | FK inválida retorna 422; `descontomaximo` inválido retorna 400 | unit | `npx jest athos-produto.service.test.ts -t "validação FK"` | ❌ Wave 0 |
| EPROD-01 | `editarProduto` com valores de preço parciais gera UPDATE correto | unit | `npx jest athos-produto.service.test.ts -t "editarProduto preco"` | ❌ Wave 0 |
| EPROD-02 | `editarProduto` com campos de cadastro parciais gera UPDATE correto | unit | `npx jest athos-produto.service.test.ts -t "editarProduto cadastro"` | ❌ Wave 0 |
| EPROD-03 | UPDATE sempre inclui `idusuarioalteracao` no SET | unit | verificação de mock: parâmetros do `client.query` | ❌ Wave 0 |
| EPROD-04 | Nenhuma query emitida para tabela diferente de `produto` em edit | unit | verificação de mock: nenhum SQL com outro nome de tabela | ❌ Wave 0 |
| DPROD-01 | `alterarStatusProduto(id, false)` seta `statusproduto=false, vendeproduto=false` | unit | `npx jest athos-produto.service.test.ts -t "deactivate"` | ❌ Wave 0 |
| DPROD-02 | `alterarStatusProduto(id, true)` seta `statusproduto=true, vendeproduto=true` | unit | `npx jest athos-produto.service.test.ts -t "reactivate"` | ❌ Wave 0 |
| DPROD-03 | Nenhum método emite DELETE em qualquer condição | unit | verificação de mock: `client.query` nunca chamado com `DELETE` | ❌ Wave 0 |
| SPROD-01 | Todas as queries do service têm `produto` como target único | unit | inspeção de queries nos mocks | ❌ Wave 0 |
| SPROD-03 | `logger.log` chamado após cada operação com operação, idproduto e idusuario | unit | `expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(...))` | ❌ Wave 0 |
| SPROD-04 | Endpoints aparecem no Swagger | manual/smoke | Abrir `/api/docs` após start e verificar os três novos endpoints | manual |

### Padrão de Mock para Testes (replicar athos.service.test.ts)

```typescript
// athos-produto.service.test.ts — estrutura base
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

const pgMock = require("pg");

describe("AthosProdutoService", () => {
  let service: AthosProdutoService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_SISTEMA_USUARIO_ID = "1";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({ providers: [AthosProdutoService] }).compile();
    service = module.get<AthosProdutoService>(AthosProdutoService);
  });

  describe("criarProduto", () => {
    it("deve retornar idproduto do RETURNING quando DTO válido informado", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value;
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(client);

      // Sequência de queries: [0] pre-query FK dep, [1] INSERT RETURNING
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validação FK departamento (se informado)
        .mockResolvedValueOnce({ rows: [{ idproduto: 42 }] }); // INSERT RETURNING

      const result = await service.criarProduto({ descricaoproduto: "Papel A4" });

      expect(result).toEqual({ idproduto: 42 });
      expect(client.release).toHaveBeenCalled();
    });
  });
});
```

### Gaps do Wave 0

- [ ] `athos-produto.service.test.ts` — cobre todos os 13 requisitos listados acima
- [ ] `dto/create-produto.dto.ts` — precisa existir antes dos testes de validação de DTO poderem rodar
- [ ] `dto/update-produto.dto.ts` — idem

*(Infraestrutura de testes existente (Jest + ts-jest) já está configurada — sem gaps de framework)*

---

## Security Domain

### ASVS Aplicável

| Categoria ASVS | Aplica | Controle Padrão |
|----------------|--------|-----------------|
| V2 Autenticação | sim | `InternalAuthGuard` via `APP_GUARD` global — já implementado |
| V3 Session Management | não | API stateless com x-internal-api-key |
| V4 Access Control | sim | Apenas operadores autenticados chegam aos endpoints (guard global) |
| V5 Input Validation | sim | `class-validator` via `ValidationPipe` + pre-queries FK |
| V6 Cryptography | não | Nenhuma cripto nesta fase |

### Ameaças Conhecidas para este Stack

| Padrão | STRIDE | Mitigação Padrão |
|--------|--------|-----------------|
| SQL injection via campos do DTO | Tampering | Queries parametrizadas `$n` — nunca concatenação de strings com valor de usuário |
| Write em tabela não autorizada | Tampering / Elevation | `AthosProdutoService` só emite SQL para `produto`; sem input de nome de tabela |
| Enum de IDs de produto | Information Disclosure | Endpoints protegidos por `InternalAuthGuard` — não expostos publicamente |
| `descontomaximo` fora de range | Tampering | `@Min(0) @Max(100)` no DTO + check constraint no banco (dupla proteção) |
| FK injection via `idfornecedor`/`idunidade` | Tampering | FK constraint do banco rejeitará ID inválido; capturar `23503` com 422, distinguindo a constraint via `error.constraint` |

**Nota de segurança crítica:** Nenhum campo de nome de coluna ou tabela vem do input do usuário. O `UPDATE` dinâmico deve usar apenas nomes de campo do DTO (objeto TypeScript controlado) — nunca interpolar strings do body HTTP diretamente em SQL.

---

## Environment Availability

| Dependência | Requerida Por | Disponível | Versão | Fallback |
|-------------|--------------|-----------|--------|----------|
| PostgreSQL Athos (192.168.3.198) | Todos os endpoints de escrita | verificar em runtime | — | Nenhum — bloqueia execução |
| `ATHOS_SISTEMA_USUARIO_ID` (env var nova) | `criarProduto`, `editarProduto`, `alterarStatusProduto` | não (a adicionar) | n/a | Nenhum — fail-fast configurado em D-02 |
| Permissão INSERT/UPDATE em `produto` para `ATHOS_PG_USER` | Todos os writes | `usuario_leitura` atual pode não ter | — | Alterar permissão no Athos ou criar usuário dedicado |

**Dependências ausentes sem fallback:**
- `ATHOS_SISTEMA_USUARIO_ID` não está no `.env.example` atual — deve ser adicionado
- Permissão de escrita do `ATHOS_PG_USER` na tabela `produto` não foi confirmada. O `.env.example` atual usa `usuario_leitura` — **ação manual necessária antes do deploy**: `GRANT INSERT, UPDATE ON TABLE produto TO usuario_escrita;` (ou ajustar para usuário com permissão de escrita)

---

## Assumptions Log

| # | Afirmação | Seção | Risco se Errado |
|---|-----------|-------|-----------------|
| A1 | A sequence criada pelo `serial` chama-se `produto_idproduto_seq` (padrão PostgreSQL: `{tabela}_{coluna}_seq`) | Standard Stack / Pattern 2 | Se o nome for diferente, `nextval('produto_idproduto_seq')` falha — mas como usamos `DEFAULT` (sem `nextval` explícito), isso não é problema na abordagem recomendada de INSERT sem `idproduto` |
| A2 | A função PL/pgSQL `alterarproduto()` executada pelo trigger não sobrescreve `idusuariocadastro` no INSERT | Pitfall 2 / Pattern 2 | Se a trigger sobrescrever `idusuariocadastro`, o campo ficará com valor inesperado — verificar com teste de integração manual |
| A3 | O usuário Athos configurado em `ATHOS_SISTEMA_USUARIO_ID` tem `idfuncionariousuario` válido em `funcionario_usuario` | Pitfall 6 | INSERT falha com 23503 — falha de configuração, não de código |
| A4 | O usuário de conexão (`ATHOS_PG_USER`) tem permissão de INSERT/UPDATE na tabela `produto` | Environment Availability | Todos os endpoints de escrita retornam 500 com "permission denied" |
| A5 | `tipoproduto` boolean: `false` = produto físico, `true` = serviço (ou vice-versa) | Standard Stack / DTO | Inversão de semântica — confirmar com operador antes de expor no formulário (Fase 34) |

**Se a tabela A1 estiver vazia:** Todas as afirmações nesta pesquisa foram verificadas — não há confirmações necessárias. (Não é o caso — há 5 itens.)

---

## Open Questions

> **Status:** Todas as 3 questões foram RESOLVIDAS durante o planejamento da Fase 33. Soluções adotadas registradas abaixo.

1. **Permissão de escrita do `ATHOS_PG_USER`** — **RESOLVED**
   - O que sabíamos: `.env.example` usa `usuario_leitura` para `ATHOS_PG_USER`; o DDL mostra apenas `GRANT SELECT ON TABLE produto TO usuario_leitura`.
   - **Solução adotada:** Tratada via **checkpoint humano bloqueante na task 33-04-03** — antes do deploy, um operador confirma (ou aplica) o GRANT de INSERT/UPDATE em `produto` para o usuário de conexão. A permissão não pode ser garantida em código; o checkpoint pausa a execução até confirmação humana.
   - Risco residual: nenhum — o checkpoint bloqueante impede o deploy sem a permissão confirmada.

2. **Comportamento da função `alterarproduto()`** — **RESOLVED**
   - O que sabíamos: É uma função PL/pgSQL executada BEFORE INSERT OR UPDATE por `tg_alterarproduto`; não temos o corpo da função, então não sabemos exatamente quais campos ela seta.
   - **Solução adotada:** Risco residual gerenciado pela estratégia de **sempre incluir `idusuarioalteracao` no UPDATE** (valor de `ATHOS_SISTEMA_USUARIO_ID`), evitando que a trigger tente preencher o campo com NULL (Pitfall 2). `datacadastro`/`idusuariocadastro` são enviados explicitamente no INSERT. A verificação fina de quais campos a trigger sobrescreve fica como assumption A2, confirmável em teste de integração manual — não bloqueia a fase.
   - Risco residual: baixo — o caminho crítico (`idusuarioalteracao` sempre presente) está coberto.

3. **`idfornecedor` e `idunidade` — pre-query ou tratar via catch 23503?** — **RESOLVED**
   - O que sabíamos: Ambos têm FK constraint e o DTO os inclui como opcionais; uso menos frequente que departamento/grupo/marca.
   - **Solução adotada:** **Catch de `error.code === '23503'`** no service, distinguindo a FK violada pelo `error.constraint` (preenchido pelo driver `pg`): FKs de usuário do sistema (`fk_produto_relations_funciona`/`fk_produto_funcionar_funciona`) → `InternalServerErrorException` (problema de config); qualquer outra FK (`idfornecedor`, `idunidade`, etc.) → `UnprocessableEntityException` (HTTP 422) com mensagem indicando o campo FK violado. Sem pre-queries adicionais para esses campos. Ver fix da Issue 2 / Pitfall 7 / task 33-01-02.
   - Risco residual: nenhum — input inválido do operador retorna 422 com mensagem clara; má configuração do sistema retorna 500 orientado à config.

---

## Sources

### Primary (HIGH confidence)

- `apps/backend/src/modules/integrations/athos/produto.types.ts` — 162 colunas, verificadas contra banco BomCusto 2026-06-15
- `.planning/DATABASE_SCHEMA.md L592-856` — DDL completo da tabela `produto`, constraints FK e CHECK, trigger `tg_alterarproduto`, rules `atualizardatahora*`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` L505-527 — padrão `getPool()` e `getDbConfig()`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` L2176-2225 — `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` L1209-1268 — `criarContaPagar` (referência para padrão de write com pool)
- `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` — controller existente com padrão de decorators e injeção
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — módulo existente
- `apps/backend/src/modules/app.module.ts` — padrão de `REQUIRED_ENV_VARS` e `validateEnv`
- `apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts` — padrão de mock para controller
- `apps/backend/src/modules/integrations/athos/athos.service.test.ts` L1-50 — padrão `jest.mock("pg")` para testes de service
- `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` — padrão de DTO com class-validator
- `apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts` — padrão `PartialType`
- `apps/backend/src/modules/common/logging.interceptor.ts` — `LoggingInterceptor` que cobre POST/PATCH automaticamente
- `apps/backend/jest.config.js` — configuração Jest
- `.env.example` — variáveis de ambiente existentes
- `deploy/stack.env.example` — variáveis de produção existentes

### Secondary (MEDIUM confidence)

- `.planning/phases/33-api-de-escrita-de-produto/33-CONTEXT.md` — decisões e padrões acordados na sessão de discussão

---

## Metadata

**Breakdown de confiança:**
- Standard Stack: HIGH — todas as dependências verificadas no codebase existente; nenhum pacote novo
- Architecture: HIGH — padrões de pool, DTO e log extraídos diretamente do código em produção
- Schema do banco: HIGH — DDL em `DATABASE_SCHEMA.md` + `produto.types.ts` verificado em 2026-06-15
- Pitfalls: HIGH — identificados a partir de padrões existentes no código (comentário Pitfall 2 no controller, padrão LOCK TABLE no criarContaPagar)
- Permissões de banco: LOW — não confirmadas no `.env.example` nem no DDL; `usuario_leitura` tem apenas SELECT

**Data da pesquisa:** 2026-06-15
**Válido até:** 2026-07-15 (schema do Athos estável; stack NestJS estável)
