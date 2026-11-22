# API Coverage — Chatwoot (Application API + Public API + webhook de conta)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Fonte da superfície: código do Chatwoot 4.12.1 e 4.19.1 lido nos containers (52-RESEARCH.md; contrato de messages.list reverificado em leitura na revisão do arquiteto de 2026-11-22). A fase 52 integra o Chatwoot já existente do projeto (ChatwootService); a Evolution API não é chamada diretamente (o WhatsApp sai pelo Chatwoot).

| capability | decision | reason |
|---|---|---|
| messages.create (outgoing público: fechamento, cupom, convite) | INTEGRATE | existente (sendOutgoingMessage); reutilizado nos três envios da fase |
| messages.create (privada: nota com nota, comentário e cupom) | INTEGRATE | existente (postConversationNote); D-12 |
| messages.create (privada com content_type input_csat) | INTEGRATE | novo createPrivateCsatMessage; D-06; antes de recriar, lista e reutiliza a existente |
| messages.list (GET .../messages com after e filter_internal_messages) | INTEGRATE | novo listMessagesAfter: re-check D-40, achar input_csat existente (incluirInternas) e conferir envio incerto antes de reenviar |
| csat_survey.update (PUT /public/api/v1/csat_survey/:uuid) | INTEGRATE | novo submitCsatResponse; D-07 |
| conversations.show (uuid, status, inbox_id, meta.sender) | INTEGRATE | existente (getConversation); tipo estendido com uuid, inbox_id e meta.sender |
| conversations.labels get e post (mescla) | INTEGRATE | existente; avaliou e csat-baixo usam a mesma fila por conversa; D-14 e D-34 |
| contacts.update (custom_attributes) | INTEGRATE | novo updateContactCustomAttributes; D-13 |
| inboxes.show (ler csat_survey_enabled) | INTEGRATE | novo getInbox: guarda que evita input_csat com o CSAT nativo ligado; reforça o passo manual (D-09 e D-29) |
| webhooks de conta (message_created, assinatura HMAC) | INTEGRATE | receptor novo para detectar SAIR; D-36 |
| labels.create (etiqueta de conta, token de administrador) | OPT-OUT | D-33, revisão do arquiteto: passo manual do roteiro (curl com token digitado), sem env nem endpoint no sistema |
| conversations.toggle_status | OPT-OUT | existente e inalterado (bloqueio por pedido pendente da fase 51); nada novo nesta fase |
| csat_survey_responses.index (relatório nativo, GET) | OPT-OUT | o painel lê o banco próprio; o relatório nativo é conferido na tela do Chatwoot e por curl no roteiro |
| inboxes.update (csat_survey_enabled) | OPT-OUT | D-09 e D-29: desligar o CSAT nativo é passo manual com verificação somente leitura; automatizar mudaria produção sem revisão |
| contacts.search e contacts.create | OPT-OUT | existente (searchContact) e fora do escopo desta fase |
| assignments, teams, agents, canned_responses, automation_rules, reports | OPT-OUT | explicitly out of scope: a fase não atribui, não cria automações nem lê relatórios além do CSAT |
| attachments (sendAttachment) | OPT-OUT | existente, usado por outro fluxo; nada de anexo na pesquisa |
