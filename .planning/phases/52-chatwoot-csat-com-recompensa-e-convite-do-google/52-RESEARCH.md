# Phase 52: Chatwoot CSAT com recompensa e convite do Google - Research

**Pesquisado:** 2026-11-22
**Domínio:** Integração Chatwoot (CSAT nativo, API pública, webhooks, etiquetas e atributos de contato) + Prisma + NestJS + Next.js (rota pública e admin)
**Confiança geral:** MEDIUM
- Contrato Chatwoot: HIGH. Código-fonte lido nos containers `chatwoot-rails-1` (v4.19.1) e `chatwoot-box-rails-1` (v4.12.1) nesta sessão, mais consultas SELECT somente de leitura nos bancos dos dois Chatwoots.
- Código do projeto: HIGH. Arquivos lidos nesta sessão, com linha.
- Fluxo privado (`input_csat` privado com PUT público): MEDIUM. Validado só por leitura de código; nenhuma mensagem foi criada em Chatwoot (regra do projeto).
- Compliance (LGPD, política do WhatsApp/Evolution): LOW. Marcado como `[ASSUMED]`; precisa de conferência jurídica.

<user_constraints>
## User Constraints (from CONTEXT.md)

Fonte: `.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-CONTEXT.md` (copiado literalmente).

### Locked Decisions

#### Pesquisa e dados
- URL publica da pesquisa: `/pesquisa/[token]` no dominio publico do frontend (APP_BASE_URL), com proxy server-side para o backend como em `/cobranca/confirmar/[token]` — **Reversibility:** one-way — a URL vai em mensagens de WhatsApp ja enviadas e nao pode mudar depois.
- Token: aleatorio (randomBytes 24, hex) guardado no banco, revogavel, com expiracao — **Reversibility:** costly — formato persistido e embutido em links enviados.
- Modelos Prisma novos (nomes finais a criterio do planner): config singleton da pesquisa/recompensa, pesquisa (token, conversa Chatwoot, uuid da conversa, contato, telefone, nota 1-5, comentario, respondida em, variante visual), cupom (codigo unico, pesquisa, telefone, percentual, teto, compra minima, validade, status EMITIDO/USADO/EXPIRADO/CANCELADO, valor real do desconto ao usar, usado em, usado por), opt-out (telefone) — **Reversibility:** costly — exige migracao para mudar.
- Escala da nota: 1 a 5 (o Chatwoot so aceita rating 1-5 no CsatSurveyResponse). Visual configuravel com duas variantes para teste A/B: estrelas e carinhas. Config permite escolher estrelas, carinhas ou alternar (A/B, ex.: aleatorio por pesquisa) e o painel compara as variantes. A variante exibida e gravada na pesquisa.
- Nota obrigatoria, comentario opcional.

#### Relatorio nativo do Chatwoot (pesquisado no codigo do Chatwoot 4.12.1 e 4.19.1 — logica de CSAT identica)
- Ao agendar/enviar a mensagem de fechamento com o link, o backend cria na conversa uma mensagem **privada** com `content_type: input_csat` via `POST /api/v1/accounts/:id/conversations/:id/messages` (o MessageBuilder aceita `content_type` dos params). A Evolution ignora mensagens privadas (`e.private` -> return) e eventos `message_updated`, entao nada chega ao cliente.
- Ao receber a resposta na nossa pagina, o backend chama `PUT /public/api/v1/csat_survey/:conversation_uuid` com `{ message: { submitted_values: { csat_survey_response: { rating, feedback_message } } } }`. O listener `message_updated` do Chatwoot roda `CsatSurveys::ResponseBuilder`, que grava `CsatSurveyResponse` (alimenta `/app/accounts/:id/reports/csat`).
- Limites do Chatwoot: rating 1-5; resposta bloqueada apos 14 dias da mensagem input_csat (nosso link vale 7 dias por padrao).
- CSAT nativo do inbox continua DESLIGADO nos inboxes WhatsApp (senao ele manda a mensagem dele, duplicando). Passo manual no roteiro.
- Falha ao gravar no Chatwoot nunca bloqueia a resposta do cliente nem o cupom (best-effort, log, re-tentativa).
- Obrigatorio validar em homologacao numa conversa de teste antes de ativar (nada foi criado no Chatwoot de producao durante a discussao). Fallback se falhar: so nota privada + atributos + etiqueta.

#### Extras no Chatwoot (todos)
- Nota privada na conversa com nota, comentario e codigo do cupom (percentual, teto, validade).
- Atributos customizados do contato: ultima nota, data da ultima avaliacao, cupom ativo e validade.
- Etiqueta `avaliou` em toda resposta; `csat-baixo` para nota 1 ou 2. Etiquetas mescladas com as existentes (POST labels substitui a lista inteira — ler e regravar, como na fase 51).

#### Cupom e resgate
- Recompensa: desconto em % com teto em R$ e compra minima, por qualquer nota.
- Cupom unico por cliente, uso unico, validade curta (padrao 30 dias, editavel).
- Resgate: tela "Cupons" no sistema — balcao digita o codigo, ve se e valido, quanto desconta (informa o valor da compra, sistema calcula % limitado ao teto e checa minimo) e marca como usado. O desconto e lancado manualmente no Athos/PDV (Athos nao tem cupom).
- Teto mensal (padrao R$300, editavel) contado pelo **desconto real dos cupons usados** no mes.
- Ao atingir o teto do mes: a pesquisa continua, mas o cupom e suspenso ate o mes seguinte; a mensagem de fechamento passa a nao prometer recompensa (texto alternativo editavel).

#### Mensagens
- Mensagem de fechamento: mantem o texto gerado pela IA da fase 51 e anexa um bloco fixo editavel (link da pesquisa, frase da recompensa e opt-out "Responda SAIR para nao receber"), para o link nunca se perder.
- Apos a resposta: pagina de agradecimento mostra o cupom e um botao para avaliar no Google; o sistema tambem manda uma mensagem no WhatsApp com o codigo do cupom e o convite do Google (template editavel). Convite do Google para todos, independente da nota, sem recompensa e sem qualquer vinculo com o cupom.
- Um unico link por mensagem sempre que possivel (risco de banimento WhatsApp/Evolution).

#### Configuracoes e painel
- Nova aba em /configuracoes (ex.: "Pesquisa e recompensa") no admin-shell, ao lado de "Templates de PDF" e "Juros e multa".
- Campos editaveis: liga/desliga, percentual, teto por cupom, compra minima, validade do cupom, validade do link, intervalo entre cupons por cliente, teto mensal, link de avaliacao do Google, variante visual (estrelas/carinhas/A-B), textos (bloco do fechamento, bloco sem recompensa, mensagem pos-resposta, textos da pagina).
- Painel na mesma area: nota media (geral e por variante), taxa de resposta, ultimas respostas com comentario, cupons emitidos/usados, gasto real no mes vs teto.
- Defaults sugeridos (editaveis): Box — 10%, teto R$2, compra minima R$6; Bom Custo — 10%, teto R$5, compra minima R$30. Como Box e Bom Custo sao instancias separadas, o default pode vir de env por instancia ou ser preenchido no primeiro acesso (criterio do planner).

#### Decided autonomously
- [Arquitetura] Q: 'Como suportar Box e Bom Custo?' -> Selected: 'Mesmo codigo, uma instancia por empresa (deploys box-backend e orcamento-backend ja separados); config singleton por instancia; sem refatoracao multi-Chatwoot' — segue o modelo de deploy atual (fase 51 D-14/D-24).
- [Pesquisa] Q: 'Como servir a pagina publica?' -> Selected: 'Pagina/rota no Next.js que faz proxy server-side ao backend (backendFetch), padrao de /cobranca/confirmar/[token]' — padrao local existente.
- [Pesquisa] Q: 'Validade do link?' -> Selected: '7 dias, editavel na config' — valor de configuracao.
- [Cupom] Q: 'Formato do codigo?' -> Selected: 'Prefixo da empresa + 6 caracteres sem ambiguos (ex.: BOX-7K3Q9M); prefixo configuravel' — so geracao de texto.
- [Cupom] Q: 'Limite por cliente?' -> Selected: '1 cupom a cada 90 dias por telefone, editavel' — valor de configuracao.
- [Fluxo] Q: 'Quando enviar a recompensa?' -> Selected: 'Na hora do envio da pesquisa, com status ENVIADA/FALHA e re-tentativa' — logica interna.
- [Fluxo] Q: 'Idempotencia?' -> Selected: 'Unique por conversa na pesquisa e unique por pesquisa no cupom; token invalidado apos resposta' — restricao local.
- [Fluxo] Q: 'Opt-out?' -> Selected: 'Mensagem recebida igual a SAIR (normalizada) inclui o telefone na lista de supressao; suprime pesquisa e convite, nao mensagens de servico' — lista simples.
- [Chatwoot] Q: 'CSAT nativo?' -> Selected: 'Desligado nos inboxes WhatsApp, passo manual no roteiro' — liga/desliga no painel.

### Claude's Discretion
- Nomes de modelos, servicos e rotas internas de admin; estrutura de modulo (ex.: modulo `csat` no backend).
- Mecanismo de A/B (aleatorio por pesquisa vs alternado).
- Calculo da taxa de resposta (pesquisas enviadas vs respondidas).
- Retentativa de falhas (cron leve ou retry na proxima acao).

### Deferred Ideas (OUT OF SCOPE)
- Integracao do cupom com Athos/PDV (aplicar desconto automaticamente) — fase propria; exige escrita no Athos de producao.
- Migrar WhatsApp para a Cloud API oficial (reduz risco de banimento) — avaliacao futura.

**Escopo fora desta fase (CONTEXT, Phase Boundary):** integracao de cupom com Athos/PDV, recompensa por avaliacao no Google, sorteios.
</user_constraints>

<phase_requirements>
## Phase Requirements

Nenhum ID de requisito foi atribuido a esta fase (o pedido diz "none assigned"; a Fase 52 nao aparece como requisitos em REQUIREMENTS.md). As decisoes do CONTEXT fazem o papel de requisitos. A secao "Mapa decisao -> verificacao" (em Validation Architecture) liga cada decisao a um teste automatizado ou a um passo de homologacao.
</phase_requirements>

## Summary

O fluxo de CSAT nativo do Chatwoot funciona nas duas versoes em uso e ja foi usado em producao. No Bom Custo (v4.19.1) existem 10 respostas gravadas em `csat_survey_responses`, todas na inbox 21 (`Channel::Api`, o tipo de inbox que, segundo a memoria do projeto, recebe o WhatsApp via Evolution). No Box (v4.12.1) existem 3 respostas na inbox 1 (`Channel::Api`, tambem WhatsApp segundo a memoria do projeto), a ultima em 2026-08-10. Isso confirma que a cadeia "cliente responde pelo link -> PUT publico -> CsatSurveyResponse" funciona com inbox de API. A fase pode reaproveitar exatamente esse contrato: criar uma mensagem `input_csat` pela API da Chatwoot e enviar a nota pelo `PUT /public/api/v1/csat_survey/:conversation_uuid`.

Ha, porem, premissas do CONTEXT que precisam de correcao. (a) Os arquivos de CSAT nao sao todos identicos entre as versoes: o controller publico, o ResponseBuilder, o listener e o CsatSurveyService batem por md5, mas `message.rb`, `message_content_presenter.rb`, `message_builder.rb` e `csat_survey_response.rb` diferem (normalizacao de webhook, encaminhamento, marcacao de voz, colunas de revisao). Nenhuma diferenca muda o contrato CSAT. (b) O modo **privado** do `input_csat` nunca foi exercitado em nenhuma das duas instancias. A leitura do codigo sugere que funciona (o PUT publico nao verifica `private`, e a Evolution descarta mensagens privadas), mas isso precisa de homologacao antes de ligar a funcao.

Cinco restricoes de arquitetura mudam o plano. (1) O PUT publico usa `find_by!(content_type: 'input_csat')` sem ordenacao explicita, e a default_scope ordena por `created_at asc`. Ou seja, o PUT grava na **primeira** mensagem CSAT da conversa; so pode haver uma pesquisa com registro no Chatwoot por conversa. (2) O CSAT nativo continua **ligado** na inbox 1 do Box (consulta ao banco). Ele dispara no `resolved` imediatamente, antes do atraso de 45-180 s, e geraria uma segunda mensagem com link. Precisa ser desligado antes de qualquer ativacao. (3) O listener de `message_updated` roda por job (`EventDispatcherJob`), entao a linha em `csat_survey_responses` aparece depois do PUT. (4) `GET /conversations/:id` devolve em `messages` **so a ultima mensagem** (partial `_conversation.json.jbuilder`), nao o historico. O re-check da fase 51 (`avaliarRespostaDoCliente`) usa esse campo e pode perder uma resposta do cliente se houver uma mensagem de atividade depois dela. O correto e `GET .../messages?after=<id>`. (5) A automacao de fechamento do Chatwoot envia so `conversation.webhook_data` (sem conteudo de mensagem), entao a deteccao de "SAIR" exige um webhook de conta `message_created`, que o Chatwoot assina com HMAC.

**Primary recommendation:** construir primeiro um tracer bullet (uma conversa de teste: fechamento com link -> resposta na pagina -> PUT -> aparece em `/reports/csat` e na API de relatorio), atras de uma flag `PESQUISA_ATIVA=false`, antes de qualquer logica de cupom. Ligar em producao so depois da homologacao do roteiro e do desligamento do CSAT nativo. Tres decisoes precisam da confirmacao do usuario antes do plano (ver Open Questions Q1, Q2 e Q4): ambiente de homologacao do Chatwoot, uma pesquisa por conversa e teto mensal rigido ou flexivel.

## Achados que mudam o plano

| # | Achado | Evidencia | Impacto no plano |
|---|--------|-----------|------------------|
| 1 | O PUT publico grava na primeira mensagem `input_csat` da conversa (`find_by!`) | [VERIFIED: chatwoot-rails-1:/app/app/controllers/public/api/v1/csat_survey_controller.rb:22] `    @message = @conversation.messages.find_by!(content_type: 'input_csat')` | Uma pesquisa com registro no Chatwoot por conversa. Segundas pesquisas na mesma conversa nao criam input_csat (ver Q2) |
| 2 | CSAT nativo ligado na inbox 1 do Box | [VERIFIED: SELECT somente leitura em chatwoot-box-postgres-1: `1\|Box Personalizado Atendimento\|Channel::Api\|t`] | Desligar `csat_survey_enabled` na inbox 1 (e na 3 se for WhatsApp) antes de ligar. Sem isso, o cliente recebe dois links |
| 3 | Nativo ja existe e dispara antes do nosso atraso | [VERIFIED: chatwoot-rails-1:/app/app/services/csat_survey_service.rb:35-36] `conversation.messages.where(content_type: :input_csat).present?` e listener `conversation_status_changed` -> `CsatSurveyService.new(...).perform` (csat_survey_listener.rb:2-8) | O nativo nao espera o atraso humano. Desligar e obrigatorio. Se nossa mensagem privada for criada antes, o nativo ate se bloqueia, mas nao se pode contar com essa corrida |
| 4 | O listener CSAT roda assincrono | [VERIFIED: chatwoot-rails-1:/app/app/dispatchers/async_dispatcher.rb:2-4] `EventDispatcherJob.perform_later(event_name, timestamp, data)`; listener na linha 15 `CsatSurveyListener.instance` | A validacao no Chatwoot precisa consultar o relatorio depois de alguns segundos, nao logo apos o PUT |
| 5 | `GET conversation` devolve so a ultima mensagem | [VERIFIED: chatwoot-rails-1:/app/app/views/api/v1/conversations/partials/_conversation.json.jbuilder:30-42] `last_message = conversation.messages.where(...).reorder(created_at: :desc, id: :desc).first` e `json.messages [last_message.try(:push_event_data)]` | O re-check da fase 51 (`enviarMensagemFechamento` -> `avaliarRespostaDoCliente(conversa.messages, ...)`) pode errar. Trocar por `GET .../messages?after=<id>` (ver Q6) |
| 6 | Conversation `uuid` nao vem no webhook | [VERIFIED: chatwoot-rails-1:/app/app/presenters/conversations/event_data_presenter.rb:2-30] `push_data` nao contem `uuid`; `uuid` so aparece no partial de show (`_conversation.json.jbuilder:46`) | O uuid precisa de `GET /conversations/:id` antes de gravar a pesquisa (o re-check ja faz essa leitura) |
| 7 | A automacao nao envia conteudo de mensagem | [VERIFIED: chatwoot-rails-1:/app/app/services/automation_rules/action_service.rb:36-38] `payload = @conversation.webhook_data.merge(event: "automation_event.#{@rule.event_name}")` | "SAIR" nao pode ser detectado pela automacao. Usar webhook de conta com `message_created` (ver Arquitetura) |
| 8 | Webhook de conta assina com HMAC | [VERIFIED: chatwoot-rails-1:/app/lib/webhooks/trigger.rb, metodo `request_headers`] headers `X-Chatwoot-Timestamp` e `X-Chatwoot-Signature` = `sha256=` + HMAC-SHA256(secret, "<ts>.<body>") | Verificar com `rawBody` (ja ligado em `main.ts:11`), no padrao de `efi-webhook.guard.ts:31-32` |
| 9 | Labels: POST substitui e aceita etiqueta nao cadastrada | [VERIFIED: chatwoot-rails-1:/app/app/models/concerns/labelable.rb:9-11] `def update_labels(labels = nil)` / `update!(label_list: labels)`; sem validacao contra labels de conta | `avaliou` e `csat-baixo` funcionam mesmo sem existir na conta; criar na conta so para aparecer na barra lateral e com cor (ver Q7) |
| 10 | Criar label de conta exige corpo aninhado e admin | [VERIFIED: chatwoot-rails-1:/app/app/controllers/api/v1/accounts/labels_controller.rb:11-13 e 39-41] `@label = Current.account.labels.create!(permitted_params)` e `params.require(:label).permit(:title, :description, :color, :show_on_sidebar)`; policy `create?` so `administrator?` | Resolve o conflito A1 da fase 51: o corpo deve ser `{ "label": { ... } }`. Confirmado nas duas versoes |
| 11 | Rota publica tem a 1a rota de contatos com update | [VERIFIED: chatwoot-rails-1:/app/config/routes.rb:266] `resources :contacts, only: [:index, :show, :update, :create, :destroy]` | PATCH/PUT em `/api/v1/accounts/:id/contacts/:id` |
| 12 | Atributos customizados do contato sao mesclados | [VERIFIED: chatwoot-rails-1:/app/app/controllers/api/v1/accounts/contacts_controller.rb:185-189] `return @contact.custom_attributes.merge(permitted_params[:custom_attributes]) if permitted_params[:custom_attributes]` | Atualizar atributos nao apaga os outros. Nao precisa ler antes (diferente das labels) |
| 13 | Throttler global por IP e o proxy do Next compartilha IP | [VERIFIED: apps/backend/src/modules/app.module.ts:89-91] `provide: APP_GUARD` / `useClass: ThrottlerGuard`; [VERIFIED: apps/backend/src/main.ts] sem `trust proxy`; [VERIFIED: apps/frontend/src/lib/backend-client.ts:8-12] o Next chama o backend com `fetch` do servidor | Todas as chamadas publicas vindas do proxy Next chegam do mesmo IP. Usar `@SkipThrottle()` na rota publica e limitar por token (ver Pitfall P8) |
| 14 | A rota de webhook do fechamento usa limite de 30/min | [VERIFIED: apps/backend/src/modules/security/throttle.config.ts:11-14] `THROTTLE_WEBHOOK = { ttl: 60_000, limit: 30 }` | `message_created` dispara a cada mensagem da conta. Com 30/min, pico de atendimento pode descartar SAIR. Usar rota propria com HMAC e limite maior (P9) |
| 15 | Telefone do cliente no projeto nao e normalizado | [VERIFIED: apps/backend/src/modules/quotes/quotes.service.ts:1273] `const phone = customerInput.telefone?.trim();` e [VERIFIED: apps/backend/prisma/schema.prisma:46] `phone String?` | Cupom por telefone e opt-out precisam de chave normalizada propria (digitos, prefixo 55). Nao existe util pronto |
| 16 | Evolution grava telefone do contato com `+` | [VERIFIED: evolution_api_v24 bundle, trecho `c.phone_number=\`+${e}\``] | Normalizar `+5512...` para digitos antes de comparar |
| 17 | Evolution descarta privadas e message_updated | [VERIFIED: evolution_api_v24 bundle] `if(!e?.conversation\|\|e.private\|\|e.event==="message_updated"&&!e.content_attributes?.deleted)return{message:"bot"}` | A mensagem privada `input_csat` nao chega ao cliente. Confirmado em codigo; confirmar em homologacao |
| 18 | PR #75 nao esta em `main` | [VERIFIED: git] `git merge-base --is-ancestor 3709ae5 main` falhou; commit existe em `fix/compose-chatwoot-automation-env` | Pre-condicao de deploy da fase 51 (D-23) continua aberta. Sem as variaveis `CHATWOOT_AUTOMATION_*` nos composes, o fechamento nao roda |
| 19 | Nao ha Chatwoot de homologacao configurado | [VERIFIED: docker inspect orcamento-homolog-fase50] sem `CHATWOOT_BASE_URL` no ambiente | O teste de homologacao precisa de decisao (Q1) |
| 20 | Suite Chatwoot atual passa | [VERIFIED: execucao nesta sessao] `jest src/modules/integrations/chatwoot`: 5 suites, 116 testes, todos passam (6 s) | Base verde para a fase. O research da fase 51 registrava 19 testes (desatualizado) |

## Architectural Responsibility Map

| Capacidade | Tier primario | Tier secundario | Justificativa |
|------------|---------------|-----------------|---------------|
| Gerar a pesquisa (token, variante A/B, expiracao) | API / Backend (`PesquisaService`) | Database / Storage (Prisma) | Regra de negocio; token e persistido |
| Anexar bloco da pesquisa ao fechamento | API / Backend (`ChatwootAutomationService`) | Chatwoot (envio pelo `sendOutgoingMessage`) | Mesmo gancho da fase 51, depois da IA |
| Criar mensagem privada `input_csat` | API / Backend (`ChatwootService`) | Chatwoot (`MessageBuilder`) | Credenciais e base URL ja estao no `ChatwootService` |
| Pagina publica de resposta | Frontend Server (proxy Next, `backendFetch`) | Browser (formulario) | Cliente nunca acessa o backend diretamente (padrao `cobranca/confirmar`) |
| Gravar nota (`PesquisaSatisfacao`) e cupom | API / Backend | Database (unique, updateMany atomico) | Idempotencia e uso unico do cupom |
| Gravar nota no relatorio nativo | Chatwoot (`CsatSurveyResponse`, via PUT publico) | API / Backend (chamada best-effort) | O Chatwoot grava; nos so disparamos |
| Etiquetas `avaliou` / `csat-baixo` e atributos do contato | API / Backend (fila por conversa de `chatwoot-etiquetas.ts`) | Chatwoot | Mesma fila da fase 51 evita o POST que substitui a lista |
| Detectar "SAIR" | API / Backend (webhook `message_created`, HMAC) | Database (lista de supressao) | Chatwoot envia o conteudo; nos filtramos e gravamos |
| Mensagem do cupom e convite Google (WhatsApp) | API / Backend (`sendOutgoingMessage`, com retry) | Chatwoot / Evolution | Mesmo caminho do fechamento; falha vira FALHA + retentativa |
| Teto mensal e situacao "suspenso" | Database (soma de `descontoAplicado` de USADO no mes) | API / Backend (derivacao no GET) | Derivado, sem enum novo (UI-D09) |
| Configuracao e painel | Backend (`@AdminOnly`) | Frontend admin (`adminBackendFetch` + `requireAdminSession`) | Mesmo padrao de `cobranca-encargos` |
| Retencao de 12 meses | API / Backend (`@Cron` com kill-switch) | Database | Padrao dos jobs de cobranca |

## Standard Stack

### Core (ja instalados; nenhum pacote novo)

| Biblioteca | Versao verificada | Uso nesta fase | Por que |
|------------|-------------------|----------------|---------|
| @nestjs/common | 11.1.19 | Controllers, guards, DTOs | Padrao do backend. [VERIFIED: node_modules via require.resolve] |
| @nestjs/throttler | 6.5.0 | `@SkipThrottle()` na rota publica; `getTracker` se precisar | [VERIFIED: node_modules/@nestjs/throttler/dist/throttler.decorator.d.ts:10 exporta `SkipThrottle`] |
| @nestjs/schedule | 6.1.3 | `@Cron` para retentativa e retencao | Padrao de `cobranca-aviso-vencimento.job.ts` |
| @prisma/client / prisma | 5.22.0 | Modelos novos, migracao SQL | [VERIFIED: node_modules] |
| axios | 1.15.2 | Chamadas ao Chatwoot | Padrao de `chatwoot.service.ts` |
| handlebars | (ja em uso) | Textos editaveis com `{link}`, `{percentual}` | Ja usado em `chatwoot-automation.service.ts:79`, com `noEscape: true` |
| node:crypto | builtin | `randomBytes`, `randomInt`, `createHmac`, `timingSafeEqual` | Padrao em `email-envio.service.ts:238`, `efi-webhook.guard.ts`, `chatwoot-automation.controller.ts:30` |
| next | ^16.2.5 | Pagina publica e rotas proxy | [VERIFIED: apps/frontend/package.json:12] |
| jest / ts-jest | ^30.3.0 / ^29.4.9 | Testes | [VERIFIED: apps/backend/package.json] (ja executados) |

### Alternativas consideradas

| Em vez de | Poderia usar | Trade-off |
|-----------|--------------|-----------|
| Agendador em memoria para a retentativa | `@nestjs/schedule` `@Cron` (ja em uso) | Cron sobrevive ao restart, o timer nao. Usar cron para FALHA (decisao: Claude's discretion) |
| `crypto.randomInt` para o codigo | nanoid / biblioteca de codigo | Nao compensa; builtin tem rejeicao sem vies |
| Webhook com token no path | HMAC `X-Chatwoot-Signature` | HMAC e melhor (segredo nao fica em logs de URL). O padrao do projeto e token no path (`chatwoot-automation.controller.ts:43-45`). Recomendado HMAC para `message_created` (Q10) |
| Lista de telefones em CSV | Tabela `PesquisaSupressao` | Tabela e auditavel e cabe no Prisma |

**Installation:** nenhuma.

## Package Legitimacy Audit

**Nenhum pacote externo novo e instalado nesta fase.** O gate de legitimidade (`gsd-tools query package-legitimacy check`) nao foi executado porque nao ha pacote a verificar. Se o planner decidir adicionar Playwright, Vitest ou outra biblioteca para o frontend (que nao tem suite de testes), ela precisa passar pelo gate antes de entrar no plano.

## Architecture Patterns

### Fluxo ponta a ponta (proposta)

```
[Fechamento: webhook conversation_resolved -> ChatwootAutomationService]
   |  (fase 51, sem alteracao) etiquetas finalizado/cliente-frequente na hora (fila por conversa)
   |  agenda envio com atraso humano (setTimeout por conversa, 45-180 s)
   v
[enviarMensagemFechamento - re-check (GET conversation + GET messages?after=)]
   |  se ok: PesquisaService.criarPesquisa(conversa)  -> token randomBytes(24), variante A/B, expiraEm
   |  texto IA + bloco fixo (link /pesquisa/<token>, recompensa, "Responda SAIR") -> sendOutgoingMessage
   |  depois do envio ok: createPrivateMessage(input_csat) (best-effort) e grava conversationUuid
   v
[Cliente abre /pesquisa/<token>]  Next (proxy backendFetch) -> GET /api/pesquisa/<token>  (@Public, @SkipThrottle)
   |  formulario: nota 1-5 (radio), comentario opcional (max 500)
   v
[POST resposta]  -> valida token, nao respondido, nao expirado -> grava nota
   |-- PUT /public/api/v1/csat_survey/<uuid> (best-effort, fila por conversa)   -> CsatSurveyResponse (async no Chatwoot)
   |-- nota privada + atributos do contato + etiquetas avaliou / csat-baixo (fila por conversa)
   |-- cupom: se elegivel (sem supressao, teto mensal ok, intervalo 90 dias ok) -> CupomRecompensa EMITIDO
   |-- WhatsApp 1: cupom (sem link), status envioCupomStatus
   |-- WhatsApp 2: convite Google (um link), independente da nota e do cupom
   v
[Pagina de agradecimento] cupom + botao Avaliar no Google (UI-SPEC)

[Webhook message_created (conta Chatwoot, HMAC)] -> filtra incoming e private=false -> texto normalizado == "SAIR" -> PesquisaSupressao

[Admin /configuracoes/pesquisa, /cupons] -> /api/admin/* (requireAdminSession) -> backend @AdminOnly (x-admin-api-key)
```

### Estrutura de modulo (proposta; nomes a criterio do planner)

```
apps/backend/src/modules/pesquisa/
├── pesquisa-regras.ts              # PURO: token, normalizarTelefone, ehOptOut, gerarCodigoCupom,
│                                   #       calcularDescontoCentavos, situacaoCupom, janelaMesSaoPaulo, sortearVariante, validarNota
├── pesquisa-regras.test.ts
├── pesquisa-config.service.ts      # singleton id "default" (padrao CobrancaEncargosConfigService)
├── pesquisa.service.ts             # criarPesquisa, registrarResposta, emitirCupom, enviarMensagensPosResposta
├── pesquisa-public.controller.ts   # @Public @SkipThrottle: GET/POST /pesquisa/:token
├── pesquisa-admin.controller.ts    # @AdminOnly: config, painel, cupons (buscar, resgatar)
├── pesquisa-webhook.controller.ts  # POST webhook message_created (HMAC, rawBody)
├── pesquisa-retry.job.ts           # @Cron: reenvio de FALHA (cupom, convite, Chatwoot)
├── pesquisa-retencao.job.ts        # @Cron: anonimiza apos 12 meses
└── pesquisa.module.ts
apps/backend/src/modules/integrations/chatwoot/
├── chatwoot.service.ts             # + createPrivateCsatMessage, submitCsatResponse, listMessagesAfter,
│                                   #   updateContactCustomAttributes, createAccountLabel (mesma credencial de env)
└── chatwoot-automation.service.ts  # + anexar bloco e criar pesquisa no envio (ver Pitfall P3 sobre construtor)
```

### Modelo de dados (PROPOSTA; nomes a criterio do planner)

Consistente com o CONTEXT (modelos novos, migracao SQL aditiva e idempotente como em `20261117120000_add_cobranca_boleto_atualizado`, que usa `ADD COLUMN IF NOT EXISTS` e `CREATE TABLE IF NOT EXISTS`).

```prisma
// Config singleton (padrao: ChatwootAutomationConfig schema.prisma:441-447, CobrancaEncargosConfig schema.prisma:450-455)
model PesquisaConfig {
  id                 String   @id @default("default")
  ativo              Boolean  @default(false)     // kill-switch; default desligado
  percentualDesconto Decimal  @db.Decimal(5, 2)   // UI-D15: 1 a 50
  tetoDesconto       Decimal  @db.Decimal(12, 2)
  compraMinima       Decimal  @db.Decimal(12, 2)
  validadeCupomDias  Int                          // UI-D15: 1 a 180; CONTEXT padrao 30
  validadeLinkDias   Int                          // UI-D14: 1 a 14; padrao 7
  intervaloDias      Int                          // padrao 90 (CONTEXT: intervalo por cliente); UI-D15: 0 a 365
  tetoMensal         Decimal  @db.Decimal(12, 2)  // padrao 300
  prefixoCupom       String
  linkGoogle         String?                      // allowlist de dominio (P14)
  varianteVisual     String                       // ESTRELAS | CARINHAS | AB
  textoFechamento    String   @db.Text            // bloco fixo do fechamento
  textoSemRecompensa String   @db.Text
  textoPosResposta   String   @db.Text            // WhatsApp com cupom, sem link
  textoConviteGoogle String   @db.Text            // WhatsApp com um link
  atualizadoEm       DateTime @updatedAt
  atualizadoPor      String?
}

// Uma pesquisa por link enviado
model PesquisaSatisfacao {
  id               String    @id @default(uuid())
  token            String    @unique             // randomBytes(24).toString("hex") -> 48 caracteres
  conversationId   BigInt    @db.BigInt
  conversationUuid String?                       // de GET conversation; necessario para o PUT
  contactId        BigInt?   @db.BigInt          // sender.id, para atributos e etiquetas
  telefone         String                        // normalizado (ver normalizarTelefone)
  customerId       String?
  variante         String                        // ESTRELAS | CARINHAS (gravada no envio, UI-D03)
  nota             Int?                          // 1..5 (CsatSurveyResponse exige 1..5)
  comentario       String?   @db.VarChar(500)
  status           String                        // ENVIADA | FALHA | (respondida = respondidaEm != null)
  chatwootCsat     String?                       // PENDENTE | OK | FALHA | NAO_APLICAVEL (2a pesquisa na conversa)
  criadaEm         DateTime  @default(now())
  expiraEm         DateTime
  respondidaEm     DateTime?
  @@index([conversationId])
  @@index([telefone, criadaEm])
}

// Cupom unico por pesquisa (UI-D09: SUSPENSO e derivado; nao entra no enum)
enum CupomStatus {
  EMITIDO
  USADO
  EXPIRADO
  CANCELADO
}

model CupomRecompensa {
  id                 String      @id @default(uuid())
  codigo             String      @unique
  pesquisaId         String      @unique
  telefone           String
  percentual         Decimal     @db.Decimal(5, 2)
  teto               Decimal     @db.Decimal(12, 2)
  compraMinima       Decimal     @db.Decimal(12, 2)
  status             CupomStatus @default(EMITIDO)
  validadeAte        DateTime
  envioCupomStatus   String      // PENDENTE | ENVIADA | FALHA
  envioConviteStatus String      // PENDENTE | ENVIADA | FALHA | NAO_APLICAVEL
  valorCompra        Decimal?    @db.Decimal(12, 2)
  descontoAplicado   Decimal?    @db.Decimal(12, 2)
  usadoEm            DateTime?
  usadoPor           String?
  criadoEm           DateTime    @default(now())
  @@index([telefone, criadoEm])     // regra de intervalo de 90 dias
  @@index([status, usadoEm])        // soma do teto mensal
}

// Opt-out (SAIR)
model PesquisaSupressao {
  telefone  String   @id
  origem    String   @default("SAIR")
  criadoEm  DateTime @default(now())
}
```

### Padroes do projeto a reutilizar

- **Token publico:** `randomBytes(24).toString("hex")` [VERIFIED: apps/backend/src/modules/cobranca/email-envio.service.ts:238], link montado com `APP_BASE_URL` (mesmo arquivo, linhas 240-245, comentario: o dominio publico e o do FRONTEND).
- **Pagina publica com proxy:** [VERIFIED: apps/frontend/src/app/cobranca/confirmar/[token]/route.ts:8-25] `backendFetch(\`/cobranca/email/${encodeURIComponent(token)}/confirmar\`)`, com `Cache-Control: no-store` e HTML de erro com status 502.
- **Rota publica no backend:** [VERIFIED: apps/backend/src/modules/cobranca/cobranca.controller.ts:73, 85 e 292] `@Public()`. O guard global `InternalAuthGuard` pula rotas `@Public` [VERIFIED: apps/backend/src/modules/security/internal-auth.guard.ts:21-23 `if (isPublic) { return true; }`]. Mas o proxy Next continua enviando `x-internal-api-key` (`backend-client.ts:4-5`).
- **Singleton de configuracao:** [VERIFIED: apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts:22-30] `findUnique({ where: { id: "default" } })` e, se nao existir, `create({ data: { id: "default" } })`.
- **Admin:** [VERIFIED: apps/backend/src/modules/cobranca/cobranca-encargos-config.controller.ts:36-48] `@AdminOnly()` em `GET`/`PUT`. Proxy Next [VERIFIED: apps/frontend/src/app/api/admin/cobranca-encargos/route.ts:12-21] `if (!requireAdminSession(req)) return unauthorized();` e `adminBackendFetch(CAMINHO_BACKEND)`.
- **Menu:** [VERIFIED: apps/frontend/src/app/contas-receber/admin-shell.tsx:26-34] `PA_NAV_ITEMS` com filhos de "Configurações"; UI-SPEC ja define os novos itens (Cupons e Pesquisa e recompensa).
- **Cron com kill-switch:** [VERIFIED: apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts:35-40] `@Cron("0 8,14 * * *", { name: ..., timeZone: "America/Sao_Paulo" })`, env `COBRANCA_AVISO_ATIVO !== "true"` -> ignora, e guarda `running`.
- **Webhook com HMAC e rawBody:** [VERIFIED: apps/backend/src/modules/security/efi-webhook.guard.ts:31-32] `const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), "utf8");` e `createHmac("sha256", secret).update(raw).digest("hex")`. [VERIFIED: apps/backend/src/main.ts:11] `rawBody: true`.
- **Fila por conversa e mesclagem de labels:** [VERIFIED: apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts:197-217 `enfileirarPorConversa`; 54-61 `mesclarEtiquetas`; 90-103 `aplicarEtiquetasGerenciadas`].
- **Textos com placeholders:** [VERIFIED: apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts:78-80] `Handlebars.compile(template, { noEscape: true })({ saudacao })`.

### Anti-padroes a evitar
- **Criar input_csat antes do envio da mensagem com o link:** se o envio falhar, fica uma mensagem privada sem link e o PUT grava numa pesquisa que o cliente nunca viu.
- **Segunda input_csat na mesma conversa:** o PUT pega a primeira (Achado 1).
- **Chamada ao Chatwoot dentro de `$transaction`:** mesma regra da fase 51 (segura a transacao aberta).
- **`@Throttle` ou limite global por IP na rota publica:** todos os clientes compartilham o IP do proxy Next (Achado 13).
- **Reenviar o corpo com `JSON.stringify` para validar HMAC:** o Chatwoot assina o `to_json` do Ruby; usar `rawBody`.
- **Ler labels e gravar sem a fila por conversa:** o POST substitui a lista (Achado 9). Labels de pesquisa precisam passar pela mesma fila de `chatwoot-etiquetas.ts`.
- **Cupom com validacao so no cliente:** o resgate deve ser atomico no banco (`updateMany` com `where: { status: "EMITIDO" }`).

## Don't Hand-Roll

| Problema | Nao construir | Usar | Por que |
|----------|---------------|------|---------|
| Token da pesquisa e do cupom | gerador proprio ou `Math.random` | `randomBytes(24).toString("hex")` | Mesmo padrao de `email-envio.service.ts:238`; 192 bits |
| Codigo do cupom legivel | `Math.random().toString(36)` | `crypto.randomInt` sobre alfabeto sem ambiguos | Sem vies; sem 0/O/1/I/L |
| Assinatura do webhook de SAIR | comparacao com `===` | `createHmac` + `timingSafeEqual` (padrao de `chatwoot-automation.controller.ts:28-31`) | Evita timing attack; ja usado no projeto |
| Mesclar etiquetas | GET + merge proprio | `mesclarEtiquetas` / `aplicarEtiquetasGerenciadas` | Ja testado (chatwoot-etiquetas.test.ts, 33 testes) |
| Atraso aleatorio da mensagem | `Math.random` uniforme | `sortearAtrasoHumanoMs` (triangular) | Ja existe |
| Texto editavel com placeholders | parser proprio | Handlebars `noEscape: true` | Ja em uso; placeholders `{link}`, `{percentual}` (UI-SPEC) |
| Dinheiro | `number` com floats | centavos inteiros (`Math.floor(compraCentavos * percentualBps / 10000)`) ou `Prisma.Decimal` | Evita erro de arredondamento; quotes.service ja usa Decimal |
| Normalizacao de telefone | so `replace(/\D/g, "")` | funcao propria `normalizarTelefone` com prefixo 55 e teste | Nao existe util; sem regra o mesmo numero vira duas chaves |
| Contador de cupons por cliente | tabela agregada | `count` com indice `[telefone, criadoEm]` | Volume pequeno; mesmo raciocinio da fase 51 |
| Limite de taxa por token | biblioteca nova | `@SkipThrottle()` + contador por token no banco (ou `getTracker` do throttler) | Evita pacote novo e o problema de IP compartilhado |

**Key insight:** o CSAT do Chatwoot ja cobre o relatorio, a nota e a validade de 14 dias. O que e nosso e o link, o cupom, o opt-out e a fila. Nao reimplementar o relatorio.

## Code Examples

Trechos de referencia. Valores de contrato (nomes de campo, rotas e enums) vem das fontes verificadas acima. Os trechos marcados como PROPOSTA nao foram executados.

### Chatwoot: mensagem privada `input_csat` (PROPOSTA para `ChatwootService`)

Contrato verificado: `MessageBuilder` le `params[:private]` (4.19.1 `message_builder.rb:10`), `content_type` vai direto para o modelo (`message_builder.rb:169`), e `content_type` e enum com `input_csat: 9` (`message.rb:99`).

```ts
// PROPOSTA — apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
async createPrivateCsatMessage(conversationId: string, content: string) {
  const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
  const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
  const token = this.config.get<string>("CHATWOOT_API_TOKEN");
  if (!baseUrl || !accountId || !token) return { enabled: false };

  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const response = await axios.post(
    url,
    { content, message_type: "outgoing", private: true, content_type: "input_csat" },
    { headers: { api_access_token: token }, timeout: 10000 },
  );
  return { enabled: true, id: response.data?.id };   // id: [ASSUMED] campo do jbuilder de create; confirmar na homologacao
}
```

### Chatwoot: enviar a nota ao relatorio nativo (PROPOSTA)

Contrato verificado: rota `namespace :public` > `namespace :api` > `resources :csat_survey, only: [:show, :update]` (routes.rb:672-691), e o `params.permit` aceita hash (csat_survey_controller.rb:26). A rota e publica (sem `api_access_token`).

```ts
// PROPOSTA — ChatwootService
async submitCsatResponse(conversationUuid: string, rating: 1 | 2 | 3 | 4 | 5, feedback?: string) {
  const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
  if (!baseUrl) return { enabled: false };
  const url = `${baseUrl}/public/api/v1/csat_survey/${conversationUuid}`;
  await axios.put(
    url,
    { message: { submitted_values: { csat_survey_response: { rating, feedback_message: feedback ?? "" } } } },
    { timeout: 10000 },
  );
  return { enabled: true };
}
```

Atencao: `feedback_message` vazio e aceito (ResponseBuilder so exige `rating.present?`, response_builder.rb:11). O PUT devolve o partial `public/api/v1/models/csat_survey` (update.json.jbuilder), que inclui `csat_survey_response`. Esse campo deve vir nulo logo apos o PUT, porque a gravacao roda no listener assincrono (Achado 4). Nao usar o retorno do PUT como confirmacao; a confirmacao e a leitura posterior do relatorio.

### Chatwoot: re-check com historico (PROPOSTA; corrige o Achado 5)

Contrato verificado: `messages_after` (message_finder.rb:39-41) devolve `created_at asc`, `id > after`, limite 100; `filter_internal_messages` exclui privadas e atividades (message_finder.rb:19-23).

```ts
// PROPOSTA — ChatwootService
async listMessagesAfter(conversationId: string, afterId: number) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const response = await axios.get(url, {
    params: { after: afterId, filter_internal_messages: true },
    headers: { api_access_token: token },
    timeout: 10000,
  });
  return Array.isArray(response.data?.payload) ? response.data.payload : null; // null = indeterminado
}
// Regra: se algum item com message_type 0 (incoming) e created_at > resolvidaEm -> "resposta_nova".
// afterId = id da ultima mensagem no momento do agendamento do fechamento (guardar na hora do webhook).
```

### Chatwoot: atributos do contato (PROPOSTA)

Contrato verificado: merge (contacts_controller.rb:185-186); rota `resources :contacts, only: [..., :update]` (routes.rb:266).

```ts
// PROPOSTA — ChatwootService
async updateContactCustomAttributes(contactId: number, attrs: Record<string, string | number>) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}`;
  await axios.put(url, { custom_attributes: attrs }, { headers: { api_access_token: token }, timeout: 10000 });
}
// Chaves em snake_case, ex.: ultima_nota_csat, data_ultima_avaliacao, cupom_ativo, cupom_validade.
```

### Chatwoot: criar etiqueta de conta (PROPOSTA; uso manual ou no roteiro)

Contrato verificado: `params.require(:label).permit(:title, :description, :color, :show_on_sidebar)` (labels_controller.rb:40 na 4.19.1; mesma linha na 4.12.1). Admin apenas (label_policy `create?`).

```ts
// Body CORRETO (aninhado em "label"); o formato plano da documentacao falha
await axios.post(
  `${baseUrl}/api/v1/accounts/${accountId}/labels`,
  { label: { title: "avaliou", show_on_sidebar: true } },   // "color": formato [ASSUMED] (hex), omitido
  { headers: { api_access_token: adminToken } },           // token de ADMINISTRADOR
);
```

### Webhook `message_created`: HMAC e filtro (PROPOSTA)

Contrato verificado: `X-Chatwoot-Timestamp` e `X-Chatwoot-Signature: sha256=HMAC(secret, "<ts>.<body>")` (lib/webhooks/trigger.rb). Mensagens enviadas para o webhook: `webhook_sendable?` = incoming/outgoing/template (message_filter_helpers.rb:8-10), ou seja, **inclui nossas mensagens privadas**.

```ts
// PROPOSTA — pesquisa-webhook.controller.ts
import { createHmac, timingSafeEqual } from "crypto";

function assinaturaValida(rawBody: Buffer, ts: string, assinatura: string, secret: string): boolean {
  const agora = Math.floor(Date.now() / 1000);
  if (Math.abs(agora - Number(ts)) > 300) return false;            // tolerancia de 5 min [ASSUMED]
  const esperado = "sha256=" + createHmac("sha256", secret).update(`${ts}.`).update(rawBody).digest("hex");
  const a = Buffer.from(esperado), b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Filtro: message_type === "incoming" && private === false && ehOptOut(content) -> PesquisaSupressao.upsert
// Demais eventos: 200 sem efeito (o Chatwoot faz retry em erro).
```

### Regras puras (PROPOSTA)

```ts
// PROPOSTA — pesquisa-regras.ts
import { randomBytes, randomInt } from "crypto";

export const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0, 1, I, L, O

export function gerarToken(): string {
  return randomBytes(24).toString("hex");                 // 48 caracteres
}

export function gerarCodigoCupom(prefixo: string): string {
  let sufixo = "";
  for (let i = 0; i < 6; i++) sufixo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return `${prefixo}-${sufixo}`;
}

/** Desconto em centavos: percentual em basis points (10% = 1000); arredonda para baixo; limita ao teto e a compra. */
export function calcularDescontoCentavos(compraCentavos: number, percentualBps: number, tetoCentavos: number): number {
  const bruto = Math.floor((compraCentavos * percentualBps) / 10000);
  return Math.max(0, Math.min(bruto, tetoCentavos, compraCentavos));
}

/** Telefone: so digitos; 10 ou 11 digitos sem DDI recebem 55. Retorna null se nao parecer telefone brasileiro. */
export function normalizarTelefone(bruto: string): string | null {
  let digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return /^55\d{10,11}$/.test(digitos) ? digitos : null;
}

/** Opt-out: texto normalizado (sem acento, sem pontuacao, maiusculo) igual a SAIR. */
export function ehOptOut(texto: string): boolean {
  const normal = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}]/gu, "").toUpperCase();
  return normal === "SAIR";
}
```

Exemplos de `normalizarTelefone`: `"+5512996484918"` -> `"5512996484918"`; `"(12) 99648-4918"` -> `"5512996484918"`; `"12 3456-7890"` -> `"551234567890"`.

## Common Pitfalls

### P1: Resposta do CSAT nativo duplicada
**O que da errado:** o cliente recebe a mensagem do CSAT nativo (texto com link) e a nossa.
**Por que acontece:** `CsatSurveyService` dispara em `conversation_status_changed` -> `resolved` (csat_survey_listener.rb:2-8), sem atraso, e so checa `input_csat` existente (csat_survey_service.rb:35-36).
**Como evitar:** desligar `csat_survey_enabled` nas inboxes WhatsApp antes de ligar a funcao. Box: inbox 1 esta ligada hoje. Bom Custo: todas desligadas (consulta de leitura). Incluir o passo no roteiro (gate de deploy).
**Sinais:** duas mensagens com link na mesma conversa, uma com `private = f` e `content_type = 9`.

### P2: Pesquisa gravada na mensagem errada
**O que da errado:** o PUT grava a nota na primeira `input_csat` da conversa, nao na da pesquisa atual.
**Por que acontece:** `find_by!` sem ordenacao explicita; default_scope `order(created_at: :asc)` (message.rb:130).
**Como evitar:** uma pesquisa com `input_csat` por conversa. Para as demais, `chatwootCsat = NAO_APLICAVEL` e a nota fica so no nosso banco, com nota privada e etiqueta. Decisao em Q2.

### P3: Mudanca no construtor quebra testes
**O que da errado:** adicionar `PesquisaService` ao construtor de `ChatwootAutomationService` quebra `chatwoot-automation.service.test.ts:147` e `chatwoot-fechamento-agendado.test.ts:72` (ambos com 3 argumentos).
**Como evitar:** atualizar os dois testes no mesmo plano (custo baixo, 2 linhas) ou usar injecao opcional. Recomendado: atualizar os testes e manter o construtor explicito.

### P4: Mensagem privada que vira mensagem para o cliente
**O que da errado:** se `private` nao for enviado, `content_with_survey_link` (message_content_presenter.rb:16-28) reescreve o `input_csat` como texto + link e a Evolution envia.
**Como evitar:** `private: true` obrigatorio no POST. Teste automatizado que verifica o corpo do POST. Homologacao: conferir no WhatsApp de teste que nada chegou.

### P5: Re-check perde a resposta do cliente
**O que da errado:** o cliente responde, o sistema grava uma mensagem de atividade depois dessa resposta (troca de etiqueta gera mensagem de atividade: `conversation.rb:421-428`, `create_label_change` -> `create_label_added`/`create_label_removed`), e o `GET conversation` mostra so essa atividade. A resposta do cliente fica invisivel e a despedida e enviada.
**Por que acontece:** `messages` do GET e so a ultima mensagem (Achado 5).
**Como evitar:** `GET .../messages?after=<id>&filter_internal_messages=true` com o id guardado no agendamento. Corrige a fase 51 tambem (divida a registrar).

### P6: Etiqueta de pesquisa apagada pelo fechamento seguinte
**O que da errado:** `avaliou` e `csat-baixo` somem quando a conversa fecha de novo.
**Por que acontece:** o fechamento faz POST de `["finalizado", ...]`, que substitui a lista inteira (`addConversationLabels`, chatwoot.service.ts:95-107; `handleConversationResolved` -> `enfileirarEtiquetasFinalizado`). `avaliou` e `csat-baixo` nao estao em `ETIQUETAS_GERENCIADAS` (chatwoot-etiquetas.ts:42), entao as mesclagens posteriores os preservam, mas o fechamento nao.
**Como evitar:** decidir se o fechamento deve preservar essas labels (ajustar `ETIQUETA_FINALIZADO`-path para mesclar) ou aceitar que cada novo fechamento zera o estado. Recomendado: mesclar, para que `avaliou` e `csat-baixo` acompanhem a ultima pesquisa (Q8).

### P7: Labels escritas em paralelo
**O que da errado:** duas escritas (ex.: resposta do cliente e troca de status) apagam uma delas.
**Como evitar:** toda escrita de label da pesquisa passa por `enfileirarPorConversa` (chatwoot-etiquetas.ts:197-217), com leitura fresca dentro da fila (mesma regra R1 da fase 51).

### P8: Limite de taxa compartilhado pelo proxy
**O que da errado:** o `ThrottlerGuard` global (APP_GUARD, app.module.ts:89-91) tem limite padrao de 60/min por rota e IP (THROTTLE_DEFAULT, throttle.config.ts:1-4). Como o Next chama o backend, todos os clientes aparecem com o IP do servidor do Next; no pico, a pagina da pesquisa retorna 429.
**Como evitar:** `@SkipThrottle()` na rota publica, e um limite por token no banco (ex.: 20 tentativas por hora por token) ou `getTracker` que usa o token. Nao usar IP como chave.
**Nota:** o `main.ts` nao define `trust proxy`, entao `req.ip` e o IP do proxy mesmo com `X-Forwarded-For`.

### P9: Webhook de SAIR descartado sob carga
**O que da errado:** `message_created` dispara para cada mensagem da conta (in e out). Com `THROTTLE_WEBHOOK` (30/min, throttle.config.ts:11-14), o SAIR pode ser descartado num pico de atendimento.
**Como evitar:** rota propria (`/integrations/chatwoot/pesquisa/webhook`) com HMAC (que ja e a autenticacao), `@SkipThrottle()` ou limite alto, e filtro rapido (`message_type` e `private`) antes de qualquer consulta ao banco.

### P10: Teto mensal ultrapassado por um resgate
**O que da errado:** o teto e checado na emissao (UI-SPEC: "novos cupons deixam de ser emitidos"), e o resgate so bloqueia quando o mes ja esta em "Suspenso" (UI-SPEC, linha 537). Um cupom resgatado com o mes em R$299 pode levar o total a R$299 + desconto.
**Limite do dano:** o excesso e no maximo um desconto de cupom (teto por cupom: R$2 Box, R$5 Bom Custo). Decisao em Q4.

### P11: Mes de referencia no fuso errado
**O que da errado:** o teto mensal e o "cupom suspenso ate dia 1" usam o mes do servidor (UTC).
**Como evitar:** calcular o mes em `America/Sao_Paulo`, como `getHoraSaoPaulo` (chatwoot-automation.service.ts:69-76, `Intl.DateTimeFormat` com `timeZone`). Ex.: `2026-12-01T01:00Z` ja e novembro em Sao Paulo.

### P12: Duplicidade de cupom por clique duplo ou resgate duplo
**O que da errado:** dois cliques no formulario ou dois balcoes resgatam o mesmo codigo.
**Como evitar:** resgate com `updateMany({ where: { id, status: "EMITIDO" }, data: { status: "USADO", ... } })` e checar `count === 1`; sem isso retornar 409 (ja previsto no UI-SPEC, linha 529). Pesquisa: `respondidaEm` gravado com `updateMany` condicionado a `respondidaEm: null`.

### P13: Telefone em formatos diferentes
**O que da errado:** o mesmo cliente recebe dois cupons (ou o opt-out nao vale) porque o telefone esta gravado como `+5512...`, `(12) 99648-4918` ou `12996484918`.
**Por que acontece:** `Customer.phone` e gravado cru (quotes.service.ts:1273, schema.prisma:46); a Evolution grava `+` (bundle).
**Como evitar:** `normalizarTelefone` em todas as chaves (pesquisa, cupom, supressao). Teste com os tres formatos.

### P14: Link do Google aberto para dominio arbitrario
**O que da errado:** o admin (ou alguem com acesso) grava um link que nao e do Google, e o cliente e levado a outro site pelo botao da pagina.
**Como evitar:** validar `linkGoogle` no DTO com allowlist de dominios do Google (confirmar quais: Q12) e `https`. Rotulo "abre em nova aba" (UI-SPEC) com `rel="noopener noreferrer"`.

### P15: Link de pesquisa expira depois do limite do Chatwoot
**O que da errado:** o Chatwoot bloqueia o PUT apos 14 dias da mensagem `input_csat` (csat_survey_controller.rb:29-31: `(Time.zone.now.to_date - @message.created_at.to_date).to_i > 14`), mas o link nosso vale mais.
**Como evitar:** `validadeLinkDias` <= 14 (UI-D14). A mensagem `input_csat` e criada no envio, entao o relogio e o mesmo.

### P16: Restart perde o envio agendado (aceito)
**O que da errado:** o timer em memoria some no restart; a despedida nao sai. O cupom e a pesquisa so existem se o envio foi feito, entao nao ha pesquisa orfa.
**Como evitar:** aceito (D-12, D-24 da fase 51). Criar a pesquisa no envio, nao no agendamento.

### P17: "SAIR" reabre conversa resolvida
**O que da errado:** a resposta "SAIR" e mensagem de entrada; em conversa resolvida, a Chatwoot reabre (message.rb:414-421, `reopen_resolved_conversation` -> `conversation.open!` para `inbox.api?`, message.rb:439-441). Isso aparece na fila do atendente e pode disparar nova automacao de fechamento depois.
**Como evitar:** aceitar e documentar, ou responder "SAIR" com nota privada e etiqueta para o atendente. Q9.

### P18: Convite do Google junto com o cupom
**O que da errado:** a politica do Google proibe oferecer incentivo em troca de avaliacao (ver Fontes). Se o cupom aparecer na mesma mensagem ou no mesmo texto do convite, o convite passa a parecer incentivado.
**Como evitar:** duas mensagens separadas (UI-D08), convite sem nenhuma referencia a cupom, e a recompensa sempre ligada a responder a pesquisa, nunca a nota nem a avaliacao. Revisar os textos padrao do UI-SPEC contra isso.

### P19: Rajada de mensagens no WhatsApp
**O que da errado:** para um cliente, o fluxo envia ate tres mensagens em poucos minutos (fechamento, cupom, convite). O risco de banimento do WhatsApp via Evolution (nao oficial) cresce com a cadencia.
**Como evitar:** atraso humano entre o cupom e o convite (ex.: 60-180 s, reaproveitando `sortearAtrasoHumanoMs`) e nunca mais de uma mensagem com link por envio. [ASSUMED: limiar de risco, sem fonte oficial.]

### P20: Uma escrita no Chatwoot de producao durante a validacao
**O que da errado:** testar em conversa real envia mensagens a clientes.
**Como evitar:** Q1. Enquanto nao houver ambiente de teste, validar apenas leitura (GET e SELECT) e o codigo; nao criar mensagens. Regra do projeto: nao escrever em producao sem pedido.

## Security Domain

Obrigatorio (security_enforcement nao esta desligado; config absente = ativo).

### Categorias ASVS aplicaveis

| Categoria | Aplica | Controle padrao |
|-----------|--------|-----------------|
| V2 Autenticacao | Sim (rota publica, token) | Token de 192 bits (`randomBytes(24)`), expiracao, uso unico da resposta; mensagem de erro identica para token invalido, expirado ou usado (UI-SPEC: "Inválida, expirada ou desativada") |
| V3 Gestao de sessao | Parcial | Sem sessao para o cliente. Cookie admin ja existente (`orcamento_admin_session`, admin-session.ts:18) para o painel e a tela Cupons |
| V4 Controle de acesso | Sim | Admin: `@AdminOnly()` (x-admin-api-key) + `requireAdminSession` no proxy. Publico: somente `@Public()` nas rotas de token |
| V5 Validacao de entrada | Sim | DTO com class-validator: `nota` inteiro 1-5; `comentario` string <= 500; `codigo` regex do alfabeto; `valorCompra` positivo com 2 casas; `linkGoogle` allowlist https |
| V6 Criptografia | Sim | `randomBytes`, `randomInt`, HMAC-SHA256 com `timingSafeEqual`. Nunca `Math.random` |
| V7 Log e erro | Sim | Log sem telefone completo (mascarar: ultimos 4 digitos), sem token, sem texto da mensagem (padrao de `enviarMensagemFechamento`, chatwoot-automation.service.ts:299-301) |
| V8 Protecao de dados | Sim | LGPD: retencao 12 meses (CONTEXT, memoria) com job de anonimizacao; opt-out; comentario livre pode conter dado pessoal |
| V9 Comunicacao | Sim | HTTPS via `APP_BASE_URL`; cabecalho `Referrer-Policy: no-referrer` na pagina publica (token esta na URL) |
| V13 API | Sim | Rota publica com `@SkipThrottle` + limite por token; rota de webhook com HMAC e `rawBody` |

### Ameacas

| Padrao | STRIDE | Mitigacao |
|--------|--------|-----------|
| Forca bruta de token | Spoofing | 192 bits + limite por token + resposta generica |
| Reuso de link para responder varias vezes | Tampering | `respondidaEm` condicionado; pagina "Ja respondida" sem reexibir cupom (UI-D06) |
| Resgate duplicado de cupom | Tampering | `updateMany` condicionado a EMITIDO; 409 |
| Cupom resgatado sem lancar no Athos | Repudiation | Registro de `usadoPor` e `usadoEm`; confirmacao dupla no balcao (UI-D11); lembrete de lancar no PDV |
| Webhook forjado (SAIR falso) | Spoofing | HMAC `X-Chatwoot-Signature` + janela de timestamp |
| Vazamento de telefone em log | Information disclosure | Mascarar, nao logar corpo nem token |
| XSS no comentario (admin e pagina) | Tampering | React escapa por padrao; nao usar `dangerouslySetInnerHTML`; limitar tamanho |
| Open redirect pelo link do Google | Tampering | Allowlist de dominio + https |
| Enumeracao de pesquisas via IDs | Information disclosure | IDs do banco nunca expostos; so token na URL |
| Abuso do endpoint de resgate por credencial vazada | Elevation | Mesmo controle do admin (senha da tela + x-admin-api-key); auditar `usadoPor` |

## Compliance e textos (LOW; decisao do usuario e conferencia juridica)

- **Recompensa pelo ato de responder, nunca pela nota:** decisao do CONTEXT (qualquer nota). Consistente com a politica do Google (ver Fontes): a recompensa nao e pela avaliacao no Google.
- **Convite do Google separado do cupom:** UI-D08 e P18.
- **Opt-out "SAIR":** o CONTEXT suprime pesquisa e convite, nao mensagens de servico. Base legal e prazo de atendimento do opt-out nao foram verificados em fonte oficial. [ASSUMED: revogacao deve ser processada sem demora e registrada; prazos de 24 a 48 h e registro de 5 anos vem de fornecedores, nao da LGPD.]
- **Base legal para enviar pesquisa e cupom apos o atendimento:** [ASSUMED: sem consulta a texto oficial. O legitimo interesse para pesquisa pos-venda e possivel, mas oferta de desconto pode ser tratada como marketing, o que pode exigir consentimento. Pedir parecer do Legal Compliance Checker, ja consultado na fase, antes de ligar em producao.]
- **Retencao de 12 meses:** CONTEXT (memoria do projeto). Implementacao: anonimizar `telefone`, `comentario` e `contactId` apos 12 meses; manter agregados (nota, data, variante) para o painel. [ASSUMED: prazo de anonimizacao.]
- **Textos com placeholders e acentuacao:** textos do fechamento usam `{link}`, `{percentual}`, `{teto}`, `{compra_minima}`, `{validade}`, `{codigo}`, `{link_google}`, `{nome_empresa}` (UI-SPEC linha 301). Sem emoji nos textos de cupom (padrao das mensagens do projeto).

## State of the Art

| Abordagem antiga | Abordagem atual nesta fase | Quando mudou | Impacto |
|------------------|----------------------------|--------------|---------|
| CSAT nativo enviado como texto com link (`Channel::Api`) | Mensagem privada `input_csat` criada pela API + PUT publico | Comportamento observado no Bom Custo em 2025 (127 mensagens nao privadas) | Cliente ve so a nossa pagina; relatorio nativo continua preenchido |
| Formulario de CSAT visual | Pagina propria `/pesquisa/[token]` | Decisao da fase 52 (formulario visual do Chatwoot so existe no WebWidget, memoria do projeto) | Nossa UI, com cupom e convite |
| Automacao do Chatwoot com `webhook_data` da conversa | Webhook de conta `message_created` com HMAC | Automacao nao traz conteudo (action_service.rb:36-38) | Necessario para SAIR |
| Labels: POST sem merge | GET + mesclar + POST (fase 51) | Fase 51 | Mesmo padrao para `avaliou` e `csat-baixo` |
| Relatorio de CSAT com inbox WebWidget | Relatorio com inbox de API (WhatsApp) | Confirmado pelas 10 respostas do Bom Custo (inbox 21) e 3 do Box (inbox 1) | Relatorio nativo funciona para o nosso caso |

**Deprecated/outdated (no CONTEXT e na memoria):**
- "Os arquivos de CSAT sao identicos entre 4.12.1 e 4.19.1": parcialmente verdadeiro (ver Summary). Nao invalida o contrato.
- Memoria `project_fase52_csat_recompensa.md`: "refatorar ChatwootService para credenciais por empresa". Superado pelo CONTEXT (Decided autonomously: "sem refatoracao multi-Chatwoot"). Manter uma instancia por empresa, como no deploy atual.
- Research da fase 51 (A1 sobre o formato de criacao de label, LOW): resolvido (Achado 10).

## Assumptions Log

| # | Claim | Secao | Risco se errado |
|---|-------|-------|-----------------|
| A1 | `input_csat` privado nao chega ao cliente pela Evolution | Achado 17, P4 | Alto: cliente recebe mensagem tecnica; validar na homologacao |
| A2 | `input_csat` privado aceita o PUT publico e gera `CsatSurveyResponse` | Summary, Code Examples | Alto: relatorio nativo vazio; plano de fallback do CONTEXT (so nota privada + atributos + etiqueta) |
| A3 | Atendente ve a mensagem privada `input_csat` sem poluicao visual | Summary | Baixo: so estetica; verificar na homologacao |
| A4 | Campo `id` retorna no POST de mensagem | Code Examples | Baixo: usado so como referencia; confirmar |
| A5 | Tolerancia de 5 min no timestamp do webhook | Code Examples | Baixo: ajustavel |
| A6 | Limiar de cadencia do WhatsApp para evitar banimento | P19 | Medio: sem fonte; limitar cadencia |
| A7 | LGPD: base legal e prazo de opt-out | Compliance | Alto: requer parecer juridico |
| A8 | Retencao de 12 meses e a forma de anonimizar | Compliance | Medio: vem da memoria do projeto |
| A9 | Formato do campo `color` de label | Code Examples | Baixo: omitido |
| A10 | Telefone brasileiro sem 9o digito aparece no Chatwoot | P13 | Medio: pode gerar chave que nao casa; a normalizacao cobre o caso comum |
| A11 | Volume de pesquisas (dezenas por dia) torna o risco de limite compartilhado baixo | P8 | Baixo a medio: confirmar pelo historico de fechamentos |
| A12 | Ambiente de homologacao com Chatwoot de teste pode ser criado | Q1 | Alto: sem ele, nao ha validacao segura |

## Open Questions (RESOLVED)

Apresentadas como lista numerada em texto (sem AskUserQuestion, conforme memoria do projeto). Cada item traz a recomendacao padrao.

1. **Onde validar a cadeia completa sem enviar a clientes reais?** **RESOLVED:** Chatwoot de teste local; checkpoint manual do roteiro (CONTEXT, Decisoes pos-research).
   - O que sabemos: nenhum `CHATWOOT_BASE_URL` esta configurado no ambiente de homologacao (`orcamento-homolog-fase50`). Os dois Chatwoots de producao nao devem receber escrita de teste.
   - O que falta: um Chatwoot de teste (conta, inbox de API, contato de teste com numero da equipe) ou uma instancia clonada.
   - Recomendacao: criar uma conta de teste em um Chatwoot local (mesmo padrao do `athos-teste`), com inbox `Channel::Api` e um numero de teste. Sem isso, o tracer nao sai.

2. **Uma pesquisa com registro no Chatwoot por conversa?** **RESOLVED:** Sim, uma input_csat por conversa (CONTEXT pos-research).
   - O que sabemos: o PUT grava na primeira `input_csat` (Achado 1). O CONTEXT pede "unique por conversa na pesquisa".
   - Recomendacao: sim. Pesquisas seguintes na mesma conversa geram token, nota, cupom e etiqueta do nosso lado, mas nao criam `input_csat` no Chatwoot (`chatwootCsat = NAO_APLICAVEL`). Isso preserva o relatorio nativo sem misturar respostas.

3. **Desligar o CSAT nativo: automatico ou manual?** **RESOLVED:** Manual no roteiro com verificacao somente leitura (CONTEXT pos-research).
   - O que sabemos: a API permite (`PATCH inboxes`, `csat_survey_enabled` permitido em inboxes_controller.rb:195). O CONTEXT pede passo manual no roteiro.
   - Recomendacao: manual, com verificacao de leitura no roteiro (SELECT ou GET inbox). Automatizar muda a configuracao de producao sem revisao.

4. **Teto mensal: rigido ou flexivel no resgate?** **RESOLVED:** Rigido: bloquear quando usado+desconto > teto (CONTEXT pos-research).
   - Opcao A (UI-SPEC atual): teto verificado na emissao; resgate bloqueado so quando o mes ja esta suspenso. Excesso de no maximo um cupom.
   - Opcao B: resgate bloqueado se `usado_no_mes + desconto > teto` (teto nunca ultrapassado).
   - Recomendacao: opcao B. O custo e uma mensagem de erro extra no balcao, e o teto vira garantia, nao estimativa.

5. **Mes de referencia do teto e do "suspenso ate dia 1":** **RESOLVED:** America/Sao_Paulo (CONTEXT pos-research).
   - Recomendacao: `America/Sao_Paulo`, igual a `getHoraSaoPaulo`.

6. **Normalizacao de telefone:** **RESOLVED:** 55 + DDD + numero, sem casar numero sem o 9 (CONTEXT pos-research).
   - Recomendacao: regra `55` + DDD + numero (10 ou 11 digitos), sem tentar casar numero sem o 9. Aceitar o risco residual (A10) e registrar casos de divergencia no log.

7. **Labels `avaliou` e `csat-baixo`: criar nas contas?** **RESOLVED:** Sim, criadas com token de administrador no roteiro (CONTEXT pos-research).
   - O que sabemos: nao e obrigatorio (Achado 9). Criar exige administrador e corpo aninhado (Achado 10).
   - Recomendacao: criar no roteiro (uma vez por conta, com o token de administrador), para aparecerem na barra lateral. Codigo tolerante a "ja existe" (422 ou 400).

8. **Ciclo de vida das labels de pesquisa:** **RESOLVED:** Mesclar avaliou/csat-baixo no fechamento (CONTEXT pos-research).
   - O que sabemos: o fechamento seguinte zera a lista (P6).
   - Recomendacao: mesclar no fechamento para preservar `avaliou` e `csat-baixo`, e atualizar `csat-baixo` a cada nova resposta (remove se a nota for 3 a 5). Mudanca de comportamento frente ao D-06 da fase 51, que remove etiquetas manuais: essas duas nao sao manuais, sao da pesquisa. Confirmar.

9. **"SAIR" reabrindo conversa resolvida:** **RESOLVED:** Aceitar e documentar (CONTEXT pos-research).
   - Recomendacao: aceitar (efeito nativo). Opcional: nota privada automatica "Cliente pediu para sair das pesquisas" para o atendente nao ignorar.

10. **Autenticacao do webhook de SAIR:** **RESOLVED:** HMAC com secret por instancia + janela de timestamp (CONTEXT pos-research).
    - Recomendacao: HMAC com `secret` da conta, guardado em env por instancia (`CHATWOOT_WEBHOOK_SECRET`), mais janela de timestamp. Alternativa: token no path (padrao atual), mas o token fica em URL e logs.

11. **Compliance (LGPD, opt-out, base legal, retencao):** **RESOLVED:** Parecer juridico antes de ligar em producao; nao bloqueia desenvolvimento (CONTEXT pos-research).
    - Recomendacao: parecer do Legal Compliance Checker antes de ativar em producao. Pontos: base legal para oferta de desconto pos-venda, prazo de processamento do SAIR, anonimizacao aos 12 meses.

12. **Dominios permitidos para o link do Google:** **RESOLVED:** Allowlist https g.page, search.google.com, maps.google.com, business.google.com (CONTEXT pos-research).
    - Recomendacao: `g.page`, `search.google.com`, `maps.google.com` e `business.google.com`, com https. Confirmar com o usuario se ha outro link.

13. **Defaults por empresa (Box e Bom Custo):** **RESOLVED:** Defaults por env por instancia, valores do CONTEXT (criterio do planner; UI-SPEC confirmacao 8).
    - O que sabemos: instancias separadas; defaults diferentes (CONTEXT).
    - Recomendacao: env por instancia (`PESQUISA_PERCENTUAL_PADRAO`, `PESQUISA_TETO_PADRAO`, `PESQUISA_COMPRA_MINIMA_PADRAO`, `PESQUISA_TETO_MENSAL_PADRAO`) usada apenas para criar a linha singleton na primeira leitura, como `getConfig()` da fase 51. Depois, a tela manda.

14. **Ordem: input_csat antes ou depois do texto com link?** **RESOLVED:** input_csat criada depois do sendOutgoingMessage ok (planos 52-01/52-05; recomendado).
    - Recomendacao: depois do envio bem-sucedido. Se o envio falhar, nao ha pesquisa para o cliente e nao sobra mensagem privada.

15. **Retencao: anonimizar ou apagar?** **RESOLVED:** Anonimizar (mantem agregados); job desligado por padrao ate parecer juridico (recomendado).
    - Recomendacao: anonimizar telefone, comentario e contactId; manter nota, data e variante para o painel historico. Apagar o cupom usado so se o financeiro aceitar.

16. **Textos do UI-SPEC que contrariam o CONTEXT:** **RESOLVED:** Decisoes do UI-SPEC confirmadas pelo usuario prevalecem (UI-D08 etc.).
    - CONTEXT: "uma mensagem no WhatsApp com o codigo do cupom e o convite do Google". UI-SPEC (UI-D08, confirmado pelo usuario em 2026-11-22 com "use o recomendado"): duas mensagens.
    - Resolvido pela confirmacao do usuario. Registrar que o CONTEXT esta desatualizado nesse ponto.

## Environment Availability

| Dependencia | Requerida por | Disponivel | Versao | Fallback |
|-------------|---------------|------------|--------|----------|
| Node.js (host) | build e testes | Sim | v22.22.1 | — |
| Node.js (imagem do backend) | runtime | Sim (Dockerfile) | node:20-bookworm-slim | — |
| Docker | leitura dos containers e DBs | Sim | 29.1.3 | — |
| Chatwoot v4.19.1 (Bom Custo) | contrato CSAT, leitura | Sim (chatwoot-rails-1, chatwoot-postgres-1) | 4.19.1 | — |
| Chatwoot v4.12.1 (Box) | contrato CSAT, leitura | Sim (chatwoot-box-rails-1, chatwoot-box-postgres-1) | 4.12.1 | — |
| Evolution API | caminho WhatsApp | Sim (evolution_api_v24) | 2.4.0-rc2 | — |
| Chatwoot de homologacao | validacao do tracer | **Nao** | — | Q1 (criar ambiente de teste) |
| Redis | jobs (sidekiq do Chatwoot) | Sim | — | — |
| PR #75 (variaveis CHATWOOT_AUTOMATION_*) | pre-condicao de deploy | **Nao em main** (branch `fix/compose-chatwoot-automation-env`) | commit 3709ae5 | Mesclar e implantar antes da fase 52 |
| Prisma CLI | migracao | Sim | 5.22.0 | — |
| Jest | testes | Sim | 30 (executado: 116 testes verdes) | — |
| Suite de testes do frontend | validacao da UI | **Nao** (so `next build`) | — | `npm --workspace @orcamento/frontend run build` + roteiro manual |

**Missing dependencies with no fallback:**
- Chatwoot de homologacao (Q1). Bloqueia a validacao segura da cadeia privada.
- PR #75 em producao (pre-condicao da fase 51, D-23). Bloqueia o fechamento em producao.

**Missing dependencies with fallback:**
- Suite de frontend: cobrir com `next build` (CI ja roda, ci.yml:32) e roteiro manual.

## Validation Architecture

> `workflow.nyquist_validation` nao esta explicitamente desligado; a secao e obrigatoria.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29 (backend). Frontend sem runner |
| Config file | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| Quick run command | `cd /root/SistemaOrcamento/apps/backend && ../../node_modules/.bin/jest src/modules/pesquisa src/modules/integrations/chatwoot` |
| Full suite command | `cd /root/SistemaOrcamento && npm --workspace @orcamento/backend run test` |
| Build (CI) | `cd /root/SistemaOrcamento && npm run build` (backend `tsc` + frontend `next build`) |

Notas verificadas: a suite do Chatwoot passa hoje (5 suites, 116 testes). O binario deve ser o da raiz (`../../node_modules/.bin/jest`), como registrado na fase 51.

### Mapa decisao -> verificacao

| Decisao (CONTEXT) | Comportamento | Tipo | Comando / verificacao | Arquivo existe? |
|-------------------|---------------|------|----------------------|-----------------|
| Token 24 bytes hex, unico, expira | Gera 48 hex; expirado recusado | unit | `jest pesquisa-regras -t token` | Wave 0 |
| Nota 1-5, comentario <= 500 | Rejeita 0, 6, texto | unit | `jest pesquisa-regras -t nota` | Wave 0 |
| Variante A/B gravada | 50/50 com rnd injetado; gravada no envio | unit | `jest pesquisa-regras -t variante` | Wave 0 |
| Input_csat privado com content_type | POST com `private: true, content_type: "input_csat"` | unit (mock axios) | `jest chatwoot-csat.service` | Wave 0 |
| PUT publico com submitted_values | Corpo exato; sem api token | unit | `jest chatwoot-csat.service -t submit` | Wave 0 |
| Uma pesquisa com Chatwoot por conversa | Segunda pesquisa marca NAO_APLICAVEL e nao cria input_csat | unit | `jest pesquisa.service -t segunda` | Wave 0 |
| Chatwoot falha nao bloqueia | Resposta e cupom gravados mesmo com 500 no PUT | unit | `jest pesquisa.service -t best-effort` | Wave 0 |
| Cupom unico por pesquisa | `pesquisaId` unico; segunda emissao nao cria | unit (Prisma mock) + migracao | `jest pesquisa.service -t cupom` | Wave 0 |
| Cupom de uso unico | Dois resgates simultaneos: um 200 e um 409 | unit (mock de updateMany) | `jest pesquisa-cupom -t resgate` | Wave 0 |
| Desconto = min(%, teto, compra), centavos, arredonda para baixo | Casos: R$ 6 Box 10%, R$ 30 Bom Custo, R$ 0,01 | unit | `jest pesquisa-regras -t desconto` | Wave 0 |
| Compra minima | Abaixo do minimo: 422 | unit | `jest pesquisa-cupom -t minimo` | Wave 0 |
| Teto mensal (emissao e resgate) | Emissao bloqueada no teto; resgate bloqueado se passar (Q4) | unit | `jest pesquisa-cupom -t teto` | Wave 0 |
| Mes em America/Sao_Paulo | 01/12 01:00 UTC = novembro | unit | `jest pesquisa-regras -t mes` | Wave 0 |
| Intervalo 90 dias por telefone | Segundo cupom antes de 90 dias: sem recompensa | unit | `jest pesquisa.service -t intervalo` | Wave 0 |
| Convite Google para todos | Convite enviado com nota 1 e com nota 5 | unit | `jest pesquisa.service -t convite` | Wave 0 |
| Convite sem referencia a cupom | Texto do convite nao contem codigo nem "cupom" | unit (checagem de template) | `jest pesquisa-regras -t convite` | Wave 0 |
| SAIR normalizado | "sair", "Sair!", " SAIR " = verdadeiro; "sair por favor" = falso | unit | `jest pesquisa-regras -t optout` | Wave 0 |
| SAIR suprime pesquisa e convite, nao servico | Supressao gravada; closing sem bloco; mensagens de servico seguem | unit | `jest pesquisa-webhook -t supressao` | Wave 0 |
| HMAC valido/invalido/expirado | Assinatura certa aceita; errada e fora da janela recusadas | unit | `jest pesquisa-webhook -t hmac` | Wave 0 |
| Webhook filtra incoming e private=false | Mensagem privada propria nao dispara nada | unit | `jest pesquisa-webhook -t filtro` | Wave 0 |
| Re-check com historico (corrige P5) | Resposta do cliente antes de atividade e detectada | unit | `jest chatwoot-etiquetas -t reavaliacao` (estender) | Estender existente |
| Labels sem perda (P6, P7) | `avaliou` preservada em mesclagem; POST na fila | unit | `jest chatwoot-etiquetas -t mescla` | Existe (estender) |
| Rota publica sem limite global (P8) | Metadado `SkipThrottle` presente; limite por token | unit | `jest pesquisa-public -t limite` | Wave 0 |
| Retencao 12 meses | Anonimiza linhas > 12 meses; mantem agregados | unit | `jest pesquisa-retencao` | Wave 0 |
| Kill-switch | `ativo=false` nao cria pesquisa nem envia bloco | unit | `jest pesquisa.service -t ativo` | Wave 0 |
| Telefone normalizado | `+5512996484918`, `(12) 99648-4918`, `12996484918` -> mesma chave | unit | `jest pesquisa-regras -t telefone` | Wave 0 |
| Link Google allowlist | Dominio fora da lista recusado no DTO | unit | `jest pesquisa-admin -t linkGoogle` | Wave 0 |
| Pagina publica (proxy, UI) | Carrega com token valido; mensagem generica com invalido | build + manual | `npm --workspace @orcamento/frontend run build` + roteiro | Sem framework |
| Relatorio nativo recebe a nota | `GET /api/v1/accounts/:id/csat_survey_responses` mostra a nota de teste | manual (homologacao) | roteiro abaixo | Roteiro |
| Nada chega ao cliente pelo input_csat privado (A1) | Conversa de teste sem mensagem extra no WhatsApp | manual (homologacao) | roteiro abaixo | Roteiro |
| CSAT nativo desligado (P1) | `csat_survey_enabled = false` em todas as inboxes WhatsApp | manual (leitura) | `SELECT id, csat_survey_enabled FROM inboxes` (somente leitura) | Roteiro |

### Sampling Rate
- **Por tarefa (commit):** `jest` apenas nos arquivos tocados (quick run acima).
- **Por onda:** `npm --workspace @orcamento/backend run test`.
- **Gate da fase:** `npm run build` (backend e frontend) + suite completa + roteiro de homologacao assinado.

### Roteiro de homologacao (manual; so em Chatwoot de teste - Q1)
1. Desligar `csat_survey_enabled` nas inboxes WhatsApp de teste (confirmar por leitura).
2. Criar as etiquetas `avaliou` e `csat-baixo` na conta de teste (admin, corpo `{ "label": { ... } }`).
3. Com `PESQUISA_ATIVA=true`, fechar uma conversa de teste ligada a um orcamento de teste.
4. Conferir que o WhatsApp de teste recebeu a mensagem de fechamento com um link, e que nao recebeu nenhuma outra mensagem com link.
5. Abrir o link, enviar nota 2 com comentario. Conferir: nota privada na conversa; etiquetas `avaliou` e `csat-baixo`; atributos do contato.
6. Aguardar alguns segundos e conferir `GET /api/v1/accounts/:id/csat_survey_responses` e a tela `/app/accounts/:id/reports/csat` (nota 2 e comentario).
7. Conferir que a mensagem privada `input_csat` NAO apareceu no WhatsApp de teste.
8. Enviar "SAIR" pelo WhatsApp de teste. Conferir supressao e que a conversa reabriu (esperado).
9. Repetir o fechamento: conferir que nao ha segunda `input_csat` (Q2) e que a pesquisa nova so existe no nosso banco.
10. Registrar o resultado (conversation id, nota, horario) no roteiro.

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` — funcoes puras (token, codigo, desconto, telefone, opt-out, mes, variante, validacao de nota).
- [ ] `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` — criacao, resposta, cupom, teto, intervalo, convite, best-effort, kill-switch (mocks de Prisma e ChatwootService com os metodos novos).
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts` — resgate atomico, minimo, teto no resgate.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts` — HMAC, janela, filtro, SAIR.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-public.controller.test.ts` — limite por token e metadado de throttle.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-retencao.test.ts` — anonimizacao.
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts` — payloads de `createPrivateCsatMessage`, `submitCsatResponse`, `listMessagesAfter`, `updateContactCustomAttributes`, `createAccountLabel` (corpo aninhado).
- [ ] Atualizar `chatwoot-automation.service.test.ts:147` e `chatwoot-fechamento-agendado.test.ts:72` se o construtor mudar (P3).
- [ ] Estender `chatwoot-etiquetas.test.ts` para a reavaliacao com historico (P5).
- [ ] Frontend: nenhuma biblioteca nova sem passar pelo gate de pacotes. Cobertura por `next build` e roteiro.

## Recommended Plan Breakdown (tracer-first)

Ordem sugerida. Cada plano tem gate de validacao antes do seguinte. Flag `PESQUISA_ATIVA` (default false) em todos.

1. **52-01 Tracer (backend + Chatwoot, sem UI admin):** modelos e migracao aditiva (`PesquisaConfig`, `PesquisaSatisfacao`, `CupomRecompensa`, `PesquisaSupressao`); `ChatwootService` com os cinco metodos novos; anexar bloco no fechamento (depois do envio, e depois de corrigir o re-check, P5); pagina publica GET/POST com `@SkipThrottle`; PUT para o Chatwoot; etiquetas e atributos pela fila. Gate: roteiro de homologacao passos 1-7 em Chatwoot de teste (Q1). Sem cupom ainda.
2. **52-02 Cupom e mensagens:** regras puras (desconto, codigo, intervalo, teto mensal em America/Sao_Paulo); emissao; mensagens WhatsApp (cupom sem link, convite com um link) com status e retentativa (`@Cron`); textos com Handlebars. Gate: testes de regras e de servico; roteiro passos 8-10.
3. **52-03 SAIR e retencao:** webhook `message_created` com HMAC e rawBody; supressao; job de retencao de 12 meses; limite por token. Gate: testes de webhook e de retencao; roteiro passo 8.
4. **52-04 Admin backend:** `PesquisaConfig` (GET/PUT, `@AdminOnly`, defaults por env); painel (agregados); cupons (buscar, resgatar com `updateMany`, teto no resgate conforme Q4); DTOs com allowlist de Google. Gate: testes de admin e de resgate.
5. **52-05 Frontend publico:** `/pesquisa/[token]` (pagina + proxy `api/pesquisa/[token]`), `Referrer-Policy`, textos da UI-SPEC, mensagens de erro genericas. Gate: `next build` e revisao contra UI-SPEC.
6. **52-06 Frontend admin:** aba `/configuracoes/pesquisa` (com `PA_NAV_ITEMS`), painel de resultados e tela `/cupons` (com `PasswordGate`). Gate: `next build` e revisao contra UI-SPEC.
7. **52-07 Deploy e roteiro:** envs nos composes (box e vps) e `stack.env.example` (`PESQUISA_ATIVA`, defaults, `CHATWOOT_WEBHOOK_SECRET`); PR #75 mesclado e implantado (pre-condicao, Achado 18); CSAT nativo desligado (passo manual); etiquetas criadas nas duas contas; roteiro de producao.

Ordem alternativa mais segura (se o usuario preferir): 52-01 e 52-07 antes de 52-02, para validar o deploy e a homologacao com o minimo de logica.

## Sources

### Primary (HIGH confidence)
- Chatwoot v4.19.1 (container `chatwoot-rails-1`, lido por `docker exec` em 2026-11-22):
  - `/app/app/controllers/public/api/v1/csat_survey_controller.rb` (linhas 7-31)
  - `/app/app/builders/csat_surveys/response_builder.rb` (linhas 4-27)
  - `/app/app/listeners/csat_survey_listener.rb` (linhas 2-15)
  - `/app/app/dispatchers/async_dispatcher.rb` (linhas 2-24)
  - `/app/app/services/csat_survey_service.rb` (linhas 35-36, 137-145)
  - `/app/app/models/message.rb` (linhas 88-103, 112-116, 130, 141-144, 184-200, 214-216, 255-258, 297-307, 400-412, 414-445)
  - `/app/app/presenters/message_content_presenter.rb` (linhas 16-31)
  - `/app/app/builders/messages/message_builder.rb` (linhas 8-22, 127-133, 161-176)
  - `/app/app/models/csat_survey_response.rb` (linha 36)
  - `/app/app/services/messages/send_email_notification_service.rb` (linhas 4-7, 21-27)
  - `/app/app/jobs/send_reply_job.rb` (linhas 14-15)
  - `/app/app/services/automation_rules/action_service.rb` (linhas 36-39)
  - `/app/app/listeners/webhook_listener.rb` (linhas 25-33)
  - `/app/app/models/concerns/message_filter_helpers.rb` (linhas 8-10)
  - `/app/app/presenters/conversations/event_data_presenter.rb` (linhas 2-50)
  - `/app/app/views/api/v1/conversations/partials/_conversation.json.jbuilder` (linhas 6-7, 30-46, 58)
  - `/app/app/finders/message_finder.rb` (linhas 19-58)
  - `/app/app/models/concerns/labelable.rb` (linhas 9-11)
  - `/app/app/controllers/concerns/label_concern.rb` (linhas 2-5)
  - `/app/app/controllers/api/v1/accounts/labels_controller.rb` (linhas 11-13, 39-41)
  - `/app/app/policies/label_policy.rb` (`create?`)
  - `/app/app/controllers/api/v1/accounts/contacts_controller.rb` (linhas 185-200)
  - `/app/app/models/inbox.rb` (linha 13), `/app/app/controllers/api/v1/accounts/inboxes_controller.rb` (linha 195)
  - `/app/app/controllers/api/v1/accounts/csat_survey_responses_controller.rb` (linha 31)
  - `/app/config/routes.rb` (linhas 266, 672-691)
  - `/app/lib/webhooks/trigger.rb` (metodo `request_headers`)
  - `/app/app/models/concerns/webhook_secretable.rb`
- Chatwoot v4.12.1 (container `chatwoot-box-rails-1`): mesmos arquivos acima; `md5sum` comparado (ver tabela de diferencas abaixo).
- Consultas SELECT somente de leitura (sem escrita) nos bancos `chatwoot-postgres-1` (Bom Custo) e `chatwoot-box-postgres-1` (Box): inboxes, `csat_survey_enabled`, mensagens com `content_type = 9`, `csat_survey_responses` agregadas.
- Evolution API `evolution_api_v24` (bundle `/evolution/dist`, busca por `message_updated` e `e.private`): filtro de mensagens privadas e de eventos de update; campo `phone_number` com `+`.
- Projeto (lido nesta sessao): `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts`, `chatwoot-automation.service.ts`, `chatwoot-automation.controller.ts`, `chatwoot-etiquetas.ts`, `chatwoot.module.ts`, `apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts`, `cobranca-encargos-config.controller.ts`, `cobranca.module.ts`, `email-envio.service.ts`, `apps/backend/src/modules/security/*.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/app.module.ts`, `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/20261117120000_add_cobranca_boleto_atualizado/migration.sql`, `apps/frontend/src/app/cobranca/confirmar/[token]/route.ts`, `apps/frontend/src/app/api/admin/cobranca-encargos/route.ts`, `apps/frontend/src/app/contas-receber/admin-shell.tsx`, `apps/frontend/src/lib/backend-client.ts`, `admin-backend-client.ts`, `admin-session.ts`, `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `deploy/stack.env.example`, `.github/workflows/ci.yml`.
- Execucao da suite: `jest src/modules/integrations/chatwoot` -> 5 suites, 116 testes, todos passam.
- Pacotes instalados (node_modules): `@nestjs/throttler` 6.5.0 (`throttler.decorator.d.ts:10` exporta `SkipThrottle`), `@nestjs/schedule` 6.1.3, `@prisma/client` 5.22.0, `axios` 1.15.2, `@nestjs/common` 11.1.19.

### Secondary (MEDIUM confidence)
- [CITED: https://support.google.com/business/answer/3474122?hl=en] Google Business Profile, "Tips to get more reviews". Trecho obtido por WebFetch (resumo do modelo; conferir o texto integral): "Offering incentives, like free or discounted goods or services, in exchange for customers to post reviews, change reviews, or remove negative reviews is considered fake & misleading content and is strictly prohibited." Usado para P18 e para a regra "recompensa nunca pela avaliacao".
- [CITED: https://support.google.com/business/answer/14114287] Restricoes de perfil por violacao de politica (link citado em busca, nao aberto). Usado so como referencia de penalidade; nao foi lido.
- Fontes de LGPD e WhatsApp (busca web, fontes secundarias: blogs de fornecedores, decisao TRF3 citada por terceiros, guia ANPD). Nao usadas como base de afirmacao; ver Compliance [ASSUMED].

### Tertiary (LOW confidence)
- Prazos de opt-out de WhatsApp (24-48 h, registro de 5 anos) — fornecedores, nao verificados em fonte oficial. [ASSUMED]
- Limiar de cadencia de WhatsApp para evitar banimento. [ASSUMED]

### Diferencas entre as versoes do Chatwoot (md5 comparado nesta sessao)

| Arquivo | v4.19.1 vs v4.12.1 |
|---------|--------------------|
| csat_survey_controller.rb | identico |
| response_builder.rb | identico |
| csat_survey_listener.rb | identico |
| csat_survey_service.rb | identico |
| message.rb | **diferente** (webhook normalizer, `forwarded?`, `content_mode`; logica de reabertura e CSAT identica pelo diff) |
| message_content_presenter.rb | **diferente** (v4.19 envolve o conteudo em `Messages::WebhookContentNormalizer`; logica de link identica) |
| message_builder.rb | **diferente** (v4.19 com encaminhamento e marcacao de voz; v4.19 converte `private` com `ActiveModel::Type::Boolean` (linha 10); v4.12.1 usa `@private = params[:private] || false` (linha 10). Para JSON com `private: true`, ambas gravam privada) |
| csat_survey_response.rb | **diferente** (colunas de revisao em 4.19; validacao de rating igual) |

## Metadata

**Confidence breakdown:**
- Contrato Chatwoot (CSAT, labels, webhook, contatos): HIGH (codigo-fonte lido nos containers; banco lido em SELECT).
- Caminho privado `input_csat` com PUT publico: MEDIUM (codigo sugere; homologacao obrigatoria).
- Projeto (modulos, padroes, envs, testes): HIGH (arquivos lidos com linha).
- Pagina publica e proxy Next: HIGH para o padrao existente; MEDIUM para o comportamento final (sem teste de UI).
- Compliance e cadencia de WhatsApp: LOW (ASSUMED).

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (30 dias para o projeto). Revalidar o contrato Chatwoot se a instancia for atualizada, e a pre-condicao PR #75 antes do deploy.

**Notas de processo:**
- Nenhum arquivo de codigo do projeto foi alterado. Nenhuma mensagem foi criada no Chatwoot, na Evolution ou no Athos. Consultas aos bancos Chatwoot foram somente SELECT.
- Credenciais (tokens de API, chaves) nao foram impressas. A checagem de env do homolog mostrou apenas a ausencia de `CHATWOOT_BASE_URL`.

## Project Constraints (from CLAUDE.md)

Diretivas de `/root/SistemaOrcamento/CLAUDE.md`, `memory/*.md` e do `CLAUDE.md` global que afetam o planejamento:

- **Idioma:** responder e escrever em portugues brasileiro (`memory/feedback_idioma.md`). Identificadores tecnicos seguem o padrao do repositorio.
- **Sem AskUserQuestion:** perguntas ao usuario em lista numerada em texto (`memory/feedback_askuserquestion.md`). Aplicado em Open Questions.
- **Nao alterar codigo sem pedido explicito** (`memory/feedback_nao_mexer_codigo.md`). Esta pesquisa nao alterou codigo.
- **Athos e de producao; escrita proibida** (`memory/athos_postgres_9_0_5.md`, CLAUDE.md global). A fase nao consulta nem escreve no Athos. Pesquisa de Chatwoot de producao: somente leitura.
- **Chatwoot de producao sem escrita de teste** (pedido do usuario na tarefa: "DO NOT create/modify any data in Chatwoot, Evolution, Athos or any database"). Atendido.
- **Persistir memorias novas no repositorio** (`CLAUDE.md` do projeto): esta pesquisa nao cria memoria nova; a memoria `project_fase52_csat_recompensa.md` esta desatualizada em um ponto (refatoracao multi-Chatwoot), registrado em State of the Art.
- **Ordem de ambientes:** backend VPS primeiro, depois localhost (`memory/project_urls.md`). Aplica-se a validacao: a homologacao deve apontar para o backend indicado pelo usuario.
- **Skills de UI:** planejamento de UI deve usar `ui-ux-pro-max` e `bom-custo-design` (CONTEXT Specifics). O UI-SPEC ja foi aprovado (`52-UI-SPEC.md`, status approved).
- **Commit:** commitar apenas quando pedido; esta entrega pede commit de `52-RESEARCH.md` somente.

## Decisoes adicionais do UI-SPEC (confirmadas pelo usuario em 2026-11-22)

Estas decisoes estao em `52-UI-SPEC.md` (secao "Confirmacoes do usuario") e nao foram copiadas para o CONTEXT. O planner deve trata-las como decisoes travadas:

1. Tema do admin: AdminShell atual (`pa-*`, indigo). Sem tema Painel.
2. Pagina "ja respondida": nao reexibe o codigo do cupom (UI-D06).
3. WhatsApp pos-resposta: dois envios separados, cupom sem link e convite Google com um link (UI-D08). Diferente do CONTEXT ("uma mensagem").
4. Teto mensal atingido: cupom suspenso ate o dia 1 do mes seguinte (UI-D09).
5. Arredondamento do desconto: para baixo, no centavo (UI-D10).
6. Tela Cupons protegida pela mesma senha das demais areas admin (UI-D12).
7. Limites: desconto 1-50%, validade do cupom 1-180 dias, minimo de 30 respostas por variante para comparar A/B (UI-D13, UI-D15).
8. Defaults por empresa: Box 10% / teto R$2 / minimo R$6; Bom Custo 10% / teto R$5 / minimo R$30. Mecanismo a criterio do planner (Q13).

Pontos do UI-SPEC que ainda dependem de Open Questions: teto no resgate (Q4), mes de referencia (Q5), intervalo de 90 dias como default (Q13).

## RESEARCH COMPLETE
