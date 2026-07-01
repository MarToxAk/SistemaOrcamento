# Phase 39: Scaffold, Leitura e Spikes de Introspecção - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Provar os fundamentos do módulo `produto_composto` e o caminho de **leitura**, mais resolver as 3 incógnitas do banco por introspecção — tudo que **não** depende do write GRANT (que só bloqueia a Fase 40).

**In scope (Fase 39):**
- 3 spikes de introspecção no DB de referência `192.168.3.198` (COMP-07): (a) tipo-base + cláusula CHECK do domínio `quantidade`; (b) existência de constraint UNIQUE em `(idprodutomaster, idprodutodetail)`; (c) inventário de triggers/rules em `produto_composto`
- Extrair `validarFkExiste` de `AthosProdutoService` para `athos-fk.util.ts` reutilizável, sem mudança de comportamento (COMP-08)
- Endpoint `GET` de listagem enriquecida de componentes de um kit (COMP-01)
- Scaffold do `AthosProdutoCompostoService` (só `listarPorMaster`), controller, DTOs base e registro no `AthosModule`

**Out of scope (Fase 39):**
- Qualquer escrita em `produto_composto` (POST/PATCH/DELETE) e o flag `usaprodutocomposto` → Fase 40
- O write GRANT no Athos → pré-requisito externo da Fase 40
- Frontend (v2.5 é API-only)
</domain>

<decisions>
## Implementation Decisions

### Logística dos spikes de introspecção (COMP-07)
- **D-01:** Modo **(b)** — o plano/executor **entrega o SQL de introspecção pronto** e o usuário roda no `192.168.3.198` e cola os resultados de volta. O executor em CI/cloud **não alcança** a rede `192.168.3.198`. Os resultados dos 3 spikes devem ser documentados no PLAN/SUMMARY da fase antes de qualquer DTO/INSERT ser finalizado. (Os DTOs e o tratamento de erro da Fase 40 dependem desses resultados.)

### Shape da resposta do GET (COMP-01)
- **D-02:** Lista **plana**, um objeto por componente, com: `idprodutocomposto`, `idprodutodetail`, `descricaoproduto` (do produto detail, via JOIN), `statusproduto` (do produto detail, via JOIN) e `quantidade`. Não repetir dados do master no payload (o master vem na rota). JOIN único — sem N+1.

### Rota do endpoint (COMP-01)
- **D-03:** Sub-recurso aninhado: `GET /athos/produtos/:idprodutomaster/composicao`. Espelha "componentes de um produto". Rotas estáticas declaradas antes de paramétricas (padrão do controller existente).
- Comportamento: 404 quando `idprodutomaster` não existe no catálogo; array vazio (200) quando o master existe mas não tem componentes.

### Componente com produto detail inativo na listagem (COMP-01)
- **D-04:** O GET **lista todos** os componentes, incluindo aqueles cujo produto detail está inativo (`statusproduto = false`), e **expõe o `statusproduto`** no payload para o caller decidir. Não filtra. (Distinto da Fase 40, onde **adicionar** um detail inativo é rejeitado com 422.)

### Carregadas das fases anteriores (v2.2/v2.4)
- INSERT/SELECT dinâmico com allowlist explícita de colunas + parâmetros `$N` (anti-injection).
- Pool lazy singleton por serviço com as mesmas env `ATHOS_PG_*`; `getDbConfig()` falha-fechado se faltar config.
- `Logger` estruturado por serviço.
- Pré-validação de FK + mapeamento de erros Postgres já estabelecidos em `AthosProdutoService` — base da extração `athos-fk.util.ts`.

### Claude's Discretion
- Estrutura exata do `athos-fk.util.ts` (assinatura de `validarFkExiste` — receber `PoolClient` + tabela/coluna/id/nomeEntidade, como hoje) e como `AthosProdutoService` passa a importá-lo.
- SQL exato do JOIN do GET (LEFT vs INNER JOIN em `produto` pelo `idprodutodetail` — preferir LEFT para não esconder componente cujo detail sumiu, mas decidir no plano após o spike de integridade).
- Formato exato das 3 queries de introspecção entregues ao usuário (desde que cubram domínio/UNIQUE/triggers).
- Nomes de arquivos novos seguindo o padrão `athos-produto-composto.*`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` — COMP-01, COMP-07, COMP-08 (e COMP-02..06 para contexto da Fase 40)
- `.planning/ROADMAP.md` §"Phase 39" — goal e 5 critérios de sucesso; §"External prerequisite" (write GRANT)

### Pesquisa do milestone (dependência direta)
- `.planning/research/SUMMARY.md` — verdict de convergência (zero deps novas, serial via RETURNING, validação dual de FK, GRANT como gate, flag transacional, spikes)
- `.planning/research/STACK.md` — domínio `quantidade` via pg, serial PK, do-not-add
- `.planning/research/ARCHITECTURE.md` — mapa de arquivos novos/modificados, extração do util, build order
- `.planning/research/PITFALLS.md` — 7 pitfalls (GRANT 42501, MAX+1, orphan detail, domínio, triggers)
- `.planning/research/FEATURES.md` — endpoints, edge cases, flag `usaprodutocomposto`

### Código a estender / padrão a seguir
- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — `validarFkExiste` (a extrair), Pool lazy, INSERT dinâmico, mapeamento de erro
- `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` — estrutura do controller, guard `x-internal-api-key`, ordenação de rotas
- `apps/backend/src/modules/integrations/athos/athos.module.ts` — registro de providers/controllers
- `apps/backend/src/modules/integrations/athos/produto.types.ts` — tipos de colunas (`produto_composto`: idprodutomaster/detail, quantidade; `produto.usaprodutocomposto`/`statusproduto`/`descricaoproduto`)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` §`allocateNextContaPagarId` — exemplo do bug MAX+1 (NÃO aplicar aqui; serial usa RETURNING)

### DDL alvo
- `.planning/PROJECT.md` §"Current Milestone v2.5" — DDL de `produto_composto`, status do GRANT, papel do `192.168.3.198`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validarFkExiste(client, tabela, coluna, id, nomeEntidade)` em `AthosProdutoService` — a extrair para `athos-fk.util.ts`; usada na Fase 39 (master no GET? não — só write) e central na Fase 40 (master + detail).
- Padrão de `getPool()`/`getDbConfig()` por serviço — replicar em `AthosProdutoCompostoService`.
- Controller existente já tem o guard de API key e o padrão de rotas a espelhar.

### Established Patterns
- SELECT/INSERT com colunas allowlisted + `$N` — o GET usa SELECT parametrizado com JOIN em `produto`.
- Tratamento de exceção com mapeamento de error codes Postgres (23503 etc.) — base para o catch da Fase 40.

### Integration Points
- Novo `AthosProdutoCompostoService` + `AthosProdutoCompostoController` registrados no `AthosModule`.
- `AthosProdutoService` passa a importar `validarFkExiste` do novo util (refactor sem mudança de comportamento; testes existentes devem continuar verdes).
</code_context>

<specifics>
## Specific Ideas

- `192.168.3.198` = banco de **referência read-only** com exemplos reais de `produto_composto` — usado só para os spikes; a API roda contra o Athos do `ATHOS_PG_*`.
- Os spikes são o gargalo de conhecimento: o tipo do domínio `quantidade` decide os decorators do DTO (`@IsInt` vs `@IsNumber`, `@Min`), e a presença/ausência de UNIQUE decide se a checagem de duplicado é só aplicativa ou também pega `23505`. Resolver antes de escrever DTO/INSERT.
- DELETE físico é correto para `produto_composto` (tabela de composição) — regra de soft-delete vale só para `produto` (relevante na Fase 40).
</specifics>

<deferred>
## Deferred Ideas

- Detecção de ciclos, add em lote, explosão recursiva de BOM — fora do v2.5 (Out of Scope em REQUIREMENTS.md).
- Toda escrita (POST/PATCH/DELETE) + flag `usaprodutocomposto` transacional → **Fase 40**.
- Write GRANT no Athos (`GRANT INSERT, UPDATE, DELETE` + `USAGE, SELECT` na sequence) → pré-requisito externo da Fase 40.

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 39-Scaffold, Leitura e Spikes de Introspecção*
*Context gathered: 2026-06-29*
