# Phase 32: API de Busca de Produto - Research

**Pesquisado:** 2026-06-15
**Domínio:** NestJS REST API + PostgreSQL (banco Athos externo read-only)
**Confiança:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Criar `ProdutoController` separado no mesmo módulo Athos (`apps/backend/src/modules/integrations/athos/athos-produto.controller.ts`). Prefixo de rota: `/athos/produtos`. `AthosModule` registra os dois controllers. `AthosController` não é alterado nesta fase.
- **D-02:** Métodos de busca de produto ficam em `AthosService` (mesmo service existente) — sem criar `ProdutoService` separado.
- **D-03:** Retornar `SELECT *` da tabela `produto` como objeto tipado — interface TypeScript com todos os campos conhecidos. O requirement BPROD-04 exige "linha completa"; nenhum campo deve ser filtrado no backend.
- **D-04:** Response de busca segue o padrão `{ total: number, page: number, take: number, items: Produto[] }` — igual ao `buscarClientes`. Take máximo: 50.
- **D-05:** Permitir listagem paginada **sem filtro obrigatório** — quando nenhum filtro é informado, retornar todos os produtos ordenados por `descricaoproduto ASC` com paginação.
- **D-06:** Filtro de descrição: busca parcial case-insensitive via `ILIKE '%valor%'` em `descricaoproduto` e `descricaocurta` (OR). Sem mínimo de caracteres.
- **D-07:** Filtro de código de barras: match exato em `codigobarra1` e `codigobarra2` (OR). Sem ILIKE.
- **D-08:** Filtros de departamento, grupo e marca aceitam o ID (integer) — o frontend resolve o nome via lookups.
- **D-09:** Endpoints de lookup para as três entidades:
  - `GET /athos/produtos/lookup/departamentos`
  - `GET /athos/produtos/lookup/grupos`
  - `GET /athos/produtos/lookup/marcas`
- **D-10:** Cada lookup retorna array `{ id: number, nome: string }[]` ordenado por nome. Sem paginação.
- **D-11:** Researcher deve verificar nomes reais de tabelas e colunas — **verificado nesta pesquisa** (ver seção Schema Verificado).
- **D-12:** `GET /athos/produtos/:idproduto` — linha completa ou 404.
- **D-13:** Autenticação por herança do `APP_GUARD` global — sem ação adicional.

### Claude's Discretion

- Nomenclatura dos query params: `descricao`, `codigobarra`, `iddepartamento`, `idgrupo`, `idmarca`, `page`, `take`
- Swagger: `@ApiOperation`, `@ApiQuery`, `@ApiOkResponse` seguindo padrão do `AthosController`
- Logger: `this.logger.log(...)` no início de cada método
- Error handling: `BadRequestException`, `NotFoundException`, `InternalServerErrorException`

### Deferred Ideas (OUT OF SCOPE)

- Busca full-text com ranking de relevância (trigram/pg_trgm)
- Cache de lookups
- Filtro por `statusproduto` como filtro obrigatório (a Fase 34 decide — pode ser filtro opcional de baixo custo)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BPROD-01 | Operador pode buscar produtos por descrição (descricaoproduto/descricaocurta), parcial e sem diferenciar maiúsculas | ILIKE verificado funcionando no banco real; campos confirmados |
| BPROD-02 | Operador pode buscar produtos por código de barras (codigobarra1/codigobarra2) | Match exato verificado no banco; campo codigobarra2 presente, codigobarra1 frequentemente null |
| BPROD-03 | Operador pode filtrar produtos por departamento, grupo e marca | Tabelas produto_departamento, produto_grupo, produto_marca confirmadas com IDs e nomes |
| BPROD-04 | Busca retorna a linha completa do produto (todos os campos) com paginação | 162 colunas mapeadas; COUNT(*) OVER() funcional no banco |
| BPROD-05 | Operador pode consultar um produto específico por idproduto | idproduto é integer PK, confirmado |
| SPROD-02 | Endpoints de produto exigem autenticação interna (x-internal-api-key), igual ao restante da API | APP_GUARD global (InternalAuthGuard) protege automaticamente — verificado em app.module.ts |
</phase_requirements>

---

## Summary

A fase 32 implementa endpoints REST de leitura no backend NestJS para busca e consulta de produtos do banco Athos. O código de referência é o módulo `integrations/athos` já existente, especialmente `AthosService.buscarClientes()` (paginação) e `AthosController` (padrão de decoradores). A fase é estritamente read-only no banco Athos.

**Schema crítico verificado diretamente no banco de produção:** A tabela `produto` tem 162 colunas; as tabelas de lookup usam o prefixo `produto_` (ex: `produto_departamento`, `produto_grupo`, `produto_marca`) com colunas de ID no formato `id{entidade}` e nome no campo `nome` — diferente dos nomes que o CONTEXT.md especulava (`descricaodepartamento`). O campo nome em todas as tabelas de lookup se chama simplesmente `nome` (não `descricaodepartamento`).

**Recomendação primária:** Seguir exatamente o padrão `buscarClientes()` para a query de busca — construção dinâmica de `conditions[]` e `qParams[]`, paginação com query separada para `COUNT(*)`, `try/finally` com `client.release()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Busca de produto com filtros | API / Backend (NestJS) | — | Lógica de query SQL fica no backend; frontend apenas passa parâmetros |
| Paginação | API / Backend | — | offset/limit e total calculados no service |
| Lookups (departamento/grupo/marca) | API / Backend | — | Queries simples ao Athos; sem cache nesta fase |
| Autenticação | API / Backend (Guard global) | — | InternalAuthGuard já registrado em app.module.ts como APP_GUARD |
| Interface TypeScript do produto | API / Backend | — | Tipo `Produto` definido no service para retorno tipado |

---

## Schema Verificado — Banco Athos BomCusto

> [VERIFIED: conexão direta ao banco 192.168.3.198/athos — 2026-06-15]

### Tabela `produto`

162 colunas confirmadas. Lista completa abaixo (em ordem de `ordinal_position`):

```
idproduto                   integer           (PK)
iddepartamento              integer           (FK → produto_departamento)
idsetor                     integer           (FK → produto_setor)
idgrupo                     integer           (FK → produto_grupo)
idsubgrupo                  integer           (FK → produto_subgrupo)
idlinha                     integer           (FK → produto_linha)
idfornecedor                integer
idunidade                   integer           (FK → produto_unidade)
iddeposito                  integer
idmarca                     integer           (FK → produto_marca)
idusuariocadastro           integer
idusuarioalteracao          integer
imagem                      integer
codigobarra1                character varying
codigobarra2                character varying
descricaoproduto            character varying
descricaocurta              character varying
referencia                  character varying
statusproduto               boolean
controlaestoque             boolean
vendeproduto                boolean
usagrade                    boolean
usacontroleserie            boolean
usaprodutocomposto          boolean
valorvenda1                 numeric
margemvenda1                numeric
valorvenda2                 numeric
margemvenda2                numeric
valorvenda3                 numeric
margemvenda3                numeric
valorvendapromocao          numeric
margemvendapromocao         numeric
icms                        character varying
ipi                         numeric
frete                       numeric
imposto                     numeric
outroimposto                numeric
tributacao                  character varying
origem                      integer
valorcustocaixa             numeric
quantidadecaixa             numeric
valorcustounitario          numeric
custorealcaixa              numeric
custorealunitario           numeric
descontomaximo              numeric
comissaovenda               numeric
estoquemaximo               numeric
estoqueminimo               numeric
pesobruto                   numeric
pesoliquido                 numeric
pesanabalanca               boolean
pesaporquilo                boolean
validadeproduto             integer
datacadastro                date
dataultimaentrada           date
dataultimaalteracao         date
dataultimavenda             date
informacaoadicional         character varying
localproduto                character varying
usarpreco                   smallint
iniciopromocao              date
terminopromocao             date
estoqueloja                 numeric
estoquedeposito             numeric
estoqueentregar             numeric
baixarestoque               boolean
tipoproduto                 boolean
promocaostatus              boolean
permitefracionar            boolean
precousado                  integer
ncm                         character varying
alterado                    boolean
codigocsosn                 character varying
utilizacodigomae            boolean
codigomae                   integer
idprodutocaracteristica     integer
utilizacaracteristica       boolean
exportasite                 boolean
idcfopsaida                 character varying
idcfopsaidaiterestadual     character varying
porcreducao                 numeric
tipoitem                    character varying
piscst                      character varying
pisaliquota                 numeric
cofinscst                   character varying
cofinsaliquota              numeric
iva                         numeric
horaultimaalteracao         time without time zone
ipisaida                    numeric
horaultimavenda             time without time zone
lancacardapio               boolean
idprodutocardapiocategoria  integer
idprodutocardapiosetor      integer
tempopreparocardapio        integer
valorst                     numeric
naoabaterconsumacao         boolean
anoinicio                   integer
anofim                      integer
codigoanp                   character varying
dataatencao                 date
ncmex                       character varying
ncmtipo                     integer
contacontabil               character varying
valorimpostorenda           numeric
cfopsat                     character varying
utilizagrade                boolean
referenciagrade             character varying
cest                        character varying
unidadeporcaixa             numeric
utilizaplanofaixaetaria     boolean
idprodutogenero             integer
idreceita                   integer
utilizainfonutricionais     boolean
codigoenquadramentoipi      character varying
utilizareducaoicms          boolean
nutricionalporcao           numeric
nutricionalorigem           character varying
nutricionalpesoliquido      numeric
codigoservico               character varying
codigoatividadeservico      character varying
aliquotaiss                 real
margemperda                 numeric
sincronizado                boolean
ultimaalteracao             timestamp without time zone
icmsnfe                     character varying
origemnfe                   integer
codigocsosnnfe              character varying
tributacaonfe               character varying
piscstnfe                   character varying
pisaliquotanfe              numeric
cofinscstnfe                character varying
cofinsaliquotanfe           numeric
largura                     numeric
altura                      numeric
profundidade                numeric
larguraembalagem            numeric
alturaembalagem             numeric
profundidadeembalagem       numeric
pesoembalagem               numeric
utilizafcp                  boolean
codigoselocontroleipi       character varying
imagemproduto               bytea           (ATENÇÃO: blob binário — excluir do SELECT * ou retornar null/undefined)
cfoptroca                   character varying
enviaremailvendaprazo       boolean
original                    character varying
idunidadetrib               integer
ipicst                      character varying
desoneradoaliquota          numeric
desoneradomotivo            integer
codigobeneficiofiscal       character varying
desoneradoaliquotanfe       numeric
desoneradomotivonfe         integer
codigobeneficiofiscalnfe    character varying
porcreducaosimples          numeric
porcreducaolucro            numeric
tributacaonfesimples        character varying
tributacaonfelucro          character varying
comissaovenda2              numeric
comissaovenda3              numeric
codigonaturezareceita       character varying
margemliquidavenda1         numeric
margemliquidavenda2         numeric
margemliquidavenda3         numeric
vbcstret                    numeric
pbio                        numeric
porig                       numeric
cuforigen                   character varying
indimport                   integer
utilizalocalizacao          boolean
nutricionalunidade          character varying
atacadostatus1              boolean
valorvendaatacado1          numeric
margemvendaatacado1         numeric
quantidadeatacado1          numeric
comissaoatacado1            numeric
inicioatacado1              date
terminoatacado1             date
atacadostatus2              boolean
valorvendaatacado2          numeric
margemvendaatacado2         numeric
quantidadeatacado2          numeric
comissaoatacado2            numeric
inicioatacado2              date
terminoatacado2             date
st_modalidade               integer
modalidade                  integer
margemliquidavenda4         numeric
margemliquidavenda5         numeric
margemliquidavenda6         numeric
valorvenda4                 numeric
margemvenda4                numeric
valorvenda5                 numeric
margemvenda5                numeric
valorvenda6                 numeric
margemvenda6                numeric
comissaovenda4              numeric
comissaovenda5              numeric
comissaovenda6              numeric
percentualglp               numeric
percentualglpnatural        numeric
percentualglpnaturalimportado numeric
usacomandaautomatica        boolean
cstibscbs                   character varying
cclasstribibscbs            character varying
ibsaliquota                 numeric
cbsaliquota                 numeric
utilizareducaoibscbs        boolean
porcreducaoibs              integer
porcreducaocbs              integer
nfsenbs                     character varying
nfseindopnbs                character varying
nfsecclasstribnbs           character varying
nfseibsaliquota             numeric
nfsecbsaliquota             numeric
nfsebeneficio               character varying
observacao                  text
utilizainformacaofisco      boolean
```

**Total: 162 colunas** | **Total de registros: 28.836 produtos**

### Tabelas de Lookup

> [VERIFIED: conexão direta ao banco 192.168.3.198/athos — 2026-06-15]

**ATENÇÃO CRÍTICA:** Os nomes das tabelas de lookup usam o prefixo `produto_`, não `departamento`/`grupo`/`marca` diretamente. O campo descritivo se chama `nome` em todas elas (não `descricaodepartamento` como o CONTEXT.md especulava).

| Tabela real | Coluna ID | Coluna nome | Registros | Exemplo |
|-------------|-----------|-------------|-----------|---------|
| `produto_departamento` | `iddepartamento` | `nome` | 1 | `{id:1, nome:"GRAFICA"}` |
| `produto_grupo` | `idgrupo` | `nome` | 6 | `{id:1, nome:"CONFECÇÃO CARIMBO"}` |
| `produto_marca` | `idmarca` | `nome` | 3 | `{id:1, nome:"NYKON"}` |
| `produto_setor` | `idsetor` | `nome` | 2 | `{id:1, nome:"GRAFICA RAPIDA"}` |
| `produto_subgrupo` | `idsubgrupo` | `nome` | 5 | `{id:3, nome:"COLORIDO"}` |
| `produto_linha` | `idlinha` | `nome` | 20 | `{id:2, nome:"AZUL BEBE"}` |
| `produto_unidade` | `idunidade` | `sigla` + `descricao` | 30 | `{sigla:"PC", descricao:"PACOTE"}` |

**Nota sobre `produto_setor`:** O campo `idsetor` existe na tabela `produto` mas não está nos filtros de busca definidos (D-08 menciona apenas departamento/grupo/marca). Os endpoints de lookup incluem apenas departamento, grupo e marca (D-09).

---

## Standard Stack

### Core (já existente — sem novas instalações)

| Library | Versão atual | Purpose | Status |
|---------|-------------|---------|--------|
| `@nestjs/common` | existente | Controllers, Guards, Exceptions | Já instalado |
| `@nestjs/swagger` | existente | Decoradores de documentação | Já instalado |
| `pg` (node-postgres) | existente | Pool de conexão ao Athos | Já instalado |
| TypeScript | existente | Tipagem da interface `Produto` | Já configurado |

> Esta fase não instala nenhum pacote novo. [VERIFIED: inspeção do código existente]

## Package Legitimacy Audit

> Não aplicável — esta fase não instala pacotes externos. Todos os recursos necessários já estão no projeto.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | Nenhum pacote novo |

**Pacotes removidos por slopcheck:** nenhum
**Pacotes suspeitos:** nenhum

---

## Architecture Patterns

### System Architecture Diagram

```
Request (x-internal-api-key)
         │
         ▼
[InternalAuthGuard — APP_GUARD global]
         │ 401 se inválido
         ▼
[ProdutoController] ─── GET /athos/produtos?descricao=X&codigobarra=Y&...
         │               GET /athos/produtos/:idproduto
         │               GET /athos/produtos/lookup/departamentos
         │               GET /athos/produtos/lookup/grupos
         │               GET /athos/produtos/lookup/marcas
         ▼
[AthosService] (métodos novos adicionados)
         │  buscarProdutos()
         │  buscarProdutoPorId()
         │  buscarDepartamentos()
         │  buscarGrupos()
         │  buscarMarcas()
         ▼
[this.getPool().connect()] ──► Banco Athos PostgreSQL (192.168.3.198)
         │                          tabela: produto
         │                          tabelas: produto_departamento, produto_grupo, produto_marca
         ▼
[{ total, page, take, items: Produto[] }]  ─── buscarProdutos
[Produto]                                  ─── buscarProdutoPorId
[{ id, nome }[]]                           ─── lookups
```

### Recommended Project Structure

```
apps/backend/src/modules/integrations/athos/
├── athos.controller.ts              (existente — NÃO MODIFICAR)
├── athos.module.ts                  (modificar: adicionar ProdutoController em controllers:[])
├── athos.service.ts                 (modificar: adicionar 5 novos métodos)
├── athos-produto.controller.ts      (CRIAR — novo arquivo)
└── dto/
    └── (nenhum DTO necessário — params via @Query, sem body)
```

### Pattern 1: Paginação com Query Separada de COUNT (padrão estabelecido)

`buscarClientes()` usa **duas queries separadas** — uma para COUNT e uma para os dados — não `COUNT(*) OVER()`. Ambas compartilham o mesmo `baseJoins` e `qParams`.

```typescript
// Source: athos.service.ts L1109-1131 (verificado)
const countResult = await client.query(`SELECT COUNT(*) AS total ${baseJoins}`, qParams);
const total = Number(countResult.rows[0]?.total ?? 0);

const dataResult = await client.query(
  `SELECT * ${baseJoins} ORDER BY p.descricaoproduto ASC LIMIT $${idx} OFFSET $${idx + 1}`,
  [...qParams, take, offset],
);
```

**Nota:** O `COUNT(*) OVER()` também funciona (confirmado no banco), mas o padrão estabelecido do projeto usa queries separadas. Usar o padrão existente para consistência.

### Pattern 2: Construção Dinâmica de Filtros

```typescript
// Source: athos.service.ts L1071-1093 (padrão buscarClientes — verificado)
const conditions: string[] = [];
const qParams: (string | number)[] = [];
let idx = 1;

if (descricao?.trim()) {
  conditions.push(`(p.descricaoproduto ILIKE $${idx} OR p.descricaocurta ILIKE $${idx})`);
  qParams.push(`%${descricao.trim()}%`);
  idx++;
}
if (codigobarra?.trim()) {
  conditions.push(`(p.codigobarra1 = $${idx} OR p.codigobarra2 = $${idx})`);
  qParams.push(codigobarra.trim());
  idx++;
}
if (iddepartamento) {
  conditions.push(`p.iddepartamento = $${idx++}`);
  qParams.push(iddepartamento);
}
// ... idgrupo, idmarca analogamente

const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
```

### Pattern 3: Pool Connection com try/finally

```typescript
// Source: athos.service.ts L1068-1184 (verificado)
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  // queries...
  return result;
} catch (err) {
  if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
  this.logger.warn(`Falha: ${err instanceof Error ? err.message : String(err)}`);
  throw new InternalServerErrorException("Erro ao buscar produtos no Athos.");
} finally {
  client.release();
}
```

### Pattern 4: Controller sem validateAthosToken (diferença do padrão antigo)

O `AthosController` usa `validateAthosToken` (validação manual legada). O `ProdutoController` **NÃO** deve usar esse método — o `APP_GUARD` global (`InternalAuthGuard`) já protege todos os endpoints via `x-internal-api-key`. Esse é o padrão atual do projeto.

```typescript
// Source: app.module.ts L82-85 (verificado)
{
  provide: APP_GUARD,
  useClass: InternalAuthGuard,
}
// Header validado: x-internal-api-key (security.constants.ts)
// O ProdutoController herda essa proteção automaticamente.
// Não injetar @Headers("authorization") nem chamar validateAthosToken.
```

### Pattern 5: Registro de Controller no Módulo

```typescript
// Source: athos.module.ts L10-16 (verificado)
@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [AthosService, AthosListenerService],
  controllers: [AthosController, ProdutoController], // adicionar aqui
  exports: [AthosService],
})
export class AthosModule {}
```

### Pattern 6: Resolução de Rota (lookup vs :idproduto)

As rotas de lookup devem ser declaradas **antes** da rota `/:idproduto` no controller para evitar que o NestJS tente parsear `"lookup"` como um inteiro:

```typescript
@Controller("athos/produtos")
export class ProdutoController {
  @Get("lookup/departamentos")  // PRIMEIRO
  async lookupDepartamentos() {}

  @Get("lookup/grupos")         // PRIMEIRO
  async lookupGrupos() {}

  @Get("lookup/marcas")         // PRIMEIRO
  async lookupMarcas() {}

  @Get(":idproduto")            // DEPOIS — evita conflito com "lookup"
  async buscarPorId(@Param("idproduto", ParseIntPipe) id: number) {}

  @Get()                        // listagem com filtros
  async buscarProdutos() {}
}
```

**Atenção:** No NestJS, a ordem de declaração dos handlers dentro de um controller importa para resolução de rotas estáticas vs. paramétricos.

### Anti-Patterns a Evitar

- **Não usar `validateAthosToken`** no `ProdutoController` — o guard global cuida disso.
- **Não retornar `imagemproduto` (bytea) diretamente** — é um blob binário que pode crashar a serialização JSON e é pesado. Excluir da query ou retornar `null`.
- **Não colocar `SELECT *` literal** — a coluna `imagemproduto` é `bytea` e deve ser explicitamente excluída ou substituída por `NULL AS imagemproduto`.
- **Não usar `COUNT(*) OVER()`** — o padrão do projeto usa query separada para COUNT.
- **Não criar `ProdutoService` separado** — D-02 locked.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paginação | Lógica custom de slice em array | Padrão `buscarClientes()` com LIMIT/OFFSET | O banco tem 28.836 produtos — nunca trazer tudo em memória |
| Autenticação | Validação manual de token no controller | `APP_GUARD` global (InternalAuthGuard) | Já funciona por herança; duplicar cria divergência |
| Busca case-insensitive | `LOWER()` manual | `ILIKE` (PostgreSQL nativo) | `ILIKE` suporta locale-aware; já verificado funcionando |

**Insight:** Com 28.836 produtos, a paginação não é opcional — é obrigatória.

---

## Common Pitfalls

### Pitfall 1: imagemproduto (bytea) no SELECT *

**O que dá errado:** `SELECT *` retorna a coluna `imagemproduto` como um Buffer Node.js. O `JSON.stringify` vai serializar como objeto `{type:"Buffer", data:[...]}` ou falhar com buffers grandes, além de transferir dados binários pesados desnecessariamente.

**Por que acontece:** A tabela `produto` tem uma coluna `imagemproduto bytea` na posição 140. `SELECT *` a inclui.

**Como evitar:** Substituir por `NULL AS imagemproduto` na query, ou listar explicitamente as colunas excluindo `imagemproduto`. Recomendado: `SELECT p.*, NULL::bytea AS imagemproduto FROM produto p`.

**Sinais de alerta:** Response com campo `{type:"Buffer",data:[...]}` no JSON; payload excessivamente grande.

### Pitfall 2: Rota /lookup/* conflitando com /:idproduto

**O que dá errado:** Se `@Get(":idproduto")` for declarado antes de `@Get("lookup/departamentos")`, o NestJS captura a requisição para `/athos/produtos/lookup/departamentos` e tenta parsear `"lookup"` como inteiro — o `ParseIntPipe` lança 400.

**Por que acontece:** NestJS resolve rotas na ordem de declaração dentro do controller.

**Como evitar:** Declarar todos os handlers de rota estática (lookup/*) antes do handler paramétrico (`:idproduto`).

### Pitfall 3: Tabelas de lookup com nome errado

**O que dá errado:** Usar `departamento`, `grupo`, `marca` como nomes de tabela — essas tabelas não existem no banco Athos da BomCusto.

**Por que acontece:** O CONTEXT.md mencionava os nomes por hipótese (D-11 pedia verificação).

**Como evitar:** Usar os nomes verificados: `produto_departamento`, `produto_grupo`, `produto_marca`.

### Pitfall 4: Campo nome das tabelas de lookup

**O que dá errado:** Tentar acessar `descricaodepartamento`, `descricaogrupo`, `descricaomarca` — essas colunas não existem.

**Por que acontece:** Nomes especulativos no CONTEXT.md. A coluna real em todas as tabelas de lookup chama-se `nome`.

**Como evitar:** Usar `nome` em `produto_departamento`, `produto_grupo`, `produto_marca`.

### Pitfall 5: validateAthosToken no ProdutoController

**O que dá errado:** Copiar o padrão antigo do `AthosController` que injeta `@Headers("authorization")` e chama `this.validateAthosToken()` — o `ProdutoController` ficaria com duas camadas de autenticação (guard + manual).

**Por que acontece:** O `AthosController` usa validação legada de `ATHOS_API_TOKEN`. O projeto migrou para `InternalAuthGuard` + `INTERNAL_API_KEY`.

**Como evitar:** O `ProdutoController` não deve ter nenhuma referência a `validateAthosToken`, `ATHOS_API_TOKEN`, ou `@Headers("authorization")`. O guard global é suficiente.

### Pitfall 6: Sem filtro retorna 28.836 produtos sem paginação

**O que dá errado:** Implementar endpoint sem validar `take` máximo — caller passa `take=10000` e derruba o processo.

**Como evitar:** Copiar o padrão `take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50)`.

---

## Code Examples

### Interface TypeScript da tabela produto

```typescript
// Todos os campos verificados — exclui imagemproduto (bytea)
export interface Produto {
  idproduto: number;
  iddepartamento: number | null;
  idsetor: number | null;
  idgrupo: number | null;
  idsubgrupo: number | null;
  idlinha: number | null;
  idfornecedor: number | null;
  idunidade: number | null;
  iddeposito: number | null;
  idmarca: number | null;
  idusuariocadastro: number | null;
  idusuarioalteracao: number | null;
  imagem: number | null;
  codigobarra1: string | null;
  codigobarra2: string | null;
  descricaoproduto: string | null;
  descricaocurta: string | null;
  referencia: string | null;
  statusproduto: boolean | null;
  controlaestoque: boolean | null;
  vendeproduto: boolean | null;
  usagrade: boolean | null;
  usacontroleserie: boolean | null;
  usaprodutocomposto: boolean | null;
  valorvenda1: string | null;       // numeric → string no driver pg
  margemvenda1: string | null;
  valorvenda2: string | null;
  margemvenda2: string | null;
  valorvenda3: string | null;
  margemvenda3: string | null;
  valorvendapromocao: string | null;
  margemvendapromocao: string | null;
  icms: string | null;
  ipi: string | null;
  frete: string | null;
  imposto: string | null;
  outroimposto: string | null;
  tributacao: string | null;
  origem: number | null;
  valorcustocaixa: string | null;
  quantidadecaixa: string | null;
  valorcustounitario: string | null;
  custorealcaixa: string | null;
  custorealunitario: string | null;
  descontomaximo: string | null;
  comissaovenda: string | null;
  estoquemaximo: string | null;
  estoqueminimo: string | null;
  pesobruto: string | null;
  pesoliquido: string | null;
  pesanabalanca: boolean | null;
  pesaporquilo: boolean | null;
  validadeproduto: number | null;
  datacadastro: string | null;      // date → string ISO
  dataultimaentrada: string | null;
  dataultimaalteracao: string | null;
  dataultimavenda: string | null;
  informacaoadicional: string | null;
  localproduto: string | null;
  usarpreco: number | null;         // smallint
  iniciopromocao: string | null;
  terminopromocao: string | null;
  estoqueloja: string | null;
  estoquedeposito: string | null;
  estoqueentregar: string | null;
  baixarestoque: boolean | null;
  tipoproduto: boolean | null;
  promocaostatus: boolean | null;
  permitefracionar: boolean | null;
  precousado: number | null;
  ncm: string | null;
  alterado: boolean | null;
  codigocsosn: string | null;
  utilizacodigomae: boolean | null;
  codigomae: number | null;
  idprodutocaracteristica: number | null;
  utilizacaracteristica: boolean | null;
  exportasite: boolean | null;
  idcfopsaida: string | null;
  idcfopsaidaiterestadual: string | null;
  porcreducao: string | null;
  tipoitem: string | null;
  piscst: string | null;
  pisaliquota: string | null;
  cofinscst: string | null;
  cofinsaliquota: string | null;
  iva: string | null;
  horaultimaalteracao: string | null;
  ipisaida: string | null;
  horaultimavenda: string | null;
  lancacardapio: boolean | null;
  idprodutocardapiocategoria: number | null;
  idprodutocardapiosetor: number | null;
  tempopreparocardapio: number | null;
  valorst: string | null;
  naoabaterconsumacao: boolean | null;
  anoinicio: number | null;
  anofim: number | null;
  codigoanp: string | null;
  dataatencao: string | null;
  ncmex: string | null;
  ncmtipo: number | null;
  contacontabil: string | null;
  valorimpostorenda: string | null;
  cfopsat: string | null;
  utilizagrade: boolean | null;
  referenciagrade: string | null;
  cest: string | null;
  unidadeporcaixa: string | null;
  utilizaplanofaixaetaria: boolean | null;
  idprodutogenero: number | null;
  idreceita: number | null;
  utilizainfonutricionais: boolean | null;
  codigoenquadramentoipi: string | null;
  utilizareducaoicms: boolean | null;
  nutricionalporcao: string | null;
  nutricionalorigem: string | null;
  nutricionalpesoliquido: string | null;
  codigoservico: string | null;
  codigoatividadeservico: string | null;
  aliquotaiss: number | null;       // real
  margemperda: string | null;
  sincronizado: boolean | null;
  ultimaalteracao: string | null;   // timestamp
  icmsnfe: string | null;
  origemnfe: number | null;
  codigocsosnnfe: string | null;
  tributacaonfe: string | null;
  piscstnfe: string | null;
  pisaliquotanfe: string | null;
  cofinscstnfe: string | null;
  cofinsaliquotanfe: string | null;
  largura: string | null;
  altura: string | null;
  profundidade: string | null;
  larguraembalagem: string | null;
  alturaembalagem: string | null;
  profundidadeembalagem: string | null;
  pesoembalagem: string | null;
  utilizafcp: boolean | null;
  codigoselocontroleipi: string | null;
  imagemproduto: null;              // bytea — sempre null na resposta
  cfoptroca: string | null;
  enviaremailvendaprazo: boolean | null;
  original: string | null;
  idunidadetrib: number | null;
  ipicst: string | null;
  desoneradoaliquota: string | null;
  desoneradomotivo: number | null;
  codigobeneficiofiscal: string | null;
  desoneradoaliquotanfe: string | null;
  desoneradomotivonfe: number | null;
  codigobeneficiofiscalnfe: string | null;
  porcreducaosimples: string | null;
  porcreducaolucro: string | null;
  tributacaonfesimples: string | null;
  tributacaonfelucro: string | null;
  comissaovenda2: string | null;
  comissaovenda3: string | null;
  codigonaturezareceita: string | null;
  margemliquidavenda1: string | null;
  margemliquidavenda2: string | null;
  margemliquidavenda3: string | null;
  vbcstret: string | null;
  pbio: string | null;
  porig: string | null;
  cuforigen: string | null;
  indimport: number | null;
  utilizalocalizacao: boolean | null;
  nutricionalunidade: string | null;
  atacadostatus1: boolean | null;
  valorvendaatacado1: string | null;
  margemvendaatacado1: string | null;
  quantidadeatacado1: string | null;
  comissaoatacado1: string | null;
  inicioatacado1: string | null;
  terminoatacado1: string | null;
  atacadostatus2: boolean | null;
  valorvendaatacado2: string | null;
  margemvendaatacado2: string | null;
  quantidadeatacado2: string | null;
  comissaoatacado2: string | null;
  inicioatacado2: string | null;
  terminoatacado2: string | null;
  st_modalidade: number | null;
  modalidade: number | null;
  margemliquidavenda4: string | null;
  margemliquidavenda5: string | null;
  margemliquidavenda6: string | null;
  valorvenda4: string | null;
  margemvenda4: string | null;
  valorvenda5: string | null;
  margemvenda5: string | null;
  valorvenda6: string | null;
  margemvenda6: string | null;
  comissaovenda4: string | null;
  comissaovenda5: string | null;
  comissaovenda6: string | null;
  percentualglp: string | null;
  percentualglpnatural: string | null;
  percentualglpnaturalimportado: string | null;
  usacomandaautomatica: boolean | null;
  cstibscbs: string | null;
  cclasstribibscbs: string | null;
  ibsaliquota: string | null;
  cbsaliquota: string | null;
  utilizareducaoibscbs: boolean | null;
  porcreducaoibs: number | null;
  porcreducaocbs: number | null;
  nfsenbs: string | null;
  nfseindopnbs: string | null;
  nfsecclasstribnbs: string | null;
  nfseibsaliquota: string | null;
  nfsecbsaliquota: string | null;
  nfsebeneficio: string | null;
  observacao: string | null;
  utilizainformacaofisco: boolean | null;
}
```

### Interface dos Lookups

```typescript
export interface LookupItem {
  id: number;
  nome: string;
}
```

### Query de busca de produto (skeleton)

```typescript
// Padrão adaptado de buscarClientes() — athos.service.ts L1024+
async buscarProdutos(params: {
  descricao?: string;
  codigobarra?: string;
  iddepartamento?: number;
  idgrupo?: number;
  idmarca?: number;
  page?: number;
  take?: number;
}): Promise<{ total: number; page: number; take: number; items: Produto[] }> {
  const take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const offset = (page - 1) * take;

  const conditions: string[] = [];
  const qParams: (string | number)[] = [];
  let idx = 1;

  if (params.descricao?.trim()) {
    conditions.push(`(p.descricaoproduto ILIKE $${idx} OR p.descricaocurta ILIKE $${idx})`);
    qParams.push(`%${params.descricao.trim()}%`);
    idx++;
  }
  if (params.codigobarra?.trim()) {
    conditions.push(`(p.codigobarra1 = $${idx} OR p.codigobarra2 = $${idx})`);
    qParams.push(params.codigobarra.trim());
    idx++;
  }
  if (params.iddepartamento) {
    conditions.push(`p.iddepartamento = $${idx++}`);
    qParams.push(params.iddepartamento);
  }
  if (params.idgrupo) {
    conditions.push(`p.idgrupo = $${idx++}`);
    qParams.push(params.idgrupo);
  }
  if (params.idmarca) {
    conditions.push(`p.idmarca = $${idx++}`);
    qParams.push(params.idmarca);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const countResult = await client.query(
      `SELECT COUNT(*) AS total FROM produto p ${whereClause}`,
      qParams,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const dataResult = await client.query(
      `SELECT p.*, NULL::bytea AS imagemproduto FROM produto p ${whereClause}
       ORDER BY p.descricaoproduto ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...qParams, take, offset],
    );

    return { total, page, take, items: dataResult.rows as Produto[] };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    this.logger.warn(`buscarProdutos: ${err instanceof Error ? err.message : String(err)}`);
    throw new InternalServerErrorException("Erro ao buscar produtos no Athos.");
  } finally {
    client.release();
  }
}
```

### Query de lookup

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

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| validateAthosToken manual em cada controller | APP_GUARD global (InternalAuthGuard) | Fases 1-2 (v1.0) | ProdutoController herda proteção sem código extra |
| Query com COUNT(*) OVER() em window function | Duas queries separadas (COUNT + dados) | buscarClientes() estabeleceu o padrão | Mais claro e testável |

---

## Assumptions Log

| # | Claim | Section | Risk se Errado |
|---|-------|---------|----------------|
| A1 | O driver `pg` retorna colunas `numeric` como `string` (não `number`) | Interface TypeScript | Tipos incorretos na interface; impacto baixo pois a Fase 34 converte para exibição |
| A2 | O usuário `usuario_leitura` tem acesso de SELECT nas tabelas `produto_departamento`, `produto_grupo`, `produto_marca` | Queries de lookup | Lookup retorna erro de permissão — fácil de detectar em Wave 0 |

**Riscos A1 e A2 são de baixo impacto** — serão detectados imediatamente nos primeiros testes manuais (Wave 0).

---

## Open Questions

1. **`imagemproduto` (bytea) — excluir via `NULL::bytea` ou via lista explícita de colunas?**
   - O que sabemos: a coluna existe, é bytea, e `SELECT *` a incluiria.
   - O que é incerto: se `NULL::bytea AS imagemproduto` é suficiente ou se o planner prefere listar as 161 outras colunas explicitamente.
   - Recomendação: usar `p.*, NULL::bytea AS imagemproduto` (sobrescreve a coluna no result) — menos manutenção se a tabela ganhar colunas futuras.

2. **Filtro por `statusproduto` como parâmetro opcional?**
   - CONTEXT.md defer: "a Fase 34 decide o comportamento de UX"
   - De baixo custo adicionar como filtro opcional: `&statusproduto=true`
   - Recomendação: incluir como parâmetro opcional `statusproduto?: boolean` para não forçar repasse na Fase 34. Decisão final do planner.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL Athos (192.168.3.198:5432) | buscarProdutos, lookups | Verificado | PostgreSQL 15.x (estimado) | — |
| Pool pg existente (AthosService.getPool()) | todos os métodos | Verificado (código) | node-postgres existente | — |
| NestJS InternalAuthGuard | SPROD-02 | Verificado (app.module.ts) | existente | — |

**Dependências bloqueantes:** nenhuma. Banco conectável, código de pool existente.

---

## Validation Architecture

> `workflow.nyquist_validation` não está presente em `.planning/config.json` — tratado como habilitado.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `cd apps/backend && npx jest --testPathPattern="athos-produto"` |
| Full suite command | `cd apps/backend && npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BPROD-01 | buscarProdutos filtra por descricao com ILIKE | unit | `npx jest athos-produto.controller.test --testNamePattern="descricao"` | ❌ Wave 0 |
| BPROD-02 | buscarProdutos filtra por codigobarra com match exato | unit | `npx jest athos-produto.controller.test --testNamePattern="codigobarra"` | ❌ Wave 0 |
| BPROD-03 | buscarProdutos filtra por iddepartamento/idgrupo/idmarca | unit | `npx jest athos-produto.controller.test --testNamePattern="departamento"` | ❌ Wave 0 |
| BPROD-04 | resposta contém total/page/take/items paginados | unit | `npx jest athos-produto.controller.test --testNamePattern="paginacao"` | ❌ Wave 0 |
| BPROD-05 | buscarProdutoPorId retorna produto ou 404 | unit | `npx jest athos-produto.controller.test --testNamePattern="idproduto"` | ❌ Wave 0 |
| SPROD-02 | sem auth retorna 401 via guard global | unit | Coberto por testes existentes do InternalAuthGuard | ✅ existente |

### Sampling Rate

- **Por task commit:** `cd apps/backend && npx jest --testPathPattern="athos-produto" --passWithNoTests`
- **Por wave merge:** `cd apps/backend && npx jest`
- **Phase gate:** Full suite green antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts` — testes do novo controller (BPROD-01 a BPROD-05)
- [ ] Mock do `AthosService` com métodos `buscarProdutos`, `buscarProdutoPorId`, `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas`

---

## Security Domain

> `security_enforcement` não está presente em `.planning/config.json` — tratado como habilitado.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | InternalAuthGuard (x-internal-api-key via timingSafeEqual) |
| V3 Session Management | não | API stateless |
| V4 Access Control | sim | APP_GUARD global — todos endpoints protegidos por padrão |
| V5 Input Validation | sim | ParseIntPipe para :idproduto; sanitização manual dos query params |
| V6 Cryptography | não | Read-only; sem geração de tokens nesta fase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL Injection via query params | Tampering | Queries parametrizadas com `$1`, `$2`, ... (nenhuma interpolação de string) |
| Exposição de dados binários (imagemproduto) | Information Disclosure | `NULL::bytea AS imagemproduto` exclui blob da resposta |
| Rate limit contorno via busca sem filtro (28k produtos) | Denial of Service | `take` capped a 50; ThrottlerGuard global aplicado |

---

## Sources

### Primary (HIGH confidence)

- Conexão direta ao banco Athos 192.168.3.198:5432/athos — `information_schema.columns` e queries de sample [VERIFIED: 2026-06-15]
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — padrão de paginação L1024-1185 [VERIFIED: leitura direta do código]
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — estrutura do módulo [VERIFIED]
- `apps/backend/src/modules/app.module.ts` — APP_GUARD InternalAuthGuard L73-85 [VERIFIED]
- `apps/backend/src/modules/security/internal-auth.guard.ts` — header `x-internal-api-key` [VERIFIED]
- `apps/backend/src/modules/security/security.constants.ts` — `INTERNAL_API_KEY_HEADER` [VERIFIED]

### Secondary (MEDIUM confidence)

- Padrão de resolução de rotas NestJS (ordem de declaração importa para static vs. parametric) [ASSUMED — comportamento NestJS bem estabelecido]

---

## Metadata

**Confidence breakdown:**
- Schema do banco: HIGH — verificado via query direta ao banco de produção
- Standard stack: HIGH — sem pacotes novos; todo código baseado no existente
- Architecture: HIGH — padrão copiado de buscarClientes() confirmado
- Pitfalls: HIGH — imagemproduto/bytea confirmada via schema; rota ordering é comportamento documentado do NestJS

**Research date:** 2026-06-15
**Valid until:** 2026-09-15 (schema do Athos estável; lookups com poucos registros)
