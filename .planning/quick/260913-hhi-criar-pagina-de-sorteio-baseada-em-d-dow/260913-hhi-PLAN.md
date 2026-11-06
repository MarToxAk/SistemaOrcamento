---
phase: quick-260913-hhi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - promo/package.json
  - promo/package-lock.json
  - promo/.gitignore
  - promo/.dockerignore
  - promo/.env.example
  - promo/index.html
  - promo/vite.config.js
  - promo/src/main.jsx
  - promo/src/App.jsx
  - promo/public/img/
  - promo/scripts/extract-images.mjs
  - promo/scripts/check.mjs
  - promo/server/index.js
  - promo/server/validate.js
  - promo/server/csv.js
  - promo/server/index.test.js
  - promo/server/validate.test.js
  - promo/README.md
  - promo/Dockerfile
  - deploy/docker-compose.promo.yml
  - deploy/nginx-promo.conf
autonomous: false
requirements: [PROMO-01, PROMO-02, PROMO-03, PROMO-04]

user_setup:
  - service: dns-tls
    why: "Publicar https://promocao.bomcustoilhabela.com.br/ (D-03)"
    dashboard_config:
      - task: "Criar registro A de promocao.bomcustoilhabela.com.br apontando para o IP da VPS"
        location: "Painel de DNS do dominio bomcustoilhabela.com.br"
      - task: "Emitir certificado TLS para o host (certbot --nginx -d promocao.bomcustoilhabela.com.br) e habilitar o server block deploy/nginx-promo.conf"
        location: "Shell da VPS"
      - task: "Gerar os QR codes sequenciais apontando para https://promocao.bomcustoilhabela.com.br/?id=NNNN e imprimir os cupons fisicos (D-04, D-05)"
        location: "Fora do sistema — responsabilidade do usuario"
    env_vars:
      - name: PROMO_ADMIN_TOKEN
        source: "Gerar segredo aleatorio (openssl rand -hex 24) e gravar em deploy/promo.env — sem ele o export CSV responde 503"

estimate:
  tokens: 115000
  raw_tokens: 115000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "Abrir a pagina com ?id=1234 mostra 1234 no box 'Seu Cupom' e o formulario nome/telefone/NFC-e (D-04)"
    - "Enviar o formulario valido grava exatamente 1 linha no banco do sorteio vinculada aquele cupom e abre o popup de regras + botao do Instagram (PROMO-01)"
    - "Enviar o MESMO id de cupom uma segunda vez nao cria segunda linha e a pagina mostra mensagem de cupom ja cadastrado (PROMO-02)"
    - "Abrir a pagina sem id valido (ausente, nao numerico ou zerado) mostra aviso inline e o botao Enviar fica bloqueado (PROMO-02)"
    - "O operador baixa todos os cadastros em CSV somente apresentando PROMO_ADMIN_TOKEN; sem token a resposta e 401 e sem token configurado no servidor e 503 (PROMO-03)"
    - "O app de orcamento existente continua intacto: package.json e package-lock.json da raiz sem diff e nenhum novo npm workspace (D-01)"
    - "A imagem Docker sobe o site e a API na mesma porta, com o arquivo do banco num volume persistente e sem integracao com o Athos (D-02, D-03, PROMO-04)"
  artifacts:
    - promo/package.json
    - promo/src/App.jsx
    - promo/server/index.js
    - promo/server/validate.js
    - promo/server/csv.js
    - promo/server/index.test.js
    - promo/server/validate.test.js
    - promo/public/img/bg.png
    - promo/Dockerfile
    - deploy/docker-compose.promo.yml
    - deploy/nginx-promo.conf
    - promo/README.md
  key_links:
    - "handleSubmit de promo/src/App.jsx -> POST /api/cadastro (o helper de storage do sandbox nao existe mais no arquivo)"
    - "boot do servidor -> schema SQLite com UNIQUE(cupom) no caminho apontado por PROMO_DB_PATH"
    - "objeto IMG de promo/src/App.jsx -> arquivos reais em promo/public/img/*.png (nenhum data URI restante no JSX)"
    - "stage runtime do promo/Dockerfile -> serve promo/dist + server/index.js na PORT"
    - "server block deploy/nginx-promo.conf (promocao.bomcustoilhabela.com.br) -> 127.0.0.1:3100"
---

<objective>
Criar o microsite de sorteio do Dia das Criancas como sub-projeto standalone `promo/` dentro deste
repositorio: a pagina React do arquivo de referencia, um backend minimo que persiste o cadastro
(nome, telefone, NFC-e) vinculado ao numero do cupom lido de `?id=NNNN` (D-04), banco SQLite proprio
e dedicado (D-02) e empacotamento Docker (D-03) para publicar em
https://promocao.bomcustoilhabela.com.br/.

Purpose: transformar o mock aprovado (que grava numa API de sandbox que nao existe em producao) num
servico real de captacao de cupons do sorteio, sem tocar no app de orcamento nem no Athos (D-01).

Output: pasta `promo/` autocontida (frontend Vite+React, servidor Node com zero dependencias de
runtime, banco SQLite, testes) + `promo/Dockerfile` + `deploy/docker-compose.promo.yml` +
`deploy/nginx-promo.conf`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Arquivo de referencia (FORA do repositorio, 836 KB, 538 linhas — NAO abrir inteiro):
`D:/Download/sorteio-final.jsx`

Mapa estrutural ja levantado e conferido deste arquivo (use para navegar; nao releia o arquivo todo):
- linha 1: `import { useState, useEffect } from "react"`
- linha 3: `const IG_URL` (Instagram da loja)
- linhas 5-15: objeto `IMG` com 9 chaves, nesta ordem — BG, LOGO, SUN, CLOUD1, CLOUD2, PINWHEEL,
  BOAT, RAINBOW, BIKE — cada valor e um PNG embutido em base64 (todos os 9 confirmados como PNG).
  **As linhas 6 a 14 tem entre 9.955 e 362.175 caracteres cada. Nunca leia essas linhas com a
  ferramenta Read.**
- linhas 17-158: `export default function App()`:
  - 18-19: leitura do query param (`params.get("id") || params.get("cupom") || "0000"`)
  - 21-25: estados nome, telefone, nfce, showRegras, error
  - 27-31: `useEffect` que zera margem do body e pinta o fundo `#A8EEC1`
  - 33-45: `handleSubmit` — valida nome e telefone e persiste no storage do sandbox; hoje chama
    `setShowRegras(true)` mesmo quando a gravacao falha (o `catch {}` engole o erro)
  - 47-49: `irParaInstagram`
  - 51-57: `REGRAS` (4 itens) e `REGRAS_CORES`
  - 59-157: JSX — decoracoes, logo, letras de SORTEIO, banner, `prizeCard`, `card` com
    `cupomLabel`/`cupomBox`/`cupomNum`, 3 inputs, `{error && ...}`, botao Enviar
  - 128-155: popup de regras (`overlay`, `popup`, `regraRow`, `igBtnFull`)
- linhas 160-538: objeto `st` com 45 chaves de estilo inline. As que este plano toca ou referencia:
  `page` (linha 161, consome `IMG.BG` dentro de um `url(...)` de CSS), `cupomLabel` (178),
  `cupomBox` (184), `cupomNum` (190), `input` (205), `error` (217), `submitBtn` (223).

Contexto do repositorio (conferido):
- Node desta maquina: v24.14.1. `node:sqlite` funciona sem flag, e uma violacao de UNIQUE lanca erro
  com `code` `ERR_SQLITE_ERROR`, `errcode` 2067 e mensagem citando `UNIQUE constraint failed`.
- O `package.json` da raiz declara `workspaces: ["apps/*", "packages/*"]`; existem `apps/backend`,
  `apps/frontend`, `packages/shared` e um `package-lock.json` de 370 KB na raiz.
- Portas ja publicadas no host pelo compose de producao: 3001, 4001, 5435. A porta 3100 esta livre.
- `deploy/nginx.conf` tem um unico server block `listen 80; server_name _;` (catch-all do app de
  orcamento). Um server block com `server_name` nomeado tem precedencia sobre o default `_`, entao o
  host do sorteio pode ser adicionado em ARQUIVO SEPARADO sem editar `deploy/nginx.conf`.

Identidade visual: a pagina de sorteio TEM design proprio ja aprovado pelo usuario (paleta de festa
infantil, fundo `#A8EEC1`, letras coloridas de SORTEIO). **Nao aplicar o tema "Painel" da skill de
projeto `bom-custo-design`** — aquela skill governa o app interno de orcamento, nao este microsite
promocional. Preservar o visual do arquivo de referencia byte a byte, exceto onde este plano manda
alterar.
</context>

<decisions>
Decisoes travadas antes do planejamento (NAO revisitar):

- **D-01**: o sorteio mora no MESMO repositorio, como sub-projeto/pasta separada — nao misturado ao
  codigo do app de orcamento.
- **D-02**: banco novo, simples e dedicado ao sorteio — SEM integracao com o Athos/Postgres atual.
- **D-03**: deploy via Docker, servico standalone, servido em https://promocao.bomcustoilhabela.com.br/.
- **D-04**: os QR codes sequenciais sao gerados externamente pelo usuario; a pagina apenas le o
  numero do cupom do query param `?id=NNNN` (aceitando tambem `?cupom=NNNN`).
- **D-05**: o cupom fisico (numero + QR impressos) e produzido pelo usuario — nao gerar PDF nem
  gerador de impressao.

Discricao do Claude (escolhas tecnicas deste plano, justificadas nas tasks):
- Frontend: Vite + React — preserva o JSX de referencia sem transcricao manual (o arquivo e copiado,
  nao reescrito).
- Banco: modulo nativo `node:sqlite` — atende D-02 com zero dependencia nativa e zero container de
  banco extra. Evita deliberadamente `better-sqlite3`, que exigiria python3/make/g++ no estagio de
  build Alpine.
- Servidor: `node:http` puro com mapa de estaticos montado no boot — **zero dependencias de
  runtime** (sem Express), o que tambem elimina path traversal por construcao.
- Extras justificados por producao: extracao dos PNGs base64 para arquivos reais, export CSV com
  token, rate limit em memoria.

Fora de escopo (deferido de proposito, nao esquecido): painel web de administracao (o export CSV
cobre o sorteio), autenticacao de operador com usuario/senha (token basta), envio de mensagem ao
participante, geracao de QR code ou PDF do cupom (D-05), qualquer leitura ou escrita no Athos (D-02).
</decisions>

<requirements_map>
| ID | Requisito |
|----|-----------|
| PROMO-01 | Visitante le o cupom do QR (`?id=NNNN`), preenche nome/telefone/NFC-e e o cadastro fica persistido |
| PROMO-02 | Um cupom so pode ser cadastrado uma vez; id ausente/invalido bloqueia o envio |
| PROMO-03 | Operador consegue extrair todos os cadastros para o sorteio, protegido por token |
| PROMO-04 | Servico roda em container Docker standalone com banco persistente, sem tocar no app de orcamento |
</requirements_map>

<!-- planner-discipline-allow: data:image/png;base64, window.storage, storage.set(, storage.get( -->

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 1: Gate de legitimidade dos pacotes npm</name>
  <what-built>
Nada foi instalado ainda — este gate vem ANTES do primeiro `npm install`. Nenhuma pesquisa
(RESEARCH.md) foi executada para esta tarefa, portanto nao existe tabela de Package Legitimacy Audit e
todos os pacotes a instalar valem como [ASSUMED] (T-hhi-SC). Os 4 pacotes propostos entram todos como
devDependencies; o runtime do servidor fica com zero dependencias.
  </what-built>
  <how-to-verify>
Abrir as 4 paginas oficiais do npm e confirmar cada pacote:

1. `vite` — https://www.npmjs.com/package/vite
2. `@vitejs/plugin-react` — https://www.npmjs.com/package/@vitejs/plugin-react
3. `react` — https://www.npmjs.com/package/react
4. `react-dom` — https://www.npmjs.com/package/react-dom

O que conferir em cada pagina: nome escrito exatamente como acima (atencao a typosquatting no escopo
`@vitejs/`), publisher esperado (vitejs para os dois primeiros, meta/react para os dois ultimos),
volume de downloads semanal na casa dos milhoes e ultima publicacao recente. Este checkpoint NAO e
auto-aprovavel, mesmo com auto_advance ligado.
  </how-to-verify>
  <resume-signal>Digite "aprovado" para liberar a instalacao dos 4 pacotes, ou aponte qual pacote esta errado/rejeitado — neste caso parar e reportar em vez de instalar.</resume-signal>
</task>

<task type="tracer" tdd="true">
  <name>Task 2: Caminho ponta-a-ponta "cupom cadastrado" — um unico fluxo</name>
  <precondition>O arquivo de referencia `D:/Download/sorteio-final.jsx` existe e e legivel; o registro npm esta acessivel para instalar os 4 devDependencies aprovados na Task 1; `node --version` reporta 24.x ou superior.</precondition>
  <files>promo/package.json, promo/package-lock.json, promo/.gitignore, promo/index.html, promo/vite.config.js, promo/src/main.jsx, promo/src/App.jsx, promo/public/img/, promo/scripts/extract-images.mjs, promo/scripts/check.mjs, promo/server/index.js, promo/server/index.test.js</files>
  <reversibility rating="reversible">Trocar `node:sqlite` por outro driver (better-sqlite3, pg) exige mexer num unico modulo de acesso a dados; o schema e trivial e o volume de dados e pequeno.</reversibility>
  <behavior>
    - POST /api/cadastro com cupom/nome/telefone validos responde 201 e grava exatamente 1 linha no arquivo SQLite
    - GET / responde 200 com o HTML que referencia o bundle gerado pelo Vite
    - GET /caminho-inexistente responde 404
    - O banco e criado sozinho no boot (schema idempotente) no caminho de PROMO_DB_PATH, e reabrir o mesmo arquivo nao duplica schema nem dados
  </behavior>
  <action>
Criar o sub-projeto `promo/` na RAIZ do repositorio — deliberadamente FORA de `apps/` e de
`packages/`, porque o `package.json` da raiz declara os workspaces `apps/*` e `packages/*`: colocar o
sorteio dentro de `apps/` o transformaria em workspace, alteraria o `package-lock.json` da raiz e
quebraria o estagio `npm ci` dos Dockerfiles existentes de backend e frontend. Pasta separada no topo
atende D-01 sem risco para o app de orcamento. Instalar as dependencias entrando na pasta
(`cd promo && npm install`) e conferir que o lockfile criado foi `promo/package-lock.json`, nunca o da
raiz.

`promo/package.json`: nome `promo-sorteio`, `private: true`, `type: module`, `engines.node` `>=24`,
nenhuma dependency de runtime, devDependencies apenas os 4 pacotes aprovados na Task 1, e scripts
`dev` (vite), `build` (vite build), `start` (node server/index.js), `test` (`node --test server/`),
`extract-images` (node scripts/extract-images.mjs) e `check` (node scripts/check.mjs). O piso de Node
24 e proposital: o modulo nativo de SQLite exigia flag experimental nas versoes 22.5 a 23.3 e passou a
funcionar sem flag depois disso — nao rebaixar esse piso nem a imagem base do Docker da Task 4.

`promo/.gitignore`: `node_modules/`, `dist/`, `data/`, `.env`. O `promo/package-lock.json` DEVE ser
commitado.

`promo/index.html` + `promo/src/main.jsx`: entrypoint Vite padrao (div#root, createRoot, StrictMode),
`lang="pt-BR"`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, title
"Sorteio Dia das Criancas — Bom Custo" e `<meta name="theme-color" content="#A8EEC1">`.
`promo/vite.config.js`: plugin react e `server.proxy` de `/api` para `http://localhost:3100`, para o
`npm run dev` conversar com o servidor local.

Portar a pagina: copiar o arquivo de referencia para `promo/src/App.jsx` com um comando de copia de
arquivo (`cp "D:/Download/sorteio-final.jsx" promo/src/App.jsx`). **Nunca abrir o arquivo de
referencia com a ferramenta Read nem recriar seu conteudo manualmente** — as linhas 6 a 14 tem
centenas de milhares de caracteres de PNG embutido e estourariam o contexto. Todas as alteracoes
seguintes sao edicoes cirurgicas sobre a copia, localizadas pelos numeros de linha do mapa estrutural
da secao `<context>`.

Escrever `promo/scripts/extract-images.mjs` e roda-lo uma vez: o script le `promo/src/App.jsx`,
localiza o objeto `IMG`, e para cada uma das 9 chaves (BG, LOGO, SUN, CLOUD1, CLOUD2, PINWHEEL, BOAT,
RAINBOW, BIKE) decodifica o payload base64 gravando `promo/public/img/<chave-minuscula>.png`, e
reescreve o objeto IMG no JSX para que cada valor passe a ser a string do caminho servido
(`/img/bg.png`, `/img/logo.png`, etc). Atencao: o valor de BG e consumido dentro de um `url(...)` de
CSS em `st.page` (linha 161), e um caminho absoluto funciona ali sem nenhuma outra mudanca. O script
precisa: ser idempotente (se os valores ja forem caminhos, nao fazer nada e sair 0); jamais imprimir o
base64 em stdout; e falhar com codigo nao-zero se alguma das 9 chaves faltar, se algum PNG gravado
tiver menos de 1 KB ou se os primeiros 8 bytes nao forem a assinatura PNG. Motivo da extracao: sem ela
o bundle JS passaria de 800 KB so de imagem embutida, matando o carregamento no 4G da loja; com
arquivos separados o JS fica pequeno e as imagens cacheiam e baixam em paralelo.

Substituir o corpo de `handleSubmit` (linhas 33-45 da copia) pela chamada real ao backend: manter as
duas validacoes locais de nome e telefone e o `setError("")`, e trocar a persistencia de sandbox (as
linhas que usam o helper `window.storage` — `storage.set(` e `storage.get(`, nas linhas 39 a 42 do
arquivo original) por um `fetch` POST para `/api/cadastro` com `Content-Type: application/json` e
corpo `{ cupom, nome, telefone, nfce }` (valores com trim). Corrigir de passagem o defeito do mock: o
popup de regras NAO pode mais abrir quando a gravacao falha. Nesta task o tratamento cobre apenas o
caminho feliz mais um erro generico: resposta 201 chama `setShowRegras(true)`; qualquer outro status ou
falha de rede chama `setError` com "Nao foi possivel enviar. Tente novamente." (a diferenciacao de
409/400/429 entra na Task 3). Adicionar estado `enviando` e usa-lo em `disabled` do botao Enviar para
impedir duplo clique. O objeto `st` de estilos, o JSX e o popup de regras ficam intocados.

Escrever `promo/server/index.js` — servidor com `node:http`, `node:sqlite` e `node:fs`, sem nenhuma
dependencia externa. Boot: ler `PORT` (default 3100) e `PROMO_DB_PATH` (default `./data/promo.db`),
criar o diretorio do banco se faltar, abrir o SQLite com `DatabaseSync`, aplicar
`PRAGMA journal_mode = WAL` e `PRAGMA busy_timeout = 5000`, e executar o schema idempotente
`CREATE TABLE IF NOT EXISTS cadastro` com colunas id (INTEGER PRIMARY KEY AUTOINCREMENT), cupom (TEXT
NOT NULL UNIQUE), nome (TEXT NOT NULL), telefone (TEXT NOT NULL), nfce (TEXT), ip (TEXT) e criado_em
(TEXT NOT NULL) — a restricao UNIQUE em cupom e o que garante a prevencao de duplicidade de
PROMO-02 no nivel do banco, mesmo sob corrida. Rotas: `POST /api/cadastro` le o corpo com limite duro
de 4096 bytes (abortar com 413 se passar, T-hhi-06), faz `JSON.parse` protegido, insere e responde 201
`{ ok: true, cupom }`; qualquer outro metodo em `/api/cadastro` responde 405. Estaticos: no boot,
percorrer recursivamente `promo/dist` uma unica vez e montar um Map de rota exata -> caminho absoluto +
content-type (html, js, css, png, svg, ico, webmanifest, woff2; default application/octet-stream),
mapeando `/` para index.html; requisicoes resolvem por consulta exata nesse Map e qualquer rota ausente
responde 404 — como nenhum caminho de arquivo e derivado da requisicao, path traversal fica impossivel
por construcao (T-hhi-05). Se `promo/dist` nao existir, logar aviso e servir apenas a API (permite
rodar os testes antes do build). Exportar uma funcao `createServer({ dbPath })` alem do arranque via
CLI, para o teste subir instancias isoladas.

Escrever `promo/server/index.test.js` com `node:test` (built-in): subir o servidor em porta efemera
com um `PROMO_DB_PATH` dentro de um diretorio temporario, e cobrir os quatro comportamentos declarados
em `<behavior>` — POST valido retorna 201 e a consulta SQL direta no arquivo mostra exatamente 1 linha
com cupom/nome/telefone gravados; GET / retorna 200 e o HTML cita o bundle; rota inexistente retorna
404; reabrir o mesmo arquivo de banco nao duplica schema nem dados. Limpar o diretorio temporario no
teardown.

Escrever `promo/scripts/check.mjs`, um verificador de gates que recebe o modo como primeiro argumento
(`node scripts/check.mjs tracer`), aceitando os modos `tracer`, `hardening` e `deploy` — os dois
ultimos sao preenchidos nas Tasks 3 e 4 e nesta task podem sair 0 sem asserir nada. Motivo de existir
um script de verificacao em vez de one-liners de
shell: as asercoes precisam procurar literais com barras, aspas e dois-pontos dentro de arquivos, e
isso nao sobrevive a citacao de shell no Windows. O modo `tracer` deve asserir, falhando com codigo
nao-zero e mensagem em portugues: existem exatamente 9 arquivos em `promo/public/img`, todos com no
minimo 1 KB e assinatura PNG valida nos 8 primeiros bytes; em `promo/src/App.jsx`, ignoradas as linhas
de comentario, nao resta nenhuma ocorrencia dos literais de data URI de PNG nem do helper de storage do
sandbox (`window.storage`, `storage.set(`, `storage.get(`); e `promo/src/App.jsx` contem um `fetch`
para `/api/cadastro`.
  </action>
  <verify>
    <automated>npm --prefix promo run build &amp;&amp; npm --prefix promo test &amp;&amp; node promo/scripts/check.mjs tracer &amp;&amp; git diff --quiet -- package.json package-lock.json</automated>
  </verify>
  <done>`promo/dist` e gerado pelo Vite; os testes passam provando 201 + exatamente 1 linha persistida + HTML servido + 404 + schema idempotente; `node promo/scripts/check.mjs tracer` passa (9 PNGs validos, nenhum data URI nem helper de storage de sandbox restante no App.jsx, POST /api/cadastro presente); `package.json` e `package-lock.json` da raiz sem diff nenhum (D-01).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Validacao, cupom unico, guarda de id invalido e export CSV</name>
  <files>promo/server/validate.js, promo/server/csv.js, promo/server/index.js, promo/server/validate.test.js, promo/server/index.test.js, promo/src/App.jsx, promo/.env.example, promo/scripts/check.mjs</files>
  <behavior>
    - cupom fora de `^\d{1,10}$`, ou numericamente zero, responde 400 com campo `cupom`
    - nome com menos de 2 ou mais de 80 caracteres responde 400 com campo `nome`
    - telefone que nao reduz a 10 ou 11 digitos responde 400 com campo `telefone`
    - nfce acima de 44 caracteres ou com caractere fora de digito/espaco/hifen responde 400 com campo `nfce`
    - segundo POST com o mesmo cupom responde 409 `cupom_ja_cadastrado` e o banco segue com exatamente 1 linha
    - acima de 10 POSTs da mesma origem em 10 minutos responde 429
    - GET /api/cadastros.csv sem token responde 401; com token correto responde 200 text/csv com cabecalho e linhas; com PROMO_ADMIN_TOKEN ausente no servidor responde 503
    - celula de CSV cujo primeiro caractere e sinal de igual, mais, menos ou arroba sai prefixada por apostrofo
  </behavior>
  <action>
Extrair a validacao para `promo/server/validate.js` como funcao pura `validarCadastro(body)` que
devolve `{ ok: true, valor }` ou `{ ok: false, campo, erro }`, testavel sem HTTP. Regras: `cupom` e
feito trim, precisa casar `^\d{1,10}$` e nao ser numericamente zero — a rejeicao do zero existe porque
o mock de referencia usava o literal de quatro zeros como default quando o query param faltava (linha
19), e sem essa guarda quem abrisse a URL nua cadastraria um cupom fantasma (D-04); `nome` com trim
entre 2 e 80 caracteres; `telefone` reduzido a somente digitos precisa ter 10 ou 11 digitos (DDD +
fixo ou celular) e e ARMAZENADO nessa forma canonica de digitos, o que simplifica o sorteio e a
deduplicacao manual depois; `nfce` e opcional, com trim, no maximo 44 caracteres e aceitando apenas
digitos, espacos e hifens. Ligar `validarCadastro` no POST antes do insert, respondendo 400
`{ ok: false, error: 'dados_invalidos', campo }`.

Duplicidade (PROMO-02): antes do insert, consultar `SELECT 1 FROM cadastro WHERE cupom = ?` e responder
409 `{ ok: false, error: 'cupom_ja_cadastrado' }`; adicionalmente envolver o insert em try/catch e
tratar como o mesmo 409 quando o erro do SQLite indicar violacao de restricao UNIQUE. O pre-check cobre
o caso comum e o catch fecha a janela de corrida entre dois leitores do mesmo QR code. Conferido nesta
maquina: o modulo nativo de SQLite lanca um erro cujo `code` e generico (`ERR_SQLITE_ERROR`), com
`errcode` 2067 e mensagem citando `UNIQUE constraint failed` — a deteccao deve olhar `errcode` ou a
mensagem, nunca apenas o `code`.

Rate limit (T-hhi-01): Map em memoria de origem -> `{ count, windowStart }`, janela fixa de 10 minutos
e teto de 10 POSTs, respondendo 429 `{ ok: false, error: 'muitas_tentativas' }`. Limitar o Map a 5000
chaves, descartando entradas com janela expirada antes de inserir nova — um limitador que cresce sem
teto seria ele mesmo um vetor de exaustao de memoria. Resolucao da origem: usar o endereco do socket por
padrao e so considerar o primeiro salto de `x-forwarded-for` quando a env `TRUST_PROXY` estiver ligada,
porque atras do nginx o header e confiavel mas exposto direto ele seria forjado para furar o limite
(T-hhi-02).

Export para o sorteio (PROMO-03): extrair para `promo/server/csv.js` as funcoes puras de montagem
(`escaparCelula` e `montarCsv`) e escrever a rota `GET /api/cadastros.csv` em `index.js` aceitando o
segredo via header `x-admin-token` ou via query `token` (o navegador do operador nao manda header).
Comparar com `PROMO_ADMIN_TOKEN` passando ambos por SHA-256 e usando `crypto.timingSafeEqual` sobre os
digests — tamanho fixo, evita vazamento por tempo e o erro de buffers de tamanhos diferentes. Se a env
nao estiver definida, responder 503: falha fechada, nunca liberar a lista de nomes e telefones por
esquecimento de configuracao (T-hhi-04). Resposta `text/csv; charset=utf-8` com
`Content-Disposition: attachment`, BOM UTF-8 no inicio (para o Excel pt-BR abrir os acentos certos),
cabecalho `cupom,nome,telefone,nfce,criado_em` e escape RFC4180 (aspas duplicadas, campo entre aspas
quando tiver virgula, aspas ou quebra de linha). Antes do escape, prefixar a celula com um apostrofo
quando o primeiro caractere for igual, mais, menos, arroba, tab ou CR — sem isso um nome digitado no
formulario publico executaria como formula ao abrir a planilha do sorteio (T-hhi-03).

Frontend: no corpo do componente, derivar `cupomValido` testando `^\d{1,10}$` e valor nao-zero sobre o
`cupomId` lido do query param, e trocar o default do `cupomId` (linha 19) de quatro zeros para string
vazia. Quando invalido: renderizar o caractere travessao no lugar do numero dentro de `st.cupomBox`,
mostrar aviso inline usando o estilo `st.error` ja existente com o texto "Cupom nao identificado.
Acesse pela leitura do QR code do seu cupom." e deixar o botao Enviar `disabled`. Ampliar o tratamento
de resposta do `handleSubmit`: 201 abre o popup; 409 chama setError com "Este cupom ja foi
cadastrado."; 400 chama setError com mensagem especifica por campo; 429 com "Muitas tentativas. Aguarde
alguns minutos."; demais casos mantem a mensagem generica da Task 2. Nenhuma chave do objeto `st` e
alterada ou removida.

`promo/.env.example`: documentar PORT, PROMO_DB_PATH, PROMO_ADMIN_TOKEN e TRUST_PROXY com comentarios
em portugues e sem nenhum valor real de segredo.

Testes: criar `promo/server/validate.test.js` com testes unitarios diretos de `validarCadastro` (um por
regra, incluindo o cupom zerado) e de `escaparCelula`/`montarCsv` (incluindo a celula que comeca com
sinal de igual e a celula que contem virgula e aspas). Estender `promo/server/index.test.js` cobrindo os
oito comportamentos HTTP declarados em `<behavior>`, com o teste de 409 conferindo por SQL que o banco
continua com exatamente 1 linha, e os testes de CSV subindo instancias com e sem `PROMO_ADMIN_TOKEN`
definido.

Preencher o modo `hardening` de `promo/scripts/check.mjs`, asserindo sobre `promo/server/index.js`
(ignoradas as linhas de comentario) a presenca dos status 409, 429, 401 e 503, de `timingSafeEqual` e
do tratamento de `x-forwarded-for`; sobre `promo/src/App.jsx` a presenca de `cupomValido` e a ausencia
do default de cupom zerado no `params.get`; e sobre `promo/.env.example` a presenca de
`PROMO_ADMIN_TOKEN` e `TRUST_PROXY`.
  </action>
  <verify>
    <automated>npm --prefix promo test &amp;&amp; node promo/scripts/check.mjs hardening</automated>
  </verify>
  <done>Todos os oito comportamentos HTTP e os testes unitarios de validacao e de CSV passam; `node promo/scripts/check.mjs hardening` passa; o segundo POST do mesmo cupom responde 409 com o banco ainda em 1 linha (PROMO-02); o CSV exige token e falha fechada em 503 sem env (PROMO-03); abrir a pagina sem id valido bloqueia o botao Enviar.</done>
</task>

<task type="auto">
  <name>Task 4: Empacotamento Docker, publicacao no dominio e README de operacao</name>
  <files>promo/Dockerfile, promo/.dockerignore, deploy/docker-compose.promo.yml, deploy/nginx-promo.conf, promo/README.md, promo/scripts/check.mjs</files>
  <reversibility rating="reversible">Compose e nginx do sorteio ficam em arquivos novos e separados; remover o microsite e apagar 2 arquivos de deploy e parar 1 container, sem tocar no stack do app de orcamento.</reversibility>
  <action>
`promo/Dockerfile` em dois estagios, ambos a partir de `node:24-alpine` (nao rebaixar a base: o piso de
Node 24 e o que permite usar o SQLite nativo sem flag experimental). Estagio `build`: copiar
`package.json` + `package-lock.json`, rodar `npm ci`, copiar o resto e rodar `npm run build`. Estagio
runtime: copiar apenas `server/`, `package.json` e o `dist/` produzido pelo estagio de build — **sem
nenhum `npm ci` nem `node_modules` no runtime**, porque o servidor nao tem dependencia de runtime
alguma; essa e a recompensa direta de ter escolhido `node:http` + `node:sqlite`. Definir
`ENV NODE_ENV=production PORT=3100 PROMO_DB_PATH=/data/promo.db`, criar `/data`, rodar como usuario
`node` (nao root) com `/data` pertencendo a ele, `EXPOSE 3100`, `HEALTHCHECK` batendo numa rota
`/api/health` (adicionar essa rota no servidor: responde 200 `{ ok: true }` e nao toca no banco) e
`CMD ["node", "server/index.js"]`.

`promo/.dockerignore`: `node_modules`, `dist`, `data`, `.env`, `.git`, `*.md`, `scripts`.

`deploy/docker-compose.promo.yml`: arquivo NOVO e independente — nao editar
`deploy/docker-compose.vps.yml` nem `deploy/docker-compose.box.vps.yml`, e nao juntar o sorteio na rede
`app_net` do stack de orcamento; D-03 pede servico standalone e o isolamento e o que garante que uma
falha do microsite promocional nunca derrube o faturamento. Um servico `promo`: `build: ../promo`,
`container_name: promo-sorteio`, `restart: always`, `env_file: ./promo.env`, porta
`"127.0.0.1:3100:3100"` (bind apenas em loopback — quem expoe na internet e o nginx, com TLS; publicar
em 0.0.0.0 entregaria a API em HTTP puro), volume nomeado `promo_data:/data` (PROMO-04: o banco
sobrevive a rebuild da imagem) e `TRUST_PROXY=1` no ambiente, coerente com estar atras do nginx.
Documentar no topo do arquivo, em comentario, que `deploy/promo.env` e criado a mao a partir de
`promo/.env.example` com o `PROMO_ADMIN_TOKEN` real e NAO e versionado.

`deploy/nginx-promo.conf`: arquivo NOVO com o server block de
`server_name promocao.bomcustoilhabela.com.br` fazendo `proxy_pass http://127.0.0.1:3100` com
`proxy_set_header Host`, `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto`. Nao editar
`deploy/nginx.conf`: seu server block e o catch-all `server_name _` do app de orcamento, e um
`server_name` nomeado tem precedencia sobre o default no roteamento do nginx, entao os dois coexistem
sem conflito. Deixar em comentario no arquivo que as diretivas de TLS sao inseridas pelo certbot
(`certbot --nginx -d promocao.bomcustoilhabela.com.br`) e que `client_max_body_size 8k` na location
`/api/` casa com o limite de corpo do servidor.

`promo/README.md`: pagina unica de operacao, em portugues, cobrindo — o que o microsite e e onde e
servido (D-03); rodar local (`npm install`, `npm run dev` + `npm start` em dois terminais); as 4 envs;
o formato da URL do QR code `https://promocao.bomcustoilhabela.com.br/?id=NNNN`, deixando explicito que
os QR codes e os cupons impressos sao gerados pelo usuario fora do sistema (D-04, D-05); como o
operador baixa a lista para o sorteio (URL do CSV com `?token=`, e o aviso de que esse link contem o
segredo e nao deve circular); como subir e atualizar em producao
(`docker compose -f deploy/docker-compose.promo.yml up -d --build`); onde o banco vive (volume
`promo_data`, arquivo `/data/promo.db`) e como copia-lo para backup antes do sorteio; e a declaracao de
que este servico nao le nem escreve nada no Athos e nao compartilha banco com o app de orcamento
(D-01, D-02).

Preencher o modo `deploy` de `promo/scripts/check.mjs` asserindo: `promo/Dockerfile` tem dois estagios
`FROM`, base `node:24-alpine`, `USER node` e nenhum `npm ci` depois da linha do estagio runtime;
`deploy/docker-compose.promo.yml` cita `promo_data`, faz bind em `127.0.0.1:3100` e referencia
`promo.env`; `deploy/nginx-promo.conf` cita `promocao.bomcustoilhabela.com.br` e `127.0.0.1:3100`;
`promo/README.md` cita `?id=` e `cadastros.csv`; e `deploy/nginx.conf`,
`deploy/docker-compose.vps.yml` e `deploy/docker-compose.box.vps.yml` estao sem diff no git (guarda de
D-01 no lado do deploy).
  </action>
  <verify>
    <automated>node promo/scripts/check.mjs deploy &amp;&amp; git diff --quiet -- package.json package-lock.json deploy/nginx.conf deploy/docker-compose.vps.yml deploy/docker-compose.box.vps.yml &amp;&amp; npm --prefix promo test</automated>
    <human-check>Com `docker compose -f deploy/docker-compose.promo.yml up -d --build` rodando na VPS e o DNS/TLS do host publicados: (1) abrir https://promocao.bomcustoilhabela.com.br/?id=1234 num celular e confirmar que o layout de festa infantil aparece igual ao mock aprovado, com as 9 imagens carregando e 1234 no box "Seu Cupom"; (2) enviar o formulario e ver o popup de regras com o botao do Instagram; (3) reenviar o MESMO ?id=1234 e ver a mensagem de cupom ja cadastrado; (4) abrir a URL sem `?id` e confirmar o aviso inline com o botao Enviar bloqueado; (5) baixar o CSV com o token e abrir no Excel conferindo acentos e as linhas cadastradas; (6) `docker compose ... down` seguido de `up -d` e confirmar que os cadastros continuam no CSV (volume persistente).</human-check>
  </verify>
  <done>A imagem sobe servindo o site e a API na porta 3100 em loopback, com o banco em volume nomeado persistente; o CSV e baixavel com token; nenhum arquivo de deploy ou de dependencia do app de orcamento tem diff; `node promo/scripts/check.mjs deploy` passa; os 6 pontos do human-check foram confirmados pelo operador (ou registrados como pendentes de ambiente, com o motivo, se a VPS/DNS ainda nao estiver pronta).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| internet -> nginx -> servidor promo | Formulario 100% publico, sem login: qualquer pessoa com a URL posta dados |
| query param do QR -> aplicacao | O numero do cupom vem do cliente e nunca deve ser tratado como confiavel |
| operador -> GET /api/cadastros.csv | Unica superficie de leitura em massa de nomes e telefones (dado pessoal) |
| planilha do sorteio -> Excel do operador | Conteudo digitado por estranhos e renderizado numa ferramenta que executa formulas |
| registro npm -> estagio de build | 4 devDependencies entram na imagem de build |
| container promo -> host | Banco SQLite em volume montado; nenhuma conexao com o Athos ou com o Postgres do orcamento |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-hhi-01 | Denial of Service | POST /api/cadastro | high | mitigate | Rate limit em memoria de 10 POSTs por origem a cada 10 min (429), com o proprio Map limitado a 5000 chaves e poda de janelas expiradas (Task 3) |
| T-hhi-02 | Spoofing | resolucao de IP do rate limiter | medium | mitigate | `x-forwarded-for` so e considerado quando `TRUST_PROXY` esta ligado; default usa o endereco do socket (Task 3) |
| T-hhi-03 | Tampering | CSV aberto no Excel do operador | high | mitigate | Celula iniciada por `=`, `+`, `-`, `@`, tab ou CR recebe prefixo de apostrofo antes do escape RFC4180 (Task 3) |
| T-hhi-04 | Information Disclosure | GET /api/cadastros.csv | critical | mitigate | Token comparado por SHA-256 + `timingSafeEqual`; 401 sem token e 503 fail-closed quando `PROMO_ADMIN_TOKEN` nao esta configurado (Task 3) |
| T-hhi-05 | Information Disclosure | servidor de arquivos estaticos | high | mitigate | Map de rotas exatas montado no boot; nenhum caminho de arquivo derivado da requisicao, rota ausente responde 404 (Task 2) |
| T-hhi-06 | Denial of Service | leitura do corpo da requisicao | medium | mitigate | Limite duro de 4096 bytes com 413, mais `client_max_body_size 8k` no nginx (Tasks 2 e 4) |
| T-hhi-07 | Tampering | cupom vindo do query param | high | mitigate | `validarCadastro` exige `^\d{1,10}$` nao-zero; UNIQUE(cupom) no schema impede segundo cadastro mesmo sob corrida (Tasks 2 e 3) |
| T-hhi-08 | Information Disclosure | trafego do formulario | high | transfer | TLS terminado no nginx via certbot; container publica so em `127.0.0.1` (Task 4 + user_setup) |
| T-hhi-09 | Elevation of Privilege | processo do container | medium | mitigate | Estagio runtime roda como `USER node`, sem `node_modules` e sem toolchain de build (Task 4) |
| T-hhi-10 | Repudiation | origem de um cadastro contestado | low | accept | Grava-se `ip` e `criado_em` por linha; um sorteio promocional de bairro nao justifica trilha de auditoria assinada |
| T-hhi-SC | Tampering | npm installs (4 devDependencies) | high | mitigate | Gate de legitimidade de pacote com checkpoint humano bloqueante antes de instalar (Task 1); nenhum pacote no runtime |
</threat_model>

<verification>
- `npm --prefix promo run build` gera `promo/dist` sem erro
- `npm --prefix promo test` passa (testes HTTP de `index.test.js` + unitarios de `validate.test.js`)
- `node promo/scripts/check.mjs tracer`, `... hardening` e `... deploy` passam
- `git diff --quiet -- package.json package-lock.json deploy/nginx.conf deploy/docker-compose.vps.yml deploy/docker-compose.box.vps.yml` — nenhum arquivo do app de orcamento alterado (D-01)
- `promo/public/img` tem 9 PNGs validos e `promo/src/App.jsx` nao tem mais data URI nem chamada de storage de sandbox
- human-check de producao da Task 4 (6 pontos) confirmado ou registrado como pendente de ambiente
</verification>

<success_criteria>
- Visitante abre a URL do QR com `?id=NNNN`, ve o numero no box "Seu Cupom", envia nome/telefone/NFC-e e o cadastro fica persistido no SQLite dedicado, com o popup de regras + Instagram aparecendo somente em caso de sucesso real (PROMO-01)
- Um segundo envio do mesmo cupom responde 409 e o banco continua com 1 linha; abrir sem id valido bloqueia o envio (PROMO-02)
- Operador baixa o CSV completo apresentando `PROMO_ADMIN_TOKEN`, com acentos corretos no Excel e sem risco de formula (PROMO-03)
- Servico sobe por `docker compose -f deploy/docker-compose.promo.yml up -d --build`, banco em volume persistente, servido em https://promocao.bomcustoilhabela.com.br/ via nginx + TLS (PROMO-04, D-03)
- Zero mudanca no app de orcamento: nenhum novo workspace npm, lockfile da raiz e arquivos de deploy existentes sem diff, nenhuma conexao com o Athos (D-01, D-02)
</success_criteria>

<output>
Create `.planning/quick/260913-hhi-criar-pagina-de-sorteio-baseada-em-d-dow/260913-hhi-SUMMARY.md` when done
</output>
