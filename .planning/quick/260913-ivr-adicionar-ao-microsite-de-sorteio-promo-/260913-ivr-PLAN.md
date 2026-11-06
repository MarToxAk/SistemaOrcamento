---
phase: quick-260913-ivr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.ts
  - apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.test.ts
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/integrations/athos/athos.service.cupom-sorteio.test.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.test.ts
  - .env.example
  - promo/server/athos.js
  - promo/server/athos.test.js
  - promo/server/whatsapp.js
  - promo/server/whatsapp.test.js
  - promo/server/index.js
  - promo/server/index.test.js
  - promo/server/validate.js
  - promo/server/validate.test.js
  - promo/src/App.jsx
  - promo/scripts/check.mjs
  - promo/.env.example
  - promo/README.md
  - deploy/docker-compose.promo.yml
autonomous: false
requirements: [SORT-01, SORT-02, SORT-03, SORT-04]

user_setup:
  - service: backend-orcamento (validacao do cupom fiscal via Athos)
    why: "O microsite do sorteio precisa consultar o backend NestJS para validar o COO no Athos (D-02)"
    env_vars:
      - name: PROMO_ATHOS_BASE_URL
        source: "URL base da API do backend de orcamento, JA INCLUINDO o prefixo /api (o backend roda com setGlobalPrefix('api')). Candidato em producao: http://host.docker.internal:4001/api (o compose do promo publica esse alias de host); alternativa: a URL publica https do backend. Validar com o curl da Task 4 antes do sorteio."
      - name: PROMO_ATHOS_API_TOKEN
        source: "MESMO valor de ATHOS_API_TOKEN configurado no backend (deploy/stack.env) — o endpoint compara com timingSafeEqual"
      - name: PROMO_BACKEND_INTERNAL_API_KEY
        source: "MESMO valor de INTERNAL_API_KEY do backend — o InternalAuthGuard global exige esse header em toda rota nao-@Public"
    dashboard_config:
      - task: "Gravar as 3 variaveis em deploy/promo.env (arquivo NAO versionado, lido via env_file do compose do promo). Sem elas o cadastro responde 503 e ninguem consegue se inscrever (fail-closed, D-03)"
        location: "Shell da VPS"
  - service: evolution-api (WhatsApp)
    why: "Enviar a mensagem de confirmacao do cupom ao telefone digitado pelo cliente (D-04, D-05)"
    env_vars:
      - name: PROMO_WHATSAPP_HOST
        source: "Raiz do host da instancia Evolution API (sem /manager e sem barra final) — informado pelo usuario, gravar SOMENTE em deploy/promo.env"
      - name: PROMO_WHATSAPP_INSTANCE
        source: "NOME da instancia. Atencao: a OpenAPI oficial da Evolution API documenta o path param de POST /message/sendText/{instance} como 'Name of the instance', e o identificador que aparece na URL do painel /manager/instance/<uuid>/dashboard e o UUID, nao o nome. Descobrir o nome com GET {host}/instance/fetchInstances (header apikey) — passo da Task 4"
      - name: PROMO_WHATSAPP_API_KEY
        source: "apikey da instancia Evolution (valor fornecido pelo usuario no chat). Gravar SOMENTE em deploy/promo.env — nunca no repositorio"
    dashboard_config:
      - task: "Confirmar que a instancia esta conectada (GET {host}/instance/connectionState/{instance}) antes do inicio do sorteio; instancia desconectada nao derruba o cadastro (best-effort, D-04) mas ninguem recebe mensagem"
        location: "Painel Evolution API"

estimate:
  # raw = projecao crua; fator aplicado a partir de 1 unico sample de calibracao
  # (quick 260913-hhi: 22.6k reais contra 115k projetados) — 1 sample => confidence low.
  tokens: 20000
  raw_tokens: 40000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "Cadastro com um numero de cupom fiscal (COO) que existe no Athos numa venda nao cancelada de valor >= R$50 responde 201 e grava exatamente 1 linha no SQLite do sorteio (SORT-01, D-01)"
    - "Cadastro com COO que nao bate nenhuma venda valida responde 422 com error cupom_fiscal_invalido e NAO grava linha nenhuma; a pagina mostra a mensagem pedindo para conferir o COO impresso no cupom fiscal (SORT-02, D-03)"
    - "Com o backend de validacao fora do ar, sem configuracao, ou estourando o timeout, o cadastro responde 503 com error validacao_indisponivel e NAO grava linha — falha fechada, nunca aceita sem validar (SORT-02, D-03)"
    - "Cadastro aceito dispara uma mensagem de texto pelo Evolution API para 55 + DDD + numero digitado, com o texto exato de D-05 e o cupom em 5 digitos (SORT-03, D-04)"
    - "Falha no envio da mensagem (API fora, numero invalido, timeout de 5s) mantem o cadastro gravado e a resposta em 201 — o envio e best-effort e nunca reverte a gravacao (SORT-03, D-04)"
    - "O microsite continua sem conexao direta ao Postgres do Athos: a unica leitura do Athos passa pelo endpoint autenticado do backend NestJS (D-02)"
    - "Nenhum segredo (apikey do WhatsApp, UUID da instancia, token do Athos) existe em arquivo versionado — apenas nomes de variavel em .env.example (SORT-04)"
    - "apps/frontend e o lockfile da raiz continuam sem diff; os 30 testes que o microsite ja tinha continuam passando"
  artifacts:
    - apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.ts
    - apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.test.ts
    - apps/backend/src/modules/integrations/athos/athos.service.cupom-sorteio.test.ts
    - promo/server/athos.js
    - promo/server/athos.test.js
    - promo/server/whatsapp.js
    - promo/server/whatsapp.test.js
    - promo/.env.example
    - promo/README.md
  key_links:
    - "POST /api/cadastro de promo/server/index.js -> verificarCupomFiscal (promo/server/athos.js) -> GET {PROMO_ATHOS_BASE_URL}/athos/venda/verificar-cupom do backend NestJS -> AthosService.verificarCupomFiscalSorteio -> SELECT na tabela venda do Athos"
    - "AthosController.verificarCupomFiscalSorteio -> validateAthosToken (x-api-token/Bearer) + InternalAuthGuard global (x-internal-api-key) — as duas camadas de auth do endpoint"
    - "insert bem-sucedido em promo/server/index.js -> enviarWhatsapp (promo/server/whatsapp.js) -> POST {PROMO_WHATSAPP_HOST}/message/sendText/{PROMO_WHATSAPP_INSTANCE} com header apikey"
    - "campo nfce do formulario (promo/src/App.jsx) -> validarCadastro (digitos do COO) -> parametro coo da consulta ao Athos"
    - "deploy/promo.env (nao versionado) -> env_file do deploy/docker-compose.promo.yml -> process.env lido pelas fabricas de promo/server/athos.js e promo/server/whatsapp.js"
---

<objective>
Fechar o microsite de sorteio `promo/` (criado na quick task 260913-hhi) com as duas integracoes que
faltavam: (1) validar o numero do cupom fiscal digitado pelo cliente — que na verdade e o **COO** de
uma venda na tabela `venda` do Athos — antes de aceitar o cadastro, usando um endpoint NOVO no backend
NestJS existente (D-01, D-02), bloqueando o cadastro quando nao ha compra valida de no minimo R$50
(D-03); e (2) enviar uma mensagem de WhatsApp de confirmacao pelo Evolution API ao telefone digitado,
em modo best-effort, quando o cadastro e aceito (D-04, D-05).

Purpose: hoje qualquer pessoa cadastra qualquer numero no formulario — o sorteio nao tem nenhum vinculo
com compra real, e quem se cadastra nao recebe confirmacao nem as regras no celular.

Output: endpoint `GET /api/athos/venda/verificar-cupom` no backend (+ util e testes), dois adaptadores
novos e sem dependencia npm em `promo/server/` (`athos.js`, `whatsapp.js`), o fluxo de `POST
/api/cadastro` reescrito com fail-closed, mensagens novas no formulario, documentacao de envs e um gate
de segredos em `promo/scripts/check.mjs`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260913-hhi-criar-pagina-de-sorteio-baseada-em-d-dow/260913-hhi-SUMMARY.md

Arquivos a ler antes de editar (todos pequenos, exceto athos.service.ts):
@promo/server/index.js
@promo/server/validate.js
@promo/server/index.test.js
@promo/server/validate.test.js
@promo/scripts/check.mjs
@promo/.env.example
@deploy/docker-compose.promo.yml

Do backend, ler SOMENTE as faixas necessarias (athos.service.ts tem 2951 linhas — nao ler inteiro):
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` linhas 1-130 (imports, `validateAthosToken`)
  e 395-412 (endpoint `GET venda/:idvenda/tipo-produto`, o padrao exato a copiar)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 2700-2755
  (`verificarTipoProdutoVenda`: idioma de `getPool()` + `pool.connect()` + `try/finally client.release()`)
- `apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts` linhas 1-40
  (idioma de mock: `jest.mock("pg", ...)` + helper `setupClient()`)
- `apps/backend/src/modules/integrations/athos/athos.controller.test.ts` linhas 1-70
  (idioma de teste do controller: `new AthosController(mock as any)` e assercoes sobre `validateAthosToken`)

Fatos ja levantados e conferidos nesta sessao — use, nao reinvestigue:

1. **Duas camadas de auth no endpoint.** `InternalAuthGuard` esta registrado como `APP_GUARD` global em
   `apps/backend/src/modules/app.module.ts` e exige o header `x-internal-api-key` (= `INTERNAL_API_KEY`)
   em toda rota que nao tenha `@Public()`. Nenhuma rota do `AthosController` e `@Public()`. Portanto o
   `promo/` precisa mandar **os dois** headers: `x-internal-api-key` e `x-api-token`. Nao marcar o
   endpoint novo como `@Public()` — isso rebaixaria a postura de seguranca do backend.
2. **Prefixo global `api`.** `apps/backend/src/main.ts:14` chama `app.setGlobalPrefix("api")` — a rota
   final e `GET /api/athos/venda/verificar-cupom`. Por isso `PROMO_ATHOS_BASE_URL` inclui `/api`.
3. **Booleanos do Athos nao sao confiaveis como boolean.** `athos.service.ts:2550` registra em
   comentario que um filtro `cancelada` foi removido porque "coluna pode nao existir ou ter tipo
   nao-boolean no Athos", e `athos.service.ts:2618` le a coluna `cancelada` como
   `r["cancelada"] === true || r["cancelada"] === "t"`. Consequencia de projeto na Task 1.
4. **Evolution API v2, confirmado na OpenAPI oficial (repo EvolutionAPI/docs-evolution,
   openapi/openapi-v2.json):** `POST /message/sendText/{instance}`; o path param `instance` e
   documentado como "Name of the instance"; auth e `ApiKeyAuth` = header **`apikey`**; corpo JSON com
   `number` (obrigatorio, "with country code") e `text` (obrigatorio), opcionais `delay` e
   `linkPreview`; sucesso = **201**. Existe `GET /instance/fetchInstances` para listar instancias (e
   descobrir o nome a partir do UUID do painel). Isto NAO e suposicao — foi lido da spec.
5. **Estado atual dos testes (medido):** `npm --prefix promo test` = 30/30 passando;
   `npm --prefix apps/backend test -- athos-fk.util` = 3/3 passando em 22s (idioma de comando de teste
   do backend confirmado: `npm --prefix apps/backend test -- <padrao>`).
6. **Ha uma alteracao NAO commitada em `promo/src/App.jsx`** (3 linhas): `cupomBruto` +
   `cupomId = cupomValido ? cupomBruto.padStart(5, "0") : cupomBruto`. PRESERVAR — e exatamente o
   formato de 5 digitos que a mensagem de WhatsApp interpola (D-05). Ela entra no commit da Task 1.
7. **HEAD no inicio deste plano:** `3f27371`. Use esse sha como base dos `git diff` de guarda de escopo.

Schema relevante da tabela `venda` do Athos (fornecido pelo usuario, D-01):
`idvenda serial PK`, `coo varchar(10)`, `valor monetario`, `cancelada boolean`,
`cupomcancelado boolean`, `data dmdata`. `monetario` e `dmdata` sao dominios do Athos — o tipo base
nao foi introspeccionado, entao nenhum cast SQL deve depender deles (ver Task 1).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Caminho ponta-a-ponta — COO validado no Athos libera o cadastro</name>
  <files>apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.ts, apps/backend/src/modules/integrations/athos/athos-cupom-sorteio.util.test.ts, apps/backend/src/modules/integrations/athos/athos.service.ts, apps/backend/src/modules/integrations/athos/athos.service.cupom-sorteio.test.ts, apps/backend/src/modules/integrations/athos/athos.controller.ts, apps/backend/src/modules/integrations/athos/athos.controller.test.ts, .env.example, promo/server/athos.js, promo/server/athos.test.js, promo/server/index.js, promo/server/index.test.js</files>
  <reversibility rating="reversible">Endpoint novo de leitura no Athos e um adaptador novo no promo; remover e apagar 1 rota, 1 metodo de servico, 1 util e 1 arquivo no promo. Nenhuma escrita no Athos, nenhuma migration, nenhum schema alterado.</reversibility>
  <behavior>
    - `normalizarCoo` devolve so os digitos: "  01 234-5 " vira "012345"; devolve null para vazio, para valor com letra, para mais de 10 digitos e para numericamente zero ("0", "0000")
    - `cooCandidatos("012345")` devolve um array sem repeticao contendo o valor sem zeros a esquerda ("12345"), o proprio valor e as variantes zero-padded de 4, 5 e 6 digitos, descartando qualquer candidato com mais de 10 caracteres (limite de `varchar(10)`)
    - `parseValorMonetario` aceita 50, "50", "50.00", "1234.56" e "1234,56"; devolve null para null, undefined e "abc"
    - `ehVerdadeiroAthos` trata true, "t", "T", "S", "s", 1, "1", "true" e "sim" como verdadeiro; qualquer outra coisa (inclusive null e "") como falso
    - `valorMinimoSorteio()` devolve 50 sem env; devolve o numero de SORTEIO_VALOR_MINIMO quando ele e um numero positivo; volta para 50 quando a env e vazia, nao numerica ou <= 0
    - `AthosService.verificarCupomFiscalSorteio` com uma linha de coo igual, nao cancelada e valor 80 devolve `{ valido: true, valor: 80 }`
    - mesma consulta sem nenhuma linha devolve `{ valido: false, valor: null }`
    - linha existente porem com cancelada verdadeira, ou cupomcancelado verdadeiro, ou valor abaixo do minimo devolve `{ valido: false, valor: null }`
    - duas linhas com o mesmo coo (uma de 20 e uma de 90) devolvem `{ valido: true, valor: 90 }` — basta uma linha bater (D-01)
    - erro do driver pg na consulta faz o metodo lancar ServiceUnavailableException (nunca devolver `valido: false` disfarcando indisponibilidade)
    - `AthosController.verificarCupomFiscalSorteio` sem token lanca UnauthorizedException; com token valido e coo invalido lanca BadRequestException; com token valido e coo valido delega ao servico passando o coo normalizado e o minimo de `valorMinimoSorteio()`
    - `criarVerificadorCupomFiscal` (promo) com as 3 envs ausentes devolve `{ status: 'indisponivel', motivo: 'nao_configurado' }` sem chamar fetch
    - o verificador chama exatamente um GET, com os headers `x-api-token` e `x-internal-api-key`, e a URL termina com o caminho do endpoint e a query do coo
    - resposta 200 com `{ valido: true, valor: 80 }` devolve `{ status: 'valido', valor: 80 }`
    - `POST /api/cadastro` com verificador stub que aprova responde 201 e grava exatamente 1 linha, e o verificador recebe o COO digitado no campo nfce
  </behavior>
  <action>
Backend, arquivo novo `athos-cupom-sorteio.util.ts` (funcoes puras, sem I/O, exportadas nomeadamente):
`normalizarCoo(valor: unknown): string | null` (tira tudo que nao e digito; rejeita vazio, rejeita mais
de 10 digitos, rejeita numericamente zero — mesma regra de nao-zero que `validarCadastro` do promo ja
aplica ao cupom); `cooCandidatos(coo: string): string[]`; `parseValorMonetario(valor: unknown): number |
null` (aceita number, aceita string com ponto e string com virgula como separador decimal);
`ehVerdadeiroAthos(valor: unknown): boolean`; `valorMinimoSorteio(env = process.env): number` (le
`SORTEIO_VALOR_MINIMO`, default 50). Motivo de `cooCandidatos`: `coo` e `varchar(10)` e o numero
impresso no cupom pode chegar com ou sem zeros a esquerda; comparar por uma lista finita de variantes
mantem a consulta indexavel, diferente de envolver a coluna em `regexp_replace`.

`athos.service.ts`, metodo novo `verificarCupomFiscalSorteio(coo: string, valorMinimo: number):
Promise<{ valido: boolean; valor: number | null }>` colocado junto de `verificarTipoProdutoVenda`,
seguindo o mesmo idioma (`const pool = this.getPool()`, `await pool.connect()`, `try/finally
client.release()`). Consulta parametrizada, uma unica query: seleciona `v.idvenda, v.coo, v.valor,
v.cancelada, v.cupomcancelado` de `venda v` com `WHERE v.coo = ANY($1::text[])`, `ORDER BY v.idvenda
DESC`, `LIMIT 20`, passando `cooCandidatos(coo)` como parametro. **Nunca interpolar o coo na string
SQL.** A decisao de validade acontece em JS sobre as linhas retornadas: descarta linha com
`ehVerdadeiroAthos(cancelada)` ou `ehVerdadeiroAthos(cupomcancelado)`, converte `valor` com
`parseValorMonetario` e considera valida a linha com valor `>= valorMinimo`; devolve a de maior valor.
Isto implementa exatamente a semantica de D-01 (coo igual, valor >= minimo, nao cancelada, nao com cupom
cancelado, basta uma linha bater), mas avaliando os tres criterios em JS de proposito: o proprio
codebase registra que colunas booleanas deste Athos podem nao ser boolean e que `valor` e o dominio
`monetario` de tipo base nao introspeccionado — um `COALESCE(...) = false` ou um `::numeric` que estoure
por tipo transformaria TODA validacao em 503 e travaria o sorteio inteiro. Em `catch`, logar com
`this.logger.warn` (coo e contagem de linhas, nunca o valor bruto da venda) e lancar
`ServiceUnavailableException("Athos indisponivel para validar o cupom fiscal")` — o chamador precisa
distinguir "nao existe" de "nao deu para consultar" (D-03); importar `ServiceUnavailableException` de
`@nestjs/common`.

`athos.controller.ts`, rota nova `@Get("venda/verificar-cupom")` posicionada logo depois de
`venda/:idvenda/tipo-produto`, copiando o padrao daquele handler: decoradores `@ApiOperation`,
`@ApiQuery({ name: "coo", required: true })`, `@ApiOkResponse`, `@ApiUnauthorizedResponse`; assinatura
com `@Query("coo") coo?: string`, `@Headers("authorization")` e `@Headers("x-api-token")`; primeira
linha do corpo e `this.validateAthosToken(authorization, xApiToken)`. Depois normaliza com
`normalizarCoo` e lanca `BadRequestException("coo invalido")` quando vier null, e retorna
`this.athosService.verificarCupomFiscalSorteio(normalizado, valorMinimoSorteio())`. O minimo vem
**sempre** do servidor: nao aceitar minimo por query param, senao qualquer chamador rebaixaria a regra
de R$50. Nao adicionar `@Public()` (ver fato 1 do contexto) e nao adicionar `@AdminOnly()` (o promo nao
tem sessao de admin).

Testes do backend: `athos-cupom-sorteio.util.test.ts` cobrindo as 5 funcoes puras;
`athos.service.cupom-sorteio.test.ts` copiando o cabecalho de `athos.service.indicadores.test.ts`
(`jest.mock("pg", ...)`, `setupClient()`, envs `ATHOS_PG_*` em `beforeAll`, `Test.createTestingModule`
com `PrismaService` mockado) e cobrindo os 5 comportamentos de servico declarados em `<behavior>`;
`athos.controller.test.ts` ganha um `describe` novo com os 3 comportamentos de controller, adicionando
`verificarCupomFiscalSorteio: jest.fn()` ao objeto e ao tipo do `athosServiceMock` existente sem
remover nenhuma chave ja presente.

`.env.example` da raiz: documentar `SORTEIO_VALOR_MINIMO=50` como opcional, explicando que e o valor
minimo de compra para concorrer e que, sendo 50 o default do codigo, producao nao precisa declarar a
variavel — por isso `deploy/docker-compose.vps.yml` e `deploy/stack.env` NAO devem ser editados. Nao
incluir a variavel em `REQUIRED_ENV_VARS` de `app.module.ts`.

Promo, arquivo novo `promo/server/athos.js` (zero dependencia, `fetch` nativo do Node 24):
`lerConfigAthos(env = process.env)` devolvendo null quando falta `PROMO_ATHOS_BASE_URL`,
`PROMO_ATHOS_API_TOKEN` ou `PROMO_BACKEND_INTERNAL_API_KEY`, e senao `{ baseUrl, apiToken, internalKey,
timeoutMs }` com `PROMO_ATHOS_TIMEOUT_MS` default 5000; e
`criarVerificadorCupomFiscal({ env, fetchImpl, logger } = {})` que devolve uma funcao assincrona
`({ coo }) => { status, valor?, motivo? }` com `status` em `'valido' | 'invalido' | 'indisponivel'`.
Montagem da URL por concatenacao com a barra final do baseUrl removida, caminho
`/athos/venda/verificar-cupom` e query com o coo passado por `encodeURIComponent`. Headers: `x-api-token`,
`x-internal-api-key` e `accept: application/json`. Timeout por `AbortSignal.timeout(timeoutMs)`.
Mapeamento: 200 com `valido` verdadeiro vira `valido`; 200 com `valido` falso e 400 viram `invalido`
(400 = o proprio backend rejeitou o formato do coo); qualquer outro status, corpo nao-JSON, abort de
timeout ou erro de rede viram `indisponivel` com `motivo` curto (`http_<status>`, `timeout`,
`falha_de_rede`). **A funcao nunca lanca** — quem chama precisa de uma resposta em qualquer cenario. Log
so com status e motivo; nunca logar headers, token ou corpo da resposta.

`promo/server/index.js`: `createServer` passa a aceitar `{ dbPath, verificarCupomFiscal, enviarWhatsapp }`,
usando `criarVerificadorCupomFiscal()` como default quando a dependencia nao e injetada (o parametro
`enviarWhatsapp` fica reservado para a Task 3; nesta task aceite e ignore). No handler de `POST
/api/cadastro`, depois do pre-check de cupom duplicado (que continua vindo antes, por ser barato e
evitar chamada externa para quem ja esta cadastrado) e ANTES do insert, chamar o verificador com o COO
(`validacao.valor.nfce`). Nesta task implemente apenas o ramo feliz: `status === 'valido'` segue para o
insert e responde 201 como hoje. Os ramos de bloqueio sao a Task 2 — nao antecipar.

`promo/server/index.test.js`: o helper `startServer` passa a aceitar dependencias e `withServer` a
injetar por default um verificador stub que devolve `{ status: 'valido' }`, de modo que os 30 testes
existentes continuem exercendo exatamente o que exerciam (nenhum deles deve ser apagado ou enfraquecido).
O teste "reabrir o mesmo arquivo de banco nao duplica schema nem dados" monta o corpo do POST a mao —
adicionar `nfce` nesse corpo, porque a Task 2 torna o campo obrigatorio. Somar 2 testes novos: 201 com
verificador que aprova gravando 1 linha, e assercao de que o verificador recebeu o COO digitado.
`promo/server/athos.test.js` novo, com `fetchImpl` fake, cobrindo os 4 comportamentos de adaptador
declarados em `<behavior>` (sem configuracao, headers/URL da chamada, 200 valido, e um fake que rejeita
virando `indisponivel`).

Nao tocar em `apps/frontend/**`, `deploy/docker-compose.vps.yml`, `deploy/nginx.conf`, `package.json` nem
`package-lock.json` da raiz.
  </action>
  <verify>
    <automated>npm --prefix apps/backend test -- athos &amp;&amp; npm --prefix promo test</automated>
  </verify>
  <done>Os testes novos do backend (util, servico, controller) passam junto com toda a regressao do modulo athos; `npm --prefix promo test` passa com 32+ testes, incluindo o caso ponta-a-ponta em que o verificador aprova o COO e o cadastro grava 1 linha; a rota `GET /api/athos/venda/verificar-cupom` exige os dois headers de auth e nunca interpola o coo em SQL (SORT-01, D-01, D-02).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fail-closed — cupom fiscal invalido bloqueia (422), Athos indisponivel bloqueia (503)</name>
  <files>promo/server/validate.js, promo/server/validate.test.js, promo/server/index.js, promo/server/index.test.js, promo/src/App.jsx, promo/scripts/check.mjs</files>
  <behavior>
    - `validarCadastro` sem nfce, com nfce vazia, com nfce so de espacos e com nfce numericamente zero devolve `{ ok: false, campo: 'nfce' }`
    - `validarCadastro` com nfce "01 234-5" devolve ok e `valor.nfce` igual a "012345" (somente digitos)
    - `validarCadastro` com nfce de letra ("ABC-123") e com nfce de mais de 10 digitos continua rejeitando com campo nfce
    - nenhuma outra regra de `validarCadastro` muda: cupom, nome e telefone seguem com o mesmo contrato e os mesmos testes
    - `POST /api/cadastro` com verificador que devolve `invalido` responde 422 com `{ ok: false, error: 'cupom_fiscal_invalido' }` e o banco fica com 0 linhas
    - `POST /api/cadastro` com verificador que devolve `indisponivel` responde 503 com `{ ok: false, error: 'validacao_indisponivel' }` e o banco fica com 0 linhas
    - `POST /api/cadastro` num servidor sem nenhuma env de validacao configurada (verificador default) responde 503 e nao grava
    - `POST /api/cadastro` sem nfce responde 400 com campo nfce e nao chega a chamar o verificador
  </behavior>
  <action>
`promo/server/validate.js`: o campo `nfce` deixa de ser opcional e passa a carregar o COO. Ordem das
regras: primeiro rejeitar caractere fora de digito/espaco/hifen (a regra que ja existe hoje, que e o que
faz "ABC-123" cair em campo nfce), depois reduzir a somente digitos, depois exigir de 1 a 10 digitos e
recusar numericamente zero. `valor.nfce` passa a ser a string de digitos (nunca mais null), porque esse
e o valor que vai como `coo` para o Athos. O limite de 10 digitos substitui o antigo limite de 44
caracteres: `coo` e `varchar(10)` no Athos, entao aceitar 44 caracteres seria aceitar algo que nunca
pode casar. Mensagem de erro do campo em portugues citando cupom fiscal e COO.

`promo/server/validate.test.js`: o teste que hoje afirma que nfce ausente e aceita como opcional passa a
afirmar o oposto (rejeicao com campo nfce) — renomear o teste para refletir a nova regra, nao apagar a
cobertura. Adicionar os casos de nfce so-espacos, nfce zerada e normalizacao de "01 234-5" para
"012345". Manter os demais testes intactos.

`promo/server/index.js`, handler de `POST /api/cadastro`: completar o `switch` do resultado do
verificador iniciado na Task 1. `invalido` responde **422** com `{ ok: false, error:
'cupom_fiscal_invalido' }`; `indisponivel` responde **503** com `{ ok: false, error:
'validacao_indisponivel' }`; nos dois casos retornar antes de qualquer `insertStmt.run`, e nunca gravar
linha parcial. Escolha de projeto a manter explicita em comentario no codigo: 503 tambem para o caso de
configuracao ausente ou timeout — falha fechada (D-03). O trade-off e assumido: se o backend de
validacao cair durante o sorteio, ninguem consegue se cadastrar; o inverso (aceitar sem validar) daria
premio a cupom inexistente e e pior. A resposta ao navegador nunca inclui o `valor` da venda devolvido
pelo backend — esse dado fica no servidor (evita transformar o formulario publico em sonda de valores de
venda por COO).

`promo/src/App.jsx`: manter a alteracao nao commitada de `cupomBruto`/`padStart(5, "0")`. Adicionar ao
`MENSAGENS_CAMPO` a mensagem nova do campo nfce (pedir somente numeros do COO). No `handleSubmit`,
adicionar guarda local de campo vazio para o cupom fiscal, no mesmo estilo das guardas de nome e
telefone que ja existem; adicionar tratamento de `422` com exatamente o texto pedido pelo usuario — "Nao
encontramos uma compra valida (minimo R$50) com este numero de cupom fiscal. Confira o numero do COO
impresso no seu cupom fiscal." — e de `503` com "Nao conseguimos validar seu cupom fiscal agora. Tente
novamente em alguns minutos." Os tratamentos de 201, 409, 400 e 429 ficam como estao. Trocar o rotulo do
campo de NFC-e para cupom fiscal (COO) e o placeholder para indicar somente numeros. Nao mexer no objeto
`st`, no popup de regras, no array `REGRAS` nem no `IG_URL`.

`promo/server/index.test.js`: somar os 4 comportamentos HTTP declarados em `<behavior>`, cada um
conferindo por SQL que o banco ficou com 0 linhas nos casos de bloqueio. O teste de "sem env
configurada" sobe o servidor sem injetar verificador, com as 3 variaveis de validacao apagadas do
`process.env` dentro do teste e restauradas no `finally`.

`promo/scripts/check.mjs`, modo `hardening` existente: acrescentar as assercoes de que
`promo/server/index.js` contem os status 422 e 503 e os dois codigos de erro (`cupom_fiscal_invalido`,
`validacao_indisponivel`), e de que `promo/src/App.jsx` contem o tratamento do 422. Nao remover nenhuma
assercao ja existente do modo (a regressao dos gates da task anterior faz parte do `<verify>`).
  </action>
  <verify>
    <automated>npm --prefix promo test &amp;&amp; node promo/scripts/check.mjs tracer &amp;&amp; node promo/scripts/check.mjs hardening &amp;&amp; npm --prefix promo run build</automated>
  </verify>
  <done>Cupom fiscal que nao bate no Athos responde 422 e nao grava; backend de validacao indisponivel, sem configuracao ou em timeout responde 503 e nao grava; formulario exige o COO e mostra as duas mensagens novas; build do Vite e os gates tracer e hardening passam (SORT-02, D-03).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Mensagem de WhatsApp best-effort via Evolution API, com segredos so em env</name>
  <files>promo/server/whatsapp.js, promo/server/whatsapp.test.js, promo/server/index.js, promo/server/index.test.js, promo/scripts/check.mjs, promo/.env.example, promo/README.md, deploy/docker-compose.promo.yml</files>
  <reversibility rating="reversible">Envio e best-effort e isolado num arquivo novo; desligar e apagar as envs do WhatsApp de deploy/promo.env — o cadastro continua funcionando igual.</reversibility>
  <behavior>
    - `normalizarNumeroWhatsapp("11999998888")` devolve "5511999998888"; com 10 digitos devolve "55" + os 10; com telefone que ja comeca com 55 e tem 12-13 digitos devolve o proprio numero sem duplicar o DDI; devolve null para qualquer coisa que nao reduza a 10, 11, 12 ou 13 digitos
    - `montarMensagemSorteio("42")` devolve o texto exato de D-05 com "00042" no lugar do cupom; `montarMensagemSorteio("00042")` devolve o mesmo texto (idempotente no padding)
    - `lerConfigWhatsapp` devolve null quando falta qualquer uma das 3 variaveis; devolve host sem barra final e timeout default de 5000
    - o enviador faz exatamente um POST, com o caminho de sendText da instancia, header apikey e corpo JSON com as chaves number e text — e nada mais alem das opcionais documentadas
    - resposta 201 devolve `{ enviado: true }`; resposta 400 devolve `{ enviado: false, motivo: 'http_400' }`; abort de timeout devolve `{ enviado: false, motivo: 'timeout' }`; erro de rede devolve `{ enviado: false, motivo: 'falha_de_rede' }`; config ausente devolve `{ enviado: false, motivo: 'nao_configurado' }` sem chamar fetch
    - o enviador nunca lanca, mesmo com fetchImpl que rejeita ou que devolve corpo nao-JSON
    - `POST /api/cadastro` aceito chama o enviador uma vez com o telefone gravado e o cupom, e responde 201 com `{ ok: true, cupom, whatsapp: { enviado: true } }`
    - `POST /api/cadastro` aceito com enviador que falha ou que lanca responde 201 com `whatsapp.enviado` falso e a linha permanece gravada no banco (1 linha)
    - cadastro bloqueado em 422, 503, 409 ou 400 nao chama o enviador
  </behavior>
  <action>
`promo/server/whatsapp.js` novo, zero dependencia, `fetch` nativo. Exportar:
`normalizarNumeroWhatsapp(telefone)` (reduz a digitos; 10 ou 11 digitos recebem o prefixo 55; 12 ou 13
digitos que ja comecam com 55 passam direto — evita DDI duplicado se o cliente digitar o pais; qualquer
outro tamanho devolve null); `montarMensagemSorteio(cupom)`; `lerConfigWhatsapp(env = process.env)` lendo
`PROMO_WHATSAPP_HOST`, `PROMO_WHATSAPP_INSTANCE`, `PROMO_WHATSAPP_API_KEY` e `PROMO_WHATSAPP_TIMEOUT_MS`
(default 5000); e `criarEnviadorWhatsapp({ env, fetchImpl, logger } = {})` devolvendo
`async ({ telefone, cupom }) => ({ enviado, motivo? })`.

Chamada HTTP, conforme a OpenAPI oficial da Evolution API v2 ja conferida (fato 4 do contexto): metodo
POST, URL = host sem barra final + o caminho de envio de texto + a instancia passada por
`encodeURIComponent`; headers `apikey` e `content-type: application/json`; corpo via `JSON.stringify`
com as chaves `number` (saida de `normalizarNumeroWhatsapp`) e `text` (saida de
`montarMensagemSorteio`) — nunca montar o corpo por concatenacao de string, o nome do cliente e o
telefone sao entrada de terceiros. `AbortSignal.timeout` com o timeout da config (D-04 pede curto, 5s).
Tratar 200 e 201 como sucesso (a spec documenta 201). Toda saida de log passa por `logger.warn` com
status e motivo apenas: **nunca** logar a apikey, os headers, a URL completa nem o corpo da resposta.
Esse arquivo e a unica peca que conhece o formato da Evolution API — se o path ou o payload divergirem
na instancia real (por exemplo instancia em v1, que usa outro formato de corpo), a correcao e num unico
lugar; o teste da Task 4 e o que confirma o formato contra a instancia real.

Texto de `montarMensagemSorteio`: usar `String(cupom).replace(/\D/g, '').padStart(5, '0')` e devolver
exatamente as linhas abaixo, nesta ordem, unidas por quebra de linha, com as linhas em branco
preservadas (elas fazem parte do texto aprovado em D-05) e sem alterar emoji, acento, asterisco de
negrito do WhatsApp ou pontuacao:

🎉 *Sorteio Dia das Crianças – Bom Custo Papelaria!*

Seu cupom nº {cupom} foi cadastrado com sucesso! 🎈

Para concorrer, não esqueça das regras:
✅ Compras no Débito, Crédito, Dinheiro ou Pix
✅ Preencha o cupom Físico e Digital
✅ Curta a publicação
✅ Siga nossa página

📲 Siga a gente no Instagram: https://www.instagram.com/bomcustopapelaria/

Boa sorte! 🍀

`promo/server/index.js`: `createServer` passa a usar `criarEnviadorWhatsapp()` como default do parametro
`enviarWhatsapp` reservado na Task 1. Depois do insert bem-sucedido, chamar o enviador com o telefone e
o cupom gravados, dentro de `try/catch` proprio, e responder 201 com o campo `whatsapp: { enviado,
motivo? }` somado ao corpo atual (`ok` e `cupom` continuam). A chamada e aguardada (mesmo padrao do
envio Chatwoot ja adotado no backend em 260902-hal) e o timeout curto e o que limita a espera do usuario;
qualquer falha, rejeicao ou excecao do enviador so muda o campo `whatsapp` — **jamais** apaga a linha
gravada, jamais muda o status para erro, jamais impede o popup de regras (D-04). O frontend nao precisa
de alteracao nesta task: ele abre o popup em qualquer 201.

`promo/server/whatsapp.test.js` novo com `fetchImpl` fake cobrindo os 7 primeiros comportamentos de
`<behavior>`; a assercao do texto confere o cupom com 5 digitos, as 4 linhas de regra e a URL do
Instagram. `promo/server/index.test.js` ganha os 3 ultimos comportamentos, incluindo o caso de enviador
que lanca, provando 201 com 1 linha no banco.

`promo/.env.example`: documentar, em portugues e **sem nenhum valor real**, as variaveis novas —
`PROMO_ATHOS_BASE_URL` (com o aviso de que precisa terminar com o prefixo /api do backend),
`PROMO_ATHOS_API_TOKEN`, `PROMO_BACKEND_INTERNAL_API_KEY`, `PROMO_ATHOS_TIMEOUT_MS`,
`PROMO_WHATSAPP_HOST`, `PROMO_WHATSAPP_INSTANCE` (registrar que a Evolution API espera o NOME da
instancia e que o identificador da URL do painel e o UUID, com a dica do `GET /instance/fetchInstances`),
`PROMO_WHATSAPP_API_KEY` e `PROMO_WHATSAPP_TIMEOUT_MS` — mantendo as 4 variaveis que o arquivo ja
documenta. Deixar explicito que sem as 3 primeiras o cadastro responde 503 (fail-closed) e que sem as 3
do WhatsApp o cadastro continua funcionando, so nao envia mensagem.

`deploy/docker-compose.promo.yml`: acrescentar `extra_hosts` com o alias de host-gateway para o container
alcancar a porta que o backend de orcamento publica no host da VPS (o servico promo continua fora da rede
`app_net`, preservando o isolamento decidido em D-03 da task anterior — o alias da acesso ao host, nao a
rede do stack). Comentar no arquivo que as 7 variaveis novas chegam pelo `env_file: ./promo.env` (nao
versionado) e que `PROMO_ATHOS_BASE_URL` pode apontar tanto para o alias do host quanto para a URL
publica do backend, o que for alcancavel da VPS. Nao alterar o bind de porta, o volume nem o `TRUST_PROXY`
existentes.

`promo/README.md`: secao nova de integracoes cobrindo — a regra do sorteio (compra de no minimo R$50
localizada pelo COO na tabela de vendas do Athos, cupom fiscal cancelado nao vale); o caminho da
validacao (microsite chama o backend de orcamento por HTTP autenticado, sem acesso direto ao banco do
Athos, D-02); o comportamento fail-closed e o que o operador ve quando ele dispara; as 7 variaveis novas
e onde grava-las; como descobrir o nome da instancia do WhatsApp; e que a mensagem e best-effort.

`promo/scripts/check.mjs`: modo novo `integracao` asserindo (1) que `promo/server/athos.js` referencia as
3 variaveis de validacao e que `promo/server/whatsapp.js` referencia as 3 do WhatsApp; (2) que
`promo/.env.example` cita as 7 variaveis novas; (3) gate de forma-de-segredo: lendo cada arquivo de
`promo/server/` **cru, sem filtrar comentarios** (segredo em comentario tambem e segredo), falhar se
algum casar o regex de UUID (8-4-4-4-12 hexadecimal) ou o regex de sequencia hexadecimal de 32
caracteres ou mais — e o que impede a apikey da instancia ou o identificador do painel de entrarem no
repositorio por copiar-e-colar. Manter os modos `tracer`, `hardening` e `deploy` funcionando.
  </action>
  <verify>
    <automated>npm --prefix promo test &amp;&amp; node promo/scripts/check.mjs integracao &amp;&amp; node promo/scripts/check.mjs deploy &amp;&amp; git diff --quiet 3f27371 -- apps/frontend package.json package-lock.json deploy/docker-compose.vps.yml deploy/nginx.conf</automated>
  </verify>
  <done>Cadastro aceito dispara um POST de texto para a instancia Evolution com o numero em 55+DDD+numero e o texto exato de D-05 com o cupom em 5 digitos; falha, timeout de 5s ou ausencia de configuracao do WhatsApp mantem o 201 e a linha gravada; nenhum segredo em arquivo versionado (gate `integracao` passa); apps/frontend, lockfile da raiz e os arquivos de deploy do app de orcamento seguem sem diff (SORT-03, SORT-04, D-04, D-05).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 4: Verificacao humana contra o Athos real e a instancia real de WhatsApp</name>
  <precondition>Tailscale ativo nesta maquina (ou shell na VPS) com o Postgres do Athos alcancavel, backend de orcamento no ar, e `deploy/promo.env` preenchido com as 7 variaveis novas — nada disso e garantido pelo plano.</precondition>
  <what-built>
Validacao do cupom fiscal (COO) contra a tabela `venda` do Athos via endpoint novo
`GET /api/athos/venda/verificar-cupom` do backend NestJS, consumida pelo microsite do sorteio com
fail-closed (422 para cupom fiscal invalido, 503 para validacao indisponivel), mais envio best-effort de
mensagem de WhatsApp pela Evolution API a cada cadastro aceito. Tudo coberto por testes automatizados
com adaptadores injetados — o que resta depende do Athos de producao e da instancia real de WhatsApp,
indisponiveis no ambiente de execucao (mesmo motivo que deixou o human-check de 260913-hhi pendente).
  </what-built>
  <how-to-verify>
1. Descobrir o nome da instancia: `GET {PROMO_WHATSAPP_HOST}/instance/fetchInstances` com o header
   `apikey`, e conferir qual nome corresponde ao identificador que aparece na URL do painel. Gravar o
   NOME em `PROMO_WHATSAPP_INSTANCE` de `deploy/promo.env`.
2. Confirmar o alcance do backend a partir de onde o microsite roda: um GET autenticado (headers
   `x-api-token` e `x-internal-api-key`) em `{PROMO_ATHOS_BASE_URL}/athos/venda/verificar-cupom?coo=` +
   um COO real de uma venda acima de R$50, esperando `{ valido: true, valor: ... }`. Se responder 401,
   o par de tokens nao casa com `ATHOS_API_TOKEN`/`INTERNAL_API_KEY` do backend; se nao conectar,
   `PROMO_ATHOS_BASE_URL` nao e alcancavel do container e precisa trocar para a URL publica.
3. Mesmo GET com um COO inexistente e com um COO de venda abaixo de R$50: esperar `valido: false` nos
   dois.
4. Pelo site: cadastrar usando um cupom fiscal real de compra acima de R$50 e um telefone real —
   esperar o popup de regras e a mensagem chegando no WhatsApp com o cupom em 5 digitos, os 4 itens de
   regra e o link do Instagram.
5. Pelo site: cadastrar com um numero de cupom fiscal inventado — esperar a mensagem pedindo para
   conferir o COO, e conferir no CSV que nenhuma linha nova apareceu.
6. Derrubar temporariamente o acesso ao backend (ou apagar `PROMO_ATHOS_API_TOKEN` de
   `deploy/promo.env` e reiniciar o container) e tentar cadastrar — esperar a mensagem de tentar mais
   tarde e nenhuma linha nova; restaurar depois.
7. Com a instancia de WhatsApp desconectada de proposito, cadastrar um cupom fiscal valido — esperar o
   popup de sucesso normal e a linha gravada no CSV mesmo sem mensagem entregue (best-effort, D-04).
  </how-to-verify>
  <resume-signal>Responda "aprovado" quando os 7 passos conferirem, descreva o que divergiu (especialmente o formato exato aceito pela instancia Evolution, que se corrige apenas em `promo/server/whatsapp.js`), ou responda "pendente de ambiente" para registrar no SUMMARY que Tailscale/VPS/instancia nao estavam disponiveis — pendencia de ambiente nao e falha.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador publico -> POST /api/cadastro | Formulario sem login: nome, telefone e o numero do cupom fiscal sao 100% entrada nao confiavel |
| servidor promo -> backend NestJS | Chamada server-to-server que carrega DOIS segredos (token do Athos e chave interna) e devolve dado de venda |
| backend NestJS -> Postgres do Athos | Banco de producao do PDV; este plano so le, e apenas a tabela `venda` |
| servidor promo -> Evolution API (internet) | Egress para terceiro, carregando a apikey da instancia e um telefone digitado por estranho |
| deploy/promo.env -> processo do container | Unico lugar onde os segredos existem em texto; arquivo nao versionado |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ivr-01 | Tampering | parametro coo -> SQL da tabela venda | critical | mitigate | `normalizarCoo` reduz a digitos e recusa o resto no controller (400); a consulta usa `= ANY($1::text[])` parametrizado, sem nenhuma interpolacao de string (Task 1) |
| T-ivr-02 | Elevation of Privilege | validacao do cupom fiscal contornavel | high | mitigate | Fail-closed: config ausente, timeout, 401, 5xx e corpo invalido viram 503 sem gravar; ramo de aceite existe so para `status === 'valido'`; 4 testes HTTP cobrem os ramos (Tasks 1 e 2) |
| T-ivr-03 | Elevation of Privilege | minimo de R$50 rebaixado pelo chamador | high | mitigate | O minimo vem sempre de `valorMinimoSorteio()` no servidor; o endpoint nao aceita minimo por query param e o promo nao envia (Task 1) |
| T-ivr-04 | Information Disclosure | formulario publico como sonda de valores de venda por COO | medium | mitigate | Endpoint exige `x-internal-api-key` + `x-api-token`; a resposta ao navegador nunca inclui o `valor` retornado pelo backend, so o codigo de erro; o rate limit de 10/10min por origem que ja existe limita enumeracao de COO (Tasks 1 e 2) |
| T-ivr-05 | Information Disclosure | segredos (apikey Evolution, identificador da instancia, tokens do backend) | critical | mitigate | Somente nomes de variavel em `.env.example`; valores apenas em `deploy/promo.env` nao versionado; gate `integracao` do check.mjs falha se algum arquivo de `promo/server/` (lido cru, comentarios incluidos) casar o regex de UUID ou de hexadecimal longo (Task 3) |
| T-ivr-06 | Information Disclosure | logs do servidor promo | medium | mitigate | Logs de falha registram so status e motivo curto; proibido logar headers, apikey, URL completa e corpo de resposta das duas integracoes (Tasks 1 e 3) |
| T-ivr-07 | Denial of Service | chamadas externas travando a resposta ao cliente | medium | mitigate | `AbortSignal.timeout` em ambas as integracoes (5s default cada), e o envio de WhatsApp nao pode bloquear a gravacao ja concluida (Tasks 1 e 3) |
| T-ivr-08 | Denial of Service | backend de validacao fora do ar trava todo o sorteio | high | accept | Consequencia aceita de D-03 (fail-closed): preferimos ninguem se cadastrar por alguns minutos a premiar cupom fiscal inexistente; mitigado operacionalmente pelo passo 6 do human-check e pela mensagem de "tente novamente" |
| T-ivr-09 | Tampering | corpo enviado ao Evolution API com dado do cliente | low | mitigate | `number` derivado apenas de digitos validados (10-13) e `text` de template fixo; corpo montado por `JSON.stringify`, nunca por concatenacao (Task 3) |
| T-ivr-10 | Spoofing | mesmo COO reaproveitado em varios cupons do sorteio | low | accept | Fora do escopo decidido: a unicidade continua sendo por `cupom` (UNIQUE no SQLite). O COO fica gravado na coluna `nfce` e sai no CSV, entao o operador consegue auditar repeticao a mao antes do sorteio |
| T-ivr-11 | Repudiation | contestacao de quem enviou a mensagem/cadastro | low | accept | Continua-se gravando `ip` e `criado_em` por linha; sorteio promocional de bairro nao justifica trilha assinada |
| T-ivr-SC | Tampering | instalacao de pacote npm | n/a | mitigate | Nenhum pacote novo em nenhuma das duas pontas: as duas integracoes usam `fetch` nativo do Node 24, mantendo o runtime do microsite com zero dependencia. Sem install, nao ha gate de legitimidade a rodar |
</threat_model>

<verification>
- `npm --prefix apps/backend test -- athos` passa (testes novos de util, servico e controller + regressao do modulo athos)
- `npm --prefix promo test` passa, com os 30 testes anteriores intactos mais os novos de validacao, adaptador Athos, WhatsApp e fluxo HTTP
- `node promo/scripts/check.mjs tracer`, `... hardening`, `... deploy` e `... integracao` passam
- `npm --prefix promo run build` gera `promo/dist` sem erro
- `git diff --quiet 3f27371 -- apps/frontend package.json package-lock.json deploy/docker-compose.vps.yml deploy/nginx.conf` — nada do app de orcamento alterado
- Nenhum valor de segredo em arquivo versionado (gate `integracao` + revisao do diff final)
- Human-check da Task 4 (7 passos) confirmado ou registrado como pendente de ambiente com o motivo
</verification>

<success_criteria>
- Cliente so consegue se cadastrar apresentando um numero de cupom fiscal (COO) que o Athos confirma numa venda nao cancelada de no minimo R$50; qualquer outro caso e bloqueado com mensagem clara (SORT-01, SORT-02, D-01, D-03)
- O microsite continua sem tocar no Postgres do Athos: a validacao passa por um endpoint novo e autenticado do backend NestJS existente (D-02)
- Cadastro aceito resulta em mensagem de WhatsApp com o texto aprovado, e falha de envio nunca desfaz o cadastro (SORT-03, D-04, D-05)
- Segredos vivem so em `deploy/promo.env`; o repositorio tem apenas nomes de variavel documentados (SORT-04)
- Nada do app de orcamento regride: `apps/frontend` intocado, zero dependencia npm nova, suite do modulo athos e os 30 testes do microsite continuam verdes
</success_criteria>

<output>
Create `.planning/quick/260913-ivr-adicionar-ao-microsite-de-sorteio-promo-/260913-ivr-SUMMARY.md` when done
</output>
