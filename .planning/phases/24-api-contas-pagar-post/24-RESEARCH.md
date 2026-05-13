# Phase 24: API Contas a Pagar — POST e Autenticação Obrigatória - Research

**Researched:** 2026-05-09
**Domain:** NestJS backend — pg.Pool legado, class-validator DTOs, autenticação fail-closed
**Confidence:** HIGH (todas as claims baseadas na leitura direta do código-fonte e schema)

---

## Summary

A fase 24 tem escopo preciso: (1) adicionar endpoint POST /athos/contas-pagar que insere em `conta_pagar` e retorna o ID gerado; (2) adicionar filtro `statusconta` no GET existente; (3) corrigir o padrão de autenticação de fail-open para fail-closed nos dois endpoints do controller.

O padrão técnico já está 100% estabelecido no projeto: `pg.Pool` via `getPool()` para queries no banco Athos legado, `class-validator` com `ValidationPipe` global para DTOs, e `UnauthorizedException` para tokens inválidos. Não há divergência de abordagem — a implementação segue o que já existe, corrigindo apenas o bug de autenticação e acrescentando o endpoint POST.

**Primary recommendation:** Seguir exatamente o padrão de `listarContasPagar()` para o pool/client, e o padrão de `CreateQuoteDto` para o DTO. Corrigir auth antes de adicionar o endpoint POST para garantir que o novo endpoint nasce já com segurança correta.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth token validation | API / Backend (controller) | — | Token verificado antes do handler; não chega ao service |
| INSERT conta_pagar | API / Backend (service) | Database/Storage (pg legado) | AthosService detém o pool e a lógica de query; controller apenas delega |
| DTO validation | API / Backend (global pipe) | — | ValidationPipe global em main.ts cobre todos os controllers sem config adicional |
| statusconta filter | API / Backend (service) | — | Filtro adicionado como condição paramétrica no SQL do listarContasPagar |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CPAG-01 | POST /athos/contas-pagar → INSERT em `conta_pagar`, retornar `idcontapagar` | Schema confirma `idcontapagar serial` com `RETURNING`; padrão pg.Pool já em uso |
| CPAG-02 | Validar campos obrigatórios: `descricaoconta`, `datavencimento`, `valorconta`. Opcionais: `dataemissao`, `observacao`, `idfornecedor`, `numerodocumento` | Schema confirma nullable para todos os opcionais; `class-validator` + ValidationPipe global cobrem a validação |
| CPAG-03 | GET /athos/contas-pagar com filtro adicional por `statusconta` | Coluna `statusconta character varying(3)` existe na tabela; padrão de params[] já em uso no GET |
| CPAG-04 | ATHOS_API_TOKEN obrigatório em ambos os endpoints (fail-closed quando env ausente) | Bug identificado no controller; fix é mudar `if (requiredToken)` para lançar `InternalServerErrorException` quando token ausente |
</phase_requirements>

---

## Current State (o que já existe)

### Controller atual (`athos.controller.ts`)

- `GET /athos/contas-pagar` — aceita `dataInicio`, `dataFinal` (ambas as formas de casing), delega para `athosService.listarContasPagar()`
- `GET /athos/clientes` — busca com filtros nome/documento/idcliente
- **Bug de autenticação** (CONCERNS.md linha 27-31): padrão `if (requiredToken)` — quando `ATHOS_API_TOKEN` não está no env, o bloco inteiro é pulado e o endpoint fica público
- Não existe POST, não existe filtro `statusconta`, não existe correção do auth

```typescript
// PADRÃO ATUAL (VULNERÁVEL)
const requiredToken = process.env.ATHOS_API_TOKEN;
if (requiredToken) {                        // ← falha silenciosa se env ausente
  const provided = xApiToken || ...;
  if (!provided || provided !== requiredToken) {
    throw new UnauthorizedException("Token inválido ou ausente");
  }
}
```

### Service atual (`athos.service.ts`)

- `getPool()` — singleton de `pg.Pool` com max=5, idleTimeoutMillis=30000
- `getDbConfig()` — lança `InternalServerErrorException` quando env vars do PG ausentes (padrão correto para fail-closed)
- `listarContasPagar(dataInicio?, dataFinal?)` — usa `findExistingTable()` para auto-detectar nome da tabela, monta query com `conditions[]` + `params[]` com `$N` paramétrico
- **Nenhum método de INSERT existe ainda**

### Infraestrutura de validação (`main.ts`)

`ValidationPipe` global configurado com `whitelist: true, transform: true, forbidNonWhitelisted: true`.
Qualquer `@Body() dto: AlgumDto` em qualquer controller já é validado automaticamente — **não precisa de `@UsePipes()` explícito no controller POST**.

### Testes existentes (`athos.service.test.ts`)

Jest com `jest.mock("pg")`. Padrão: mock do `Pool` e do `client` retornado por `pool.connect()`, respostas de `client.query` configuradas com `mockResolvedValueOnce`. Framework completamente configurado e funcional.

---

## INSERT Pattern (como fazer o INSERT no pg legado)

### pg.Pool com RETURNING

```typescript
// [VERIFIED: leitura direta de athos.service.ts — getPool(), listarContasPagar()]
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  const result = await client.query<{ idcontapagar: number }>(
    `INSERT INTO conta_pagar
       (descricaoconta, datavencimento, valorconta, dataemissao, observacao, idfornecedor, numerodocumento)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING idcontapagar`,
    [descricaoconta, datavencimento, valorconta, dataemissao ?? null, observacao ?? null, idfornecedor ?? null, numerodocumento ?? null],
  );
  return { idcontapagar: result.rows[0].idcontapagar };
} finally {
  client.release();
}
```

### Por que RETURNING funciona

- `idcontapagar` é `serial NOT NULL` (PK) — PostgreSQL garante auto-increment via sequência implícita
- `RETURNING idcontapagar` retorna o valor gerado na mesma query, sem precisar de `SELECT lastval()`
- `pg` node driver suporta `RETURNING` nativamente — `result.rows[0]` contém a coluna retornada
- [VERIFIED: DATABASE_SCHEMA.md linha 1083 — `idcontapagar serial NOT NULL`]

### Colunas que NÃO devem ser incluídas no INSERT

- `idcontapagar` — serial, gerado pelo banco
- `ultimaalteracao` — `DEFAULT now()`, o banco preenche automaticamente
- `sincronizado` — `DEFAULT false`, o banco preenche automaticamente
- `recorrenciafornecedor` — `NOT NULL DEFAULT true`, o banco preenche automaticamente
- `exibemsgrecorrencia` — `NOT NULL DEFAULT true`, o banco preenche automaticamente
- `agruparconta` — `DEFAULT false`, o banco preenche automaticamente

---

## Schema Analysis (colunas obrigatórias vs opcionais de `conta_pagar`)

[VERIFIED: DATABASE_SCHEMA.md linhas 1077-1144]

### Colunas com NOT NULL explícito (obrigam valor no INSERT ou têm DEFAULT)

| Coluna | Tipo | Constraint | Ação no INSERT |
|--------|------|------------|----------------|
| `idcontapagar` | serial | PK, NOT NULL | Gerado automaticamente — omitir |
| `recorrenciafornecedor` | boolean | NOT NULL DEFAULT true | Omitir — banco usa default |
| `exibemsgrecorrencia` | boolean | NOT NULL DEFAULT true | Omitir — banco usa default |

### Colunas requeridas pelo CPAG-02 (sem DEFAULT, nullable)

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| `descricaoconta` | descricao (varchar) | SIM | Obrigatório por requisito — validar no DTO |
| `datavencimento` | dmdata | SIM | Obrigatório por requisito — validar no DTO |
| `valorconta` | monetario (numeric) | SIM | Obrigatório por requisito — validar no DTO |

### Colunas opcionais do CPAG-02 (nullable, sem DEFAULT)

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| `dataemissao` | dmdata | SIM | Opcional — null se não fornecido |
| `observacao` | descricao | SIM | Opcional — null se não fornecido |
| `idfornecedor` | integer | SIM | Opcional — FK para fornecedor; null se não fornecido |
| `numerodocumento` | descricao | SIM | Opcional — null se não fornecido |

### Tipo `dmdata`

O schema usa o tipo customizado `dmdata` para datas. Na prática (confirmado por outros inserts observados no Athos), PostgreSQL aceita strings `'YYYY-MM-DD'` para este domínio sem conversão especial — o driver `pg` serializa `Date` JS ou string ISO como aceito pelo banco.

### Colunas adicionais com DEFAULT (podem ser omitidas com segurança)

`ultimaalteracao DEFAULT now()`, `sincronizado DEFAULT false`, `agruparconta DEFAULT false` — o banco gerencia automaticamente ao INSERT.

---

## DTO & Validation (padrão do projeto)

### Padrão existente

[VERIFIED: leitura direta de `apps/backend/src/modules/quotes/dto/create-quote.dto.ts`]

```typescript
import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateContaPagarDto {
  @IsString()
  descricaoconta!: string;                       // obrigatório

  @IsDateString()
  datavencimento!: string;                       // obrigatório — formato YYYY-MM-DD

  @IsNumber()
  @Min(0.01)
  valorconta!: number;                           // obrigatório — > 0

  @IsOptional()
  @IsDateString()
  dataemissao?: string;                          // opcional

  @IsOptional()
  @IsString()
  observacao?: string;                           // opcional

  @IsOptional()
  @IsNumber()
  idfornecedor?: number;                         // opcional — FK inteiro

  @IsOptional()
  @IsString()
  numerodocumento?: string;                      // opcional
}
```

### Regras de derivação

- `class-validator` é a lib usada no projeto (importada em todos os DTOs existentes)
- `class-transformer` é importado junto quando há `@Type()` — necessário apenas para objetos aninhados; o DTO de conta_pagar é plano, então não precisa de `@Type()`
- ValidationPipe global com `transform: true` converte strings para números quando `@IsNumber()` está presente, se o body vier como JSON (padrão)
- `forbidNonWhitelisted: true` — campos extras no body retornam 400 automaticamente
- `@IsDateString()` valida formato ISO 8601 (aceita `"2026-05-10"`) — documentado em class-validator
- Não usar `@Min()` em `@IsDateString()` — usar `@Min(0.01)` apenas em `valorconta` (igual ao padrão de `valoritem` no CreateQuoteItemDto)

### Localização do arquivo

Criar em: `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts`

O controller importa o DTO localmente (o padrão do projeto não usa barrel exports para DTOs de integração).

---

## Auth Fix Pattern (como corrigir fail-closed)

### Bug atual

[VERIFIED: athos.controller.ts linhas 18-26 — confirmado por CONCERNS.md HIGH item]

```typescript
// BUG: se ATHOS_API_TOKEN não está definido, o bloco é pulado
const requiredToken = process.env.ATHOS_API_TOKEN;
if (requiredToken) {   // ← falha aqui: undefined é falsy, bypassa tudo
  ...
}
```

### Correção fail-closed

Dois casos distintos com respostas HTTP diferentes:

| Situação | Resposta correta | Razão |
|----------|------------------|-------|
| `ATHOS_API_TOKEN` ausente no env | `InternalServerErrorException` (500) | Erro de configuração do operador, não do cliente |
| Token fornecido mas incorreto | `UnauthorizedException` (401) | Credencial inválida |
| Token ausente no request | `UnauthorizedException` (401) | Credencial ausente |

```typescript
// PADRÃO CORRETO (fail-closed)
private validateAthosToken(authorization?: string, xApiToken?: string): void {
  const requiredToken = process.env.ATHOS_API_TOKEN;
  if (!requiredToken) {
    throw new InternalServerErrorException(
      "ATHOS_API_TOKEN nao configurado no servidor"
    );
  }
  const provided =
    xApiToken ||
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization) ||
    undefined;
  if (!provided || provided !== requiredToken) {
    throw new UnauthorizedException("Token invalido ou ausente");
  }
}
```

Extrair para método privado no controller evita duplicação nos dois endpoints (GET e POST). Chamada: `this.validateAthosToken(authorization, xApiToken)` antes de qualquer lógica de negócio.

### Imports necessários no controller

Adicionar `Post, Body, InternalServerErrorException` ao import do `@nestjs/common`. `UnauthorizedException` já está importado.

---

## statusconta Filter (como adicionar ao GET)

### Coluna no schema

[VERIFIED: DATABASE_SCHEMA.md linha 1095 — `statusconta character varying(3)`]

Valores conhecidos (documentados no CONCERNS/listarContasPagar): `ABE` (aberto), `PAG` (pago). A coluna já é retornada no mapeamento do `listarContasPagar` via `pickString(row, ["statusconta", "status_conta", "status", "situacao"])`.

### Estratégia de adição

O `listarContasPagar` já usa o padrão `conditions[]` + `params[]`:

```typescript
// Padrão existente (athos.service.ts linhas 498-509)
const conditions = [`${dateColumn} IS NOT NULL`];
const params: string[] = [];

if (start) {
  params.push(start.toISOString());
  conditions.push(`CAST(${dateColumn} AS timestamp) >= $${params.length}`);
}
```

Adicionar `statusconta` segue exatamente o mesmo padrão:

```typescript
// Adicionar após os filtros de data existentes
if (typeof statusconta === "string" && statusconta.trim()) {
  params.push(statusconta.trim().toUpperCase());
  conditions.push(`statusconta = $${params.length}`);
}
```

### Assinatura do método atualizada

```typescript
async listarContasPagar(
  dataInicio?: string,
  dataFinal?: string,
  statusconta?: string,   // NOVO
)
```

### Assinatura do controller atualizada

```typescript
@Get("contas-pagar")
async listarContasPagar(
  @Query("dataInicio") dataInicio?: string,
  @Query("dataFinal") dataFinal?: string,
  @Query("datainicio") dataInicioLegacy?: string,
  @Query("datafinal") dataFinalLegacy?: string,
  @Query("statusconta") statusconta?: string,  // NOVO
  @Headers("authorization") authorization?: string,
  @Headers("x-api-token") xApiToken?: string,
) {
  this.validateAthosToken(authorization, xApiToken);
  return this.athosService.listarContasPagar(
    dataInicio ?? dataInicioLegacy,
    dataFinal ?? dataFinalLegacy,
    statusconta,
  );
}
```

### Sem necessidade de auto-detect

Diferente de `dateColumn` (que usa auto-detect porque o nome varia entre tabelas), `statusconta` é o nome exato da coluna no schema do Athos. Não há auto-detect necessário — usar o nome literal na query é seguro.

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez disso | Por quê |
|----------|--------------|-------------------|---------|
| Validação de body | Parser/validação manual | `class-validator` + ValidationPipe global | Já configurado; `forbidNonWhitelisted` protege contra campos extras |
| Pool de conexões PG | Novo `pg.Client` por request | `getPool()` existente no AthosService | Pool já existe com max=5; criar Client por request é o bug documentado no CONCERNS |
| Retorno do ID gerado | `SELECT MAX(idcontapagar)` após INSERT | `RETURNING idcontapagar` na mesma query | Atômico, sem race condition, padrão PostgreSQL |
| Extração do token | Duplicar bloco de auth | Método privado `validateAthosToken()` | DRY; 3 endpoints no controller, mesma lógica |

---

## Common Pitfalls

### Pitfall 1: Esquecer RETURNING no INSERT
**O que dá errado:** `result.rows` fica vazio; código tenta acessar `result.rows[0].idcontapagar` e lança `TypeError: Cannot read property of undefined`.
**Por que acontece:** INSERT sem RETURNING não retorna rows no pg.
**Como evitar:** Sempre finalizar o INSERT com `RETURNING idcontapagar`.
**Sinal de alerta:** `result.rowCount === 1` mas `result.rows.length === 0`.

### Pitfall 2: Não liberar o client com `client.release()`
**O que dá errado:** Pool de conexões esgota (max=5) sob carga; requests subsequentes ficam pendentes indefinidamente.
**Por que acontece:** Exceção lançada antes do `release()` quando não há `finally`.
**Como evitar:** Sempre usar `try { ... } finally { client.release(); }` — padrão de todos os métodos existentes no AthosService.

### Pitfall 3: Autenticação no service em vez do controller
**O que dá errado:** Service validaria o token para chamadas internas também (ex: `AthosListenerService` chama métodos do `AthosService` diretamente sem HTTP token).
**Por que acontece:** Confusão de responsabilidades.
**Como evitar:** Auth exclusivamente no controller — service é agnóstico de autenticação.

### Pitfall 4: `if (requiredToken)` — reproduzir o bug ao adicionar o POST
**O que dá errado:** Novo endpoint nasce com o mesmo padrão vulnerável.
**Por que acontece:** Copiar/colar o padrão do GET antes de corrigir.
**Como evitar:** Corrigir o auth helper antes de adicionar o endpoint POST. Ordem das tarefas importa.

### Pitfall 5: Passar `Date` JS diretamente para o INSERT sem serialização
**O que dá errado:** O tipo `dmdata` do Athos pode rejeitar ou truncar objetos Date, dependendo do driver.
**Por que acontece:** O driver `pg` serializa `Date` JS como timestamp ISO completo; `dmdata` pode ser só `date`.
**Como evitar:** Converter para string `'YYYY-MM-DD'` antes de passar ao INSERT: `new Date(datavencimento).toISOString().slice(0, 10)` — ou passar a string ISO do DTO diretamente (se `@IsDateString()` garante formato YYYY-MM-DD).

### Pitfall 6: Usar `@IsDate()` em vez de `@IsDateString()` no DTO
**O que dá errado:** `@IsDate()` exige um objeto `Date` JS; JSON não carrega objetos Date nativos, então a validação falha para todo request.
**Por que acontece:** Confusão entre validação de tipo JS e validação de string.
**Como evitar:** Usar `@IsDateString()` — validado pelo padrão `CreateQuoteDto.dataorcamento` e `prazoEntrega` no projeto.

---

## Code Examples

### Verified patterns from official sources

#### Padrão completo de INSERT com RETURNING (baseado no service existente)

```typescript
// [VERIFIED: athos.service.ts — padrão getPool() + client.release() em finally]
async criarContaPagar(dto: CreateContaPagarDto): Promise<{ idcontapagar: number }> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const result = await client.query<{ idcontapagar: number }>(
      `INSERT INTO conta_pagar
         (descricaoconta, datavencimento, valorconta, dataemissao, observacao, idfornecedor, numerodocumento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING idcontapagar`,
      [
        dto.descricaoconta,
        dto.datavencimento,                          // string YYYY-MM-DD do DTO
        dto.valorconta,
        dto.dataemissao ?? null,
        dto.observacao ?? null,
        dto.idfornecedor ?? null,
        dto.numerodocumento ?? null,
      ],
    );
    const idcontapagar = result.rows[0].idcontapagar;
    this.logger.log(`[Athos] conta_pagar criada: idcontapagar=${idcontapagar}`);
    return { idcontapagar };
  } catch (error) {
    this.logger.error(`Erro ao criar conta a pagar no Athos: ${error}`);
    if (error instanceof BadRequestException) throw error;
    throw new InternalServerErrorException("Erro ao criar conta a pagar no Athos");
  } finally {
    client.release();
  }
}
```

#### Padrão do controller com auth fail-closed e POST

```typescript
// [VERIFIED: athos.controller.ts — padrão de imports e decorators]
import {
  Body, Controller, Get, Headers, InternalServerErrorException,
  Post, Query, UnauthorizedException,
} from "@nestjs/common";
import { CreateContaPagarDto } from "./dto/create-conta-pagar.dto";

@Controller("athos")
export class AthosController {
  constructor(private readonly athosService: AthosService) {}

  private validateAthosToken(authorization?: string, xApiToken?: string): void {
    const requiredToken = process.env.ATHOS_API_TOKEN;
    if (!requiredToken) {
      throw new InternalServerErrorException("ATHOS_API_TOKEN nao configurado no servidor");
    }
    const provided =
      xApiToken ||
      (authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization) ||
      undefined;
    if (!provided || provided !== requiredToken) {
      throw new UnauthorizedException("Token invalido ou ausente");
    }
  }

  @Get("contas-pagar")
  async listarContasPagar(
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFinal") dataFinal?: string,
    @Query("datainicio") dataInicioLegacy?: string,
    @Query("datafinal") dataFinalLegacy?: string,
    @Query("statusconta") statusconta?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.listarContasPagar(
      dataInicio ?? dataInicioLegacy,
      dataFinal ?? dataFinalLegacy,
      statusconta,
    );
  }

  @Post("contas-pagar")
  async criarContaPagar(
    @Body() dto: CreateContaPagarDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.criarContaPagar(dto);
  }
}
```

#### Padrão do teste Jest para o INSERT

```typescript
// [VERIFIED: athos.service.test.ts — padrão jest.mock("pg") + mockResolvedValueOnce]
it("deve retornar idcontapagar ao inserir conta_pagar", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);

  client.query.mockResolvedValueOnce({ rows: [{ idcontapagar: 42 }] });

  const result = await service.criarContaPagar({
    descricaoconta: "Fornecedor X",
    datavencimento: "2026-05-20",
    valorconta: 150.00,
  });

  expect(result.idcontapagar).toBe(42);
  expect(client.query).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO conta_pagar"),
    expect.arrayContaining(["Fornecedor X", "2026-05-20", 150.00]),
  );
  expect(client.release).toHaveBeenCalled();
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest (jest.config.js confirma `testRegex: '.*\\.test\\.ts$'`) |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `cd apps/backend && npx jest src/modules/integrations/athos/athos.service.test.ts --no-coverage` |
| Full suite command | `cd apps/backend && npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo | Comando automatizado | Arquivo existe? |
|--------|--------------|------|----------------------|-----------------|
| CPAG-01 | INSERT retorna idcontapagar | unit | `npx jest athos.service.test.ts -t "criarContaPagar"` | ❌ Wave 0 |
| CPAG-01 | INSERT falha → InternalServerErrorException | unit | `npx jest athos.service.test.ts -t "erro ao criar"` | ❌ Wave 0 |
| CPAG-02 | DTO sem descricaoconta → 400 | unit (ValidationPipe) | `npx jest athos.controller.test.ts -t "campo obrigatorio"` | ❌ Wave 0 |
| CPAG-02 | DTO sem datavencimento → 400 | unit (ValidationPipe) | `npx jest athos.controller.test.ts -t "datavencimento"` | ❌ Wave 0 |
| CPAG-02 | DTO com campos opcionais omitidos → sucesso | unit | `npx jest athos.service.test.ts -t "campos opcionais"` | ❌ Wave 0 |
| CPAG-03 | GET com statusconta=ABE filtra corretamente | unit | `npx jest athos.service.test.ts -t "statusconta"` | ❌ Wave 0 |
| CPAG-04 | ATHOS_API_TOKEN ausente → 500 | unit | `npx jest athos.controller.test.ts -t "token ausente"` | ❌ Wave 0 |
| CPAG-04 | Token incorreto → 401 | unit | `npx jest athos.controller.test.ts -t "token invalido"` | ❌ Wave 0 |
| CPAG-04 | Token correto → passa | unit | `npx jest athos.controller.test.ts -t "token valido"` | ❌ Wave 0 |

### Sampling Rate

- **Por task commit:** `cd apps/backend && npx jest src/modules/integrations/athos/ --no-coverage`
- **Por wave merge:** `cd apps/backend && npx jest --no-coverage`
- **Phase gate:** Suite verde antes de `/gsd-verify-work`

### Wave 0 Gaps

Os testes de `AthosService` para os novos métodos vão em `athos.service.test.ts` (arquivo já existe — adicionar novos `describe` blocks).

- [ ] `src/modules/integrations/athos/athos.service.test.ts` — adicionar describe block para `criarContaPagar` (cobre CPAG-01, CPAG-02 lado service)
- [ ] `src/modules/integrations/athos/athos.controller.test.ts` — NOVO arquivo; cobre CPAG-04 (auth fail-closed) e CPAG-02 (ValidationPipe)
- [ ] `src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` — NOVO arquivo; sem teste dedicado mas coberto via controller test

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | ATHOS_API_TOKEN via `validateAthosToken()` — fail-closed |
| V3 Session Management | no | API stateless; token por request |
| V4 Access Control | no | Endpoint interno; sem RBAC necessário nesta fase |
| V5 Input Validation | yes | class-validator + ValidationPipe global (`whitelist`, `forbidNonWhitelisted`) |
| V6 Cryptography | no | Token comparado por igualdade de string; sem hash/crypto necessário para este mecanismo |

### Known Threat Patterns

| Padrão | STRIDE | Mitigação padrão |
|--------|--------|-----------------|
| Bypass de auth por env ausente | Elevation of Privilege | `if (!requiredToken) throw InternalServerErrorException` — não há "modo aberto" |
| Injeção SQL via parâmetros | Tampering | Parâmetros `$N` — nunca interpolação de string |
| Path traversal em statusconta | Tampering | Nenhum — `statusconta` vai como `$N`; não é usado em identifier position |
| Body oversized / campos extras | Denial of Service | `forbidNonWhitelisted: true` rejeita campos desconhecidos; NestJS bodyParser tem limite default 100kb |

---

## Implementation Plan Summary (recomendações para o planner)

### Ordem recomendada de tasks

**Wave 1 — Correções de segurança e fundações:**
1. Criar DTO `CreateContaPagarDto` em `athos/dto/create-conta-pagar.dto.ts`
2. Corrigir autenticação: extrair `validateAthosToken()` no controller e corrigir os dois endpoints existentes (GET contas-pagar e GET clientes) para usar o método
3. Adicionar `@Post("contas-pagar")` no controller com `@Body() dto: CreateContaPagarDto`
4. Implementar `criarContaPagar(dto)` no AthosService com INSERT + RETURNING
5. Adicionar parâmetro `statusconta?` em `listarContasPagar()` no service + `@Query("statusconta")` no controller

**Wave 2 — Testes:**
6. Adicionar testes de `criarContaPagar` em `athos.service.test.ts` (describe block novo)
7. Criar `athos.controller.test.ts` cobrindo auth fail-closed (CPAG-04)

### Arquivos afetados

| Arquivo | Operação | Detalhes |
|---------|----------|---------|
| `apps/backend/src/modules/integrations/athos/athos.controller.ts` | MODIFY | Extrair `validateAthosToken()`, corrigir GET existente, adicionar POST |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | MODIFY | Adicionar `criarContaPagar()`, adicionar parâmetro `statusconta` em `listarContasPagar()` |
| `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` | CREATE | DTO com class-validator |
| `apps/backend/src/modules/integrations/athos/athos.service.test.ts` | MODIFY | Adicionar describe block `criarContaPagar` |
| `apps/backend/src/modules/integrations/athos/athos.controller.test.ts` | CREATE | Testes de autenticação fail-closed |

### Dependências entre tasks

```
DTO criado → Controller POST usa DTO
Auth helper criado → Controller GET + POST usam helper
Service criarContaPagar → Controller POST delega para ele
statusconta no service → Controller passa parâmetro
Testes → dependem de todas as implementações acima
```

### Sem ambiguidades de decisão

Todas as escolhas técnicas já estão determinadas pelo código existente:
- `pg.Pool` via `getPool()` — não Prisma (banco Athos é separado)
- `class-validator` — não Joi, não Zod
- `InternalServerErrorException` para env ausente — não `UnauthorizedException`
- `RETURNING idcontapagar` — não `SELECT lastval()`
- Método privado no controller — não guard NestJS (escopo local ao módulo)

---

## Assumptions Log

> Todas as claims nesta pesquisa foram verificadas por leitura direta do código-fonte, schema e arquivos de configuração do repositório. Nenhuma claim foi marcada como [ASSUMED].

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (tabela vazia) | — | — |

**Todas as claims verificadas diretamente nos arquivos do repositório.**

---

## Open Questions (RESOLVED)

1. **`dmdata` aceita strings ISO sem conversão? RESOLVED:** O tipo `dmdata` não tem CREATE DOMAIN definido no DATABASE_SCHEMA.md exportado. O driver pg + PostgreSQL aceita strings YYYY-MM-DD para tipos de data via cast implícito — verificado indiretamente pelo comportamento de `listarContasPagar()` que lê campos `dmdata` sem conversão. Para total segurança, o plano 24-01 instrui usar `CAST($N AS date)` explícito no INSERT para `datavencimento` e `dataemissao`.

---

## Sources

### Primary (HIGH confidence)

- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — padrão auth atual, endpoints existentes
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — padrão getPool(), listarContasPagar(), error handling
- `.planning/DATABASE_SCHEMA.md` — schema completo de `conta_pagar` incluindo tipos, constraints, defaults
- `apps/backend/src/main.ts` — ValidationPipe global configurado
- `apps/backend/src/modules/quotes/dto/create-quote.dto.ts` — padrão class-validator do projeto
- `apps/backend/src/modules/integrations/athos/athos.service.test.ts` — padrão jest.mock("pg") existente
- `.planning/milestones/v2.0-ROADMAP.md` — requirements CPAG-01..04
- `.planning/codebase/CONCERNS.md` — vulnerabilidade HIGH do auth fail-open

### Secondary (MEDIUM confidence)

Nenhum — todas as informações necessárias estão nos arquivos do repositório.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verificado no código-fonte (pg.Pool, class-validator, ValidationPipe)
- Architecture: HIGH — padrão idêntico ao listarContasPagar existente
- Schema analysis: HIGH — leitura direta do DATABASE_SCHEMA.md
- Auth fix: HIGH — bug documentado em CONCERNS.md, solução derivada do padrão fail-closed em getDbConfig()
- Pitfalls: HIGH — derivados de leitura do código e CONCERNS.md

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (dependências estáveis — NestJS, pg, class-validator não têm breaking changes esperados)
