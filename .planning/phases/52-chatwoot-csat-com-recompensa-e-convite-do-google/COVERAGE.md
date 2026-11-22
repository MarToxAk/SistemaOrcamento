# API Coverage — Chatwoot (Application API + Public API + webhook de conta)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Fonte da superfície: código do Chatwoot 4.12.1 e 4.19.1 lido nos containers (52-RESEARCH.md, "Achados que mudam o plano" e "Sources"). A fase 52 integra o Chatwoot já existente do projeto (ChatwootService); a Evolution API não é chamada diretamente (o WhatsApp sai pelo Chatwoot).

| capability | decision | reason |
|---|---|---|
| messages.create (outgoing público: mensagem de fechamento, cupom, convite Google) | INTEGRATE | existente (sendOutgoingMessage); reutilizado nos três envios da fase |
| messages.create (privada: nota com nota, comentário e cupom) | INTEGRATE | existente (postConversationNote); D-12 |
| messages.create (privada com content_type input_csat) | INTEGRATE | novo createPrivateCsatMessage; D-06 |
| messages.list (GET .../messages com after e filter_internal_messages) | INTEGRATE | novo listMessagesAfter; corrige o re-check da fase 51 (D-40) |
| csat_survey.update (PUT /public/api/v1/csat_survey/:uuid) | INTEGRATE | novo submitCsatResponse; D-07 |
| conversations.show (uuid, status, meta.sender) | INTEGRATE | existente (getConversation); tipo estendido com uuid e meta.sender |
| conversations.labels get e post (mescla) | INTEGRATE | existente; avaliou e csat-baixo passam pela mesma fila por conversa; D-14 e D-34 |
| contacts.update (custom_attributes) | INTEGRATE | novo updateContactCustomAttributes; D-13 |
| labels.create (etiqueta de conta, corpo aninhado, token de administrador) | INTEGRATE | novo createAccountLabel, exposto por endpoint admin idempotente; D-33 |
| webhooks de conta (message_created, assinatura HMAC) | INTEGRATE | receptor novo para detectar SAIR; D-36 |
| conversations.toggle_status | OPT-OUT | existente e inalterado (bloqueio por pedido pendente da fase 51); nada novo nesta fase |
| csat_survey_responses.index (relatório nativo, GET) | OPT-OUT | o painel lê o banco próprio; o relatório nativo é conferido na tela do Chatwoot e por curl no roteiro de homologação |
| inboxes.show e inboxes.update (csat_survey_enabled) | OPT-OUT | D-09 e D-29: desligar o CSAT nativo é passo manual com verificação somente leitura; automatizar alteraria a configuração de produção sem revisão |
| contacts.search e contacts.create | OPT-OUT | existente (searchContact) e fora do escopo desta fase |
| conversations.assignments, teams, agents, canned_responses, automation_rules, reports (demais) | OPT-OUT | explicitly out of scope: a fase não atribui, não cria automações nem lê relatórios além do CSAT |
| attachments (sendAttachment) | OPT-OUT | existente, usado por outro fluxo; nada de anexo na pesquisa |
