---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 04
subsystem: pesquisa-satisfacao
tags: [chatwoot, csat, re-check, etiquetas, axios]
status: complete
requires:
  - fase 51 (fechamento agendado da conversa do Chatwoot, re-check herdado)
  - plano 52-01 (tracer: createPrivateCsatMessage, submitCsatResponse, getInbox)
provides:
  - ChatwootService.listMessagesAfter (com opcoes.incluirInternas) e updateContactCustomAttributes
  - ETIQUETA_AVALIOU, ETIQUETA_CSAT_BAIXO, ETIQUETAS_PESQUISA e mesclarEtiquetasFechamento
  - re-check do fechamento por GET .../messages com guarda de truncamento
  - fechamento que preserva avaliou e csat-baixo (D-34)
affects:
  - plano 52-05 (atributos do contato e busca de input_csat existente via incluirInternas)
  - plano 52-12 (revogacao e leitura da inbox)
tech-stack:
  added: []
  patterns:
    - re-check decide pelo historico recente (GET .../messages), nao pelo campo messages do GET da conversa
    - POST de labels do fechamento preserva as etiquetas de pesquisa (leitura previa + mescla)
key-files:
  created:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts
  modified:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.test.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts
key-decisions:
  - "Re-check por listMessagesAfter(conversationId, ultimaMensagemId) com a guarda de truncamento (lista >= 100 vira indeterminado) dentro de avaliarRespostaDoCliente."
  - "ultimaMensagemId extraida do webhook (payload.messages[0].id) somente quando numero finito; o campo messages do GET da conversa deixa de decidir."
  - "getConversationLabels e lido dentro da tarefa enfileirada do fechamento; falha de leitura grava so as desejadas e registra warn (nunca impede o finalizado)."
requirements-completed: []

coverage:
  - id: D1
    description: "listMessagesAfter (com opcoes.incluirInternas) e updateContactCustomAttributes no ChatwootService, com suite de payloads de createPrivateCsatMessage, submitCsatResponse, getInbox, listMessagesAfter e updateContactCustomAttributes"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-check do fechamento por GET .../messages (after exclusivo, guarda de truncamento) e fechamento que preserva avaliou e csat-baixo"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts"
        status: pass
      - kind: unit
        ref: "apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts"
        status: pass
    human_judgment: false

metrics:
  duration: "~35min"
  completed: 2026-11-22
commits: 2
plan_head_before: 37bdc65e6e00120e5d8c51f8542270f353ce34ba
plan_head_after: 21d5f87e0f829a04c2021f4cd822f9f8b3b1e41c
actuals:
  tokens: 6110
  tasks: 2
  commits: 2
---

# Phase 52 Plan 04: Cliente do Chatwoot, re-check por GET messages e fechamento que preserva as etiquetas de pesquisa Summary

Cliente do Chatwoot completo com `listMessagesAfter` (com a opcao `incluirInternas`) e `updateContactCustomAttributes`, re-check do fechamento que decide pelo historico recente (`GET .../messages?after=<id>` com guarda de truncamento) e fechamento que preserva `avaliou` e `csat-baixo` ao substituir a lista de etiquetas.

## Performance

- **Duration:** ~35min
- **Tasks:** 2
- **Files modified:** 7 (1 criado, 6 modificados)
- **Verificacao:** `jest src/modules/integrations/chatwoot src/modules/pesquisa` = 7 suites / 171 testes verdes; `tsc --noEmit -p apps/backend/tsconfig.json` sem erros.

## Accomplishments

- `listMessagesAfter` no `ChatwootService` le `GET .../conversations/:id/messages` com `after` so quando numero finito (EXCLUSIVO, contrato verificado no MessageFinder 4.12.1/4.19.1) e omite a chave `filter_internal_messages` quando `opcoes.incluirInternas` (nunca enviada como false); devolve o `payload` quando array, senao null.
- `updateContactCustomAttributes` faz PUT em `/contacts/:id` com `{ custom_attributes }` (o Chatwoot MESCLA, sem leitura previa), `{ enabled: false }` sem envs.
- Suíte nova `chatwoot-csat.service.test.ts` (23 testes) afirma URL, corpo, headers, params e timeout de `createPrivateCsatMessage`, `submitCsatResponse`, `getInbox`, `listMessagesAfter` e `updateContactCustomAttributes`.
- Re-check troca `avaliarRespostaDoCliente(conversa.messages, ...)` por `listMessagesAfter(conversationId, ultimaMensagemId)`; uma atividade posterior nao esconde mais a resposta do cliente (P5). Erro vira `falha_recheck`; null vira `mensagens_indeterminadas` (guarda que fecha).
- `avaliarRespostaDoCliente` ganha a guarda de truncamento: lista com 100+ itens (limite do `after`) vira `indeterminado`, sem enviar.
- `mesclarEtiquetasFechamento` e `ETIQUETAS_PESQUISA` (`avaliou`, `csat-baixo`) mantem as etiquetas de pesquisa fora do conjunto gerenciado; o fechamento le as atuais e as preserva (D-14/D-34).

## Task Commits

Cada task foi commitada atomicamente (TDD: testes primeiro, vermelho, depois codigo):

1. **Task 1: Cliente do Chatwoot (listMessagesAfter, updateContactCustomAttributes + suite)** - `01f514a` (feat)
2. **Task 2: Re-check por GET messages e fechamento que preserva avaliou/csat-baixo** - `21d5f87` (feat)

**Plan metadata:** este arquivo (commitado separadamente).

## Files Created/Modified

- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` - `listMessagesAfter` (com `opcoes.incluirInternas`) e `updateContactCustomAttributes`
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts` - suite de payloads de CSAT, inbox, listagem de mensagens e atributos do contato
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts` - `ETIQUETA_AVALIOU`, `ETIQUETA_CSAT_BAIXO`, `ETIQUETAS_PESQUISA`, `mesclarEtiquetasFechamento` e guarda de truncamento em `avaliarRespostaDoCliente`
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` - re-check por `listMessagesAfter`, `ultimaMensagemId` no contexto e fechamento que preserva as etiquetas de pesquisa
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts` - testes das constantes e da mescla de pesquisa
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts` - `buildService`/`resolverEDisparar` alimentam `listMessagesAfter`; testes P5, D-40 (afterId, truncamento, falha de leitura) e D-34
- `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.test.ts` - `buildService` ganha `listMessagesAfter` e `getConversationLabels`

## Decisions Made

- A guarda de truncamento mora em `avaliarRespostaDoCliente` (funcao pura), nao no chamador, para que todo consumidor do re-check herde a mesma "guarda que fecha".
- `ultimaMensagemId` e extraida do webhook apenas quando `Number.isFinite`; id ausente ou nao numerico chega como `undefined` ao `listMessagesAfter` (que entao omite o `after` e le as 20 mais recentes).
- A leitura das etiquetas no fechamento e best-effort: falha vira `atuais = []` + warn, e o `finalizado` continua sendo gravado (nunca bloqueia).

## Deviations from Plan

Nenhum desvio de escopo. Observacao sem desvio:

- `chatwoot-automation.service.test.ts` recebeu tambem `getConversationLabels: jest.fn().mockResolvedValue([])` no `buildService` (alem do `listMessagesAfter` previsto no plano), porque o fechamento passou a ler as etiquetas atuais; sem isso o mock chamaria `undefined(...)` e a suite logaria um warn espurio. As assercoes originais ficaram intactas.

## Issues Encountered

- O diretorio do worktree nao tem `node_modules` proprio; os comandos `jest`/`tsc` foram executados com o `node_modules` do checkout principal (`/root/SistemaOrcamento/node_modules/.bin`), que e ancestro do worktree e resolve os modulos normalmente (mesma abordagem do plano 52-01).

## Known Stubs

Nenhum. Os metodos entregues estao completos e testados; nao ha placeholder, valor vazio hardcoded nem TODO/FIXME.

## Threat Flags

Nenhum alem do `threat_model` do plano. `listMessagesAfter` e `updateContactCustomAttributes` ficam dentro do limite ja previsto "Backend -> Chatwoot (HTTP)" (token de agente, sem token de administrador; logs sem token nem objeto de erro do axios).

## Next Phase Readiness

- Prontos para o plano 52-05: `listMessagesAfter` com `incluirInternas` (achar input_csat privada existente) e `updateContactCustomAttributes` (atributos do contato); `mesclarEtiquetasFechamento`/`ETIQUETAS_PESQUISA` para as etiquetas pela fila.
- A suite da fase 51 permanece verde (nenhum teste antigo removido nem com assercao alterada).

## Self-Check: PASSED

- Arquivos criados/modificados existem no disco e nos commits `01f514a` e `21d5f87` (ancestrais de HEAD).
- `git rev-list --count 37bdc65..HEAD` = 2 (uma por task).

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*
