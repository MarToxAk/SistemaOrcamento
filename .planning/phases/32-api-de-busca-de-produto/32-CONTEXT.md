# Phase 32: API de Busca de Produto - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar endpoints REST de leitura no backend (NestJS) para busca e consulta de produtos da tabela `produto` do Athos. Filtros suportados: descrição parcial (case-insensitive), código de barras (codigobarra1/codigobarra2), e combinação departamento/grupo/marca. Resultado paginado com a linha completa do produto. Endpoint separado para consulta por `idproduto`. Endpoints de lookup de departamento, grupo e marca para suporte à Fase 33 (validação FK) e Fase 34 (dropdowns). Fase 100% read-only — nenhuma escrita no Athos nesta fase.

</domain>

<decisions>
## Implementation Decisions

### Controller Placement

- **D-01:** Criar `ProdutoController` separado no mesmo módulo Athos (`apps/backend/src/modules/integrations/athos/athos-produto.controller.ts`). Prefixo de rota: `/athos/produtos`. `AthosModule` registra os dois controllers. `AthosController` não é alterado nesta fase.
- **D-02:** Métodos de busca de produto ficam em `AthosService` (mesmo service existente) — sem criar `ProdutoService` separado. Fase 33 avalia se a escrita merece service próprio.

### Response Shape

- **D-03:** Retornar `SELECT *` da tabela `produto` como objeto tipado — interface TypeScript com todos os campos conhecidos. O requirement BPROD-04 exige "linha completa"; nenhum campo deve ser filtrado no backend. O researcher mapeará os campos reais da tabela no banco Athos da instância da BomCusto.
- **D-04:** O response de busca segue o padrão `{ total: number, page: number, take: number, items: Produto[] }` — igual ao `buscarClientes`. Take máximo: 50 (mesmo padrão).

### Filtro Mínimo

- **D-05:** Permitir listagem paginada **sem filtro obrigatório** — quando nenhum filtro é informado, retornar todos os produtos ordenados por `descricaoproduto ASC` com paginação. Isso permite a Fase 34 exibir lista inicial sem input do usuário.
- **D-06:** Quando filtro de descrição for informado: busca parcial case-insensitive via `ILIKE '%valor%'` nos campos `descricaoproduto` e `descricaocurta` (OR entre os dois). Sem mínimo de caracteres.
- **D-07:** Quando filtro de código de barras for informado: match exato em `codigobarra1` e `codigobarra2` (OR). Sem ILIKE — código de barras é sempre exato.
- **D-08:** Filtros de departamento, grupo e marca aceitam o ID (integer) — o frontend resolve o nome via lookups.

### Lookups de Departamento / Grupo / Marca

- **D-09:** Incluir nesta fase endpoints de lookup para as três entidades. Endpoints sugeridos:
  - `GET /athos/produtos/lookup/departamentos`
  - `GET /athos/produtos/lookup/grupos`
  - `GET /athos/produtos/lookup/marcas`
- **D-10:** Cada lookup retorna array simples `{ id: number, nome: string }[]` ordenado por nome. Sem paginação — a quantidade de departamentos/grupos/marcas é pequena o suficiente para retornar tudo.
- **D-11:** O researcher deve verificar os nomes reais das tabelas e colunas no Athos (ex: `departamento`/`iddepartamento`/`descricaodepartamento`, `grupo`/`idgrupo`/`descricaogrupo`, `marca`/`idmarca`/`descricaomarca`) — nomes podem variar da instância.

### Endpoint de Consulta por ID

- **D-12:** `GET /athos/produtos/:idproduto` — retorna a linha completa do produto ou 404 se não encontrado. Consistente com o padrão `GET /athos/clientes/:idcliente/dados`.

### Autenticação

- **D-13:** Nenhuma ação necessária — guard global (`APP_GUARD`) já protege todos os endpoints automaticamente. SPROD-02 é satisfeito por herança.

### Claude's Discretion

- Nomenclatura dos parâmetros de query: `descricao`, `codigobarra`, `iddepartamento`, `idgrupo`, `idmarca`, `page`, `take` — manter consistência com padrão snake_case do Athos.
- Swagger: decorar endpoints com `@ApiOperation`, `@ApiQuery` e `@ApiOkResponse` seguindo o padrão do `AthosController`.
- Logger: `this.logger.log(...)` no início de cada método de service, igual ao padrão estabelecido.
- Error handling: `BadRequestException` para parâmetros inválidos, `NotFoundException` para produto não encontrado por ID, `InternalServerErrorException` para falha no pool Athos.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Módulo Athos — Backend
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — padrão de endpoint, decorators Swagger, estrutura de `@Get`, `@Query`; ver especialmente `buscarClientes` (L103+) para o padrão de paginação
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarClientes()` (L1024+) para o padrão de paginação `{ total, page, take, items }` e construção de queries com `PoolClient`; `buscarNotasFiscaisCliente()` para padrão de query simples sem paginação
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — onde registrar o novo `ProdutoController`

### Padrões de Autenticação
- `apps/backend/src/modules/app.module.ts` — `APP_GUARD` global (L78+) que protege automaticamente todos os endpoints

### Requisitos
- `.planning/REQUIREMENTS.md` — BPROD-01, BPROD-02, BPROD-03, BPROD-04, BPROD-05, SPROD-02

### Roadmap
- `.planning/ROADMAP.md` — Phase 32 success criteria (5 critérios de aceite)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosService.buscarClientes()` (L1024+) — padrão de paginação `{ total, page, take, items }` com `COUNT(*) OVER()` ou query separada de total. Copiar estrutura: `take = Math.min(Math.max(1, Number(...)), 50)`, `offset = (page - 1) * take`.
- `AthosService.getPool()` — método de acesso ao pool PostgreSQL do Athos; usar `pool.connect()` → `client.query()` → `client.release()` no try/finally.
- `AthosController` decorators — `@ApiOperation`, `@ApiOkResponse`, `@ApiQuery` já importados e em uso; reutilizar no `ProdutoController`.

### Established Patterns
- Query com múltiplos filtros opcionais: construir `conditions[]` e `qParams[]` dinamicamente com `$${idx++}`, igual ao `buscarClientes`.
- `ILIKE '%$1%'` para busca parcial case-insensitive em colunas de texto — padrão já usado para nome de cliente.
- Logger: `private readonly logger = new Logger(ProdutoController.name)` no controller + `new Logger(AthosService.name)` no service (já existe).

### Integration Points
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — adicionar `ProdutoController` em `controllers: []`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — adicionar métodos `buscarProdutos()`, `buscarProdutoPorId()`, `buscarDepartamentos()`, `buscarGrupos()`, `buscarMarcas()`
- Novo arquivo: `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts`

</code_context>

<specifics>
## Specific Ideas

- Endpoint de busca unificado com filtros opcionais via query params: `GET /athos/produtos?descricao=X&codigobarra=Y&iddepartamento=1&idgrupo=2&idmarca=3&page=1&take=20`
- Sem filtro = lista paginada completa, ordenada por `descricaoproduto ASC`
- Com `codigobarra`: match exato em `codigobarra1 = $x OR codigobarra2 = $x` (não ILIKE)
- Com `descricao`: `descricaoproduto ILIKE '%$x%' OR descricaocurta ILIKE '%$x%'`
- Lookup endpoints: retornam antes do endpoint de busca na ordem de URL (não há conflito com `:idproduto`)

</specifics>

<deferred>
## Deferred Ideas

- Busca full-text com ranking de relevância (trigram/pg_trgm) → complexidade desnecessária para o CRUD básico, backlog
- Cache de lookups (departamento/grupo/marca mudam raramente) → otimização futura
- Filtro por `statusproduto` na listagem (mostrar só ativos ou todos) → a Fase 34 decide o comportamento de UX; o researcher pode incluir `statusproduto` como filtro opcional de baixo custo

</deferred>

---

*Phase: 32-api-de-busca-de-produto*
*Context gathered: 2026-06-15*
