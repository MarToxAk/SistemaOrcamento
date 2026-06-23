# Phase 33: API de Escrita de Produto - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar endpoints REST de escrita no backend NestJS para a tabela `produto` do Athos: POST (criar produto), PATCH (editar produto), PATCH (desativar/reativar produto). Fase 100% backend — sem tela frontend (Fase 34). `ProdutoController` e `produto.types.ts` já existem (Fase 32) e recebem os novos endpoints. Nenhuma outra tabela do Athos é gravada. Trigger `tg_alterarproduto` e rules `atualizardatahora*` nunca são desabilitados.

</domain>

<decisions>
## Implementation Decisions

### Usuário de Escrita

- **D-01:** Criar env var `ATHOS_SISTEMA_USUARIO_ID` (integer) — usada em `idusuariocadastro` (INSERT) e `idusuarioalteracao` (PATCH). O operador configura o ID do usuário do Athos que representa o Sistema de Orçamento.
- **D-02:** `ATHOS_SISTEMA_USUARIO_ID` é variável **obrigatória** — fail-fast na inicialização junto com `ATHOS_PG_HOST`, `ATHOS_PG_DB`, `ATHOS_PG_USER`, `ATHOS_PG_PASS`. O sistema nunca sobe sem este valor configurado.

### Organização do Service

- **D-03:** Criar **`AthosProdutoService`** (`athos-produto.service.ts`) para todos os métodos de escrita de produto. Métodos de leitura existentes (`buscarProdutos`, `buscarProdutoPorId`, `buscarDepartamentos`, `buscarGrupos`, `buscarMarcas`) permanecem no `AthosService` — sem migração de código da Fase 32. `ProdutoController` injeta ambos os services. `AthosModule` registra e exporta `AthosProdutoService`.

### DTO de Criação (POST)

- **D-04:** DTO de criação com campos curados para BomCusto (papelaria/gráfica):
  - **Obrigatório:** `descricaoproduto`
  - **Opcionais comuns:** `descricaocurta`, `codigobarra1`, `codigobarra2`, `referencia`, `ncm`, `idunidade`, `iddepartamento`, `idgrupo`, `idmarca`, `idfornecedor`, `tipoproduto` (boolean — serviço vs físico), `valorvenda1..6`, `valorvendapromocao`, `valorvendaatacado1`, `descontomaximo`, `valorcustounitario`, `controlaestoque`, `vendeproduto`, `statusproduto`, `informacaoadicional`, `observacao`
  - **Preenchidos pelo sistema (não no DTO):** `idproduto` (serial do Athos — `nextval`), `datacadastro` (NOW()), `idusuariocadastro` (env var)
  - **Excluídos do DTO:** campos de grade (`usagrade`, `utilizagrade`, `referenciagrade`), composição (`usaprodutocomposto`), série (`usacontroleserie`), cardápio (`lancacardapio`, `idprodutocardapio*`), NBS (`nfsenbs`, `nfseindopnbs`, etc.), tributação avançada NFe/IBS/CBS (`cstibscbs`, `ibsaliquota`, etc.), e campos gerados pela trigger (`dataultimaalteracao`, `horaultimaalteracao`, `idusuarioalteracao`)

### DTO de Edição (PATCH)

- **D-05:** PATCH aceita subset dos campos do DTO de criação — todos opcionais (partial update). `idusuarioalteracao` preenchido pelo sistema via `ATHOS_SISTEMA_USUARIO_ID`. Campos `idproduto`, `datacadastro`, `idusuariocadastro` são imutáveis (não no DTO de edição).
- **D-06:** Escrita persiste exclusivamente na tabela `produto` — nenhuma outra tabela do Athos é gravada (EPROD-04).

### Soft-Delete e Reativação (PATCH)

- **D-07:** Endpoint separado `PATCH /athos/produtos/:idproduto/status` — body: `{ ativo: boolean }`. Quando `ativo = false`: seta `statusproduto = false, vendeproduto = false`. Quando `ativo = true`: seta `statusproduto = true, vendeproduto = true`. Nunca executa DELETE físico (DPROD-03).

### Validação de Constraints

- **D-08:** Validação de FK (departamento/grupo/marca) via **pre-query** antes do INSERT/UPDATE — consulta existência pelo ID informado e retorna `UnprocessableEntityException` (HTTP 422) com mensagem clara se inválido. Não depende da mensagem de erro do PostgreSQL.
- **D-09:** `descontomaximo` validado no DTO via `@Min(0) @Max(100)` do class-validator — retorna 400 se fora do range.

### Log de Auditoria (SPROD-03)

- **D-10:** Log estruturado via `this.logger.log(...)` no `AthosProdutoService` com: operação (`create`/`update`/`deactivate`/`reactivate`), `idproduto`, campos alterados (no PATCH), e `idusuario` (valor de `ATHOS_SISTEMA_USUARIO_ID`). `LoggingInterceptor` registra automaticamente todas as chamadas mutantes no nível de controller. Sem tabela de auditoria dedicada — padrão consistente com o restante do projeto.

### Swagger (SPROD-04)

- **D-11:** Decorar todos os novos endpoints com `@ApiOperation`, `@ApiBody`, `@ApiOkResponse`, `@ApiParam` — seguindo o padrão do `ProdutoController` existente. Body de request e response documentados.

### Claude's Discretion

- Nomenclatura dos novos endpoints: `POST /athos/produtos`, `PATCH /athos/produtos/:idproduto`, `PATCH /athos/produtos/:idproduto/status`
- `idproduto` no INSERT: usar `SELECT nextval('produto_idproduto_seq')` ou equivalente do Athos — o researcher verifica o nome real da sequence
- Transação explícita (`BEGIN/COMMIT`) no INSERT se necessário para atomicidade entre alocação do ID e inserção
- `dataultimaalteracao` e `horaultimaalteracao` gerenciados pela trigger — não enviados nos queries (a trigger dispara automaticamente)
- Tests: co-locados com o service (`athos-produto.service.test.ts`) — mocks do pool Athos seguindo o padrão de `athos.service.test.ts`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Módulo Athos — Backend (Fase 32, já implementado)
- `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` — controller existente que recebe os novos endpoints POST/PATCH; padrão de decorators Swagger, estrutura de métodos
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — métodos `buscarProdutos`/`buscarProdutoPorId`/lookups permanecem aqui; padrão de pool (`getPool()`), `client.query()`, try/finally `client.release()` — replicar no `AthosProdutoService`
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — onde registrar `AthosProdutoService` e injetá-lo no `ProdutoController`
- `apps/backend/src/modules/integrations/athos/produto.types.ts` — interface `Produto` com 162 colunas verificadas contra o banco BomCusto

### Padrão de Write no Athos (referência para writes via pool direto)
- `apps/backend/src/modules/integrations/athos/athos-conta-pagar.util.ts` — único exemplo existente de write direto no PostgreSQL do Athos; padrão de `INSERT` com colunas dinâmicas e `LOCK TABLE`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — métodos `createContaPagar()` (L~1188+) e `updateContaPagar()` (L~1271+) para ver como o pool é usado em operações de escrita

### DTOs existentes (referência de estrutura)
- `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` — padrão de DTO com class-validator decorators
- `apps/backend/src/modules/integrations/athos/dto/update-conta-pagar.dto.ts` — padrão de DTO de edição (partial)

### Segurança / Autenticação
- `apps/backend/src/modules/app.module.ts` — `APP_GUARD` global que protege automaticamente todos os endpoints; SPROD-02 satisfeito por herança

### Requisitos
- `.planning/REQUIREMENTS.md` — CPROD-01..04, EPROD-01..04, DPROD-01..03, SPROD-01, SPROD-03, SPROD-04
- `.planning/ROADMAP.md` — Phase 33 success criteria (7 critérios de aceite)

### Constraints do Projeto
- `.planning/PROJECT.md` — seção Constraints: "Athos: Excecao controlada (v2.2): escrita permitida APENAS na tabela produto"; "Produto: Nunca apagar fisicamente"; "Produto: Escrita deve respeitar trigger tg_alterarproduto, rules atualizardatahora* e FKs/constraints existentes"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosService.getPool()` — método privado de acesso ao pool PostgreSQL do Athos; `AthosProdutoService` deve replicar o mesmo padrão de pool lazy-init com `ATHOS_PG_*` env vars (ou receber injeção do `AthosService` se o `AthosModule` exportar o pool — o researcher avalia)
- `athos-conta-pagar.util.ts` — funções `buildContaPagarInsertParts` e `buildContaPagarUpdateParts` mostram o padrão de construção dinâmica de colunas; para `produto` o DTO é fixo, então não é necessário utilitário dinâmico — SQL estático é mais simples
- `ProdutoController` (já existente) — recebe os novos métodos; não quebrar os `@Get` existentes

### Established Patterns
- Pool: `pool.connect()` → `client.query()` → `client.release()` no try/finally — padrão obrigatório para não vazar conexões
- Errors: `BadRequestException` (400 params inválidos), `UnprocessableEntityException` (422 violação de constraint/FK), `NotFoundException` (404 produto não encontrado), `InternalServerErrorException` (falha no pool)
- Logger: `private readonly logger = new Logger(AthosProdutoService.name)`
- Testes: mocks de pool Athos via `jest.fn()` — seguir `athos.service.test.ts` e `athos-produto.controller.test.ts` como referência

### Integration Points
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — adicionar `AthosProdutoService` em `providers` e `exports`; `ProdutoController` recebe injeção de `AthosProdutoService` via constructor
- Novo arquivo: `apps/backend/src/modules/integrations/athos/athos-produto.service.ts`
- Novos arquivos DTO: `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts`, `update-produto.dto.ts`
- Env var nova: `ATHOS_SISTEMA_USUARIO_ID` — adicionar a `.env.example` e `deploy/stack.env.example`

</code_context>

<specifics>
## Specific Ideas

- `PATCH /athos/produtos/:idproduto/status` com body `{ ativo: boolean }` — endpoint de toggle limpo, sem ambiguidade sobre o que está sendo alterado
- Pre-validação de FK para departamento/grupo/marca: reutilizar os métodos `buscarDepartamentos()`, `buscarGrupos()`, `buscarMarcas()` já existentes no `AthosService` para checar se o ID informado existe antes de inserir
- `idproduto` alocado via sequence do PostgreSQL (`SELECT nextval(...)`) — o researcher verifica o nome exato da sequence na instância BomCusto; alternativa: deixar o Athos gerar via `RETURNING idproduto` se a coluna for SERIAL
- Logger no create: `this.logger.log(\`criarProduto descricao="${dto.descricaoproduto}" idusuario=${idusuario}\`)`
- Logger no update: `this.logger.log(\`editarProduto idproduto=${id} campos=[${Object.keys(dto).join(',')}] idusuario=${idusuario}\`)`

</specifics>

<deferred>
## Deferred Ideas

- Filtro por `statusproduto` na busca (mostrar só ativos vs todos) → Fase 34 decide o comportamento de UX — o researcher pode propor como parâmetro opcional de baixo custo
- Tabela de auditoria persistente (produto_audit no Prisma) → complexidade não justificada sem usuário identificável; backlog
- Importação em massa de produtos → fora do escopo, risco operacional alto (REQUIREMENTS.md Out of Scope)
- Gestão de grade/composição/série → v2 requirements (PADV-01..03)

</deferred>

---

*Phase: 33-api-de-escrita-de-produto*
*Context gathered: 2026-06-15*
