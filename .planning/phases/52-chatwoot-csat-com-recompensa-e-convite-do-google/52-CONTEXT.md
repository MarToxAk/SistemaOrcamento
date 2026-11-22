# Phase 52: Chatwoot CSAT com recompensa e convite do Google - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Ao fechar um atendimento no Chatwoot (WhatsApp via Evolution, inbox Channel::Api), a mensagem de encerramento da fase 51 passa a levar um link para uma pesquisa de satisfacao propria (pagina publica no frontend). Quem responde (qualquer nota) recebe um cupom unico por cliente (desconto em % com teto e compra minima) e, na pagina de agradecimento, um convite para avaliar a empresa no Google (sem recompensa). A resposta aparece no Chatwoot: no relatorio nativo de CSAT, em nota privada na conversa, em atributos do contato e por etiqueta. Uma nova aba em /configuracoes (por instancia: Box e Bom Custo sao deploys separados) permite editar tudo e mostra um painel de resultados; uma tela de Cupons permite ao balcao validar e dar baixa no cupom (o desconto e lancado manualmente no Athos/PDV).

Fora do escopo: integracao de cupom com Athos/PDV (Athos nao tem sistema de cupom), recompensa por avaliacao no Google, sorteios.

</domain>

<decisions>
## Implementation Decisions

### Pesquisa e dados
- URL publica da pesquisa: `/pesquisa/[token]` no dominio publico do frontend (APP_BASE_URL), com proxy server-side para o backend como em `/cobranca/confirmar/[token]` — **Reversibility:** one-way — a URL vai em mensagens de WhatsApp ja enviadas e nao pode mudar depois.
- Token: aleatorio (randomBytes 24, hex) guardado no banco, revogavel, com expiracao — **Reversibility:** costly — formato persistido e embutido em links enviados.
- Modelos Prisma novos (nomes finais a criterio do planner): config singleton da pesquisa/recompensa, pesquisa (token, conversa Chatwoot, uuid da conversa, contato, telefone, nota 1-5, comentario, respondida em, variante visual), cupom (codigo unico, pesquisa, telefone, percentual, teto, compra minima, validade, status EMITIDO/USADO/EXPIRADO/CANCELADO, valor real do desconto ao usar, usado em, usado por), opt-out (telefone) — **Reversibility:** costly — exige migracao para mudar.
- Escala da nota: 1 a 5 (o Chatwoot so aceita rating 1-5 no CsatSurveyResponse). Visual configuravel com duas variantes para teste A/B: estrelas e carinhas. Config permite escolher estrelas, carinhas ou alternar (A/B, ex.: aleatorio por pesquisa) e o painel compara as variantes. A variante exibida e gravada na pesquisa.
- Nota obrigatoria, comentario opcional.

### Relatorio nativo do Chatwoot (pesquisado no codigo do Chatwoot 4.12.1 e 4.19.1 — logica de CSAT identica)
- Ao agendar/enviar a mensagem de fechamento com o link, o backend cria na conversa uma mensagem **privada** com `content_type: input_csat` via `POST /api/v1/accounts/:id/conversations/:id/messages` (o MessageBuilder aceita `content_type` dos params). A Evolution ignora mensagens privadas (`e.private` -> return) e eventos `message_updated`, entao nada chega ao cliente.
- Ao receber a resposta na nossa pagina, o backend chama `PUT /public/api/v1/csat_survey/:conversation_uuid` com `{ message: { submitted_values: { csat_survey_response: { rating, feedback_message } } } }`. O listener `message_updated` do Chatwoot roda `CsatSurveys::ResponseBuilder`, que grava `CsatSurveyResponse` (alimenta `/app/accounts/:id/reports/csat`).
- Limites do Chatwoot: rating 1-5; resposta bloqueada apos 14 dias da mensagem input_csat (nosso link vale 7 dias por padrao).
- CSAT nativo do inbox continua DESLIGADO nos inboxes WhatsApp (senao ele manda a mensagem dele, duplicando). Passo manual no roteiro.
- Falha ao gravar no Chatwoot nunca bloqueia a resposta do cliente nem o cupom (best-effort, log, re-tentativa).
- Obrigatorio validar em homologacao numa conversa de teste antes de ativar (nada foi criado no Chatwoot de producao durante a discussao). Fallback se falhar: so nota privada + atributos + etiqueta.

### Extras no Chatwoot (todos)
- Nota privada na conversa com nota, comentario e codigo do cupom (percentual, teto, validade).
- Atributos customizados do contato: ultima nota, data da ultima avaliacao, cupom ativo e validade.
- Etiqueta `avaliou` em toda resposta; `csat-baixo` para nota 1 ou 2. Etiquetas mescladas com as existentes (POST labels substitui a lista inteira — ler e regravar, como na fase 51).

### Cupom e resgate
- Recompensa: desconto em % com teto em R$ e compra minima, por qualquer nota.
- Cupom unico por cliente, uso unico, validade curta (padrao 30 dias, editavel).
- Resgate: tela "Cupons" no sistema — balcao digita o codigo, ve se e valido, quanto desconta (informa o valor da compra, sistema calcula % limitado ao teto e checa minimo) e marca como usado. O desconto e lancado manualmente no Athos/PDV (Athos nao tem cupom).
- Teto mensal (padrao R$300, editavel) contado pelo **desconto real dos cupons usados** no mes.
- Ao atingir o teto do mes: a pesquisa continua, mas o cupom e suspenso ate o mes seguinte; a mensagem de fechamento passa a nao prometer recompensa (texto alternativo editavel).

### Mensagens
- Mensagem de fechamento: mantem o texto gerado pela IA da fase 51 e anexa um bloco fixo editavel (link da pesquisa, frase da recompensa e opt-out "Responda SAIR para nao receber"), para o link nunca se perder.
- Apos a resposta: pagina de agradecimento mostra o cupom e um botao para avaliar no Google; o sistema tambem manda uma mensagem no WhatsApp com o codigo do cupom e o convite do Google (template editavel). Convite do Google para todos, independente da nota, sem recompensa e sem qualquer vinculo com o cupom.
- Um unico link por mensagem sempre que possivel (risco de banimento WhatsApp/Evolution).

### Configuracoes e painel
- Nova aba em /configuracoes (ex.: "Pesquisa e recompensa") no admin-shell, ao lado de "Templates de PDF" e "Juros e multa".
- Campos editaveis: liga/desliga, percentual, teto por cupom, compra minima, validade do cupom, validade do link, intervalo entre cupons por cliente, teto mensal, link de avaliacao do Google, variante visual (estrelas/carinhas/A-B), textos (bloco do fechamento, bloco sem recompensa, mensagem pos-resposta, textos da pagina).
- Painel na mesma area: nota media (geral e por variante), taxa de resposta, ultimas respostas com comentario, cupons emitidos/usados, gasto real no mes vs teto.
- Defaults sugeridos (editaveis): Box — 10%, teto R$2, compra minima R$6; Bom Custo — 10%, teto R$5, compra minima R$30. Como Box e Bom Custo sao instancias separadas, o default pode vir de env por instancia ou ser preenchido no primeiro acesso (criterio do planner).

### Decided autonomously
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts`: `handleConversationResolved`, `enviarMensagemFechamento` (re-check, texto IA com fallback, `chatwoot.sendOutgoingMessage`), `podeEnviarMensagemFechamento` + tabela `ChatwootMensagemEnviada`.
- `chatwoot-etiquetas.ts`: atraso humano (`sortearAtrasoHumanoMs`, `agendarEnvioFechamento`), mescla de etiquetas.
- `apps/frontend/src/app/cobranca/confirmar/[token]/route.ts` + `email-envio.service.ts`: padrao de token aleatorio, APP_BASE_URL e proxy publico via `backendFetch`.
- `apps/frontend/src/app/configuracoes/cobranca/page.tsx` (config singleton com GET/PUT em `/api/admin/...`) e `contas-receber/admin-shell.tsx` (menu das abas de configuracao).
- `@Public()` decorator no backend para rotas publicas (ex.: `quotes.controller.ts` approve).
- White-label por env `EMPRESA_NOME`, `EMPRESA_COR_PRIMARIA`, `EMPRESA_LOGO_URL` (usar na pagina publica).

### Established Patterns
- Integracoes Chatwoot best-effort: falha nunca bloqueia o fluxo principal; log.
- Etiquetas: GET + mescla + POST (POST substitui a lista).
- Envs novas entram em deploy/docker-compose.vps.yml, deploy/docker-compose.box.vps.yml e deploy/stack.env.example.

### Integration Points
- Webhook `conversation_resolved` (fase 51) -> anexar bloco da pesquisa e criar mensagem privada input_csat.
- Webhook `message_created` (incoming) -> detectar SAIR.
- Nova rota publica `/pesquisa/[token]` (frontend) -> backend `@Public()`.
- Admin: nova aba de configuracao + painel + tela Cupons.

</code_context>

<specifics>
## Specific Ideas

- Usuario quer ver as respostas no relatorio nativo do Chatwoot: https://chat.boxpersonalizado.com.br/app/accounts/1/reports/csat
- Teste A/B entre estrelas e carinhas.
- Ticket medio: Box R$6, Bom Custo R$30. Recompensa sempre editavel.
- Pareceres de apoio (agency-agents: Legal Compliance Checker, Customer Success Manager, Backend Architect) resumidos em memory/project_fase52_csat_recompensa.md: recompensa pelo ato de responder (nunca pela nota), sem review gating no Google, opt-out LGPD, retencao 12 meses, cuidado com banimento WhatsApp.
- Planejamento deve usar ui-ux-pro-max + bom-custo-design (UI) e os agentes agency-agents escolhidos (UX Architect, Backend Architect, Reality Checker, API Tester).

</specifics>

<deferred>
## Deferred Ideas

- Integracao do cupom com Athos/PDV (aplicar desconto automaticamente) — fase propria; exige escrita no Athos de producao.
- Migrar WhatsApp para a Cloud API oficial (reduz risco de banimento) — avaliacao futura.

</deferred>
