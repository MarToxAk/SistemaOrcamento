---
phase: quick-260905-dzi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.ts
  - apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts
  - apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
autonomous: true
requirements: [QT-DZI-01, QT-DZI-02, QT-DZI-03]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Ao abrir /contas-receber/{id} (ex.: 2829), o operador ve as contas JA PAGAS daquele cliente — titulo, vencimento, data de pagamento e valor pago — alem dos titulos em aberto que a pagina ja mostrava (QT-DZI-01)."
    - "A pagina mostra quais itens/produtos o cliente mais comprou, em duas leituras explicitas: por valor gasto e por quantidade comprada (QT-DZI-02)."
    - "A pagina mostra em que o cliente mais gastou (item de maior gasto) e qual foi o mes de maior gasto, com o valor daquele mes (QT-DZI-03)."
    - "Nenhuma consulta, endpoint ou comportamento pre-existente da pagina muda: dados cadastrais, titulos em aberto, grupos de boleto, NFS-e Emitidas e Notas Fiscais Athos continuam identicos (D-07)."
    - "Toda a leitura nova e read-only e parametrizada; uma falha em qualquer uma das consultas novas degrada apenas o proprio bloco (lista vazia / zero) e nunca derruba a pagina nem as demais metricas (D-03)."
  artifacts:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts
    - apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
  key_links:
    - "conta_receber.idcontareceber <- conta_recebida.idcontareceber (FK + UNIQUE, confirmado na DDL) = definicao de 'conta paga' (D-01)"
    - "AthosService.buscarHistoricoClienteContasReceber(idcliente) -> GET /athos/contas-receber/cliente/:idcliente/historico (validateAthosToken) -> proxy Next /api/athos/contas-receber/cliente/[idcliente]/historico (injeta x-api-token via INTERNAL_API_KEY) -> fetch no ClienteDetalhePage"
    - "venda.idcliente -> venda_item.idvenda -> produto.idproduto: unica fonte de 'itens mais comprados' (mesmo caminho ja usado por buscarItensVenda e buscarNotasFiscaisCliente)"
    - "conta_recebida.datapagamento + conta_recebida.valorpago -> agregacao mensal -> mesMaiorGasto (reduce em Node, padrao ja adotado no summary do dashboard)"
---

<objective>
Ampliar a pagina de detalhe do cliente (`/contas-receber/[idcliente]`, ex.: http://localhost:3000/contas-receber/2829) — hoje restrita a dados cadastrais + titulos EM ABERTO — para tambem exibir o historico de consumo do cliente: contas ja pagas, itens mais comprados e o mes de maior gasto.

Purpose: o operador so enxerga a divida atual. Para negociar prazo, limite de credito e cobranca ele precisa do outro lado da relacao — quanto o cliente ja pagou, o que ele costuma comprar e quando gasta mais.
Output: um unico endpoint agregado novo (`GET /athos/contas-receber/cliente/:idcliente/historico`), seu proxy Next, testes unitarios com `pg` mockado, e tres blocos novos na pagina de detalhe.

## Contrato final do endpoint (destino das 3 tasks)

```
{
  pagos: Array<{ idcontareceber, numerotitulo, datavencimento, datapagamento,
                 valor, valorpago, juros, desconto, idvenda, numeroordem }>,
  truncado: boolean,          // true quando a lista bateu o LIMIT 200
  totalPago: number,          // agregado real, independente do LIMIT da lista
  titulosPagos: number,       // idem
  itensPorValor: Array<{ idproduto, descricao, quantidade, valorTotal, compras }>,
  itensPorQuantidade: Array<{ idproduto, descricao, quantidade, valorTotal, compras }>,
  meses: Array<{ mes: "YYYY-MM", total, titulos }>,
  mesMaiorGasto: { mes, total } | null
}
```

Task 1 entrega `pagos` / `truncado` / `totalPago` / `titulosPagos`; Task 2 acrescenta os dois arrays de itens; Task 3 acrescenta `meses` / `mesMaiorGasto`. Cada task e aditiva e fecha ponta-a-ponta (banco -> service -> controller -> proxy -> tela).

## Decisoes derivadas (D-NN)

- **D-01 — "Conta paga" e definida pelo JOIN com `conta_recebida`, nunca por `statusconta`.**
  A DDL em `.planning/Discussão de Fase - Contas a Receber.md` confirma `conta_recebida` com
  FK `idcontareceber -> conta_receber` e UNIQUE INDEX em `idcontareceber` (1 pagamento por
  titulo), alem de `valorpago` e `datapagamento` — as duas colunas exigidas por QT-DZI-03.
  Os codigos de `statusconta character(3)` nao sao confiaveis: o proprio documento de fase
  supunha `'ABE'`/`'LIQ'` e o codigo em producao usa `'AVC'`/`'VEN'`; o controller aceita
  ainda `'REC'`/`'CAN'`. Como o banco Athos esta inacessivel desta maquina no momento do
  planejamento (probe `pg` com timeout de 6s expirou — exige rede Tailscale), nenhum codigo
  de status pode ser verificado, e a juncao com `conta_recebida` e a unica definicao
  auto-evidente. E tambem exatamente a fonte que `buscarDashboardContasReceber` ja usa para
  `total_recebido_mes`.
- **D-02 — SQL novo deve ser compativel com PostgreSQL 9.0.5** (versao do Athos, registrada na
  memoria do projeto). Proibido: `FILTER (WHERE ...)` (9.4+), `LATERAL` (9.3+), `GROUPING SETS`.
  Usar `SUM(CASE WHEN ... THEN ... ELSE 0 END)`, `GROUP BY` com a lista completa de colunas
  nao agregadas (ou ordinal `GROUP BY 1`), `date_trunc`, `to_char` e `ANY($1)` — todos ja
  usados no arquivo.
- **D-03 — Uma consulta, um `try/catch`.** Todas as consultas novas rodam no MESMO `PoolClient`
  (um `pool.connect()` / um `release()` no `finally`), e cada uma tem seu proprio `try/catch`
  que degrada apenas o proprio campo (array vazio / zero) com `this.logger.warn`. Este e o fix
  aplicado em `41-REVIEW-FIX.md`: um `try` unico envolvendo consultas independentes fazia uma
  falha isolada zerar metricas corretas ja calculadas.
- **D-04 — Duas consultas de itens (por valor e por quantidade), nao uma lista reordenada no
  cliente.** Um top-10 por valor nao responde "itens mais comprados": um item barato comprado
  100 vezes ficaria de fora do recorte e nunca apareceria por mais que o front reordenasse.
- **D-05 — A agregacao mensal usa `conta_recebida.datapagamento`** (dinheiro que efetivamente
  entrou), nao a data da venda. O rotulo na tela explicita o criterio para o operador nao
  interpretar como data de compra.
- **D-06 — A UI nova segue o idioma Bootstrap ja existente NESTA pagina** (`card border-0
  shadow-sm`, `table table-sm table-hover table-bordered`, icones `bi`, helpers `formatBRL` /
  `formatDate` que ja existem no arquivo). As classes `pa-*` do PlainAdmin estao definidas
  inline apenas dentro de `apps/frontend/src/app/contas-receber/page.tsx` (verificado: unica
  ocorrencia de `.pa-card {` no repo) e nao sao importaveis; portar a pagina de detalhe para
  `AdminShell` e refatoracao separada, fora do escopo desta task. Zero CSS novo, zero hex de
  marca hardcoded — cor de marca so via classes/variaveis ja existentes.
- **D-07 — Nada pre-existente muda.** `buscarDashboardContasReceber`, `buscarTitulosClienteContasReceber`,
  `verificarNFTitulos` e as rotas atuais permanecem intactas; o trabalho e puramente aditivo.
- **D-08 — Zero dependencia npm nova.** Nenhum `npm install` neste plano.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Skill de marca (consultar antes de escrever JSX): `.claude/skills/bom-custo-design/SKILL.md`
— pt-BR, Title Case em rotulos/acoes, BRL via `toLocaleString('pt-BR', ...)` (o helper
`formatBRL` da pagina ja faz isso), Bootstrap Icons 1.11.1, sem emoji.

Referencia de schema Athos (somente leitura, ja lida no planejamento):
`.planning/Discussão de Fase - Contas a Receber.md` — DDL de `conta_receber` (linha ~106) e de
`conta_recebida` (bloco JSON `ddl`, linha ~1240).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Contas ja pagas ponta-a-ponta (banco -> service -> controller -> proxy -> tela)</name>
  <files>apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.controller.ts, apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts, apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts, apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2044-2106 (`buscarTitulosClienteContasReceber`): idioma de `getPool()` + `pool.connect()` + `client.release()` no `finally`, e a normalizacao de data com `instanceof Date ? .toISOString().slice(0,10) : string`.
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2013-2028: a consulta ja existente em `conta_recebida` (`cre.valorpago`, `cre.datapagamento`) e o `try/catch` isolado que degrada para zero.
    - `apps/backend/src/modules/integrations/athos/athos.controller.ts` linhas 289-308 (`titulosClienteContasReceber`): `validateAthosToken` + `Number(idcliente)` + `BadRequestException` + decorators Swagger.
    - `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts` (arquivo inteiro, 31 linhas): modelo exato do proxy.
    - `apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts` linhas 1-90: `jest.mock("pg")` + helper `setupClient()` + env vars `ATHOS_PG_*` no `beforeAll`.
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` linhas 104-130 (assinatura da pagina, `use(params)`, estados), 226-241 (fetch dos dados cadastrais no mount) e 880-1000 (secao "Titulos em Aberto": cabecalho `h5` + `card`/`table`).
  </read_first>
  <action>
Implementar o caminho completo de "contas ja pagas" para um cliente.

1. `AthosService.buscarHistoricoClienteContasReceber(idcliente: number)` — novo metodo publico,
   inserido logo depois de `buscarTitulosClienteContasReceber`. Abre UM `PoolClient`, executa
   duas consultas, libera no `finally` (D-03).

   Consulta A (lista, `try/catch` proprio, degrada para `[]`): seleciona
   `cr.idcontareceber, cr.numerotitulo, cr.datavencimento, cr.valor, cr.idvenda`,
   `cre.datapagamento, cre.valorpago, cre.juros, cre.desconto` e `v.numeroordem`
   de `conta_receber cr` com `JOIN conta_recebida cre ON cre.idcontareceber = cr.idcontareceber`
   e `LEFT JOIN venda v ON v.idvenda = cr.idvenda`, filtrando `cr.idcliente = $1`,
   ordenando por `cre.datapagamento DESC NULLS LAST, cr.idcontareceber DESC`, com `LIMIT 200`.

   Consulta B (agregado, `try/catch` proprio, degrada para zeros): `COUNT(*)` e
   `COALESCE(SUM(cre.valorpago), 0)` sobre o mesmo par de tabelas e o mesmo filtro por
   `cr.idcliente = $1`. Existe porque a lista tem LIMIT e o total exibido nao pode depender
   dela.

   Nada de interpolacao de string: apenas `$1`. Sem `FILTER`, sem `LATERAL` (D-02).

   Normalizacao das linhas seguindo o idioma do arquivo: numeros com `Number(...)`, datas com
   o teste `instanceof Date`, strings com `trim()` + fallback `null`. `truncado` = a lista
   atingiu 200 linhas.

   Retorno desta task: `{ pagos, truncado, totalPago, titulosPagos }`.

2. `AthosController` — `@Get("contas-receber/cliente/:idcliente/historico")` colocado logo
   depois da rota `.../titulos`, com `validateAthosToken(authorization, xApiToken)`, validacao
   `Number.isFinite(id) && id > 0` (senao `BadRequestException("idcliente invalido")`) e os
   mesmos decorators Swagger (`@ApiOperation`, `@ApiParam`, `@ApiOkResponse`,
   `@ApiUnauthorizedResponse`) das rotas vizinhas.

3. Proxy Next em `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts`:
   copia literal de `titulos/route.ts` trocando apenas o caminho do `backendFetch` para
   `/athos/contas-receber/cliente/${id}/historico`.

4. `ClienteDetalhePage`: novo estado (`historico`, `loadingHistorico`, `erroHistorico`) e fetch
   de `/api/athos/contas-receber/cliente/${idcliente}/historico` com `cache: "no-store"` dentro
   do `useEffect` que ja depende de `[idcliente, refetchKey]` — sem criar um segundo effect e
   sem tocar nos fetches existentes (D-07). Renderizar, DEPOIS do bloco "Titulos em Aberto" e
   dentro da mesma `orcamento-section`, uma secao "Contas Pagas" com cabecalho `h5` no mesmo
   formato dos existentes (icone `bi bi-check2-circle`), spinner enquanto carrega, `alert
   alert-danger` em erro, `alert alert-info` quando a lista vier vazia, e tabela
   `table table-sm table-hover table-bordered` com as colunas Titulo, Vencimento, Pagamento,
   Valor, Valor Pago, Juros, Desconto e Pedido. `tfoot` com `titulosPagos` e `totalPago`
   formatado por `formatBRL`. Quando `truncado` for verdadeiro, uma nota `small text-muted`
   avisando que a lista mostra os 200 pagamentos mais recentes e que o total no rodape cobre
   todo o historico. Datas por `formatDate`. Nenhuma classe `pa-*` (D-06).

5. Teste `athos.service.historico-cliente.test.ts` com `pg` mockado no idioma de
   `athos.service.dashboard.test.ts`: (a) mapeia linhas de pagamento para o formato do contrato,
   incluindo `datapagamento` chegando como `Date` e como string; (b) `totalPago`/`titulosPagos`
   vem da consulta agregada e nao da soma da lista; (c) falha da consulta A devolve `pagos: []`
   sem descartar `totalPago` da consulta B, e vice-versa; (d) `client.release()` e chamado mesmo
   com consulta falhando.
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos.service.historico-cliente</automated>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>ls "apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts"</automated>
  </verify>
  <done>O endpoint `/athos/contas-receber/cliente/:idcliente/historico` responde com `pagos`, `truncado`, `totalPago` e `titulosPagos`; a pagina de detalhe renderiza a tabela de contas pagas com total; a suite nova passa e o typecheck do frontend fica limpo.</done>
</task>

<task type="auto">
  <name>Task 2: Itens mais comprados — por valor e por quantidade (QT-DZI-02)</name>
  <files>apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts, apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2252-2286 (`buscarItensVenda`): nomes reais das colunas — `p.descricaoproduto`, `vi.quantidadeitem`, `vi.vendavalorfinalitem`, `vi.sequenciaitem` — e o filtro `COALESCE(vi.vendavalorfinalitem, 0) > 0`.
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2377-2398 (`buscarNotasFiscaisCliente`): confirma `venda.idcliente` como caminho de venda -> cliente.
    - O metodo `buscarHistoricoClienteContasReceber` escrito na Task 1.
  </read_first>
  <action>
Acrescentar `itensPorValor` e `itensPorQuantidade` ao mesmo metodo e a mesma tela.

1. No `buscarHistoricoClienteContasReceber`, no MESMO `PoolClient`, duas consultas novas com
   `try/catch` independentes degradando para `[]` (D-03). Ambas partem de
   `venda v JOIN venda_item vi ON vi.idvenda = v.idvenda JOIN produto p ON p.idproduto = vi.idproduto`,
   filtrando `v.idcliente = $1 AND COALESCE(vi.vendavalorfinalitem, 0) > 0`, agrupando por
   `p.idproduto, p.descricaoproduto` (lista completa de colunas nao agregadas, exigencia do
   PostgreSQL 9.0 — D-02) e projetando `SUM(vi.quantidadeitem) AS quantidade`,
   `SUM(vi.vendavalorfinalitem) AS valor_total` e `COUNT(DISTINCT v.idvenda) AS compras`.
   A primeira ordena por `valor_total DESC` com `LIMIT 10`; a segunda por `quantidade DESC`
   com `LIMIT 10`. Duas consultas separadas por D-04 — nao derivar uma da outra.

2. Normalizar cada linha para `{ idproduto, descricao, quantidade, valorTotal, compras }` com
   `Number(...)` e `descricao` via `String(...).trim()` com fallback para
   `Produto #${idproduto}` quando vier vazia (mesmo cuidado de `buscarItensVenda`, cujo
   fallback e `Item ${sequencia}`).

3. Na pagina, secao "Itens Mais Comprados" logo depois de "Contas Pagas", no mesmo idioma
   visual (D-06). Um grupo de dois botoes `btn btn-sm btn-outline-primary` /
   `btn btn-sm btn-primary` alterna entre as duas leituras — estado local
   `ordemItens` com valores `"valor"` e `"quantidade"` — e a tabela renderiza o array
   correspondente vindo do backend (nunca reordenando o outro no cliente). Colunas: Produto,
   Quantidade, Compras, Total Gasto (`formatBRL`). Vazio -> `alert alert-info` com a mensagem
   de que nao ha itens de venda registrados para o cliente.

4. Ampliar `athos.service.historico-cliente.test.ts`: um teste garante que os dois arrays saem
   de consultas distintas e preservam ordens distintas (fixture onde o item de maior valor NAO
   e o de maior quantidade), e outro garante que a falha das consultas de itens devolve
   `itensPorValor: []` / `itensPorQuantidade: []` sem afetar `pagos` nem `totalPago`.
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos.service.historico-cliente</automated>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
  </verify>
  <done>O endpoint devolve `itensPorValor` e `itensPorQuantidade` com 10 linhas no maximo cada; a pagina exibe a tabela de itens com alternancia entre as duas leituras; suite e typecheck verdes.</done>
</task>

<task type="auto">
  <name>Task 3: Mes de maior gasto + cards de resumo (QT-DZI-03)</name>
  <files>apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts, apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 1958-2038: o padrao de calcular o `summary` com `Array.reduce` em Node sobre linhas ja agregadas no banco.
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` linhas 832-878 (card `border-0 shadow-sm` de "Dados Cadastrais" com grid `row g-2`) — base visual dos cards de resumo.
    - O metodo `buscarHistoricoClienteContasReceber` apos as Tasks 1 e 2.
  </read_first>
  <action>
Fechar o historico com a serie mensal e o resumo de topo.

1. Consulta mensal no MESMO `PoolClient`, com `try/catch` proprio degradando para `[]` (D-03):
   sobre `conta_receber cr JOIN conta_recebida cre ON cre.idcontareceber = cr.idcontareceber`,
   filtrando `cr.idcliente = $1 AND cre.datapagamento IS NOT NULL`, projetando
   `to_char(date_trunc('month', cre.datapagamento::date), 'YYYY-MM') AS mes`,
   `SUM(cre.valorpago) AS total` e `COUNT(*) AS titulos`, com `GROUP BY 1 ORDER BY 1 DESC`.
   Sem `LIMIT`: o numero de meses distintos de um cliente e pequeno e o recorte de exibicao e
   responsabilidade da tela. `date_trunc` + `to_char` + ordinal em `GROUP BY` sao validos no
   PostgreSQL 9.0 (D-02).

2. `mesMaiorGasto` calculado em Node com `reduce` sobre `meses` (maior `total`; `null` quando
   a serie vier vazia), seguindo o padrao do `summary` do dashboard.

3. Na pagina, tres cards de resumo renderizados ANTES da secao "Contas Pagas", dentro da mesma
   `orcamento-section`, em `row g-3` com `col-md-4`, cada um `card border-0 shadow-sm` (D-06):
   - "Total Ja Pago" — `totalPago` em `formatBRL` e, em `small text-muted`, a contagem
     `titulosPagos` de titulos quitados.
   - "Mes de Maior Gasto" — o mes de `mesMaiorGasto` exibido em pt-BR (ex.: `03/2026`) e o
     valor em `formatBRL`; em `small text-muted`, a nota de que o criterio e a data de
     pagamento (D-05). Sem dados -> travessao.
   - "Item de Maior Gasto" — descricao do primeiro elemento de `itensPorValor` e seu
     `valorTotal` em `formatBRL`. Sem dados -> travessao.

4. Secao "Gasto por Mes" depois de "Itens Mais Comprados": tabela `table table-sm
   table-hover table-bordered` com os 12 meses mais recentes de `meses` (Mes, Titulos Pagos,
   Total), destacando a linha do `mesMaiorGasto` com `table-success` e um `badge bg-success`.
   Quando `meses` tiver mais de 12 entradas, uma nota `small text-muted` informa que a tabela
   mostra os 12 meses mais recentes enquanto o card de resumo considera todo o historico.

5. Ampliar `athos.service.historico-cliente.test.ts`: `mesMaiorGasto` aponta para o mes de maior
   `total` mesmo quando ele nao e o primeiro da ordenacao por data; serie vazia produz
   `mesMaiorGasto: null`; falha da consulta mensal devolve `meses: []` e `mesMaiorGasto: null`
   preservando `pagos`, `totalPago` e os arrays de itens.
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos.service.historico-cliente</automated>
    <automated>npm --prefix apps/backend test -- athos.service</automated>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <human-check>Com a rede do Athos disponivel (Tailscale ativo), abrir http://localhost:3000/contas-receber/2829 e conferir: contas pagas listadas com data de pagamento, itens mais comprados nas duas ordens, e o mes de maior gasto batendo com o extrato do cliente no Athos. O banco Athos estava inacessivel desta maquina no momento do planejamento, entao esta e a unica checagem contra dados reais.</human-check>
  </verify>
  <done>O endpoint devolve `meses` e `mesMaiorGasto`; a pagina mostra os tres cards de resumo e a tabela de gasto por mes com o mes de pico destacado; suites do modulo athos e typecheck do frontend verdes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> proxy Next (`/api/athos/...`) | `idcliente` vem da URL, controlado pelo usuario |
| proxy Next -> backend NestJS | proxy injeta `x-api-token` server-side a partir de `INTERNAL_API_KEY` |
| backend NestJS -> PostgreSQL do Athos (producao) | banco de producao do PDV, credenciais read-only (`usuario_leitura`) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-DZI-01 | Tampering | SQL novo em `buscarHistoricoClienteContasReceber` | high | mitigate | `idcliente` entra exclusivamente como `$1` em todas as 5 consultas; zero interpolacao de string; `Number.isFinite(id) && id > 0` no controller e no proxy antes de chegar ao service |
| T-DZI-02 | Information Disclosure | novo endpoint `.../historico` | medium | accept | Expoe historico de compras de qualquer `idcliente` para quem alcanca o app — exatamente a mesma superficie ja aberta por `.../titulos` e `.../dados`, consumidos por esta mesma pagina. O `PasswordGate` cobre hoje so `/contas-receber` (dashboard), nao `/contas-receber/[idcliente]`; fechar essa lacuna e mudanca de escopo propria e fica registrada como follow-up no SUMMARY |
| T-DZI-03 | Denial of Service | carga extra no PostgreSQL de producao do Athos | medium | mitigate | 5 consultas read-only num unico `PoolClient` (sem conexao nova), todas filtradas por `cr.idcliente`/`v.idcliente` (`cliente_conta_receber_fk` existe na DDL), listas com `LIMIT 200` e `LIMIT 10`; falha de qualquer consulta cai no proprio `catch` e libera a conexao no `finally` |
| T-DZI-04 | Denial of Service | pagina de detalhe do cliente | low | mitigate | Um unico request agregado adicional no mount (nao um por bloco), reaproveitando o `useEffect` existente; erro renderiza alerta e nao quebra as secoes ja existentes |
| T-DZI-05 | Elevation of Privilege | rota nova sem autenticacao de token | high | mitigate | `validateAthosToken(authorization, xApiToken)` como primeira linha do handler, identico as rotas vizinhas de contas a receber |
| T-DZI-SC | Tampering | cadeia de suprimentos (npm/pip/cargo) | low | mitigate | Nenhum pacote instalado neste plano (D-08); nada a auditar. Se a execucao concluir que precisa de dependencia nova, parar e reabrir o planejamento com auditoria de legitimidade |
</threat_model>

<verification>
1. `npm --prefix apps/backend test -- athos.service` — suites do AthosService (novas + regressao das existentes) verdes.
2. `npx tsc --noEmit -p apps/frontend/tsconfig.json` — sem erro (baseline verificado limpo em 2026-09-05, antes deste plano).
3. `git diff --stat` deve tocar somente os 5 arquivos de `files_modified` — nenhuma alteracao em `cobranca/**`, no dashboard `contas-receber/page.tsx` ou nas consultas pre-existentes do AthosService (D-07).
4. Checagem humana com rede Athos: `/contas-receber/2829` exibindo contas pagas, itens mais comprados e mes de maior gasto coerentes com o Athos.
</verification>

<success_criteria>
- `GET /athos/contas-receber/cliente/:idcliente/historico` devolve o contrato completo (`pagos`, `truncado`, `totalPago`, `titulosPagos`, `itensPorValor`, `itensPorQuantidade`, `meses`, `mesMaiorGasto`).
- A pagina `/contas-receber/[idcliente]` exibe: cards de resumo (total pago, mes de maior gasto, item de maior gasto), tabela de contas pagas, tabela de itens mais comprados com alternancia valor/quantidade e tabela de gasto por mes com o pico destacado.
- Titulos em aberto, boletos, NFS-e e Notas Fiscais Athos continuam funcionando exatamente como antes.
- Suite do backend e typecheck do frontend verdes; zero dependencia npm nova.
</success_criteria>

<output>
Criar `.planning/quick/260905-dzi-atualizar-p-gina-de-detalhes-do-cliente-/260905-dzi-SUMMARY.md` ao concluir, registrando o follow-up do T-DZI-02 (PasswordGate ausente na pagina de detalhe) e o status da checagem humana contra o Athos real.
</output>
