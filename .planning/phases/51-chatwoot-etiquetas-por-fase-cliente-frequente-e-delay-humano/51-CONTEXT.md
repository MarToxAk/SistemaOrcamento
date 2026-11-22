# Phase 51: Chatwoot — etiquetas por fase, cliente frequente e delay humano - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning
**Source:** Decisoes do usuario em conversa (texto numerado)

<domain>
## Phase Boundary

Na conversa do Chatwoot vinculada a um orcamento (`Quote.conversationId`), o backend mantem etiquetas que refletem a fase atual do orcamento e se o cliente e frequente. No fechamento (webhook `conversation_resolved` ja existente em `chatwoot-automation.*`), limpa as etiquetas de fase e envia a mensagem de encerramento com atraso aleatorio humano. Mesmo backend para Box e Bom Custo.

</domain>

<decisions>
## Implementation Decisions

### Etiqueta por fase
- D-01: Mapa status -> etiqueta:
  PENDENTE=`orcamento-enviado`, PAGAMENTO_PARCIAL=`pagamento-parcial`, APROVADO=`aprovado`, EM_PRODUCAO=`em-producao`, PRONTO_PARA_ENTREGA=`pronto-entrega`, ENTREGUE=`entregue`, CANCELADO=`cancelado`. ENVIADO: Claude's discretion (sugestao `entregue` ou sem etiqueta — documentar).
- D-02: Fica **so a etiqueta da fase atual**: ao trocar status, remove a etiqueta de fase anterior e aplica a nova. Etiquetas manuais (fora do conjunto do sistema) sao preservadas durante a vida da conversa.
- D-03: Aplicar em toda mudanca de status do orcamento (todos os caminhos: manual, em lote/silenciosa da fase 49, webhook de pagamento EFI, conciliacao Athos, criacao). Falha do Chatwoot NUNCA bloqueia a mudanca de status (best-effort, log).
- D-04: ATENCAO: `POST /conversations/:id/labels` do Chatwoot **substitui** a lista inteira. Ler as etiquetas atuais (GET labels) e regravar a lista mesclada.
- D-05: Etiquetas devem existir na conta do Chatwoot (labels de conta). Garantir criacao idempotente (`/api/v1/accounts/:id/labels`) ou documentar criacao manual — research decide.

### Fechamento (webhook conversation_resolved)
- D-06: Conversa liberada (sem pendencia): deixar **apenas `finalizado`** + `cliente-frequente` se aplicavel. Remove todas as demais, inclusive manuais (comportamento atual mantido).
- D-07: Conversa bloqueada por pendencia: **mantem a etiqueta da fase** (nao mexe nas etiquetas alem do que ja existe).
- D-08: Status que liberam continuam configuraveis por `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO` (usuario vai usar PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO).

### Cliente frequente
- D-09: Criterio: **3 ou mais orcamentos pagos/entregues nos ultimos 6 meses neste sistema** (Prisma `Quote`), mesmo cliente. Research define a chave do cliente (contato Chatwoot / telefone / idcliente Athos) e quais status contam como "pago/entregue" (ex.: APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, ENVIADO).
- D-10: Etiqueta `cliente-frequente`. **Permanece** apos finalizar (atributo do cliente, nao da fase).
- D-11: Recalcular quando o status do orcamento muda (mesmo gancho do D-03). Critero e limiares (3 / 6 meses) configuraveis por env com esses defaults.

### Atraso humano
- D-12: Antes da mensagem de encerramento (nao da nota de pendencia), esperar um atraso **aleatorio com cara de humano** — Claude's discretion; sugestao 45-180 s, nao uniforme exato. Configuravel por env (min/max). Nao segurar a resposta HTTP do webhook: responder 200 rapido e agendar o envio (setTimeout/fila em processo e aceitavel; se o processo reiniciar a mensagem se perde — documentar).
- D-13: Re-checar antes de enviar: se a conversa foi reaberta ou recebeu mensagem nova do cliente durante a espera, nao enviar. (Claude's discretion se o custo for alto.)

### Escopo
- D-14: Box e Bom Custo — mesmo codigo; nada especifico por tenant alem de env.

### Decisoes pos-research (2026-11-21)
- D-15 (substitui o mapa do D-01 para esses dois): PENDENTE=`orcamento-pendente`, ENVIADO=`orcamento-enviado` (ENVIADO = orcamento enviado ao cliente via enviarParaCliente).
- D-16 (refina D-09): contam como pedido para cliente-frequente: APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE. Exclui ENVIADO, PENDENTE, PAGAMENTO_PARCIAL, CANCELADO. Chave = `Quote.customerId`; janela por `createdAt` (6 meses).
- D-17: Sem backfill. Etiquetas aparecem a partir da proxima mudanca de status.
- D-18 (corrigido na revisao de 2026-11-21): as 10 etiquetas de conta (8 de fase: orcamento-pendente, orcamento-enviado, pagamento-parcial, aprovado, em-producao, pronto-entrega, entregue, cancelado; mais `finalizado` e `cliente-frequente`) JA EXISTEM nos dois Chatwoots (Box e Bom Custo). Fato verificado em 2026-11-21: o orquestrador listou via GET /labels e criou as faltantes (Box: 10 criadas com resposta 200; Bom Custo: 9 criadas, `finalizado` ja existia). O codigo nao cria etiquetas; so precisa tolerar etiqueta inexistente (Chatwoot aceita etiqueta nao cadastrada na conversa) e falhas sem quebrar. O roteiro mantem uma conferencia somente de leitura.
- D-19: Corrigir o bug de ordem no webhook de fechamento (ramo "mensagem ja enviada hoje" pulava as etiquetas): etiquetas do D-06 sempre aplicadas na conversa liberada; so a mensagem respeita o limite diario.
- D-20: Labels do fechamento aplicadas na hora; apenas a mensagem e agendada com o atraso (setTimeout + Map por conversa para dedupe). Instancia unica do backend por tenant.
- D-21: Fora desta fase, divida explicita (nao implementar): (a) `approveByConversation` usa `findFirst` sem `orderBy` (pre-existente, nao deterministico com varias cotacoes na conversa); (b) re-post de cotacao sem `status` volta a PENDENTE (`normalizeStatus`) e a etiqueta acompanha; (c) `mergeDuplicates` apaga cotacoes sem ressincronizar as etiquetas. Registrados em 51-RESEARCH.md (Q5, R10, R14).
- D-22: Distribuicao do atraso do fechamento triangular entre min e max (padrao 45-180 s) aceita.
- D-23: As variaveis CHATWOOT_AUTOMATION_* e CHATWOOT_AI_* sao entregues pelo PR #75 (branch fix/compose-chatwoot-automation-env, commit 3709ae5). O PR #75 e PRE-CONDICAO DE DEPLOY desta fase; os planos nao as repetem; o gate do plano 51-05 garante ausencia de conflito e a implantacao do PR #75 e checkpoint de deploy manual (roteiro passo 0).
- D-24: Instancia unica do backend por tenant confirmada; o risco de timer perdido em restart (D-12/D-20) e aceito.

### Claude's Discretion

- Estrutura (service de labels dedicado), testes unitarios das regras puras (mapa, mescla, criterio frequente, sorteio do delay).
- Novas envs entram no compose (box e vps) e no stack.env.example.
- Escolhas registradas nos planos: `finalizado` fora do conjunto gerenciado pela sincronizacao de status (so o fechamento escreve nele); fechamento com etiquetas e contagem best-effort e enfileiradas sem await; re-check que FECHA (nao envia) em falha, null, `messages` nao-array ou `created_at` ilegivel; reabertura detectada remove `finalizado` e restaura fase e cliente-frequente; gancho EFI so quando o status muda; kill-switch CHATWOOT_ETIQUETAS_ATIVAS; sem indice novo para a contagem por cliente; a fase vem da cotacao atualizada mais recentemente da conversa.

</decisions>

<canonical_refs>
## Canonical References

- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` / `.controller.ts` — webhook de fechamento
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` — addConversationLabels (substitui a lista), toggleConversationStatus, postConversationNote
- `apps/backend/src/modules/quotes/quotes.service.ts` — mudancas de status
- `apps/backend/prisma/schema.prisma` — Quote, QuoteStatus
- `deploy/docker-compose.box.vps.yml`, `deploy/docker-compose.vps.yml`, `deploy/stack.env.example`
- Fase 49 (status silencioso/em lote) — nao enviar mensagem ao cliente; etiquetas sao internas, podem ser aplicadas

</canonical_refs>

<deferred>
## Deferred Ideas

- Fila persistente (BullMQ/DB) para o atraso sobreviver a restart.
- Cliente frequente contando compras de balcao no Athos.
- Divida explicita da D-21 (approveByConversation sem orderBy, re-post sem status voltando a PENDENTE, mergeDuplicates sem ressincronizar etiquetas).

</deferred>

---

*Phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano*
*Context gathered: 2026-11-21 via conversa*
