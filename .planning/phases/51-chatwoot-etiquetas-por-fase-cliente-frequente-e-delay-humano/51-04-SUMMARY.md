---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
plan: 04
subsystem: integrations/chatwoot
tags: [chatwoot, fechamento, etiquetas, finalizado, atraso-humano, setTimeout, recheck]
requires: ["51-01", "51-02"]
provides:
  - "chatwoot-etiquetas.ts: lerAtrasoFechamentoS, sortearAtrasoHumanoMs (triangular), agendarEnvioFechamento (1 timer por conversa), cancelarEnvioFechamento, cancelarTodosEnviosFechamento, enviosFechamentoPendentes, avaliarRespostaDoCliente"
  - "ChatwootService.getConversation (GET da conversa para o re-check)"
  - "ChatwootAutomationService.handleConversationResolved em duas fases (etiquetas enfileiradas + mensagem agendada) e enviarMensagemFechamento com re-check que fecha; onModuleDestroy"
affects:
  - "51-05: envs CHATWOOT_FECHAMENTO_ATRASO_MIN_S / MAX_S precisam chegar aos composes; comportamentos conhecidos vao para runbook e roteiro"
tech-stack:
  added: []
  patterns:
    - "etiquetas por tarefa enfileirada sem await (best-effort), mensagem por setTimeout em processo com unref"
    - "guarda que FECHA: so 'sem_resposta' com conversa ainda resolvida libera o envio"
key-files:
  created:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts
  modified:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.labels.test.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.test.ts
key-decisions:
  - "motivos logados: reaberta e resposta_nova em log; falha_recheck e mensagens_indeterminadas em warn; so conversationId, motivo e err.message"
  - "o retorno de handleConversationResolved virou uniao discriminada tipada (como no plano); os testes leem o campo action por um helper acao()"
requirements-completed: [CW-06, CW-07, CW-08, CW-09, CW-10]
status: complete
duration: ~25 min
completed: 2026-11-21
actuals:
  tokens: 12500
  tasks: 2
  commits: 2
plan_head_before: dd0144855a9c13e3c560ba1602a7ee47f165c31a
plan_head_after: 65a2b8d8ba79642c1b70d78521112c2fd709ff49
---

# Phase 51 Plan 04: Fechamento com etiquetas imediatas, mensagem agendada e re-check Summary

Resolver uma conversa liberada passa a enfileirar na hora `finalizado` (+ `cliente-frequente`) sem segurar o webhook, agenda a despedida com atraso triangular (45 a 180 s por padrao) e, no disparo, so envia se a conversa continua resolvida, sem resposta nova do cliente e com a avaliacao conclusiva.

## O que foi feito

**Task 1 (tracer, commit 3ff72a6):**
- `chatwoot-etiquetas.ts`: constantes e helpers de atraso (`lerAtrasoFechamentoS`, `sortearAtrasoHumanoMs`) e de agendamento (Map de timers por conversa, `unref`, tarefa nunca vira rejeicao nao tratada).
- `handleConversationResolved`: le a cotacao com `customerId`; ramo bloqueado inalterado (sem etiquetas, D-07); ramo liberado enfileira a tarefa de etiquetas (frequencia calculada dentro dela), checa o limite diario e agenda `enviarMensagemFechamento` (retorno `mensagem_agendada` com `atrasoMs`). O bug de ordem foi corrigido: o ramo "ja enviada hoje" agora tambem escreve as etiquetas.
- `enviarMensagemFechamento` (privado, nunca rejeita): reavalia o limite diario, calcula a saudacao no envio, IA com fallback, envio e registro. `onModuleDestroy` cancela os timers. Construtor intacto (3 argumentos).
- Testes A1 a A11 e puros em `chatwoot-fechamento-agendado.test.ts`; 3 testes antigos de `chatwoot-automation.service.test.ts` passaram a esperar `mensagem_agendada` e avancar timers falsos.

**Task 2 (commit 65a2b8d):**
- `ChatwootService.getConversation` (GET, `api_access_token`, timeout 10000, null sem envs, erro propaga).
- `avaliarRespostaDoCliente` (`resposta_nova` | `sem_resposta` | `indeterminado`): considera so mensagens de entrada nao privadas; `created_at` em segundos, ms, string numerica ou ISO; `resposta_nova` precede `indeterminado`.
- `enviarMensagemFechamento` comeca relendo a conversa: erro, null ou formato estranho = nao envia (`falha_recheck`); status diferente de `resolved` = nao envia e restaura fase + `cliente-frequente` (recalculado) sem `finalizado`; `resposta_nova` / `indeterminado` = nao envia e nao mexe nas etiquetas.
- R1 a R8 (com `it.each`), puros de `avaliarRespostaDoCliente` e 3 testes de `getConversation`.

## Verificacao

- `jest src/modules/integrations/chatwoot`: 4 suites, 98 testes passando (plano exigia 75 ou mais).
- `jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot`: 20 suites passando, 1 pulada; 307 passed, 18 skipped.
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceite: `mensagem_agendada` 2x e `sortearAtrasoHumanoMs` 2x no service; `agendarEnvioFechamento` no etiquetas.ts; `async getConversation(` 1x; `avaliarRespostaDoCliente` 2x no service; `it(` literais: 16 (fechamento agendado, antes do Task 2) e 26 no arquivo final; 9 em labels.test.ts.

## Deviations from Plan

Nenhuma de regra 1 a 4. Observacoes:
- O teste de substituicao de timer (`agendarEnvioFechamento` com tarefa que falha) foi um caso extra alem de A1 a A11.
- Nos testes, o retorno tipado como uniao discriminada exigiu um helper `acao()`; o `tsc` do plano cobre arquivos de teste.
- Os testes foram escritos antes do codigo (A1 vermelho por erro de compilacao), mas o ciclo vermelho/verde nao foi commitado em separado: um commit por tarefa.
- **Observacao para a revisao (nao corrigida):** o kill-switch `CHATWOOT_ETIQUETAS_ATIVAS` do 51-01 vale so para a sincronizacao por status (`QuotesService`). O plano 51-04 nao o aplica ao fechamento: `finalizado` (+ `cliente-frequente`) continua sendo gravado no webhook de fechamento mesmo com a flag em `false`, como era antes da fase para `finalizado`. O runbook e o roteiro (51-05) descrevem isso com precisao.
- Commits com `Co-Authored-By: Claude Sonnet 5.5` (atribuicao exigida pelo ambiente), nao Opus 5.5 como pedido no briefing.
- STATE.md, ROADMAP.md, REQUIREMENTS.md e config.json NAO foram atualizados, por instrucao do orquestrador.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes aplicadas: T-51-13 (1 timer por conversa, teto 900 s, `unref`, cancelamento no `onModuleDestroy`), T-51-14 (re-check que fecha), T-51-15 (logs so com conversationId, motivo e err.message), T-51-16 (reabertura restaura fase).

## Self-Check: PASSED

- Arquivos: chatwoot-fechamento-agendado.test.ts e demais encontrados.
- Commits 3ff72a6 e 65a2b8d presentes na branch `feat/fase-51-chatwoot-etiquetas`.
