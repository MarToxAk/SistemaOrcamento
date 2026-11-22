# Phase 51: Chatwoot — etiquetas por fase, cliente frequente e delay humano - Research

**Pesquisado:** 2026-11-21
**Domínio:** Integração Chatwoot (labels de conversa) + Prisma `Quote` + agendamento em processo (NestJS)
**Confiança geral:** MEDIUM
- Código do projeto: HIGH (arquivos lidos nesta sessão, com linha).
- API Chatwoot: MEDIUM (documentação oficial + fetch resumido do código-fonte; nenhuma sonda contra instância real).
- Formato de criação de label da conta: LOW até sonda (docs e controller divergem; ver Assumptions A1).

<user_constraints>
## User Constraints (from CONTEXT.md)

Fonte: `.planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-CONTEXT.md` (copiado literalmente).

### Locked Decisions

- D-01: Mapa status -> etiqueta:
  PENDENTE=`orcamento-enviado`, PAGAMENTO_PARCIAL=`pagamento-parcial`, APROVADO=`aprovado`, EM_PRODUCAO=`em-producao`, PRONTO_PARA_ENTREGA=`pronto-entrega`, ENTREGUE=`entregue`, CANCELADO=`cancelado`. ENVIADO: Claude's discretion (sugestao `entregue` ou sem etiqueta — documentar).
- D-02: Fica **so a etiqueta da fase atual**: ao trocar status, remove a etiqueta de fase anterior e aplica a nova. Etiquetas manuais (fora do conjunto do sistema) sao preservadas durante a vida da conversa.
- D-03: Aplicar em toda mudanca de status do orcamento (todos os caminhos: manual, em lote/silenciosa da fase 49, webhook de pagamento EFI, conciliacao Athos, criacao). Falha do Chatwoot NUNCA bloqueia a mudanca de status (best-effort, log).
- D-04: ATENCAO: `POST /conversations/:id/labels` do Chatwoot **substitui** a lista inteira. Ler as etiquetas atuais (GET labels) e regravar a lista mesclada.
- D-05: Etiquetas devem existir na conta do Chatwoot (labels de conta). Garantir criacao idempotente (`/api/v1/accounts/:id/labels`) ou documentar criacao manual — research decide.
- D-06: Conversa liberada (sem pendencia): deixar **apenas `finalizado`** + `cliente-frequente` se aplicavel. Remove todas as demais, inclusive manuais (comportamento atual mantido).
- D-07: Conversa bloqueada por pendencia: **mantem a etiqueta da fase** (nao mexe nas etiquetas alem do que ja existe).
- D-08: Status que liberam continuam configuraveis por `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO` (usuario vai usar PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO).
- D-09: Criterio: **3 ou mais orcamentos pagos/entregues nos ultimos 6 meses neste sistema** (Prisma `Quote`), mesmo cliente. Research define a chave do cliente (contato Chatwoot / telefone / idcliente Athos) e quais status contam como "pago/entregue" (ex.: APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, ENVIADO).
- D-10: Etiqueta `cliente-frequente`. **Permanece** apos finalizar (atributo do cliente, nao da fase).
- D-11: Recalcular quando o status do orcamento muda (mesmo gancho do D-03). Critero e limiares (3 / 6 meses) configuraveis por env com esses defaults.
- D-12: Antes da mensagem de encerramento (nao da nota de pendencia), esperar um atraso **aleatorio com cara de humano** — Claude's discretion; sugestao 45-180 s, nao uniforme exato. Configuravel por env (min/max). Nao segurar a resposta HTTP do webhook: responder 200 rapido e agendar o envio (setTimeout/fila em processo e aceitavel; se o processo reiniciar a mensagem se perde — documentar).
- D-13: Re-checar antes de enviar: se a conversa foi reaberta ou recebeu mensagem nova do cliente durante a espera, nao enviar. (Claude's discretion se o custo for alto.)
- D-14: Box e Bom Custo — mesmo codigo; nada especifico por tenant alem de env.

### Claude's Discretion

- Estrutura (service de labels dedicado), testes unitarios das regras puras (mapa, mescla, criterio frequente, sorteio do delay).
- Novas envs entram no compose (box e vps) e no stack.env.example.

### Deferred Ideas (OUT OF SCOPE)

- Fila persistente (BullMQ/DB) para o atraso sobreviver a restart.
- Cliente frequente contando compras de balcao no Athos.

</user_constraints>

## Summary

A fase é majoritariamente integração com o Chatwoot já existente. O ponto delicado é que **não há um ponto único de mudança de status**: `Quote.status` é gravado em **5 pontos** (um deles é o `changeStatus`, que cobre 7 dos caminhos). Os outros quatro (`enviarParaCliente`, criação via `create()`, webhook EFI PIX e webhook EFI cartão) escrevem direto no Prisma, inclusive dentro de `$transaction`. Por isso o gancho de etiquetas precisa ser chamado explicitamente nesses 5 pontos, depois do commit.

O fechamento (`handleConversationResolved`) já faz `POST labels ["finalizado"]`, que substitui a lista inteira. Ou seja, o D-06 ("remove manuais") já é o comportamento atual; a mudança real é acrescentar `cliente-frequente` ao POST e tirar o envio da mensagem do caminho síncrono. Há ainda um bug de ordem a corrigir: o ramo `mensagem_ja_enviada_hoje` retorna antes do POST de labels.

A regra "mesmo cliente" precisa ser decidida com cuidado: o `Customer` é deduplicado por telefone/e-mail (não pelo contato Chatwoot), o Athos `idcliente` não é persistido em `Quote`, e `Quote.conversationId` não é único (várias cotações podem apontar para a mesma conversa). Os status "pago/entregue" também têm ambiguidade: `APROVADO` pode ser gravado pela aprovação por link sem pagamento, e `ENVIADO` só significa "orçamento enviado".

Para o atraso humano, não há fila no projeto (`@nestjs/schedule` está instalado e registrado, mas só para `@Cron`). Recomendo `setTimeout` com `Map` em memória, dedupe por conversa e re-check via `GET /conversations/:id`. O custo de perder a mensagem num restart já está aceito no D-12.

**Primary recommendation:** criar `sincronizarEtiquetasChatwoot(quoteId)` como método público de `QuotesService`, sem alterar o construtor (evita quebrar 8+ arquivos de teste), com a lógica pura (mapa, mescla, critério, sorteio) em um arquivo novo `chatwoot-etiquetas.ts`. Chamar esse método com `void` nos 5 pontos de escrita, depois do commit. Serializar por `conversationId`, ler o banco de forma fresca dentro da fila e só gravar no Chatwoot se a lista mudou. No fechamento, aplicar as etiquetas imediatamente e agendar apenas a mensagem. Antes de implementar, responder as Open Questions (principalmente ENVIADO, status "pagos", janela de 6 meses, chave do cliente) e fazer a sonda do formato de criação de label.

## Project Constraints (from CLAUDE.md)

Diretivas dos arquivos `/root/SistemaOrcamento/CLAUDE.md`, `memory/*.md` e do CLAUDE.md global que afetam este planejamento:

- **Idioma:** responder e escrever em português brasileiro (`memory/feedback_idioma.md`). Código e nomes técnicos seguem o padrão do repositório (inglês/português já usados nos identificadores).
- **Sem AskUserQuestion:** perguntas ao usuário devem ser lista numerada em texto (`memory/feedback_askuserquestion.md`). Aplicado na seção Open Questions.
- **Não alterar código sem pedido explícito** (`memory/feedback_nao_mexer_codigo.md`). Esta pesquisa não alterou nenhum arquivo de aplicação.
- **Athos é PRODUÇÃO** (`memory/athos_postgres_9_0_5.md`; CLAUDE.md global: "O host real é `192.168.33.198` ... é o Athos de PRODUÇÃO"). Esta fase não deve consultar o Athos: D-09 pede explicitamente a contagem só no Prisma.
- **Ordem de ambientes:** o backend é acessado primeiro pelo VPS e depois localhost (`memory/project_urls.md`). Não se aplica diretamente a esta fase.

## Architectural Responsibility Map

| Capacidade | Tier primário | Tier secundário | Justificativa |
|------------|---------------|-----------------|---------------|
| Aplicar etiqueta de fase nas trocas de status | API / Backend (`QuotesService`) | Chatwoot (armazena labels) | O status vive no Prisma; o Chatwoot só reflete |
| Calcular cliente frequente | Database / Storage (COUNT no Prisma) | API / Backend | Regra de negócio sobre `Quote`; sem agregação persistida |
| Aplicar `finalizado` + `cliente-frequente` no fechamento | API / Backend (`ChatwootAutomationService`) | Chatwoot | Decisão síncrona no webhook (rápida) |
| Atraso humano e envio da mensagem | API / Backend (timer em processo) | Chatwoot (envio) / IA externa (texto) | Sem fila persistente (deferido no CONTEXT) |
| Re-check de reabertura/mensagem nova (D-13) | API / Backend | Chatwoot (`GET conversations/:id`) | Fonte de verdade do estado da conversa é o Chatwoot |
| Configuração (limiares, min/max, liga/desliga) | Backend (`ConfigService`) | Compose / `stack.env.example` | D-14: mesmo código em Box e Bom Custo |

## Q1 — Pontos de mudança de `Quote.status`

Enum verbatim (`apps/backend/prisma/schema.prisma:21-30`):

```
enum QuoteStatus {
  PENDENTE
  PAGAMENTO_PARCIAL
  APROVADO
  EM_PRODUCAO
  PRONTO_PARA_ENTREGA
  ENTREGUE
  ENVIADO
  CANCELADO
}
```

Mapa de transições (`apps/backend/src/modules/quotes/quotes.service.ts:17-26`, verbatim nas chaves e valores):

```
const statusTransitions = {
  PENDENTE: ["ENVIADO", "PAGAMENTO_PARCIAL", "APROVADO", "CANCELADO"],
  PAGAMENTO_PARCIAL: ["APROVADO", "CANCELADO"],
  APROVADO: ["EM_PRODUCAO", "CANCELADO"],
  EM_PRODUCAO: ["PRONTO_PARA_ENTREGA", "CANCELADO"],
  PRONTO_PARA_ENTREGA: ["ENTREGUE", "CANCELADO"],
  ENTREGUE: [],
  ENVIADO: ["PAGAMENTO_PARCIAL", "APROVADO", "CANCELADO"],
  CANCELADO: [],
}
```

### Todos os pontos que gravam `status` (verificados lendo o código)

| # | Local | Caminho que chega aqui | Passa por `changeStatus`? | Onde pendurar o gancho |
|---|-------|------------------------|---------------------------|------------------------|
| 1 | `quotes.service.ts:993` (dentro de `changeStatus`, linha 934) | `PATCH /quotes/:id/status` (`quotes.controller.ts:86-89`); `PATCH /quotes/status/lote` (`quotes.controller.ts:81-84` -> `changeStatusLote` linha 1062 -> `changeStatus` linha 1075, com `notificarCliente:false`); `approveByToken` (linha 2083) e `approveByConversation` (linha 2151); `conciliarViaCaixaAthos` (linha 494); `confirmarPagamentoCaixa` (linha 550); `checkPaymentStatus` (linha 379) | **sim** — ponto central | Depois do `update` (após linha 1019), antes das notificações (linha 1021) |
| 2 | `quotes.service.ts:1819` (dentro de `enviarParaCliente`, linha 1804) | `POST /quotes/:id/enviar` (`quotes.controller.ts:104`) -> ENVIADO | **não** (update direto com `statusHistory`) | Depois do `update` (após linha 1832) |
| 3 | `quotes.service.ts:677` (update) e `:787` (create), dentro de `$transaction` que começa na linha 670 e termina na 887 | `POST /quotes` (`quotes.controller.ts:63`) — upsert por `externalQuoteId`, com `status: initialStatus` | **não** | Depois do `$transaction` (após linha 887, antes de `mapQuoteBody` na linha 889) |
| 4 | `efi.service.ts:638` (dentro de `$transaction` que começa na linha 620 e termina na 664) | Webhook EFI PIX -> `nextStatus` (`resolveNextQuoteStatus`, `efi.service.ts:64-72`) | **não** | Depois da transação (após linha 664, antes da mensagem ao cliente na linha 666) |
| 5 | `efi.service.ts:830` (dentro de `$transaction` que começa na linha 815 e termina na 855) | Webhook EFI cartão | **não** | Depois da transação (após linha 855) |

Verificado e **não** é ponto de mudança de status: `quotes.service.ts:247, 270, 357, 392, 455, 481, 542` (saleExternalId, paymentConfirmedAt, paymentNote); `quotes.service.ts:1479` (só `updatedAt`); `quotes.service.ts:1916, 1943, 2077` (token/aprovação); `nfse.service.ts:198, 287, 311` (campos NFS-e); `athos-listener.service.ts:161` (só `paymentNote`). Não há `$executeRaw` que atualize `Quote`, nem `quote.delete` fora de `mergeDuplicates` (`quotes.service.ts:1483`).

### Resposta

**Não existe ponto único.** `changeStatus` cobre 1 dos 5 pontos, mas é o caminho de 7 chamadores (manual, lote, aprovação por link, caixa x2, checagem Athos). Os outros 4 pontos escrevem direto.

**Recomendação:** método público `QuotesService.sincronizarEtiquetasChatwoot(quoteId: string): Promise<void>`, que nunca lança exceção (D-03). Chamada com `void` nos 5 pontos (no ponto 1, dentro de `changeStatus`; nos pontos 2 e 3, na própria `QuotesService`; nos pontos 4 e 5, via `this.quotesService.sincronizarEtiquetasChatwoot(quote.id)`, já que `EfiService` já injeta `QuotesService` com `forwardRef`, `efi.service.ts:21-22`).

Por que `void` e não `await`: o lote (`changeStatusLote`, até 50 itens, `LIMITE_STATUS_LOTE`) chama `changeStatus` em sequência; com `await` nas chamadas ao Chatwoot, o lote ficaria lento e o PATCH poderia estourar. Os testes podem aguardar com `await new Promise(setImmediate)` ou expor a promise da fila.

**Gancho depois do commit, nunca dentro da `$transaction`:** chamadas HTTP ao Chatwoot não devem segurar a transação aberta.

## Q2 — API Chatwoot (labels)

| Operação | Método e caminho | Corpo | Resposta | Fonte |
|----------|------------------|-------|----------|-------|
| Listar labels da conversa | `GET /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels` | — | `payload`: array de strings | [CITED: developers.chatwoot.com/api-reference/conversations/list-labels] |
| **Substituir** labels da conversa | `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels` | `{ "labels": ["..."] }` | 200, `payload`: array de strings | [CITED: developers.chatwoot.com/api-reference/conversations/add-labels] — "Note that this API would overwrite the existing list of labels associated to the conversation." |
| Detalhe da conversa | `GET /api/v1/accounts/{account_id}/conversations/{conversation_id}` | — | `status` (open/resolved/pending), `labels`, `last_activity_at`, `messages` (array de mensagens) | [CITED: developers.chatwoot.com/api-reference/conversations/conversation-details] |
| Listar labels da conta | `GET /api/v1/accounts/{account_id}/labels` | — | `payload`: array de `{id, title, description, color, show_on_sidebar}` | [CITED: developers.chatwoot.com/api-reference/labels/list-all-labels] |
| Criar label da conta | `POST /api/v1/accounts/{account_id}/labels` | **CONFLITO** (ver abaixo) | 200, objeto `label` | [CITED: developers.chatwoot.com/api-reference/labels/create-a-label] |

**Autenticação:** header `api_access_token` (o código já usa: `chatwoot.service.ts:24, 52, 91, 105`).

**Código atual (verbatim, `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts:104-105`):**
```
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`;
    const response = await axios.post(url, { labels }, { headers: { api_access_token: token } });
```
Esse método (`addConversationLabels`, linha 95) já tem o comportamento de substituição. É o mesmo caminho usado no fechamento (`chatwoot-automation.service.ts:174`, verbatim: `    await this.chatwoot.addConversationLabels(conversationId, ["finalizado"]);`).

**Regras de nome de label da conta:** o model `Label` (fetch do `app/models/label.rb`, resumido) faz `before_validation` com `self.title = title.downcase if attribute_present?('title')`, valida `format` com a constante `UNICODE_CHARACTER_NUMBER_HYPHEN_UNDERSCORE` e `uniqueness: { scope: :account_id }`. [CITED: github.com/chatwoot/chatwoot/blob/develop/app/models/label.rb — via fetch resumido; charset exato da constante não lido]. Os nomes propostos (minúsculas, hífen) atendem essas regras.

**Idempotência de criação (D-05):** a unicidade é por conta (`scope: :account_id`), então a abordagem é: `GET /labels` -> criar só as que faltam -> tratar erro de criação como "possivelmente já existe" e seguir (registrar warn). Não há evidência de que o erro de duplicata seja 422; isso não foi confirmado (A4).

**CONFLITO na criação de label (A1, LOW):**
- Docs oficiais (`create-a-label`): corpo com `title`, `description`, `color`, `show_on_sidebar` **no topo** do JSON.
- Controller (`app/controllers/api/v1/accounts/labels_controller.rb`, via fetch resumido): `params.require(:label).permit(:title, :description, :color, :show_on_sidebar)`, com `create!` — ou seja, o corpo parece precisar estar **aninhado em `label`**.
- Não é possível decidir só por leitura. Sonda não destrutiva proposta (ver Validation Architecture, passo S1). Nenhuma sonda foi executada nesta pesquisa, porque escreveria numa instância Chatwoot real.

**Limite de taxa:** `config/initializers/rack_attack.rb` do Chatwoot define `req/ip` global de 3000 requisições por minuto (`RACK_ATTACK_LIMIT`), e só em produção. Não há throttle específico para `conversations/:id/labels` nem `labels`. [CITED: github.com/chatwoot/chatwoot/blob/develop/config/initializers/rack_attack.rb — fetch resumido]. Instância hospedada ou com outra configuração: não verificado (A5).

**Payload do webhook `conversation_resolved`:** a documentação de webhooks não confirma os campos. O código atual assume `id`, `contact_inbox`/`inbox_id` e `messages` (`chatwoot-automation.service.ts:150-155` e tipo `ChatwootAutomationWebhookPayload`, linhas 10-15). Mantém-se esse contrato sem mudança.

## Q3 — Cliente frequente

### Chave do cliente

**Recomendação: `Quote.customerId` (= `Customer.id`).**

Evidências:
- `Customer` (`schema.prisma:43-57`) tem `id String @id @default(uuid())`, `phone`, `email`, `chatwootContactId BigInt?`. O model não tem campo de Athos.
- `resolveCustomer` (`quotes.service.ts:1192-1235`) deduplica por **telefone OU e-mail** (`filters = [phone ? { phone } : null, email ? { email } : null]`, `findFirst({ where: { OR: filters } })`). Essa é a noção que o sistema já usa de "mesmo cliente".
- `Quote.customerId String` (linha 75, obrigatório) — sempre preenchido.
- `Quote.chatwootContactId BigInt?` (linha 83) é por cotação, nullable e indexado (`@@index([chatwootContactId])`, linha 132).
- **Athos `idcliente` não está em `Quote`** (modelo lido inteiro, `schema.prisma:71-136`). Os campos `idclienteAthos` estão em `CobrancaBoleto`, `CobrancaEmailEnvio`, `CobrancaEmailCcPadrao`, `CobrancaAvisoVencimento` e `NfseEmitida`. Usar Athos exigiria chamada ao Athos de produção, por cotação, o que D-09 não pede.

Alternativa (Open Question 4): `OR: [{ customerId }, { chatwootContactId }]` quando `chatwootContactId` existir. Aumenta o recall (mesmo contato Chatwoot com telefone diferente), mas pode juntar pessoas distintas que compartilham contato no Chatwoot. Não recomendado como default.

### Quais status contam como "pago/entregue"

Recomendação (confirmar, Open Question 2): **`APROVADO`, `EM_PRODUCAO`, `PRONTO_PARA_ENTREGA`, `ENTREGUE`**.

- **Excluir `ENVIADO`:** D-09 cita ENVIADO como exemplo, mas `enviarParaCliente` só grava "orçamento enviado" (`quotes.service.ts:1818-1828`), sem pagamento. Contar ENVIADO superestima o cliente frequente.
- **Excluir `PAGAMENTO_PARCIAL`:** pagamento incompleto (`resolveNextQuoteStatus`, `efi.service.ts:64-72`: parcial -> `PAGAMENTO_PARCIAL`, e só vai a APROVADO quando `fullyPaid`).
- **`APROVADO` tem ambiguidade (R15):** `approveByToken` chama `changeStatus(..., "APROVADO", ...)` (`quotes.service.ts:2083`) após o cliente aprovar pelo link, sem pagamento. Mantido por proposta do usuário; registrar como risco de falso positivo.
- `EM_PRODUCAO` exige aprovação ou pagamento para clientes não associados (`quotes.service.ts:981-990`), mas para clientes associados ao Athos exige só aprovação (`requiresLinkApproval`). Logo, "pago" não é garantido nem nesse status.

### Janela de 6 meses

Campo recomendado: **`createdAt`** (Open Question 3). Motivo:
- `updatedAt` tem `@updatedAt` (schema linha 127) e é alterado por qualquer `update`, inclusive por leituras que gravam (`getById` persiste `saleExternalId`, `quotes.service.ts:247, 270`). Contar por `updatedAt` infla a contagem (R16).
- `paymentConfirmedAt` (linha 96) não é gravado na aprovação por link nem em todos os caminhos.
- `statusHistory.changedAt` (`QuoteStatusHistory`) é o mais fiel ("quando entrou no status") mas exige subquery; alternativa cara para este caso.

### Consulta Prisma

```ts
const desde = new Date();
desde.setMonth(desde.getMonth() - meses); // meses = 6 (env)
const total = await prisma.quote.count({
  where: {
    customerId,
    status: { in: STATUS_PEDIDO_CONCRETIZADO },
    createdAt: { gte: desde },
  },
});
const frequente = total >= minPedidos; // minPedidos = 3 (env)
```

**Índices existentes** (`schema.prisma:129-135`): `@@index([status, updatedAt])`, `@@index([conversationId])`, `@@index([chatwootContactId])`, `@@index([saleExternalId])`, `@@index([paymentSource, paymentMethod])`, `@@index([paymentConfirmedAt])`. **Não há índice em `customerId` nem em `createdAt`.** Com `status IN (...)` e `customerId`, o planejador provavelmente usa seq scan. Não há dado de volume da produção nesta pesquisa (não verificado). Recomendação: aceitar o seq scan enquanto o volume for pequeno, e se necessário adicionar migration `@@index([customerId, status, createdAt])` (mudança de schema: decisão do planner, não feita aqui).

A contagem inclui a própria cotação se ela já estiver em um dos status (D-09 "3 ou mais" conta a atual). Ela roda a cada troca de status (D-11), uma única consulta.

## Q4 — Atraso humano, agendamento e re-check

### Infraestrutura existente (verificada)

- **Não há fila** no projeto: nenhum BullMQ/Bull (`grep` em `apps/backend/src` e `package.json` sem match).
- **`@nestjs/schedule` 6.1.3** está instalado (`apps/backend/package.json`, `"@nestjs/schedule": "^6.1.3"`) e registrado globalmente em `apps/backend/src/modules/app.module.ts:79` (`ScheduleModule.forRoot(),`). Hoje é usado só para `@Cron` (`cobranca-reconciliation.job.ts:31`, `cobranca-baixa-athos-retry.job.ts:37`, `cobranca-aviso-vencimento.job.ts:35`).
- `setInterval` existe só como keepalive do listener Athos (`athos-listener.service.ts:71`).
- O comentário do `CobrancaReconciliationJob` (linhas 17-26) documenta (linhas 14-21): "O deploy atual e de instancia unica; se isso mudar, substituir por um lock distribuido (ex.: `pg_try_advisory_lock` do Postgres)". Precedente para o risco de múltiplas instâncias (R9).
- O compose não define `replicas` em nenhum dos dois arquivos (`docker-compose.box.vps.yml`, `docker-compose.vps.yml`); ver A11.

### Opções de agendamento

| Opção | Prós | Contras | Recomendação |
|-------|------|---------|--------------|
| `setTimeout` + `Map<conversationId, Timeout>` no módulo | Zero mudança de construtor; testável com fake timers; dedupe simples | Some no restart (D-12 aceita) | **Recomendada** |
| `SchedulerRegistry.addTimeout(name, timeoutId)` (`@nestjs/schedule` 6.1.3) | Visível e gerenciável; já instalado | Exige injetar `SchedulerRegistry` no `ChatwootAutomationService`, quebrando o teste que monta o service com 3 argumentos (`chatwoot-automation.service.test.ts:130`) | Alternativa aceitável |
| Fila persistente (BullMQ/tabela + `@Cron`) | Sobrevive a restart | Deferido no CONTEXT ("Fila persistente (BullMQ/DB)") | Fora de escopo |

Typings de `SchedulerRegistry` (verbatim, `node_modules/@nestjs/schedule/dist/scheduler.registry.d.ts`, versão 6.1.3):
```
    addTimeout<T = any>(name: string, timeoutId: T): void;
    getTimeouts(): string[];
    deleteTimeout(name: string): void;
```

### Fluxo do fechamento revisado

```
POST /integrations/chatwoot/automation/webhook/:token   (200 rápido)
  1. inbox monitorado?                          (automation:151)
  2. quote por conversationId (orderBy updatedAt desc, automation:156-160)
  3. bloqueado? (podeFecharConversa)            (automation:162)
       sim -> toggle open + nota privada (automation:163-166); NÃO mexe em labels (D-07)
  4. liberado -> POST labels ["finalizado"] (+ "cliente-frequente" se frequente)   (D-06)
       ** mover para ANTES do check "mensagem_ja_enviada_hoje" (automation:169-172) — R6
  5. agendar envio: setTimeout(sortearAtrasoHumanoMs(45, 180))  -> retorna { processed:true, action:"mensagem_agendada" }
  ---- timer ----
  6. re-check (D-13): GET /conversations/:id
       status !== "resolved"  -> aborta
       existe message_type === 0 (incoming) com created_at > resolvedAt -> aborta
  7. checa 1x/dia (podeEnviarMensagemFechamento, automation:198-208)
  8. saudação calculada AGORA (calcularSaudacao(getHoraSaoPaulo()), automation:177) — não no resolve
  9. IA (chamarIA) ou fallback -> sendOutgoingMessage -> chatwootMensagemEnviada.create (automation:190-193)
```

**Por que aplicar as etiquetas imediatamente no fechamento (passo 4), e não no timer:** com restart, a mensagem se perde (aceito), mas as etiquetas continuam corretas. Se as etiquetas ficassem no timer, a fase continuaria no cartão de uma conversa já encerrada. Alternativa em Open Question 6.

**Re-check D-13:** `message_type` tem valores `incoming: 0, outgoing: 1, activity: 2, template: 3` (fetch de `app/models/message.rb`, [CITED: github.com/chatwoot/chatwoot/blob/develop/app/models/message.rb]). O formato de `created_at` (epoch em segundos?) não foi confirmado (A3). `conversation-details` documenta que `messages` contém todas as mensagens (pode ser pesado em conversas longas; A4). Alternativa mais barata: comparar `last_activity_at` com `resolvedAt`, mas labels e notas também podem atualizá-lo (não verificado, A6).

**Sorteio do atraso (Claude's discretion):** recomendo distribuição triangular (média de dois `Math.random`), entre 45 e 180 s, com min/max por env e troca automática se min > max. Uniforme também atende "não exato", mas triangular concentra no meio e evita o padrão plano.

**Dedupe:** um timer por `conversationId`. Um novo `resolved` cancela o anterior (`clearTimeout`). Isso evita duas mensagens se a conversa for resolvida, reaberta e resolvida de novo.

## Q5 — Testes

- **Framework:** Jest 30 + ts-jest 29 (`apps/backend/package.json`: `"jest": "^30.3.0"`, `"ts-jest": "^29.4.9"`, `"@types/jest": "^30.0.0"`). Config `apps/backend/jest.config.js`: `rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`, `testEnvironment: 'node'`, transform via ts-jest com `module: 'CommonJS'`.
- **Comando verificado nesta sessão:** `cd /root/SistemaOrcamento/apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot` -> **1 suite, 19 testes, todos passam (~7 s)**. O `npx jest` dentro de `apps/backend` não foi testado; use o binário da raiz.
- **Padrão observado em `chatwoot-automation.service.test.ts`:** `describe`/`it` em português; service montado com `new ChatwootAutomationService(prisma as any, chatwoot as any, config as any)` (linha 130); métodos privados espiados com `jest.spyOn(service as any, "chamarIA")` (linha 133-138); mocks em objetos literais com `jest.fn().mockResolvedValue(...)`. Funções puras são exportadas e testadas diretamente (linhas 13-83).
- **Padrão em `quotes.service.*.test.ts`:** módulo Nest (`Test.createTestingModule({ providers: [...] })`), com `{ provide: ChatwootService, useValue: { sendOutgoingMessage, sendAttachment } }`, por exemplo `quotes.service.chatwoot.test.ts`. Oito arquivos montam `QuotesService` ou `EfiService` assim (`quotes.service.unit.test.ts`, `quotes.service.chatwoot.test.ts`, `quotes.service.mensagem.test.ts`, `quotes.service.status-lote.test.ts`, `quotes.controller.status.http.test.ts`, `efi.service.test.ts`, `efi.webhook.test.ts`, `efi.card-webhook.test.ts`). Se o construtor ganhar um provider novo, todos precisam de mock. **Por isso a recomendação de não mudar o construtor.**
- **Fake timers:** não encontrei uso de `jest.useFakeTimers` nos arquivos lidos. Usar `jest.useFakeTimers()` + `jest.advanceTimersByTime(ms)` para o timer do D-12 (padrão Jest, sem dependência nova).
- **Suites de quotes e efi:** o SUMMARY da fase 49 (`49-02-SUMMARY.md`) reporta "modules/quotes + integrations/efi: 15 suites passam, 1 pulada, 181 testes passam" — **não reexecutado nesta pesquisa**. `quotes-mensagem.clone.it.test.ts` tem sufixo `.it` e pode depender de banco; verificar antes de rodar.

## Standard Stack

Nenhuma biblioteca nova. Tudo já está no projeto:

| Biblioteca | Versão (declarada) | Uso nesta fase | Fonte |
|------------|--------------------|----------------|-------|
| axios | `^1.7.7` (`apps/backend/package.json`) | Chamadas à API Chatwoot (novos métodos seguem o padrão de `chatwoot.service.ts`) | verificado no package.json |
| @prisma/client | `^5.22.0` | `count`/`findFirst` para cliente frequente e cotação da conversa | verificado no package.json |
| @nestjs/schedule | `^6.1.3` (instalado 6.1.3) | Opcional: `SchedulerRegistry` (ver Q4) | verificado em `node_modules/@nestjs/schedule/package.json` |
| jest / ts-jest | `^30.3.0` / `^29.4.9` | Testes unitários e de timer | verificado no package.json |

### Alternativas consideradas

| Em vez de | Poderia usar | Trade-off |
|-----------|--------------|-----------|
| `setTimeout` + `Map` | `SchedulerRegistry` | Visibilidade contra mudança de construtor |
| Fila por conversa em memória | Lock no Postgres (`pg_try_advisory_lock`) | Lock distribuído só é necessário se houver mais de uma instância (R9) |
| `count` de cotações | Tabela agregada de "pedidos do cliente" | Mais código e migração sem ganho no volume atual |

**Instalação:** nenhuma.

## Package Legitimacy Audit

**Nenhum pacote externo é instalado nesta fase.** O gate de legitimidade (`gsd-tools query package-legitimacy check`) não foi executado porque não há pacote novo a verificar. Se o planner decidir adicionar qualquer biblioteca (por exemplo, para fila ou rate limit), ela precisa passar pelo gate antes de entrar no plano.

## Architecture Patterns

### Estrutura recomendada (sem alterar construtores)

```
apps/backend/src/modules/integrations/chatwoot/
├── chatwoot-etiquetas.ts          # NOVO: regras puras + fila por conversa + garantia de labels da conta
├── chatwoot-etiquetas.test.ts     # NOVO: testes das regras puras
├── chatwoot.service.ts            # + getConversation, getConversationLabels, listAccountLabels, createAccountLabel
├── chatwoot-automation.service.ts # fechamento: labels imediatas, agenda envio, re-check
└── ...
apps/backend/src/modules/quotes/quotes.service.ts  # + sincronizarEtiquetasChatwoot (público), chamadas nos 3 pontos
apps/backend/src/modules/integrations/efi/efi.service.ts  # + chamadas nos 2 webhooks, após a transação
```

### Diagrama de fluxo

```
PATCH status | lote | aprovação link | caixa Athos | webhook EFI | POST /quotes | POST :id/enviar
        |  (depois do commit; void, sem await)
        v
QuotesService.sincronizarEtiquetasChatwoot(quoteId)
        |  lê a cotação de forma fresca (Prisma)  — sem conversationId: encerra aqui
        v
fila por conversationId (Promise encadeada) + teto de concorrência (3)
        |-- cotação mais recentemente atualizada da conversa  -> etiqueta de fase (D-01)
        |-- COUNT de pedidos do cliente (6 meses)             -> cliente-frequente (D-09/D-11)
        |-- GET /conversations/:id/labels
        |-- mesclarEtiquetas(atuais, novas, gerenciadas)      -> se diferente de atuais
        |-- garantirEtiquetasDaConta (cache por processo)     -> GET /labels + POST faltantes
        '-- POST /conversations/:id/labels  { labels }
```

### Padrão 1: mapa e mescla (funções puras)

```ts
// chatwoot-etiquetas.ts — PROPOSTA. Nomes de etiqueta vêm de 51-CONTEXT.md D-01:
// "PENDENTE=`orcamento-enviado`, PAGAMENTO_PARCIAL=`pagamento-parcial`, APROVADO=`aprovado`,
//  EM_PRODUCAO=`em-producao`, PRONTO_PARA_ENTREGA=`pronto-entrega`, ENTREGUE=`entregue`, CANCELADO=`cancelado`."
export const ETIQUETA_FASE_POR_STATUS: Partial<Record<QuoteStatus, string>> = {
  PENDENTE: "orcamento-enviado",
  ENVIADO: "orcamento-enviado",        // recomendação, ver Open Question 1 (D-01 sugeriu `entregue`: não usar)
  PAGAMENTO_PARCIAL: "pagamento-parcial",
  APROVADO: "aprovado",
  EM_PRODUCAO: "em-producao",
  PRONTO_PARA_ENTREGA: "pronto-entrega",
  ENTREGUE: "entregue",
  CANCELADO: "cancelado",
};
export const ETIQUETA_CLIENTE_FREQUENTE = "cliente-frequente"; // D-10

export function mesclarEtiquetas(atuais: string[], novas: string[], gerenciadas: string[]): string[] {
  const manuais = atuais.filter((l) => !gerenciadas.includes(l)); // D-02/D-04: preserva manuais
  return [...new Set([...manuais, ...novas])];
}
```

Com `ENVIADO` mapeado para a mesma etiqueta de `PENDENTE`, a transição PENDENTE -> ENVIADO (`enviarParaCliente`) não remove nem recoloca a etiqueta: a comparação com o estado atual evita POST desnecessário.

### Padrão 2: fila por conversa (serializa escritas na mesma conversa)

```ts
// PROPOSTA (padrão próprio, sem dependência nova)
const filasPorConversa = new Map<string, Promise<void>>();

export function enfileirarPorConversa(conversationId: string, tarefa: () => Promise<void>): Promise<void> {
  const anterior = filasPorConversa.get(conversationId) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(tarefa);
  filasPorConversa.set(conversationId, atual);
  void atual.finally(() => {
    if (filasPorConversa.get(conversationId) === atual) filasPorConversa.delete(conversationId);
  });
  return atual;
}
```

**Importante:** a tarefa deve ler a cotação e a contagem **dentro** da fila, não antes. Senão a última execução pode gravar um estado antigo.

### Padrão 3: timer de envio com dedupe

```ts
// PROPOSTA
const timersFechamento = new Map<string, NodeJS.Timeout>();

export function agendarEnvioFechamento(conversationId: string, delayMs: number, tarefa: () => Promise<void>): void {
  const anterior = timersFechamento.get(conversationId);
  if (anterior) clearTimeout(anterior);
  const timer = setTimeout(() => {
    timersFechamento.delete(conversationId);
    void tarefa().catch(() => undefined); // tarefa registra o próprio log
  }, delayMs);
  timersFechamento.set(conversationId, timer);
}
```

### Padrão 4: sorteio do atraso

```ts
// PROPOSTA — triangular entre min e max (segundos), retorna milissegundos
export function sortearAtrasoHumanoMs(minS: number, maxS: number, rnd: () => number = Math.random): number {
  const lo = Math.min(minS, maxS);
  const hi = Math.max(minS, maxS);
  const u = (rnd() + rnd()) / 2;
  return Math.round((lo + u * (hi - lo)) * 1000);
}
```

### Anti-padrões a evitar

- **`await` dos labels dentro de `changeStatus` no lote:** deixa o lote de 50 itens lento e bloqueia o PATCH.
- **Chamada ao Chatwoot dentro de `$transaction`:** segura a transação aberta durante HTTP.
- **Ler a fase fora da fila:** pode gravar estado antigo (ver Padrão 2).
- **Mudar o construtor de `QuotesService`, `EfiService` ou `ChatwootAutomationService`:** quebra os 8 arquivos de teste de quotes/efi e o teste de automação (`chatwoot-automation.service.test.ts:130`).
- **Usar `updatedAt` para a janela de 6 meses:** infla a contagem (R16).
- **Aplicar `cliente-frequente` a conversas sem cotação:** não há cliente para contar.

## Don't Hand-Roll

| Problema | Não construir | Usar | Motivo |
|----------|---------------|------|--------|
| Agendador com persistência | Tabela de jobs + polling próprio | Nada agora (deferido); `setTimeout` com `Map` | Escopo do CONTEXT; restart aceito no D-12 |
| "Adicionar etiqueta" no Chatwoot | Lógica de merge em outro lugar | GET labels + mesclar + POST (padrão já usado) | Chatwoot só tem substituição (add-labels), não adição |
| Contagem de cliente | Campo/tabela agregada de pedidos | `prisma.quote.count` com `createdAt` | Volume pequeno; sem migração |
| Parsing de envs de lista/limiar | Parser novo | Padrão de `getStatusPermitidosFechamento` (`chatwoot-automation.service.ts:94-102`): `split`, `filter`, fallback | Já testado no repo |
| Controle de rate limit | Biblioteca nova | Teto de concorrência simples (3) na fila | Rate limit Chatwoot é global e alto (A5) |
| Garantia de labels da conta | Criação sem checar | `GET /labels` -> criar faltantes -> tolerar erro | Unicidade por conta (CITED) |

**Insight-chave:** o projeto já tem o padrão de "best-effort com log" (`try/catch` com `logger.warn` em `quotes.service.ts:1050` e `quotes.service.ts:2145`). Reutilizá-lo para o D-03.

## Common Pitfalls (riscos Q6)

### R1 — Corrida na mesma conversa (lote, aprovação, caixa e EFI ao mesmo tempo)
- **O que dá errado:** duas escritas concorrentes (GET antigo + POST) apagam uma etiqueta da outra; o POST substitui a lista (CITED).
- **Por quê:** o POST é substituição total, sem `ETag`/versão; o GET e o POST não são atômicos.
- **Evitar:** fila por `conversationId` no processo (Padrão 2), leitura fresca dentro da fila, POST só se a lista mudou.
- **Limite:** a fila não protege entre instâncias. Hoje há uma instância (A11).

### R2 — Conversa com várias cotações (fase ambígua)
- **Evidência:** `Quote.conversationId BigInt?` sem `@unique` (`schema.prisma:82`), com índice não único (`schema.prisma:131`). O fechamento usa `findFirst ... orderBy: { updatedAt: "desc" }` (`chatwoot-automation.service.ts:156-160`). `approveByConversation` usa `findFirst` **sem** `orderBy` (`quotes.service.ts:2155`), ou seja, é não determinístico.
- **Evitar:** regra única: cotação mais recentemente atualizada da conversa. A cotação que acabou de mudar é, por construção, a mais recente após o `update` (Prisma atualiza `updatedAt`). Corrigir também `approveByConversation` (pré-existente; anotar).
- **Limite:** `getById` persiste `saleExternalId` e pode alterar a ordem (R16).

### R3 — Conversas sem `conversationId`
- **Evidência:** `conversationId` é nullable (`schema.prisma:82`). Sem cotação, `podeFecharConversa(null)` retorna `true` (`chatwoot-automation.service.ts:41`).
- **Evitar:** primeiro passo do hook: `if (!quote.conversationId) return;` (antes de qualquer HTTP ou COUNT). Fechamento sem cotação: só `finalizado`.

### R4 — Rate limit e rajadas
- **Evidência:** `req/ip` global de 3000/min em produção (CITED, A5). Um lote de 50 gera até ~150 chamadas (GET+POST+GET labels de conta), e com `void` elas saem em paralelo entre conversas diferentes.
- **Evitar:** teto de concorrência de 3 para chamadas Chatwoot no módulo de etiquetas (semáforo simples ou fila global).

### R5 — Webhook de fechamento substitui a lista inteira
- **Evidência:** `chatwoot-automation.service.ts:174`: `await this.chatwoot.addConversationLabels(conversationId, ["finalizado"]);`.
- **Efeito:** D-06 ("remove manuais") já é o comportamento. Para acrescentar `cliente-frequente`, o POST deve ter os dois itens; o cálculo de frequência deve ocorrer **antes** do POST.

### R6 — Ramo "mensagem já enviada hoje" pula as etiquetas (bug de ordem)
- **Evidência:** `chatwoot-automation.service.ts:169-172` retorna `mensagem_ja_enviada_hoje` **antes** do POST de labels (linha 174).
- **Efeito:** conversa liberada, mas com fase antiga e sem `finalizado`. Viola D-06.
- **Evitar:** mover a aplicação de labels para antes de `podeEnviarMensagemFechamento`.

### R7 — Reabertura durante a espera
- **Efeito:** `finalizado` (aplicado no passo 4) fica numa conversa aberta. A fase já foi removida no fechamento, mas a conversa voltou a ser ativa.
- **Evitar:** no re-check, se reaberta, remover `finalizado` (mantendo `cliente-frequente`), ou aplicar as labels só no timer (Open Question 6).

### R8 — Restart perde o timer
- **Efeito:** mensagem de encerramento não é enviada. Labels já aplicadas (fluxo recomendado) continuam corretas.
- **Mitigação:** log `info` ao agendar, com `conversationId` e `delayMs`. Documentar no runbook. Aceito no D-12.

### R9 — Dupla mensagem se houver mais de uma instância
- **Efeito:** dois timers, dois envios. A checagem diária (`podeEnviarMensagemFechamento`) reduz, mas não elimina (checagem e envio não são atômicos).
- **Mitigação atual:** instância única. Se escalar, usar lock (precedente: comentário de `cobranca-reconciliation.job.ts:14-21`).

### R10 — Re-post sem `status` regride a cotação para PENDENTE (pré-existente)
- **Evidência:** `normalizeStatus(input?)` retorna `"PENDENTE"` quando `!input` (`quotes.service.ts:1260-1262`); `initialStatus = this.normalizeStatus(payload.status)` (linha 577) e `status: initialStatus` no update (linha 681).
- **Efeito:** reenviar a cotação sem `status` volta a PENDENTE e, com o novo gancho, a etiqueta vira `orcamento-enviado`. Fora do escopo; anotar como risco visível.

### R11 — Variáveis de ambiente do Chatwoot ausentes nos composes
- **Evidência:** `grep` no repositório (fora de `.planning`) encontra `CHATWOOT_AUTOMATION_*`, `CHATWOOT_AI_*` e `CHATWOOT_AUTOMATION_WEBHOOK_TOKEN` só no código (`chatwoot-automation.controller.ts:24`, `chatwoot-automation.service.ts:87,95,129-131`). Nenhum aparece em `deploy/docker-compose.box.vps.yml`, `deploy/docker-compose.vps.yml` ou `deploy/stack.env.example`. Os composes não usam `env_file` (`grep env_file` retorna só `docker-compose.promo.yml`), então o container recebe apenas o que está listado em `environment`.
- **Efeito:** se o servidor não definir essas variáveis por outro meio, o webhook de fechamento responde erro (`CHATWOOT_AUTOMATION_WEBHOOK_TOKEN nao configurado no servidor`, controller:26) e a IA cai no fallback. Confirmar com o usuário (Open Question 10). Ao adicionar as novas envs, incluir essas também.

### R12 — Mesmo cliente, telefone diferente
- **Efeito:** dois `Customer` para a mesma pessoa; a contagem por `customerId` subestima. Alternativa em Q3 (OR com `chatwootContactId`).

### R13 — `GET` de cotação dispara escrita de status
- **Evidência:** `getById` chama `conciliarViaCaixaAthos` em background (`quotes.service.ts:289-291`), que pode chamar `changeStatus(..., "APROVADO")` (linha 494).
- **Efeito:** uma leitura muda o status e, portanto, a etiqueta. É o comportamento atual; o gancho cobre. Anotar para o planner não surpreender.

### R14 — Merge de duplicatas remove cotações
- **Evidência:** `mergeDuplicates` faz `tx.quote.delete` (`quotes.service.ts:1483`).
- **Efeito:** a etiqueta da conversa pode ficar desatualizada até a próxima troca. Opcional: chamar `sincronizarEtiquetasChatwoot(keepId)` após o merge.

### R15 — `APROVADO` não garante pagamento
- **Evidência:** `approveByToken` -> `changeStatus(quote.id, "APROVADO", "Aprovacao pelo cliente")` (`quotes.service.ts:2083`).
- **Efeito:** "cliente frequente" pode contar aprovações sem pagamento. Decisão do usuário (Open Question 2).

### R16 — `updatedAt` é ruidoso
- **Evidência:** `updatedAt DateTime @updatedAt` (`schema.prisma:127`); `getById` grava `saleExternalId` (`quotes.service.ts:247, 270`).
- **Efeito:** por isso `createdAt` na janela.

### R17 — Testes existentes com mocks incompletos
- **Evidência:** o mock de `prisma` em `quotes.service.chatwoot.test.ts` não tem `count`; o mock de `ChatwootService` tem só `sendOutgoingMessage` e `sendAttachment`.
- **Efeito:** com `conversationId` presente, o hook dá `TypeError`, capturado e logado, mas asserções como `not.toHaveBeenCalled` podem mudar. **Mitigação:** o gate de `conversationId` (R3) e atualizar os mocks dos testes que tenham cotação com conversa.

### R18 — Mudar construtor quebra testes
- Ver Padrão "Anti-padrões". Use Opção A (sem mudança de construtor).

## Code Examples

### Verbatim: conteúdo do POST de fechamento que será alterado (`chatwoot-automation.service.ts:174`)
```
    await this.chatwoot.addConversationLabels(conversationId, ["finalizado"]);
```
Novo: `addConversationLabels(conversationId, ["finalizado", ...(frequente ? ["cliente-frequente"] : [])])`, chamado **antes** do check `podeEnviarMensagemFechamento` (R6).

### Verbatim: cálculo de frequência (proposta)
Ver Q3. Valores de status e nome do campo vêm de `schema.prisma:21-30` e `schema.prisma:75, 129-135`.

### Verbatim: chamada de exemplo do re-check (proposta)
```ts
// PROPOSTA — campos de conversation-details (developers.chatwoot.com): status, messages
const conversa = await this.chatwoot.getConversation(conversationId);
const houveResposta = (conversa.messages ?? []).some(
  (m: { message_type: number; created_at: number }) =>
    m.message_type === 0 && m.created_at * 1000 > resolvidaEm.getTime(), // A3: created_at em segundos (não confirmado)
);
if (conversa.status !== "resolved" || houveResposta) return { processed: true, action: "envio_cancelado_reaberta" };
```

### Chamadas Chatwoot propostas (ASSUMED no nome; caminhos verbatim de CITED)
```ts
// PROPOSTA — padrão idêntico a chatwoot.service.ts:95-107
async getConversationLabels(conversationId: string): Promise<string[]> {
  // GET .../conversations/${conversationId}/labels  -> response.data.payload (array de strings)
}
async listAccountLabels(): Promise<Array<{ id: number; title: string }>> {
  // GET .../labels  -> response.data.payload
}
async createAccountLabel(title: string): Promise<void> {
  // POST .../labels — FORMATO A CONFIRMAR (A1): { title, ... } no topo OU { label: { title, ... } }
}
```
Todos com `timeout` explícito (recomendação; os métodos atuais não têm, ex. `chatwoot.service.ts:91`).

## Validation Architecture

> Incluída por padrão: `.planning/config.json` não define `workflow.nyquist_validation` (tratado como habilitado).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3 + ts-jest 29.4 |
| Config file | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| Quick run command | `cd /root/SistemaOrcamento/apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot` (verificado: 19 testes passam) |
| Full suite command | `cd /root/SistemaOrcamento/apps/backend && ../../node_modules/.bin/jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot` (reportado em 49-02-SUMMARY, não reexecutado) |

### Phase Requirements -> Test Map

Não há IDs de requisito (`ROADMAP.md`: "Requirements: TBD"). Mapeamento por decisão D-xx:

| Req ID | Comportamento | Tipo | Comando automatizado | Arquivo existe? |
|--------|---------------|------|----------------------|-----------------|
| D-01 | Mapa status -> etiqueta (inclui ENVIADO conforme decisão) | unit (pura) | `jest src/modules/integrations/chatwoot/chatwoot-etiquetas` | ❌ Wave 0 |
| D-02 / D-04 | `mesclarEtiquetas` remove fase anterior, preserva manuais, não duplica | unit (pura) | idem | ❌ Wave 0 |
| D-03 | Falha do Chatwoot não impede `changeStatus` (retorna normal) | service | `jest src/modules/quotes/quotes.service.etiquetas` | ❌ Wave 0 |
| D-03 | Gancho chamado nos 5 pontos (changeStatus, enviar, create, EFI PIX, EFI cartão) | service | idem + `efi.webhook`/`efi.card-webhook` | ❌ Wave 0 (estender) |
| D-05 | `garantirEtiquetasDaConta` cria só as faltantes; tolera erro de duplicata | unit (mock chatwoot) | idem | ❌ Wave 0 |
| D-06 | Liberada: POST `["finalizado"]` e `["finalizado","cliente-frequente"]` quando aplicável | service | `jest src/modules/integrations/chatwoot/chatwoot-automation.service` | ✅ (estender) |
| D-06 | Ramo "já enviada hoje" ainda aplica labels (R6) | service | idem | ❌ Wave 0 |
| D-07 | Bloqueada: `addConversationLabels` NÃO chamado | service | idem | ✅ (estender; hoje já passa implicitamente) |
| D-08 | Lista de status de fechamento vinda de env (inclui PRONTO_PARA_ENTREGA) | unit | idem | ✅ linhas 159-167 (estender p/ PRONTO) |
| D-09 / D-11 | `frequente = count >= min`; `where` com `customerId`, `status IN`, `createdAt gte` | unit + mock prisma | `jest .../chatwoot-etiquetas` | ❌ Wave 0 |
| D-10 | `cliente-frequente` preservado após fechamento (não removido pelo fechamento) | service | automation service | ❌ Wave 0 |
| D-12 | `sortearAtrasoHumanoMs` dentro de [min,max]; troca se min>max; triangular | unit (`rnd` injetado) | `jest .../chatwoot-etiquetas` | ❌ Wave 0 |
| D-12 | Resposta do webhook retorna antes do envio; envio ocorre após o atraso (fake timers) | service + fake timers | `jest .../chatwoot-fechamento-agendado` | ❌ Wave 0 |
| D-12 | Dois `resolved` seguidos geram uma única mensagem (dedupe) | service + fake timers | idem | ❌ Wave 0 |
| D-13 | Reaberta (`status !== resolved`) -> não envia | service | idem | ❌ Wave 0 |
| D-13 | Mensagem incoming após `resolvedAt` -> não envia | service | idem | ❌ Wave 0 |
| D-14 | Nenhum código por tenant (só env) | manual (review do diff) | — | — |
| R1 | Fila por conversa serializa duas escritas | unit (promessas controladas) | `jest .../chatwoot-etiquetas` | ❌ Wave 0 |
| R3 | Sem `conversationId` -> nenhuma chamada HTTP nem COUNT | unit | `jest .../quotes.service.etiquetas` | ❌ Wave 0 |

### Sampling Rate
- **Por tarefa:** `jest src/modules/integrations/chatwoot` (~7 s).
- **Por onda:** comando "full suite" acima; medir o tempo na primeira execução (não medido nesta pesquisa).
- **Gate da fase:** suíte completa do backend verde antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts` — regras puras (D-01, D-02, D-04, D-05 lógica, D-09 critério, D-12 sorteio, R1 fila).
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts` — timers com `jest.useFakeTimers()` (D-12, D-13, dedupe).
- [ ] `apps/backend/src/modules/quotes/quotes.service.etiquetas.test.ts` — gancho em `changeStatus`, `enviarParaCliente`, `create`; falha do Chatwoot não bloqueia (D-03); sem `conversationId` nada acontece (R3).
- [ ] Estender `efi.webhook.test.ts` e `efi.card-webhook.test.ts` — gancho chamado após a transação (não dentro).
- [ ] Estender `chatwoot-automation.service.test.ts` — D-06 (incluindo ramo "já enviada"), D-07, D-08 com PRONTO.
- [ ] Atualizar mocks de `ChatwootService` nos testes de quotes/efi que tenham cotação com `conversationId` (R17), sem mudar construtores.
- [ ] Sonda de formato de criação de label (S1 abaixo) — manual, não é teste automatizado.

### Passos de validação manual (UAT, fora do Jest)
- **S1 — sonda do formato de criação de label (A1, não executar sem autorização):** em uma conta de teste do Chatwoot, enviar `POST /api/v1/accounts/{id}/labels` com (a) `{"title":"aprovado"}` e (b) `{"label":{"title":"aprovado"}}`. Respostas esperadas: se (a) retorna 400 "param is missing ... label", o formato é aninhado; se (b) retorna 422 "has already been taken" ou cria a label, o formato é aninhado. Se o oposto, o formato é topo. Como `aprovado` é uma das etiquetas que serão criadas, qualquer resultado é seguro.
- **S2:** mudar o status de uma cotação de teste com conversa vinculada -> conferir labels (fase trocada, manuais preservadas).
- **S3:** resolver a conversa com cotação `PRONTO_PARA_ENTREGA` (após incluir na env) -> labels `finalizado` (+ `cliente-frequente`); mensagem só após 45-180 s.
- **S4:** resolver e reabrir antes do prazo -> mensagem não enviada.

## Security Domain

Obrigatório por padrão (`security_enforcement` ausente em `.planning/config.json` = habilitado).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | não (webhook autenticado por token no path) | manter `validateWebhookToken` (`chatwoot-automation.controller.ts:23-34`, `timingSafeEqual`) |
| V3 Session Management | não | — |
| V4 Access Control | sim (endpoints de config) | `@AdminOnly()` já presente (`chatwoot-automation.controller.ts:58, 66`); novas rotas, se houver, também `@AdminOnly()` |
| V5 Input Validation | sim | `conversationId` vem do webhook; `BigInt(conversationId)` já existe (`chatwoot-automation.service.ts:157`); erro cai no catch do controller (`:49-52`). Etiquetas são **constantes** (nada do payload entra em label) |
| V6 Cryptography | não | nada novo; nunca hand-roll |
| V7 Error Handling and Logging | sim | logs sem nome/telefone/token; só `quoteId`, `conversationId`, `status`, `delayMs`. Não logar `config` nem headers |
| V9 Communications | sim | `CHATWOOT_BASE_URL` (HTTPS em produção); token em header `api_access_token`, nunca em URL |
| V13 API | sim | timeout explícito nas novas chamadas axios |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Webhook forjado para fechar conversas | Spoofing | Token no path + comparação em tempo constante (existente — manter) |
| Injeção de etiqueta arbitrária | Tampering | Etiquetas só de constantes do código; nada do payload vai para labels |
| Explosão de timers (muitos fechamentos) | DoS | Um timer por conversa (dedupe), atraso máximo 180 s, teto de concorrência nas chamadas |
| Mensagem duplicada ao cliente | Repudiation / UX | Dedupe por conversa + checagem diária no momento do envio + re-check |
| Vazamento do token Chatwoot em log | Information disclosure | Não logar configuração; erros do axios com `err.message` apenas |

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|---------------|------------|--------|----------|
| Node.js | Jest / ts-jest | ✓ | v22.22.1 (verificado) | — |
| Jest (binário da raiz) | Testes | ✓ | verificado: 19 testes passam em `src/modules/integrations/chatwoot` | — |
| Instância Chatwoot (`CHATWOOT_BASE_URL`) | Sonda S1, UAT | ? não verificado (sem credenciais neste ambiente) | — | Mocks nos testes; sonda manual |
| PostgreSQL | Testes `.it` (`quotes-mensagem.clone.it.test.ts`) | ? não verificado | — | Testes unitários com mock |
| Athos de produção | — | **não usar nesta fase** (CLAUDE.md global / memory) | — | — |

**Dependências bloqueantes sem fallback:** nenhuma para a implementação. A sonda S1 precisa de acesso a uma conta Chatwoot (de teste ou produção, com autorização).

## Runtime State Inventory

Não aplicável: a fase não é rename, refactor nem migração de dados.

Observação: conversas abertas hoje não recebem as novas etiquetas até a próxima troca de status da cotação. Backfill é decisão do usuário (Open Question 7).

## Assumptions Log

| # | Claim | Seção | Risco se errado |
|---|-------|-------|-----------------|
| A1 | Formato do body de `POST /api/v1/accounts/{id}/labels`: docs dizem campos no topo; controller (fetch resumido) pede `label` aninhado | Q2, Padrões | Criação de labels falha em silêncio; etiquetas não existem na conta (sem cor/sidebar). Sonda S1 |
| A2 | Se a etiqueta não existir na conta, `POST /conversations/:id/labels` ainda a aceita (vira tag sem cadastro) | Q2 | Se não aceitar, etiqueta some. D-05 cobre com criação prévia |
| A3 | `created_at` das mensagens em `conversation-details` é inteiro em epoch segundos | Q4 (re-check) | Comparação de datas errada no D-13 (mensagem enviada indevidamente ou suprimida) |
| A4 | Erro de duplicata em `POST /labels` é 422 (ou exceção tratável) | Q2 (idempotência) | Tratamento de erro errado; log ruidoso. Mitigado por "tolerar erro" |
| A5 | Limite de taxa da instância Chatwoot é o padrão do `rack_attack.rb` (3000/min por IP em produção) | Q2, R4 | Se instância hospedada for mais restrita, rajadas do lote podem ser limitadas. Mitigado por teto de concorrência |
| A6 | Labels/notas não alteram `last_activity_at` (se não, a alternativa barata do re-check não serve) | Q4 | Só afeta a alternativa; o recomendado usa `messages` |
| A7 | `conversation_resolved` entrega `id`, `contact_inbox`/`inbox_id` e `messages` (contrato atual do código) | Q2 | Se mudar, o fechamento para de funcionar; já é o contrato atual |
| A8 | ENVIADO -> `orcamento-enviado` (mesma etiqueta de PENDENTE) | Q1, Padrão 1 | Recomendação; se o usuário preferir `entregue` (D-01), a semântica fica errada (ENVIADO não é entregue) |
| A9 | Janela de 6 meses por `createdAt` representa "pagos/entregues nos últimos 6 meses" | Q3 | Pode contar pedidos criados há 6 meses e entregues depois; alternativa é `statusHistory` |
| A10 | Lista de status "pagos/entregues" = APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE | Q3 | Ver R15; decisão do usuário |
| A11 | Deploy de instância única (sem `replicas`; comentário de `cobranca-reconciliation.job.ts:14-21`) | Q4, R9 | Timers duplicados se escalar |
| A12 | Nomes das novas envs e defaults (ver abaixo) | Config | Só nomenclatura; alinhar com o usuário |

Nomes propostos de env (padrão do projeto: `${VAR:-default}` como em `ATHOS_BAIXA_AUTO: ${ATHOS_BAIXA_AUTO:-true}`, `docker-compose.box.vps.yml`): `CHATWOOT_ETIQUETAS_ATIVAS` (default `true`; só o texto `false` desliga, padrão da Fase 43), `CHATWOOT_CLIENTE_FREQUENTE_MIN` (default `3`), `CHATWOOT_CLIENTE_FREQUENTE_MESES` (default `6`), `CHATWOOT_FECHAMENTO_ATRASO_MIN_S` (default `45`), `CHATWOOT_FECHAMENTO_ATRASO_MAX_S` (default `180`).

Locais de inclusão: `deploy/docker-compose.box.vps.yml` (bloco `environment` do `backend`, após `CHATWOOT_INBOX_ID: ${CHATWOOT_INBOX_ID}`, linha 55), `deploy/docker-compose.vps.yml` (após linha 63), `deploy/stack.env.example` (após `CHATWOOT_INBOX_ID=`, linha 25, com comentário no padrão do bloco da Fase 45, linhas 64-69).

## Open Questions

Responder em texto (sem AskUserQuestion). Recomendação entre parênteses.

1. **ENVIADO:** etiqueta `orcamento-enviado` (mesma de PENDENTE) ou nenhuma? (Recomendo `orcamento-enviado`. A sugestão `entregue` do D-01 não é semanticamente correta.)
2. **Status "pago/entregue" (D-09):** confirmar `APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE`, excluindo `ENVIADO` e `PAGAMENTO_PARCIAL`? Aceitar que `APROVADO` por aprovação de link (sem pagamento) conte? (Recomendo sim para a lista, e aceitar o risco de APROVADO.)
3. **Janela de 6 meses:** `createdAt` (recomendado) ou data de entrada no status (`statusHistory`)?
4. **Chave do cliente:** `customerId` (recomendado) ou `customerId` OR `chatwootContactId`?
5. **Conversa com várias cotações:** a fase vem da cotação mais recentemente atualizada da conversa (recomendado, mesma regra do fechamento)? E corrigir `approveByConversation` para usar a mesma regra?
6. **Momento das labels no fechamento:** imediatamente no webhook (recomendado, sobrevive a restart) ou junto com a mensagem após o atraso? Se a conversa for reaberta durante a espera, remover `finalizado`? (Recomendo: imediato + remover `finalizado` se reaberta.)
7. **Backfill:** aplicar etiquetas nas cotações abertas hoje, ou só nas próximas trocas de status? (Recomendo só nas próximas; backfill exige script à parte.)
8. **Distribuição do atraso:** triangular entre 45 e 180 s (recomendado) ou uniforme?
9. **Criação das etiquetas da conta (D-05):** autoriza a sonda S1 numa conta Chatwoot real, ou prefere criar as 8 etiquetas manualmente na interface do Chatwoot e o código só consulta?
10. **Envs ausentes nos composes:** `CHATWOOT_AUTOMATION_WEBHOOK_TOKEN`, `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO`, `CHATWOOT_AUTOMATION_INBOX_IDS`, `CHATWOOT_AI_URL`, `CHATWOOT_AI_TOKEN`, `CHATWOOT_AI_MODEL` estão definidas no servidor por outro meio? Se não, o webhook de fechamento não funciona nos composes atuais e precisa entrar neste plano.
11. **Instância única:** confirmar que não há planos de escalar o backend horizontalmente (os timers e a fila em memória dependem disso).

## Sources

### Primary (HIGH confidence — código lido nesta sessão)
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` (linhas 26, 41, 94-102, 149-196, 198-208)
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.controller.ts` (linhas 23-34, 45-54)
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` (linhas 60-107)
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.test.ts` (linhas 12-193)
- `apps/backend/src/modules/quotes/quotes.service.ts` (linhas 17-26, 56-64, 233-300, 341-400, 444-565, 567-890, 934-1055, 1062-1076, 1192-1260, 1371-1490, 1804-1834, 2067-2084, 2151-2159)
- `apps/backend/src/modules/quotes/quotes.controller.ts` (linhas 63, 81-89, 104, 115)
- `apps/backend/src/modules/integrations/efi/efi.service.ts` (linhas 18-24, 64-72, 615-667, 813-857)
- `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` (linhas 140-170)
- `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts` (linhas 17-31)
- `apps/backend/prisma/schema.prisma` (linhas 21-30 enum; 43-57 Customer; 71-136 Quote; 441-447 ChatwootAutomationConfig; 460-468 ChatwootMensagemEnviada)
- `apps/backend/jest.config.js`, `apps/backend/package.json`
- `apps/backend/src/modules/app.module.ts` (linha 79)
- `deploy/docker-compose.box.vps.yml` (linhas 35-70), `deploy/docker-compose.vps.yml` (linhas 45-100), `deploy/stack.env.example` (linhas 15-75)
- `.planning/phases/51-.../51-CONTEXT.md`, `.planning/phases/49-.../49-CONTEXT.md`, `49-02-SUMMARY.md`
- `node_modules/@nestjs/schedule/dist/scheduler.registry.d.ts` (v6.1.3)

### Secondary (MEDIUM confidence — documentação oficial e fetch de código-fonte)
- [CITED: https://developers.chatwoot.com/api-reference/conversations/add-labels] — POST substitui a lista
- [CITED: https://developers.chatwoot.com/api-reference/conversations/list-labels] — GET retorna `payload`
- [CITED: https://developers.chatwoot.com/api-reference/conversations/conversation-details] — campos `status`, `labels`, `last_activity_at`, `messages`
- [CITED: https://developers.chatwoot.com/api-reference/labels/create-a-label] — corpo com campos no topo (conflito, A1)
- [CITED: https://developers.chatwoot.com/api-reference/labels/list-all-labels] — GET labels da conta
- [CITED: https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/models/label.rb] — downcase, format, uniqueness scope account_id (fetch resumido)
- [CITED: https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/controllers/api/v1/accounts/labels_controller.rb] — `params.require(:label)` e `create!` (fetch resumido)
- [CITED: https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/controllers/concerns/label_concern.rb] — `create` chama `model.update_labels` (fetch resumido; corpo de `update_labels` não lido)
- [CITED: https://raw.githubusercontent.com/chatwoot/chatwoot/develop/config/initializers/rack_attack.rb] — `req/ip` 3000/min (fetch resumido)
- [CITED: https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/models/message.rb] — `message_type` (fetch resumido)

### Tertiary (LOW confidence)
- Busca web sobre o payload de `conversation_resolved` não confirmou os campos (WebSearch sem fonte oficial do payload). Mantido o contrato atual do código (A7).

## Metadata

**Confidence breakdown:**
- Pontos de mudança de status: HIGH — lidos linha a linha, com `grep` cruzado.
- Chave do cliente e índices: HIGH — schema lido; ausência de índice em `customerId`/`createdAt` verificada no schema completo.
- API Chatwoot (listar/substituir labels, detalhe da conversa): MEDIUM — documentação oficial, sem sonda.
- Criação de label da conta: LOW — docs e controller divergem (A1).
- Agendamento e re-check: MEDIUM — padrão de timer é do desenho; `SchedulerRegistry` verificado nos typings; formato de `created_at` não verificado (A3).
- Testes: HIGH para o comando e a configuração (executado); MEDIUM para o tempo e o estado das suítes de quotes/efi (não reexecutadas).

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 para o código do repositório (até mudanças em `quotes.service.ts` ou no Chatwoot). A API do Chatwoot deve ser reconfirmada antes da implementação (sonda S1).
