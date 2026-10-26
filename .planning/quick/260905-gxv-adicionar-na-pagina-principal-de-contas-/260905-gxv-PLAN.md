---
phase: quick-260905-gxv
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: fullstack
tags: [nestjs, nextjs, postgres, athos, contas-a-receber, dashboard, widgets]
files_modified:
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.ts
  - apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts
  - apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts
  - apps/frontend/src/app/contas-receber/page.tsx
autonomous: true
requirements: [QT-GXV-01, QT-GXV-02]

estimate:
  tokens: 56000
  raw_tokens: 48000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Ao abrir /contas-receber (lista), o operador ve um bloco 'Item Mais Vendido (Historico)' com o produto fisico de maior receita historica e o servico de maior receita historica, separados, cobrindo a loja toda e todos os clientes desde o inicio, sem filtro de data (QT-GXV-01)."
    - "O bloco de item mais vendido degrada para tracinho quando nao ha produto ou nao ha servico vendido no historico, sem quebrar a pagina."
    - "Ao abrir /contas-receber (lista), o operador ve um bloco 'Clientes Inativos' com os clientes que ja fizeram pelo menos um pedido (venda) no Athos mas nao fazem pedido novo ha mais de 180 dias, mostrando ultimo pedido e dias sem pedido (QT-GXV-02)."
    - "Clientes que nunca fizeram nenhum pedido (zero vendas historicas) nunca aparecem na lista de inativos."
    - "Nenhum dado, endpoint ou secao pre-existente da pagina de contas-receber muda: resumo de inadimplencia, aging, a vencer, boletos consolidados e a tabela de clientes devedores continuam identicos."
    - "Toda consulta nova e read-only e roda em try/catch independente dentro do mesmo PoolClient: falha em uma consulta nova degrada so o proprio campo (topProduto/topServico nulos, clientesInativos vazio) sem derrubar a pagina nem os widgets pre-existentes."
  artifacts:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts
    - apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts
    - apps/frontend/src/app/contas-receber/page.tsx
  key_links:
    - "produto.tipoproduto (true=produto fisico, false/null=servico), ja usado em producao por verificarTipoProdutoVenda e buscarItensVenda, e a unica coluna do schema Athos que separa produto de servico — reutilizada aqui para dividir topProduto/topServico"
    - "venda.idcliente + venda.data (indices cliente_venda_fk e idxdatavenda) definem 'cliente fez pedido' — DATABASE_SCHEMA.md descreve venda como 'dados principais da venda/pedido' e o frontend ja rotula venda.numeroordem como numero do pedido"
    - "AthosService.buscarIndicadoresContasReceber() -> GET /athos/contas-receber/dashboard/indicadores (validateAthosToken) -> proxy Next /api/athos/contas-receber/dashboard/indicadores (requireAdminSession + x-api-token) -> fetch em ContasReceberDashboard"
---

<objective>
Adicionar dois widgets novos na pagina PRINCIPAL de contas a receber (`/contas-receber`, dashboard/lista PlainAdmin — `apps/frontend/src/app/contas-receber/page.tsx`, NAO a pagina de detalhe do cliente): (1) o item mais vendido por valor desde o inicio, loja toda, separado em produto fisico e servico quando o schema permitir; (2) a lista de clientes inativos (ja fizeram pedido antes, mas nao pedem ha mais de 180 dias).

Purpose: o dashboard hoje so mostra inadimplencia (o que falta receber). O operador tambem precisa enxergar o que a loja mais vende historicamente (para decisao de estoque/promocao) e quais clientes pararam de comprar (para reativacao proativa) — sem precisar abrir o Athos.
Output: um endpoint agregado novo (`GET /athos/contas-receber/dashboard/indicadores`), seu proxy Next, testes unitarios com `pg` mockado, e dois blocos novos no dashboard `/contas-receber`.

## Contrato final do endpoint (destino das 2 tasks)

Corpo de resposta de `GET /athos/contas-receber/dashboard/indicadores`:

`{ topProduto: { idproduto, descricao, quantidade, valorTotal, compras } | null, topServico: { idproduto, descricao, quantidade, valorTotal, compras } | null, clientesInativos: Array<{ idcliente, nome_cliente, telefone_completo, emailcliente, ultimoPedido, diasInativo, totalPedidos }>, totalClientesInativos: number, truncado: boolean }`

Task 1 (tracer) entrega o metodo, a rota, o proxy e a tela com `topProduto`/`topServico` reais; `clientesInativos` sai `[]`, `totalClientesInativos` sai `0` e `truncado` sai `false` ao final da Task 1 — SEM mudar a assinatura do metodo, a rota ou o proxy. Task 2 substitui esses tres campos por consultas reais e acrescenta a secao "Clientes Inativos" na tela, reaproveitando a mesma rota/proxy ja provados pela Task 1 (expansao horizontal sobre a fatia vertical ja funcionando, sem mudanca de arquitetura).

## Decisoes derivadas (D-NN)

- **D-01 — "Pedido" e a linha em `venda` (join por `idcliente`), nunca orcamento nem conta_receber.**
  `.planning/DATABASE_SCHEMA.md` descreve a tabela literalmente como "Armazena os dados principais
  da venda/pedido" (linha ~1017), e o proprio frontend ja rotula `venda.numeroordem` como "numero do
  pedido" (quick tasks 260506-002/003). "Cliente fez pedido" = existe >=1 linha em `venda` com aquele
  `idcliente`. "Nao pede ha mais de 180 dias" = `MAX(venda.data) < CURRENT_DATE - INTERVAL '180 days'`
  (confirmado com o usuario). A coluna de data e `data` (tipo `dmdata`), indexada por `idxdatavenda`;
  `idcliente` e indexado por `cliente_venda_fk` — ambos confirmados na DDL de `venda` em
  `DATABASE_SCHEMA.md` linhas 1-131.
- **D-02 — SQL novo compativel com PostgreSQL 9.0.5.** Proibido `FILTER (WHERE ...)`, `LATERAL`,
  `GROUPING SETS`. Usar `GROUP BY` com lista completa de colunas nao agregadas, `HAVING MAX(...)`,
  subquery em `FROM` para o total agregado, `COALESCE`, `CASE WHEN` e `::date` — todos ja usados no
  arquivo.
- **D-03 — Quatro consultas independentes no MESMO `PoolClient`, cada uma com seu proprio
  `try/catch`** (topProduto, topServico, lista de clientesInativos, total de clientesInativos):
  falha em uma delas degrada so o proprio campo (`null`, `null`, `[]`, `0`) via `this.logger.warn`,
  nunca derruba as demais nem a pagina — mesmo padrao de `buscarHistoricoClienteContasReceber`.
- **D-04 — Duas consultas separadas para `topProduto`/`topServico`** (uma filtrando
  `p.tipoproduto = true`, outra `COALESCE(p.tipoproduto, false) = false`) em vez de uma unica
  consulta com `CASE` reordenada no Node — mantem cada uma independentemente degradavel e espelha
  a decisao D-04 do plano irmao `260905-dzi` (itens por valor/quantidade).
- **D-05 — `clientesInativos` usa `LIMIT 100` na lista + uma consulta agregada `COUNT` separada
  para `totalClientesInativos`**, seguindo o mesmo padrao `truncado`/`totalPago` ja estabelecido em
  `buscarHistoricoClienteContasReceber` — a lista tem limite de exibicao, o total nao depende dele.
- **D-06 — Sem filtro de `venda.cancelada` em nenhuma consulta nova.** Nenhuma consulta existente
  do service que agrega por produto ou por cliente (`buscarItensVenda`, `itensPorValor`,
  `itensPorQuantidade`) filtra vendas canceladas; para manter o mesmo criterio de "o que foi
  vendido"/"quando o cliente pediu" em toda a superficie do modulo, as consultas novas seguem a
  mesma convencao. Decisao deliberada e registrada aqui, nao uma lacuna.
- **D-07 — Endpoint novo e dedicado** (`GET .../contas-receber/dashboard/indicadores`), separado de
  `buscarDashboardContasReceber`. Mesmo racional ja aplicado a pagina de detalhe (dados vs titulos
  vs historico): isola o raio de explosao de consultas all-time mais pesadas — o dashboard principal
  (summary + clientes devedores) continua funcionando mesmo se este bloco falhar.
- **D-08 — Nada pre-existente muda.** `BoletosConsolidadosPanel`, o resumo de inadimplencia (aging,
  a vencer) e a tabela de clientes devedores continuam identicos; os dois blocos novos sao secoes
  adicionais ao final da pagina, com fetch e estado proprios (`useEffect` separado do
  `fetchDashboard` existente).
- **D-09 — UI 100% no idioma PlainAdmin ja existente nesta pagina** (`pa-card`, `pa-card-header`,
  `pa-card-body`, `pa-table`, `pa-stat*`, `pa-pill*`, `pa-empty*`, `pa-td-cliente`, `pa-id-badge`,
  `pa-link-btn`) — zero alteracao em `admin-shell.tsx`: todas as classes necessarias (inclusive
  `pa-pill-danger`) ja existem desde a quick task `260905-ena`.
- **D-10 — Proxy novo protegido por `requireAdminSession`**, igual ao proxy de `/dashboard` (mesma
  pagina, mesma sensibilidade de dado) — diferente do proxy de `/cliente/[idcliente]/historico`, que
  nao tem essa guarda (lacuna ja registrada como T-DZI-02/T-ENA-01 nos planos irmaos; nao reaberta
  aqui).
- **D-11 — `ultimoPedido` e `diasInativo` normalizados/calculados em Node** (nao em SQL), seguindo o
  padrao `instanceof Date` ja usado em todo o arquivo para colunas de data.
- **D-12 — Zero dependencia npm nova.**
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Skill de marca (copy, nao visual — a pagina segue o PlainAdmin ja implementado, nao o tema teal da
skill): `.claude/skills/bom-custo-design/SKILL.md` — pt-BR, Title Case em rotulos/acoes, BRL via
`toLocaleString('pt-BR', ...)` (o helper `formatBRL` da pagina ja faz isso), Bootstrap Icons 1.11.1,
sem emoji.

Referencia de schema Athos (somente leitura):
@.planning/DATABASE_SCHEMA.md (DDL de `venda`, linhas 1-131, e de `produto`, linhas 588-660)

Fonte de verdade visual e de fetch (ler antes de editar):
@apps/frontend/src/app/contas-receber/page.tsx
@apps/frontend/src/app/contas-receber/admin-shell.tsx

Padrao de consulta/servico ja estabelecido (ler antes de escrever SQL novo):
@apps/backend/src/modules/integrations/athos/athos.service.ts
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Item Mais Vendido (Historico) ponta-a-ponta — produto vs servico (QT-GXV-01)</name>
  <files>apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.controller.ts, apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts, apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts, apps/frontend/src/app/contas-receber/page.tsx</files>
  <read_first>
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2236-2282 (`itensPorValor`/`itensPorQuantidade` dentro de `buscarHistoricoClienteContasReceber`): idioma exato de agregacao `venda` + `venda_item` + `produto` por `p.idproduto, p.descricaoproduto`, e a funcao `mapItemRow` (linhas 2224-2234) que normaliza `{ idproduto, descricao, quantidade, valorTotal, compras }`.
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2529-2578 (`verificarTipoProdutoVenda`): confirma em codigo ja em producao que `p.tipoproduto = true` significa produto fisico e `COALESCE(p.tipoproduto, false) = false` significa servico (`BOOL_OR(p.tipoproduto)` / `BOOL_AND(NOT COALESCE(p.tipoproduto, false))`).
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 1903-1906 e 2036-2042 (`buscarDashboardContasReceber`): abertura de `pool.connect()` e `client.release()` no `finally` — idioma de PoolClient a repetir.
    - `apps/backend/src/modules/integrations/athos/athos.controller.ts` linhas 270-288 (`dashboardContasReceber`): decorators Swagger e chamada ao service; a rota nova entra logo depois desta.
    - `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` (arquivo inteiro, 30 linhas): modelo exato do proxy, incluindo `requireAdminSession` — copiar a estrutura para a rota nova, sem o parametro `status`.
    - `apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts` linhas 1-37 (`jest.mock("pg")` + `setupClient()` + env vars `ATHOS_PG_*` no `beforeAll`): modelo de teste a seguir.
    - `apps/frontend/src/app/contas-receber/page.tsx` linhas 1-7 (imports), 58-60 (`formatBRL`), 195-224 (padrao `pa-td-cliente`/`pa-id-badge` dentro de `BoletosConsolidadosPanel`), 262-295 (`ContasReceberDashboard`: estado e `fetchDashboard` — padrao a espelhar para o fetch novo) e 493-598 (fim da tabela de clientes devedores e fechamento do componente — ponto de insercao da nova secao, logo antes de `</AdminShell>`).
  </read_first>
  <action>
Implementar o caminho completo do bloco "Item Mais Vendido (Historico)".

1. `AthosService.buscarIndicadoresContasReceber()` — metodo novo, publico, sem parametros, inserido
   logo depois de `buscarDashboardContasReceber` e antes de `buscarTitulosClienteContasReceber`. Abre
   UM `PoolClient`, libera no `finally` (D-03). O metodo retorna desde ja o contrato completo
   `{ topProduto, topServico, clientesInativos, totalClientesInativos, truncado }`: nesta task,
   `clientesInativos` sai `[]`, `totalClientesInativos` sai `0` e `truncado` sai `false` (a Task 2
   substitui esses tres campos por consultas reais, sem alterar a assinatura do metodo).

   Consulta A (`topProduto`, `try/catch` proprio, degrada para `null`): agrupa
   `venda v JOIN venda_item vi ON vi.idvenda = v.idvenda JOIN produto p ON p.idproduto = vi.idproduto`
   filtrando `COALESCE(vi.vendavalorfinalitem, 0) > 0 AND p.tipoproduto = true` (D-01/D-02/D-06 —
   sem filtro de cliente, sem filtro de data, sem filtro de `cancelada`), agrupando por
   `p.idproduto, p.descricaoproduto`, projetando `SUM(vi.quantidadeitem) AS quantidade`,
   `SUM(vi.vendavalorfinalitem) AS valor_total` e `COUNT(DISTINCT v.idvenda) AS compras`, ordenando
   por `valor_total DESC` com `LIMIT 1`.

   Consulta B (`topServico`, `try/catch` proprio, degrada para `null`): identica a A trocando o
   filtro para `COALESCE(p.tipoproduto, false) = false` (D-04).

   Normalizar cada linha com a mesma funcao de mapeamento ja usada em `itensPorValor` (idioma de
   `mapItemRow`): `Number(...)` para `quantidade`/`valorTotal`/`compras`, e `descricao` via
   `String(...).trim()` com fallback `Produto #${idproduto}`.

2. `AthosController` — `@Get("contas-receber/dashboard/indicadores")` inserido logo depois da rota
   `.../dashboard`, com `validateAthosToken(authorization, xApiToken)`, decorators Swagger
   (`@ApiOperation` com resumo mencionando explicitamente que cobre produto e servico mais vendidos
   historicamente, `@ApiOkResponse`, `@ApiUnauthorizedResponse`) no mesmo formato das rotas vizinhas.
   Sem parametros de rota nem de query — o endpoint e global (loja toda).

3. Proxy Next em
   `apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts`: copia do idioma
   de `dashboard/route.ts` (incluindo `requireAdminSession` retornando 401 quando a sessao nao e
   valida, e a injecao de `x-api-token` via `INTERNAL_API_KEY`), apontando `backendFetch` para
   `/athos/contas-receber/dashboard/indicadores`, sem query string (D-10).

4. `ContasReceberDashboard` (`page.tsx`): novas interfaces `TopItemVendido` (`idproduto`,
   `descricao`, `quantidade`, `valorTotal`, `compras`) e o estado do bloco (`indicadores`,
   `loadingIndicadores`, `erroIndicadores`), com fetch de
   `/api/athos/contas-receber/dashboard/indicadores` (`cache: "no-store"`) num `useEffect` PROPRIO
   (dependencias `[]`, independente do `useEffect` de `fetchDashboard` — D-08). Renderizar, depois da
   tabela de clientes devedores e antes de `</AdminShell>`, um `pa-card` com `pa-card-header`
   "Item Mais Vendido (Historico)" e `pa-card-body` contendo: spinner enquanto carrega, `pa-empty
   pa-empty-erro` em erro, e — quando os dados chegam — dois `pa-card pa-stat` lado a lado dentro de
   um container com a classe `pa-stat-grid` e `style={{ gridTemplateColumns: "repeat(2, 1fr)" }}`
   (mesma tecnica ja usada no plano irmao `260905-dzi` para os tres cards de resumo): um para
   "Produto Mais Vendido" (icone `bi-box-seam`) e outro para "Servico Mais Vendido" (icone
   `bi-tools`), cada um mostrando a `descricao`, o `valorTotal` em `formatBRL` e, em
   `small text-muted`, a contagem de `compras`. Quando `topProduto`/`topServico` vier `null`, mostrar
   um travessao no lugar do valor, sem quebrar o layout do card irmao. Nenhuma classe fora do
   vocabulario `pa-*` ja existente (D-09).
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos.service.indicadores</automated>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>ls "apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts"</automated>
  </verify>
  <done>O endpoint `/athos/contas-receber/dashboard/indicadores` responde com `topProduto`, `topServico` (dados reais) e `clientesInativos: []`/`totalClientesInativos: 0`/`truncado: false`; a pagina `/contas-receber` renderiza o bloco "Item Mais Vendido (Historico)" com os dois cards produto/servico; a suite nova passa e o typecheck do frontend fica limpo.</done>
</task>

<task type="auto">
  <name>Task 2: Clientes Inativos — lista ponta-a-ponta (QT-GXV-02)</name>
  <files>apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts, apps/frontend/src/app/contas-receber/page.tsx</files>
  <read_first>
    - `.planning/DATABASE_SCHEMA.md` linhas 1-20 e 106-131 (DDL de `venda`): confirma a coluna de data `data` (tipo `dmdata`), o indice `idxdatavenda` sobre `data`, e o indice `cliente_venda_fk` sobre `idcliente` — base de performance da consulta de inatividade (D-01).
    - `apps/backend/src/modules/integrations/athos/athos.service.ts`, o metodo `buscarIndicadoresContasReceber` escrito na Task 1, e a consulta de `clientes` em `buscarDashboardContasReceber` (linhas 1907-1930) para o padrao `COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text)` e o `LEFT JOIN cliente_fisico`/`cliente_juridico` ja usados para resolver nome de cliente.
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` linhas 94-96 (`formatDate`): helper de data pt-BR a replicar em `page.tsx` (a pagina de lista ainda nao tem essa funcao).
    - A secao "Item Mais Vendido (Historico)" escrita na Task 1 em `page.tsx`: modelo visual `pa-card`/`pa-card-header`/`pa-card-body` a repetir para a secao nova.
  </read_first>
  <action>
Completar `buscarIndicadoresContasReceber` com a lista de clientes inativos e fechar a tela.

1. No MESMO `PoolClient` da Task 1, consulta C (lista, `try/catch` proprio, degrada para `[]` com
   `truncado: false`): agrupa
   `venda v JOIN cliente c ON c.idcliente = v.idcliente LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente`,
   filtrando `v.idcliente IS NOT NULL`, projetando `c.idcliente`,
   `COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente`,
   `c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo`, `c.emailcliente` e
   `MAX(v.data)::date AS ultimo_pedido`, `COUNT(v.idvenda) AS total_pedidos`, agrupando por
   `c.idcliente, cf.nome, cj.nomefantasia, cj.razaosocial, c.dddtelefoneempresa, c.telefoneempresa, c.emailcliente`,
   com `HAVING MAX(v.data)::date < (CURRENT_DATE - INTERVAL '180 days')` (D-01), ordenando por
   `MAX(v.data) ASC NULLS FIRST` (cliente mais tempo sumido primeiro) e `LIMIT 100`. `truncado` =
   a lista atingiu 100 linhas (D-05).

   Consulta D (total, `try/catch` proprio, degrada para `0`): `SELECT COUNT(*) AS total FROM (
   SELECT v.idcliente FROM venda v WHERE v.idcliente IS NOT NULL GROUP BY v.idcliente HAVING
   MAX(v.data)::date < (CURRENT_DATE - INTERVAL '180 days')) inativos` — subquery em `FROM`, valida
   no PostgreSQL 9.0 (D-02), existe porque a lista tem `LIMIT` e o total exibido nao pode depender
   dela (D-05).

   Normalizacao em Node (D-11): `ultimoPedido` pelo padrao `instanceof Date ? .toISOString().slice(0,10) : string | null`;
   `diasInativo = Math.floor((Date.now() - new Date(ultimoPedido).getTime()) / 86400000)`; telefone e
   e-mail com `trim()` + fallback `null`, seguindo o idioma ja usado em `buscarDashboardContasReceber`.

   Substituir os defaults da Task 1: o retorno final do metodo passa a usar os valores reais de
   `clientesInativos`, `totalClientesInativos` e `truncado` vindos das consultas C e D.

2. Na pagina, novo `pa-card` "Clientes Inativos" logo depois do bloco "Item Mais Vendido
   (Historico)" e antes de `</AdminShell>`, reaproveitando o MESMO estado/fetch de `indicadores` da
   Task 1 (sem `useEffect` nem chamada de rede adicional). `pa-card-header` com o titulo e a contagem
   `({totalClientesInativos})` (mesmo padrao `pa-card-header-count` de `BoletosConsolidadosPanel`).
   `pa-card-body pa-card-body-flush` contendo: `pa-empty` quando `clientesInativos` vier vazio (texto:
   nenhum cliente inativo — todos os clientes com pedido compraram novamente nos ultimos 180 dias);
   senao uma tabela `pa-table` com colunas Cliente (`pa-td-cliente` + `pa-id-badge` com `#idcliente`,
   igual ao padrao ja usado na tabela de clientes devedores), Telefone, E-mail, Ultimo Pedido
   (`formatDate`), Dias sem Pedido e Pedidos (`totalPedidos`), e uma coluna Acao com
   `<a href={`/contas-receber/${idcliente}`} className="pa-link-btn">Ver Detalhe</a>` — mesmo padrao
   das duas tabelas existentes na pagina. Na coluna Dias sem Pedido, usar um `pa-pill`: `pa-pill-warning`
   para `diasInativo` entre 180 e 365, `pa-pill-danger` para `diasInativo` acima de 365. Quando
   `truncado` for verdadeiro, uma nota `small text-muted` avisando que a tabela mostra os 100 clientes
   inativos ha mais tempo e que a contagem do cabecalho cobre todo o total.

3. Ampliar `athos.service.indicadores.test.ts` com casos cobrindo: `clientesInativos` calcula
   `diasInativo` e `ultimoPedido` corretamente a partir de uma data `Date` e de uma data string;
   `totalClientesInativos` vem da consulta agregada e nao do tamanho da lista; falha da consulta de
   lista devolve `clientesInativos: []` sem descartar `topProduto`/`topServico` ja calculados, e
   vice-versa; falha da consulta de total devolve `totalClientesInativos: 0` preservando a lista;
   `client.release()` e chamado mesmo com alguma das quatro consultas falhando.
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos.service.indicadores</automated>
    <automated>npm --prefix apps/backend test -- athos.service</automated>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>git diff --name-only HEAD -- apps/backend apps/frontend | sort | diff - <(printf '%s\n' apps/backend/src/modules/integrations/athos/athos.controller.ts apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts apps/backend/src/modules/integrations/athos/athos.service.ts apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts apps/frontend/src/app/contas-receber/page.tsx | sort)</automated>
    <human-check>Com a rede do Athos disponivel (Tailscale ativo), abrir http://localhost:3000/contas-receber e conferir: o produto e o servico mais vendidos no bloco "Item Mais Vendido (Historico)" batem com o que se espera do historico de vendas da loja, e a lista de "Clientes Inativos" mostra clientes conhecidos que realmente pararam de comprar ha mais de 180 dias (nenhum cliente novo/sem historico aparece). O banco Athos estava inacessivel desta maquina no momento do planejamento (mesma condicao registrada nos planos irmaos 260905-dzi/260905-ena), entao esta e a unica checagem contra dados reais; nao bloqueia a conclusao da task.</human-check>
  </verify>
  <done>O endpoint devolve `clientesInativos`, `totalClientesInativos` e `truncado` reais; a pagina mostra a tabela de clientes inativos com badge de severidade por dias sem pedido e link "Ver Detalhe"; suites do modulo athos, typecheck e build do frontend limpos; `git diff` toca somente os 5 arquivos declarados em `files_modified`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador -> proxy Next (`/api/athos/contas-receber/dashboard/indicadores`) | Protegido por `requireAdminSession`; sem parametros vindos do usuario |
| proxy Next -> backend NestJS | proxy injeta `x-api-token` server-side a partir de `INTERNAL_API_KEY` |
| backend NestJS -> PostgreSQL do Athos (producao) | banco de producao do PDV, credenciais read-only (`usuario_leitura`) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-GXV-01 | Tampering | SQL novo em `buscarIndicadoresContasReceber` | low | mitigate | Endpoint nao recebe `idcliente` nem query params — todas as 4 consultas sao globais e fixas; zero interpolacao de string vinda de entrada do usuario |
| T-GXV-02 | Information Disclosure | novo endpoint `.../dashboard/indicadores` | medium | mitigate | Proxy protegido por `requireAdminSession` (D-10, mesma guarda do `/dashboard` principal) + `PasswordGate` ja envolve toda a pagina `/contas-receber`; nao amplia a superficie ja aceita por `.../dashboard` |
| T-GXV-03 | Denial of Service | consulta `topProduto`/`topServico` agrega TODO o historico de vendas sem filtro de data (requisito explicito "desde o inicio") | medium | accept | `JOIN` por chaves indexadas (`vi.idvenda` FK, `p.idproduto` PK), `GROUP BY` com `LIMIT 1`; sem `statement_timeout` no pool (condicao pre-existente do modulo, nao introduzida por este plano); dado o porte da loja (papelaria/grafica de bairro, nao rede), o volume historico de vendas nao representa risco pratico — mesma decisao implicita ja aceita pelas consultas equivalentes `itensPorValor`/`itensPorQuantidade` |
| T-GXV-04 | Denial of Service | consulta de `clientesInativos` percorre toda a tabela `venda` agrupando por `idcliente` | low | mitigate | Mesmas colunas indexadas (`cliente_venda_fk`, `idxdatavenda`); `LIMIT 100` na lista + consulta de total separada e leve (`COUNT` sobre subquery agrupada) |
| T-GXV-05 | Elevation of Privilege | rota nova sem autenticacao de token | high | mitigate | `validateAthosToken(authorization, xApiToken)` como primeira linha do handler, identico as rotas vizinhas de contas a receber |
| T-GXV-SC | Tampering | cadeia de suprimentos (npm/pip/cargo) | low | mitigate | Nenhum pacote instalado neste plano (D-12); nada a auditar |
</threat_model>

<verification>
1. `npm --prefix apps/backend test -- athos.service` — suites do AthosService (novas + regressao das existentes) verdes.
2. `npx tsc --noEmit -p apps/frontend/tsconfig.json` e `npm --prefix apps/frontend run build` — sem erro.
3. `git diff --stat` deve tocar somente os 5 arquivos de `files_modified` — nenhuma alteracao em `admin-shell.tsx`, na pagina de detalhe do cliente, ou nas consultas pre-existentes do AthosService (D-08).
4. Checagem humana com rede Athos: `/contas-receber` exibindo item mais vendido (produto e servico) e clientes inativos coerentes com o Athos.
</verification>

<success_criteria>
- `GET /athos/contas-receber/dashboard/indicadores` devolve o contrato completo (`topProduto`, `topServico`, `clientesInativos`, `totalClientesInativos`, `truncado`).
- A pagina `/contas-receber` exibe dois blocos novos: "Item Mais Vendido (Historico)" (produto e servico separados) e "Clientes Inativos" (tabela com ultimo pedido, dias sem pedido e link para o detalhe).
- Resumo de inadimplencia, boletos consolidados e tabela de clientes devedores continuam funcionando exatamente como antes.
- Suite do backend, typecheck e build do frontend verdes; zero dependencia npm nova.
</success_criteria>

<output>
Criar `.planning/quick/260905-gxv-adicionar-na-pagina-principal-de-contas-/260905-gxv-SUMMARY.md` ao concluir, registrando o status da checagem humana contra o Athos real.
</output>
