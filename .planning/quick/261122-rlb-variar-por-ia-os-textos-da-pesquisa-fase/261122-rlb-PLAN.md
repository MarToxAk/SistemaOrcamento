---
phase: quick-261122-rlb-variar-por-ia-os-textos-da-pesquisa-fase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/modules/pesquisa/pesquisa-variacao.ts
  - apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa-variacao.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-variacao.env.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa.module.ts
  - apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa.service.test.ts
  - deploy/docker-compose.vps.yml
  - deploy/docker-compose.box.vps.yml
  - deploy/stack.env.example
autonomous: true
requirements: [QUICK-261122-rlb]
must_haves:
  truths:
    - "Com a IA configurada e a variacao aprovada, o bloco do fechamento, a mensagem do cupom e o convite do Google saem com o texto variado, e link unico, codigo do cupom e link do Google reais entram so depois da variacao (renderizarTexto roda sobre o modelo variado)."
    - "O payload enviado a IA contem apenas o modelo com os placeholders ainda crus: nenhum link unico, codigo de cupom, telefone, nome de cliente ou token de pesquisa sai do sistema."
    - "IA nao configurada, flag desligada (false/0/off), timeout de 8 s, erro de chamada, resposta vazia ou validacao reprovada => o texto original da config e usado, sem lancar excecao e sem atrasar o envio alem do timeout."
    - "Uma variacao que perde ou duplica placeholder, remove a palavra SAIR do opt-out, cria URL ou numero novo, foge de 0,5x a 1,8x do tamanho, vem entre aspas/markdown ou viola as regras de validarTextoMensagem e descartada."
    - "Re-tentativa de envio incerto (status ENVIANDO) do cupom e do convite nao duplica a mensagem mesmo quando o texto variado da re-tentativa difere do ja enviado (conferencia por marcador estavel, nao so por texto)."
    - "Os construtores existentes de PesquisaService com 5 argumentos posicionais continuam funcionando sem alteracao (6o parametro opcional); ausencia do servico = sem variacao."
    - "A flag PESQUISA_VARIACAO_IA (padrao ligada) esta nos dois composes e no stack.env.example; nenhuma migracao e nenhuma mudanca no schema Prisma."
  artifacts:
    - path: "apps/backend/src/modules/pesquisa/pesquisa-variacao.ts"
      provides: "helpers puros: variacaoAtiva, montarPromptVariacao, validarVariacao, constantes"
    - path: "apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts"
      provides: "PesquisaVariacaoService.variar(modelo, tipo): Promise<string> (nunca lanca)"
    - path: "apps/backend/src/modules/pesquisa/pesquisa-variacao.test.ts"
      provides: "testes unitarios dos helpers, do servico (axios mockado) e do DI opcional"
    - path: "apps/backend/src/modules/pesquisa/pesquisa-variacao.env.test.ts"
      provides: "consistencia codigo x deploy da flag PESQUISA_VARIACAO_IA"
  key_links:
    - from: "apps/backend/src/modules/pesquisa/pesquisa.service.ts"
      to: "apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts"
      via: "variarModelo() chama this.variacao.variar(modelo, tipo) antes de renderizarTexto nos 3 pontos de envio"
    - from: "apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts"
      to: "apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts"
      via: "extrairMensagemIA (export existente) e CHATWOOT_AI_URL/TOKEN/MODEL"
    - from: "apps/backend/src/modules/pesquisa/pesquisa.module.ts"
      to: "apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts"
      via: "providers: [PesquisaVariacaoService]"
    - from: "deploy/docker-compose.vps.yml"
      to: "apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts"
      via: "env PESQUISA_VARIACAO_IA lida por ConfigService (o container so enxerga o que o compose lista)"
---

<objective>
Variar por IA, de forma leve (anti-spam), os textos enviados pela pesquisa da Fase 52 — bloco do link da pesquisa no fechamento (textoFechamento/textoSemRecompensa), mensagem do cupom (textoPosResposta) e convite do Google (textoConviteGoogle) — como a mensagem de "resolvido" ja e gerada por IA, sem nunca bloquear nem alterar o comportamento atual quando a IA falha.

Purpose: mensagens identicas enviadas em volume pelo WhatsApp aumentam o risco de ser marcado como spam; a variacao leve reduz esse risco sem expor dado de cliente a IA e sem risco de dinheiro/opt-out (placeholders, link, codigo e SAIR sao protegidos por validacao).
Output: PesquisaVariacaoService + helpers puros testados; integracao opcional nos 3 pontos de envio do PesquisaService; conferencia da re-tentativa independente do texto exato; flag PESQUISA_VARIACAO_IA no deploy.

Desenho decidido pelo usuario (nao reabrir; citado abaixo como [U1]..[U10] na ordem do pedido): [U1] servico novo que envia a IA so o modelo com placeholders crus e reutiliza extrairMensagemIA + CHATWOOT_AI_*; [U2] validacao do resultado; [U3] qualquer falha = texto original, timeout ~8 s, log so do motivo; [U4] flag PESQUISA_VARIACAO_IA sem migracao e sem schema; [U5] prompt de reescrita leve; [U6] registro no modulo com parametro opcional e ultimo do construtor; [U7] tratar a re-tentativa de envio incerto; [U8] bloco do fechamento varia em prepararPesquisa/prepararFechamento sem mexer no fluxo do "resolvido"; [U9] testes unitarios sem rede/banco; [U10] regras do projeto.

Restricoes do projeto (valem para todas as tarefas): nao escrever em banco real, nao aplicar migracoes, nao tocar no schema Prisma; respostas e logs em portugues; cada commit lista os arquivos pelo caminho (git add com caminhos explicitos, nunca git add -A nem git add .). Ha arquivos alheios modificados na arvore que NAO podem entrar em nenhum commit: .claude/settings.local.json, .planning/config.json, .planning/state.json, apps/frontend/next-env.d.ts e os diretorios das fases 41 e 42 em .planning/phases. Terminar cada mensagem de commit com a linha de atribuicao exigida pelo ambiente (Co-Authored-By).

Decisoes de criterio proprio (Claude's discretion, documentadas): (a) [U7] resolvido por conferencia com marcador estavel (codigo do cupom / link do Google) alem da igualdade de texto, e nao por persistir a variacao — persistir exigiria coluna nova (proibido por [U4]) e um mapa em memoria se perde no restart, que e justamente quando a re-tentativa acontece; (b) a variacao so e aplicada ao cupom/convite se o modelo contem o placeholder do marcador ({codigo}/{link_google}), senao o texto sai identico ao atual e a conferencia por texto exato continua valida; (c) validacao extra alem de [U2]: reaproveitar validarTextoMensagem (mesmas regras do admin: sem emoji, sem cupom no convite, sem link no cupom), preservar palavras em CAIXA ALTA do modelo (garante o SAIR do opt-out, D-49) e exigir a mesma contagem de chaves; (d) o modelo enviado a IA inclui uma diretriz de estilo sorteada de uma lista curta para forcar variedade entre chamadas.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@apps/backend/src/modules/pesquisa/pesquisa.service.ts
@apps/backend/src/modules/pesquisa/pesquisa-regras.ts
@apps/backend/src/modules/pesquisa/pesquisa.module.ts
@apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts
@apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.env.test.ts

Fatos verificados no codigo (nao reler para descobrir de novo):
- `new PesquisaService(prisma, chatwoot, config, automation, configPesquisa)` posicional em 6 testes (pesquisa.service.test.ts, pesquisa-mensagens.test.ts, pesquisa-jobs.test.ts, pesquisa-revogacao.service.test.ts, pesquisa-webhook.controller.test.ts, pesquisa.tracer.test.ts); nenhum codigo de producao usa `new`. Baseline: `cd apps/backend && npx jest src/modules/pesquisa src/modules/integrations/chatwoot` = 19 suites, 490 testes verdes; `npx tsc --noEmit -p apps/backend/tsconfig.json` limpo.
- Os 3 pontos de render ficam em PesquisaService: `prepararFechamento` (renderizarTexto do bloco, escolhendo textoFechamento ou textoSemRecompensa conforme `avaliarRecompensa(...).disponivel`), `enviarCupomWhatsApp` (renderizarTexto de textoPosResposta) e `enviarConviteGoogle` (renderizarTexto de textoConviteGoogle).
- A conferencia de re-tentativa decide por TEXTO: `enviarComReserva` (status ENVIANDO + `confirmar`) chama `mensagemJaEnviada(conversationId, texto, desde)`, que compara `normalizarConteudo(content)` das mensagens de saida (lista publica: `listMessagesAfter` sem `incluirInternas` usa `filter_internal_messages=true`) com o texto renderizado, criadas desde `reservadoEm - 60 s`. Com texto variado a cada chamada, a re-tentativa nao reconheceria a mensagem ja enviada e DUPLICARIA cupom/convite. E o risco central deste plano.
- `extrairMensagemIA(resposta)` e exportado de chatwoot-automation.service.ts; a chamada existente (`chamarIA`, privada) faz POST em CHATWOOT_AI_URL com corpo `{ model, input }` e header `Authorization: Bearer <CHATWOOT_AI_TOKEN>`; modelo padrao `openclaw/main`. A resposta traz o texto em `output[0].content[0].text`.
- `validarTextoMensagem(tipo, texto)` (pesquisa-regras.ts) devolve null quando valido: limite 600 caracteres, sem emoji, so placeholders da lista fechada, fechamento/semRecompensa exigem {link}, posResposta exige {codigo} e proibe link/http, convite exige {link_google} e proibe a palavra cupom.
- Deploy: o container so enxerga as envs listadas em deploy/docker-compose.vps.yml e deploy/docker-compose.box.vps.yml (ver chatwoot-etiquetas.env.test.ts, que confere compose x stack.env.example x codigo). CHATWOOT_AI_URL/TOKEN/MODEL ja estao nos dois composes.
- Jest: rootDir `src`, testRegex `.*\.test\.ts$`; os testes de pesquisa usam Prisma em memoria, `jest.useFakeTimers()` e espiam `Logger.prototype` (padrao `espiarLogs`).
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): variacao por IA ponta a ponta no caminho do cupom, com conferencia de re-tentativa por marcador</name>
  <files>apps/backend/src/modules/pesquisa/pesquisa-variacao.ts, apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts, apps/backend/src/modules/pesquisa/pesquisa.service.ts, apps/backend/src/modules/pesquisa/pesquisa.module.ts, apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts</files>
  <action>
Fatia mais fina que cruza todas as camadas (helper puro -> servico com IA -> PesquisaService -> modulo -> mensagem enviada), pelo caminho do CUPOM apenas. As camadas ficam completas; so o fechamento e o convite sao ligados na Task 2.

1) Novo `apps/backend/src/modules/pesquisa/pesquisa-variacao.ts` (puro, sem Nest, sem Prisma, sem rede; importa so de ./pesquisa-regras). Exporta: `ENV_VARIACAO_IA = "PESQUISA_VARIACAO_IA"`; `TIMEOUT_VARIACAO_MS = 8000`; `RAZAO_TAMANHO_MIN = 0.5` e `RAZAO_TAMANHO_MAX = 1.8`; o tipo `TipoVariacao` = `Exclude<TipoTexto, "pagina">` (importando TipoTexto de pesquisa-regras); e:
 - `variacaoAtiva(valor)`: ausente, vazio ou qualquer valor desconhecido = true; so "false", "0" e "off" (apos trim, sem diferenciar caixa) = false [U4].
 - `DIRETRIZES_VARIACAO` (lista curta, 4 a 5 frases de estilo, ex.: trocar sinonimos, mudar a abertura, inverter a ordem de duas frases) e `sortearDiretriz(sorteio = Math.random)`; [U5] pede variar a cada chamada.
 - `montarPromptVariacao(modelo, tipo, diretriz)`: prompt em portugues que contem o MODELO com os placeholders crus entre delimitadores e pede: reescrita LEVE (trocar palavras ou ordem), manter tom, tamanho e emojis parecidos, manter todos os placeholders entre chaves exatamente como estao, manter a palavra SAIR e as quebras de linha, nao inventar link, numero nem valor, responder SO com o texto final, sem aspas, sem markdown, sem explicacao [U5].
 - `validarVariacao(modelo, variado, tipo)` devolvendo `{ valido: true; texto }` ou `{ valido: false; motivo }`, com motivos fixos (strings curtas, sem conteudo do texto). Ordem e regras [U2]: (i) "vazio" (so espacos); (ii) "envolvido_em_aspas" (comeca e termina com aspas ou crase, simples/duplas/tipograficas); (iii) "markdown" (tres crases, `**`, ou linha iniciando com `#`); (iv) "tamanho" (comprimento fora de RAZAO_TAMANHO_MIN..RAZAO_TAMANHO_MAX vezes o do modelo); (v) "placeholders" (multiconjunto dos nomes `{nome}` em minusculas, regex `\{([a-z_][a-z0-9_]*)\}` com flag i, IDENTICO ao do modelo: nenhum faltando, nenhum a mais, mesma contagem; caixa diferente e aceita pois renderizarTexto ja normaliza); (vi) "chaves_soltas" (mesma quantidade de `{` e `}` do modelo); (vii) "url_nova" (apos remover os `{...}` de ambos os textos, qualquer `http(s)://`, `www.` ou dominio nu terminado em com/net/org/br/io/app/me/ly/gl/page presente no variado e ausente no modelo); (viii) "numero_novo" (sequencias numericas do variado, apos remover os `{...}`, que nao existem no modelo); (ix) "palavra_obrigatoria_ausente" (toda palavra de 3 ou mais letras TODA em caixa alta do modelo, fora dos placeholders, tem de aparecer igual no variado — protege o SAIR do opt-out, D-49); (x) "regras_da_mensagem" (`validarTextoMensagem(tipo, variado) !== null`, as mesmas regras do admin: sem emoji, convite sem cupom, cupom sem link, limite de 600).

2) Novo `apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts`: `@Injectable() PesquisaVariacaoService` com `Logger` proprio e construtor `(private readonly config: ConfigService)`. Metodo unico `async variar(modelo: string, tipo: TipoVariacao): Promise<string>` que NUNCA lanca e devolve o modelo original em qualquer falha [U3]. Fluxo: flag desligada ou modelo vazio => devolve o modelo sem log; `CHATWOOT_AI_URL` ou `CHATWOOT_AI_TOKEN` ausente => log debug `motivo=ia_nao_configurada` e devolve o modelo; senao monta o prompt com `sortearDiretriz()` e chama `axios.post(url, { model, input: prompt }, { headers: { Authorization: "Bearer <token>" }, timeout: TIMEOUT_VARIACAO_MS })` com `model = CHATWOOT_AI_MODEL ?? "openclaw/main"` (mesmo contrato da chamada existente em chatwoot-automation.service.ts, que nao deve ser alterada); envolve a chamada em `Promise.race` com um timer de TIMEOUT_VARIACAO_MS (sempre `clearTimeout` no finally; abortar a requisicao via AbortController no estouro) para o envio nunca esperar alem do timeout; extrai o texto com `extrairMensagemIA` (importado de ../integrations/chatwoot/chatwoot-automation.service; null => `motivo=resposta_vazia`); roda `validarVariacao` (reprovou => warn `motivo=validacao_reprovada razao=<motivo fixo>`); aprovou => log `Variacao por IA aplicada tipo=<tipo>` e devolve o texto variado. Timeout (rejeicao do timer ou codigo ECONNABORTED/ETIMEDOUT) => warn `motivo=timeout`; qualquer outra excecao => warn `motivo=falha_chamada`, acrescentando `status=<numero>` somente se `err.response.status` for numero. Nunca logar o texto (modelo ou variado), o token, a URL nem o objeto de erro do axios [U3].

3) `apps/backend/src/modules/pesquisa/pesquisa.module.ts`: importar e registrar `PesquisaVariacaoService` em `providers` (nao precisa ir em `exports`) [U6].

4) `apps/backend/src/modules/pesquisa/pesquisa.service.ts` [U6][U7]:
 - Importar `Optional` de @nestjs/common e `PesquisaVariacaoService`. Adicionar como ULTIMO parametro do construtor `@Optional() private readonly variacao?: PesquisaVariacaoService` (os 5 anteriores ficam na mesma ordem; ausencia = sem variacao).
 - Metodo privado `variarModelo(modelo, tipo, placeholderEstavel?)`: sem `this.variacao` devolve o modelo; se `placeholderEstavel` foi dado e o modelo nao contem `{placeholderEstavel}` (sem diferenciar caixa) devolve o modelo (decisao (b): sem marcador estavel a conferencia por texto exato precisa continuar valendo); senao `await this.variacao.variar(modelo, tipo)` dentro de try/catch (excecao => warn `motivo=excecao`, devolve o modelo, sem texto no log).
 - `enviarCupomWhatsApp`: `renderizarTexto(await this.variarModelo(cfg.textoPosResposta, "posResposta", "codigo"), montarVariaveisMensagem(...))`; o mapa de variaveis continua o mesmo e so e aplicado DEPOIS da variacao, entao o codigo real nunca vai a IA [U1]. Passar `marcador: linha.codigo` em `enviarComReserva`.
 - `enviarComReserva`: aceitar `marcador?: string` em `dados` e repassa-lo a `mensagemJaEnviada(conversationId, texto, desde, marcador)`.
 - `mensagemJaEnviada`: novo 4o parametro opcional `marcador?: string`; uma mensagem conta como ja enviada quando e de saida, NAO e privada (`private !== true`), foi criada a partir de `desde - 60 s` e (o conteudo normalizado e igual ao texto renderizado OU, havendo marcador nao vazio, o conteudo contem o marcador). Atualizar o comentario do metodo explicando que a variacao por IA torna o texto instavel entre tentativas e por isso o marcador (codigo do cupom / link do Google) e a prova estavel [U7]. Comportamento sem marcador = o atual.

5) Teste do tracer em `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts`, SEM alterar nenhum teste existente: no topo, `jest.mock("axios", ...)` com fabrica `{ __esModule: true, default: { post: jest.fn() } }` e `import axios from "axios"` (o arquivo nao usa axios hoje); `Opcoes` ganha `variacao?: unknown` e o `new PesquisaService(...)` de `montar` ganha o 6o argumento `opcoes.variacao as never` (undefined quando nao informado = comportamento atual). Adicionar, DENTRO do describe "mensagens de WhatsApp e re-tentativa" (para reutilizar `respondidaEm`, `textoEnviado` e os timers falsos), um `describe("variacao por IA (quick 261122-rlb)")` com um helper que monta `new PesquisaVariacaoService({ get: (chave) => env[chave] } as never)` com env `CHATWOOT_AI_URL`, `CHATWOOT_AI_TOKEN` ("tok-secreto-ia") e `CHATWOOT_AI_MODEL`, e um helper `respostaIA(texto)` que devolve `{ data: { output: [{ content: [{ text: texto }] }] } }`. Casos do tracer (servico REAL, so a borda axios mockada): (a) IA devolve a variante "Seu cupom: {codigo}. Desconto de {percentual} até {teto}, compra mínima de {compra_minima}, válido até {validade}. {nome_empresa}" para o modelo padrao do CONFIG_BASE => `responder` envia 1 mensagem cujo texto contem "Seu cupom:", o codigo real emitido, "10%", "R$ 5,00", "R$ 30,00", "Loja Teste", nenhuma chave `{}`; e o `input` enviado ao axios contem `{codigo}` cru e NAO contem o codigo real, o telefone nem o token da pesquisa, com header Authorization `Bearer tok-secreto-ia` e `timeout` igual a TIMEOUT_VARIACAO_MS; (b) axios rejeita => o texto enviado e exatamente o da config renderizado sem variacao e o status do cupom vira ENVIADA; (c) re-tentativa incerta: cupom em ENVIANDO com reserva de 20 min, `listMessagesAfter` devolvendo uma mensagem de saida PUBLICA, recente, com texto diferente do que a IA geraria agora mas contendo o codigo do cupom, e a IA devolvendo outra variante: `reenviarPendentes` NAO chama `sendOutgoingMessage` e grava ENVIADA; variantes do mesmo caso: lista vazia ou mensagem de saida privada contendo o codigo => reenvia exatamente uma vez. Isolar o CSAT (`chatwootCsat: "OK"`) e o convite (`envioConviteStatus: "ENVIADA"`) nos casos de re-tentativa.

Commit atomico desta tarefa com `git add` dos 5 caminhos de <files> e mensagem `feat(quick-261122-rlb): variacao por IA no cupom da pesquisa com conferencia por marcador`.
  </action>
  <verify>
    <automated>(cd apps/backend && npx jest src/modules/pesquisa/pesquisa-mensagens.test.ts) && npx tsc --noEmit -p apps/backend/tsconfig.json</automated>
  </verify>
  <done>O caminho do cupom funciona ponta a ponta com o servico real e axios mockado: variante aprovada sai com o codigo real preenchido depois; falha da IA mantem o texto original; re-tentativa incerta nao duplica mesmo com variante diferente. O arquivo pesquisa-mensagens.test.ts inteiro passa (testes antigos + novos), tsc limpo, PesquisaVariacaoService registrado no modulo, construtor antigo de 5 argumentos intacto.</done>
</task>

<task type="auto">
  <name>Task 2: ligar fechamento e convite, e cobrir validacao, servico, fallbacks e os 3 pontos de envio com testes unitarios</name>
  <files>apps/backend/src/modules/pesquisa/pesquisa.service.ts, apps/backend/src/modules/pesquisa/pesquisa-variacao.test.ts, apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts, apps/backend/src/modules/pesquisa/pesquisa.service.test.ts</files>
  <action>
1) `apps/backend/src/modules/pesquisa/pesquisa.service.ts` — ligar os dois pontos restantes usando o `variarModelo` da Task 1 [U8]:
 - `prepararFechamento`: calcular uma vez `disponivel = (await this.avaliarRecompensa(telefone, cfg, agora)).disponivel`, escolher modelo e tipo (`textoFechamento` com tipo "fechamento"; `textoSemRecompensa` com tipo "semRecompensa") e renderizar `renderizarTexto(await this.variarModelo(modelo, tipo), montarVariaveisFechamento({ link, cfg, empresaNome, agora }))`. O link unico `${baseUrl}/pesquisa/${pesquisa.token}` continua so no mapa de variaveis, aplicado depois da variacao. Nao tocar em nada de chatwoot-automation.service.ts: o fluxo do "resolvido" (`${mensagem}\n\n${pesquisa.bloco}`) fica como esta.
 - `enviarConviteGoogle`: `renderizarTexto(await this.variarModelo(cfg.textoConviteGoogle, "convite", "link_google"), montarVariaveisConvite(...))` e `marcador: cfg.linkGoogle` em `enviarComReserva` (o convite nunca usa variavel do cupom, mantido).

2) Novo `apps/backend/src/modules/pesquisa/pesquisa-variacao.test.ts` (jest, sem rede e sem banco; `jest.mock("axios")` com `default.post` mockado; `espiarLogs` no padrao dos outros testes de pesquisa) [U9]:
 - `variacaoAtiva`: ausente, vazio, "true", "1" e lixo => true; "false", "FALSE", " 0 ", "off", "Off" => false.
 - `validarVariacao` APROVA: variante legitima para cada tipo usando `TEXTOS_PADRAO` de pesquisa-regras como modelo (fechamento com SAIR, semRecompensa, posResposta, convite); mesma variante com `{LINK}` em caixa alta no lugar de `{link}`; variado identico ao modelo. REPROVA, um caso por motivo fixo: vazio; envolvido_em_aspas (duplas e tipograficas) e crase; markdown (`**`, tres crases, linha com `#`); tamanho abaixo de 0,5x e acima de 1,8x; placeholders (um faltando, um a mais, um duplicado, nome inexistente); chaves_soltas (`{ link }` com espacos); url_nova (`https://`, `www.` e dominio nu como `exemplo.com`); numero_novo (numero que nao estava no modelo; e modelo com numero proprio mantido continua aprovado); palavra_obrigatoria_ausente (SAIR trocado por "PARAR" ou escrito "sair" em minuscula); regras_da_mensagem (emoji; convite citando "cupom"; posResposta com `http`).
 - `montarPromptVariacao`: contem o modelo com os placeholders crus, as instrucoes de reescrita leve, manter placeholders, manter SAIR, responder so com o texto; `sortearDiretriz` e deterministica com sorteio injetado.
 - `PesquisaVariacaoService.variar` (axios mockado; ConfigService falso `{ get }`): aprovado devolve o texto variado, chama axios.post UMA vez com `{ model, input }` cujo `input` contem o modelo cru, header Bearer e `timeout` = TIMEOUT_VARIACAO_MS; fallback devolvendo EXATAMENTE o modelo e sem chamar axios quando a flag e "false", "0" ou "off"; fallback sem chamar axios quando falta CHATWOOT_AI_URL ou CHATWOOT_AI_TOKEN; modelo padrao `openclaw/main` quando CHATWOOT_AI_MODEL falta; fallback quando axios rejeita (usar um erro cujo `message` e `config.headers.Authorization` carregam o token), quando a resposta tem formato inesperado ou texto vazio, e quando a validacao reprova; TIMEOUT com `jest.useFakeTimers()`: axios.post devolve promessa que nunca resolve, `await jest.advanceTimersByTimeAsync(TIMEOUT_VARIACAO_MS)` e a promessa de `variar` resolve com o modelo e log `motivo=timeout`; nenhum caso rejeita a promessa de `variar`. Sobre os logs coletados em todos os casos: contem `motivo=` e NUNCA o token, a URL, o texto do modelo, o texto variado nem a palavra "Authorization" [U3].
 - DI opcional com `Test.createTestingModule` (@nestjs/testing, ja usado em quotes): modulo com `PesquisaService` real + `PesquisaVariacaoService` real + valores falsos para PrismaService, ChatwootService, ConfigService, ChatwootAutomationService e PesquisaConfigService => `module.get(PesquisaService)` recebe o servico de variacao; modulo identico SEM o provider de variacao compila e o PesquisaService fica sem variacao (prova o `@Optional()` [U6]).

3) Testes de integracao dos 3 pontos de envio, sem alterar testes existentes [U9]:
 - `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts`: `Opcoes` ganha `variacao?: unknown` e `montar` passa `opcoes.variacao as never` como 6o argumento do `new PesquisaService`. Novo describe com um `variacao` falso `{ variar: jest.fn(async (modelo: string) => modelo.replace("Ganhe", "Receba")) }`: fechamento com recompensa => `variar` chamado com `(cfg.textoFechamento, "fechamento")`, o `bloco` contem "Receba", o link real `https://app.test/pesquisa/` + token e os valores resolvidos, nenhuma chave `{}`, e o argumento `modelo` recebido pela IA NAO contem o dominio `app.test` nem o token; com `gasto: "300.00"` (teto atingido) => `variar` chamado com `(cfg.textoSemRecompensa, "semRecompensa")`; `variar` que lanca ou que devolve o proprio modelo => bloco identico ao de um servico sem variacao; servico sem o 6o argumento => bloco identico ao atual.
 - `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` (dentro do describe da Task 1): cupom com `variar` falso => chamado com `(cfg.textoPosResposta, "posResposta")` e argumento sem o codigo real; texto enviado = variante com o codigo real e sem chaves; convite (esperar os 60 a 180 s com `avancar`) => `variar` chamado com `(cfg.textoConviteGoogle, "convite")` com argumento sem o link real, e o texto enviado traz o link do Google exatamente uma vez; config SEM `{codigo}` no textoPosResposta (injetada pela opcao `config`, que nao passa pelo validador) e SEM `{link_google}` no convite => `variar` nao e chamado e o texto sai igual ao atual (decisao (b)); re-tentativa do convite em ENVIANDO: mensagem publica recente que contem o link do Google com texto diferente do atual => nao reenvia e grava ENVIADA; sem mensagem ou so mensagem privada com o link => reenvia uma vez.

Rodar os tres arquivos de teste e o tsc; corrigir ate verdes. Commit atomico com `git add` dos 4 caminhos de <files> e mensagem `feat(quick-261122-rlb): variacao por IA no fechamento e no convite da pesquisa com testes`.
  </action>
  <verify>
    <automated>(cd apps/backend && npx jest src/modules/pesquisa/pesquisa-variacao.test.ts src/modules/pesquisa/pesquisa.service.test.ts src/modules/pesquisa/pesquisa-mensagens.test.ts) && npx tsc --noEmit -p apps/backend/tsconfig.json</automated>
  </verify>
  <done>Os 3 pontos de envio (bloco do fechamento, cupom, convite) renderizam o modelo variado e so depois preenchem link/codigo/link do Google; todos os fallbacks (flag, IA ausente, timeout, erro, resposta vazia, validacao reprovada) devolvem o texto original sem lancar e sem vazar segredo em log; o DI com e sem o provider compila; re-tentativa do convite nao duplica; testes novos e antigos verdes e tsc limpo.</done>
</task>

<task type="auto">
  <name>Task 3: flag PESQUISA_VARIACAO_IA no deploy, teste de consistencia e verificacao final</name>
  <files>deploy/docker-compose.vps.yml, deploy/docker-compose.box.vps.yml, deploy/stack.env.example, apps/backend/src/modules/pesquisa/pesquisa-variacao.env.test.ts</files>
  <action>
1) Nos dois composes (`deploy/docker-compose.vps.yml` e `deploy/docker-compose.box.vps.yml`), logo depois do bloco de `PESQUISA_CSAT_NATIVO_ATIVO` no servico backend, adicionar um comentario de duas linhas (somente "false", "0" ou "off" desligam a variacao por IA dos textos da pesquisa; usa CHATWOOT_AI_URL/TOKEN/MODEL ja listados e qualquer falha mantem o texto original da tela de configuracao) e a linha de env com o mesmo recuo das vizinhas: `PESQUISA_VARIACAO_IA: ${PESQUISA_VARIACAO_IA:-true}` [U4]. Sem esta linha o container nao enxerga a env, por isso o compose e parte da entrega.

2) Em `deploy/stack.env.example`, no bloco "Pesquisa de satisfacao e recompensa (Fase 52)": acrescentar ao texto de comentarios uma explicacao da flag (padrao ligada; "false", "0" ou "off" desligam; depende de CHATWOOT_AI_URL e CHATWOOT_AI_TOKEN; sem IA configurada ou com qualquer falha os textos saem como estao na tela /configuracoes/pesquisa; nenhum dado de cliente vai para a IA, so o modelo do texto) e a linha `PESQUISA_VARIACAO_IA=true` junto das demais `PESQUISA_*`.

3) Novo `apps/backend/src/modules/pesquisa/pesquisa-variacao.env.test.ts`, no molde de `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.env.test.ts` (le os arquivos de deploy com `fs`, pasta `path.resolve(__dirname, "../../../../../deploy")` — cinco niveis acima de apps/backend/src/modules/pesquisa ate a raiz): cada compose tem exatamente uma linha `PESQUISA_VARIACAO_IA: ${PESQUISA_VARIACAO_IA:-true}`; o stack.env.example tem exatamente uma linha `PESQUISA_VARIACAO_IA=true`; e o padrao do codigo bate com o do deploy: `variacaoAtiva(undefined) === true` e `ENV_VARIACAO_IA` igual ao nome da env.

4) Verificacao final de toda a area e guardas: rodar a suite completa de pesquisa e chatwoot e o tsc; conferir que nenhum arquivo de schema/migracao do Prisma mudou e que os commits desta execucao nao incluem os arquivos alheios listados nas restricoes do objetivo. Commit atomico com `git add` dos 4 caminhos de <files> e mensagem `feat(quick-261122-rlb): flag PESQUISA_VARIACAO_IA no deploy com teste de consistencia`.
  </action>
  <verify>
    <automated>(cd apps/backend && npx jest src/modules/pesquisa src/modules/integrations/chatwoot) && npx tsc --noEmit -p apps/backend/tsconfig.json && grep -cE "^\s+PESQUISA_VARIACAO_IA: \$\{PESQUISA_VARIACAO_IA:-true\}" deploy/docker-compose.vps.yml deploy/docker-compose.box.vps.yml && grep -c "^PESQUISA_VARIACAO_IA=true" deploy/stack.env.example</automated>
  </verify>
  <done>Os dois composes e o stack.env.example declaram PESQUISA_VARIACAO_IA com padrao ligada; o teste de consistencia passa; suite de pesquisa + chatwoot verde (esperado: pelo menos 21 suites, mais de 490 testes, 0 falhas) e tsc limpo; nenhuma mudanca em schema/migracao.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend -> endpoint de IA (CHATWOOT_AI_URL) | Sai apenas o modelo do texto com placeholders crus; volta texto nao confiavel que vai ao WhatsApp do cliente |
| IA -> mensagem de WhatsApp | A saida da IA e tratada como entrada nao confiavel e so e usada apos validacao |
| backend -> logs | Logs de aplicacao nao podem carregar texto, token, telefone, codigo nem erro bruto do axios |
| re-tentativa -> Chatwoot | A conferencia de "ja enviada" deixa de poder confiar no texto exato |

## STRIDE Threat Register

Threat IDs sao unicos dentro desta fase quick (prefixo T-rlb) e nao colidem com os T-52-NN da Fase 52. `T-rlb-SC` e reservado.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rlb-01 | I | PesquisaVariacaoService.variar / prompt | high | mitigate | `variar` recebe so o modelo com placeholders crus; link unico, codigo do cupom, link do Google, telefone e nome so entram em `renderizarTexto` depois da variacao. Teste afirma que o `input` enviado ao axios nao contem codigo real, telefone nem token da pesquisa (Tasks 1 e 2) |
| T-rlb-02 | T | validarVariacao (saida da IA) | high | mitigate | Descarta variacao que perde/duplica placeholder (link/codigo de cupom), cria URL ou numero novo, remove SAIR (opt-out D-49), sai do tamanho 0,5x-1,8x, vem com aspas/markdown ou viola validarTextoMensagem (sem emoji, convite sem cupom, cupom sem link); falha = texto original |
| T-rlb-03 | I | logs do PesquisaVariacaoService e variarModelo | medium | mitigate | Logs so com `motivo=` (strings fixas) e `tipo`; nunca texto, token, URL nem objeto de erro do axios; teste inspeciona todos os logs dos cenarios de falha |
| T-rlb-04 | D | chamada a IA no fechamento e nos envios | medium | mitigate | Timeout de 8 s (Promise.race + axios timeout + abort), `clearTimeout` no finally, flag PESQUISA_VARIACAO_IA desliga tudo, qualquer falha cai no texto original; o envio nunca espera alem do timeout e nunca e bloqueado |
| T-rlb-05 | T | enviarComReserva / mensagemJaEnviada (duplicidade de cupom/convite) | high | mitigate | Conferencia aceita o marcador estavel (codigo do cupom, link do Google) alem do texto exato, ignora mensagens privadas e so aplica variacao quando o modelo contem o placeholder do marcador; testes cobrem re-tentativa com variante diferente |
| T-rlb-06 | E | PesquisaService com `@Optional()` | low | accept | Parametro opcional e ultimo; ausencia do servico = comportamento atual; sem mudanca de permissao ou de superficie HTTP |
| T-rlb-SC | T | instalacao de pacotes | high | accept | Nenhum pacote novo: axios, @nestjs/common e @nestjs/testing ja sao dependencias do backend; nao ha install nem checkpoint de legitimidade |
</threat_model>

<verification>
Gates desta execucao (os que dependem de contagem trazem o baseline medido no HEAD):
- `(cd apps/backend && npx jest src/modules/pesquisa src/modules/integrations/chatwoot)` verde [HEAD=19 suites, 490 testes; EXPECT>=21 suites, >490 testes, 0 falhas].
- `npx tsc --noEmit -p apps/backend/tsconfig.json` limpo [HEAD=limpo; EXPECT=limpo].
- `grep -c "PesquisaVariacaoService" apps/backend/src/modules/pesquisa/pesquisa.module.ts` [HEAD=0 EXPECT=2: import e providers].
- `grep -cE "^\s+PESQUISA_VARIACAO_IA:" deploy/docker-compose.vps.yml` e o mesmo em `deploy/docker-compose.box.vps.yml` [HEAD=0 EXPECT=1 em cada].
- `grep -c "^PESQUISA_VARIACAO_IA=true" deploy/stack.env.example` [HEAD=0 EXPECT=1].
- Guarda de nao regressao (passa por construcao): `git status --porcelain apps/backend/prisma | wc -l` [HEAD=0 EXPECT==0] — nenhuma migracao nem mudanca de schema.
- Guarda de commits (passa por construcao; ajustar N ao numero de commits desta execucao): `git diff --name-only HEAD~3 HEAD | grep -E "settings.local.json|\.planning/config.json|\.planning/state.json|next-env.d.ts|\.planning/phases/4[12]-" | wc -l` [HEAD=0 EXPECT==0].
</verification>

<success_criteria>
- Bloco do fechamento, mensagem do cupom e convite do Google passam por PesquisaVariacaoService e saem variados quando a IA esta configurada e a variacao e aprovada; link unico, codigo e link do Google reais entram so depois.
- Nenhum dado de cliente chega a IA (provado por teste sobre o payload do axios).
- Falha, timeout (8 s), IA ausente, flag desligada ou validacao reprovada => texto original, sem excecao, sem log sensivel.
- Re-tentativa de envio incerto nao duplica cupom nem convite mesmo com texto variado diferente (testes).
- Construtor de 5 argumentos continua valendo; todos os testes antigos passam sem alteracao.
- Flag PESQUISA_VARIACAO_IA nos dois composes e no stack.env.example, coberta por teste de consistencia; sem migracao nem mudanca de schema.
- 3 commits atomicos, somente com os arquivos de files_modified.
</success_criteria>

<output>
Criar `.planning/quick/261122-rlb-variar-por-ia-os-textos-da-pesquisa-fase/261122-rlb-SUMMARY.md` ao concluir.
</output>

## Auditoria de cobertura (fontes)

| Fonte | Item | Coberto por |
|-------|------|-------------|
| GOAL | Variar por IA bloco do fechamento, textoPosResposta e textoConviteGoogle | Task 1 (cupom), Task 2 (fechamento e convite) |
| REQ | Nenhum ID de requisito (tarefa quick, sem phase_req_ids); `requirements` usa o identificador da tarefa | n/a |
| RESEARCH | Sem fase de pesquisa (restricao do pedido); fatos do codigo verificados e listados em `<context>` | n/a |
| CONTEXT | [U1] servico novo + so modelo cru a IA + extrairMensagemIA/CHATWOOT_AI_* | Task 1 itens 1, 2 e 4 |
| CONTEXT | [U2] validacao (placeholders, URL, numeros, tamanho, aspas/markdown, vazio) | Task 1 item 1; testes Task 2 |
| CONTEXT | [U3] fallback total, timeout 8 s, log so do motivo | Task 1 item 2; testes Task 2 |
| CONTEXT | [U4] flag PESQUISA_VARIACAO_IA, sem migracao/schema, documentada | Task 1 item 1 (variacaoAtiva); Task 3 |
| CONTEXT | [U5] prompt de reescrita leve, varia a cada chamada | Task 1 item 1 (montarPromptVariacao, diretrizes) |
| CONTEXT | [U6] registro no modulo, parametro opcional e ultimo, testes antigos intactos | Task 1 itens 3 e 4; teste de DI na Task 2 |
| CONTEXT | [U7] re-tentativa incerta sem duplicar | Task 1 item 4 e teste (c); convite na Task 2 |
| CONTEXT | [U8] bloco do fechamento varia em prepararFechamento sem tocar no "resolvido" | Task 2 item 1 |
| CONTEXT | [U9] testes unitarios sem rede/banco nos 3 pontos | Tasks 1 e 2 |
| CONTEXT | [U10] regras do projeto (sem banco real, sem migracao, so arquivos alterados) | Restricoes no objetivo; guardas em `<verification>` |
