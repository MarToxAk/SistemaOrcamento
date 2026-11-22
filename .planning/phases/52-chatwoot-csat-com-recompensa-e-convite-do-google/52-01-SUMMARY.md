---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 01
subsystem: pesquisa-satisfacao
tags: [chatwoot, csat, prisma, nestjs, rota-publica, rate-limit]
status: complete
requires:
  - fase 51 (fechamento agendado da conversa do Chatwoot)
provides:
  - modelos PesquisaConfig, PesquisaSatisfacao, CupomRecompensa, PesquisaSupressao e enum CupomStatus
  - ChatwootService.createPrivateCsatMessage, submitCsatResponse, getInbox
  - gancho GanchoPesquisaFechamento (registrarGanchoPesquisa) no fechamento
  - PesquisaService e rota publica GET/POST /api/pesquisa/publica/:token
affects:
  - planos 52-02 a 52-12 (frontend, cupom, re-check, envios, anonimizacao, admin, revogacao)
tech-stack:
  added: []
  patterns:
    - gancho registrado em onModuleInit para evitar dependencia circular de modulo
    - limitadores de janela em memoria no lugar do throttler global por IP
key-files:
  created:
    - apps/backend/prisma/migrations/20261122120000_add_pesquisa_recompensa/migration.sql
    - apps/backend/src/modules/pesquisa/pesquisa-regras.ts
    - apps/backend/src/modules/pesquisa/pesquisa.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-public.controller.ts
    - apps/backend/src/modules/pesquisa/pesquisa.module.ts
    - apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/app.module.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts
decisions:
  - "Gancho no fechamento por registrarGanchoPesquisa (construtor do ChatwootAutomationService intacto, 3 argumentos)."
  - "Ordem fixa no envio do fechamento: envio, registro (try/catch proprio), gancho."
  - "Guarda do CSAT nativo: getInbox antes de criar a pesquisa; ligado ou falha na leitura nunca bloqueia."
  - "Rota publica: @Public + @SkipThrottle e tres LimitadorJanela (IP real, teto da rota, token); x-client-ip so vale com x-internal-api-key valida."
metrics:
  duration: "~45min"
  completed: 2026-11-22
commits: 1
plan_head_before: 7f5201e63d58b7251e3a23d53ff4201952c4363c
plan_head_after: 3aae99ea8e21ed80de5ae87c268009b99d84a083
actuals:
  tokens: 21000
  tasks: 2
  commits: 1
---

# Phase 52 Plan 01: Tracer da pesquisa de satisfacao Summary

Tracer de producao que atravessa todo o backend: o fechamento da conversa (fase 51) ganha um bloco com UM link `/pesquisa/<48 hex>`, a rota publica serve e grava uma unica resposta por link e a nota segue em segundo plano ao CSAT nativo do Chatwoot pelo PUT publico, sem nunca bloquear o cliente.

## O que foi entregue

- **Schema e migracao (D-03):** quatro modelos e o enum `CupomStatus`, com `telefone` e `conversationId` nulaveis (anonimizacao do plano 52-06), `revogadaEm` (plano 52-12) e as colunas de reserva de envio (plano 52-05). Migracao aditiva e idempotente (`IF NOT EXISTS`, blocos `DO $$` para enum e chave estrangeira).
- **Regras puras (`pesquisa-regras.ts`):** `gerarToken` (randomBytes 24), `normalizarTelefone` (D-32), `sortearVariante`, `renderizarTexto`, formatadores pt-BR, `LimitadorJanela`, `LIMITES_PESQUISA_PUBLICA`, `chaveInternaValida` (tempo constante) e `resolverIpCliente`.
- **ChatwootService:** `createPrivateCsatMessage` (sempre `private: true` e `content_type: input_csat`), `submitCsatResponse` (PUT publico, sem `api_access_token`, corpo exato do contrato), `getInbox`; `getConversation` com `uuid`, `inbox_id` e `meta.sender`.
- **Fechamento:** `registrarGanchoPesquisa`; o bloco sai junto da mensagem da IA; `enviarMensagemFechamento` envia, grava `ChatwootMensagemEnviada` (try/catch proprio) e so entao chama o gancho.
- **PesquisaService:** `prepararFechamento` (kill-switch, telefone, supressao, guarda do CSAT nativo, reaproveitamento da pesquisa aberta, D-28), `aoFechamentoEnviado` (cria a input_csat so depois do envio), `obterPublica` e `responder` (resposta unica por `updateMany` condicional, INDISPONIVEL generico) e efeitos em segundo plano com `aguardarEfeitos`.
- **Rota publica:** `PesquisaPublicController` com `@Public`, `@SkipThrottle` e limites por IP real (60/min), balde compartilhado do socket (20/min), teto da rota (300/min) e por token (30/h), nessa ordem e antes de qualquer acesso ao banco.
- **Tracer jest:** 18 testes (T1 a T15d) em `pesquisa.tracer.test.ts`.

## Verificacao

- `jest src/modules/pesquisa src/modules/integrations/chatwoot`: 6 suites, 134 testes verdes (as suites da fase 51 intactas, nenhum teste antigo alterado).
- `tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.
- Task 2 (migracao em Postgres descartavel `postgres:16-alpine` em 127.0.0.1:5462): estado anterior via `db push` do schema do commit-base 1336941, migracao aplicada DUAS vezes (exit 0 ambas) e `prisma migrate diff --exit-code` saiu 0 com "No difference detected." Contêiner `pg52` removido; nenhum banco real tocado. A task nao gerou arquivo novo (so verificacao), portanto nao tem commit proprio; o `migration.sql` provado esta no commit da Task 1.

## Deviations from Plan

None - plano executado como escrito. Observacoes sem desvio de escopo:

- A primeira criacao da pesquisa chama `getInbox` somente quando vai criar uma pesquisa nova (nao no reaproveitamento), o que evita leitura desnecessaria; o comportamento exigido (T14) continua coberto.
- `jest`/`tsc`/`prisma` foram executados com o `node_modules` do checkout principal (ancestral do worktree); `prisma generate` atualizou o client gerado la (aditivo, so os modelos novos).
- `prisma format` NAO foi aplicado ao schema inteiro (reformataria modelos antigos); os modelos novos seguem o alinhamento do formatador.

## Known Stubs

Nenhum stub que impeca o objetivo. `RespostaPublica.cupom` e sempre `null` por desenho neste plano (o cupom e do plano 52-03); `chatwootCsat` em `AGUARDANDO_MENSAGEM`/`MENSAGEM_FALHA` mantem o estado ate a re-tentativa do plano 52-05.

## Threat Flags

Nenhum alem do threat_model do plano (nova rota publica `/api/pesquisa/publica/*` ja prevista em T-52-01, T-52-04, T-52-63 e T-52-64).

## Self-Check: PASSED

- Arquivos criados e modificados existem no disco e no commit 3aae99e.
- Commit da Task 1: 3aae99e (ancestral de HEAD).
