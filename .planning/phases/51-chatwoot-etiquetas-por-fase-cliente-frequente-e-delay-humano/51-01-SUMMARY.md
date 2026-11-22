---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
plan: 01
subsystem: integrations/chatwoot + quotes
tags: [chatwoot, etiquetas, labels, changeStatus, fire-and-forget, kill-switch]
requires: []
provides:
  - "chatwoot-etiquetas.ts: mapa status -> etiqueta (D-15), conjunto gerenciado, mesclarEtiquetas, etiquetasIguais, etiquetasAtivas, aplicarEtiquetasGerenciadas"
  - "ChatwootService.getConversationLabels e timeout de 10 s nas chamadas de labels"
  - "QuotesService.sincronizarEtiquetasChatwoot (publico, nunca lanca) e gancho em changeStatus"
affects:
  - "51-02 (enviarParaCliente e create), 51-03 (webhooks EFI) reutilizam sincronizarEtiquetasChatwoot"
  - "51-04 (fechamento) reutiliza aplicarEtiquetasGerenciadas e ETIQUETA_FINALIZADO"
tech-stack:
  added: []
  patterns:
    - "GET labels -> mescla preservando manuais -> POST so se mudou (POST do Chatwoot substitui a lista)"
    - "gancho pos-commit sem await, com try/catch total e log so com quoteId + err.message"
key-files:
  created:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.labels.test.ts
    - apps/backend/src/modules/quotes/quotes.service.etiquetas.test.ts
  modified:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
key-decisions:
  - "finalizado fica fora do conjunto gerenciado pela sincronizacao de status; so o fechamento (51-04) escreve nele"
  - "kill-switch CHATWOOT_ETIQUETAS_ATIVAS: so o texto false (trim, qualquer caixa) desliga"
  - "construtores de QuotesService, EfiService e ChatwootAutomationService nao mudaram"
requirements-completed: [CW-01, CW-02, CW-03, CW-04, CW-12]
status: complete
duration: ~25 min
completed: 2026-11-21
actuals:
  tokens: 7300
  tasks: 2
  commits: 2
plan_head_before: 3133ae6127a3e58897d2833e03b9ee644f86e3b7
plan_head_after: f2946e18bb10bd4772bcf96ef0a49c50558145cc
---

# Phase 51 Plan 01: Tracer de etiquetas por fase no Chatwoot Summary

Troca de status via `changeStatus` com conversa vinculada passa a trocar a etiqueta da fase no Chatwoot (GET -> mescla -> POST so se mudou), preservando etiquetas manuais, sem await e sem nunca falhar a troca de status.

## O que foi feito

**Task 1 (tracer, commit 3c2f897):**
- `chatwoot-etiquetas.ts` com o mapa dos 8 status (D-15), `ETIQUETAS_GERENCIADAS` (8 fases + cliente-frequente, sem finalizado), `mesclarEtiquetas`, `etiquetasIguais`, `etiquetasAtivas`, `aplicarEtiquetasGerenciadas`.
- `ChatwootService.getConversationLabels` (GET, payload filtrado para strings, [] sem configuracao, erro propaga) e `timeout: 10000` em `addConversationLabels`.
- `QuotesService.sincronizarEtiquetasChatwoot` (nunca lanca; log so com quoteId e `err.message`) e `dispararEtiquetasChatwoot` (sem await) chamado em `changeStatus` logo apos o `prisma.quote.update`, antes das notificacoes.
- `quotes.service.etiquetas.test.ts` com E1 a E5 (ChatwootService real, axios falso, Athos falso explicito: zero chamadas ao Athos).

**Task 2 (commit f2946e1):**
- Kill-switch ligado no inicio de `sincronizarEtiquetasChatwoot` (sem leitura de banco nem HTTP quando desligado).
- `chatwoot-etiquetas.test.ts` (20 testes), `chatwoot.service.labels.test.ts` (6) e E6/E7 em `quotes.service.etiquetas.test.ts` (7 no total). E7 prova que o token nao aparece no log mesmo com `err.config.headers` carregando o token.

## Verificacao

- `jest src/modules/integrations/chatwoot src/modules/quotes/quotes.service.etiquetas`: 4 suites, 52 testes passando.
- `jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot`: 19 suites passando + 1 pulada; 233 passed, 18 skipped (baseline 200 passed, 18 skipped).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceite: 8 etiquetas distintas no arquivo, `getConversationLabels` presente, `sincronizarEtiquetasChatwoot` 2+ vezes, `etiquetasAtivas` 2 vezes em quotes.service.ts, contagem de `it(` 20 / 6 / 7.

## Deviations from Plan

Nenhuma de regra 1 a 4. Observacoes:
- O teste E1 passou na primeira execucao: a implementacao foi escrita antes do teste (ordem Task 1 passos 1-3 antes do passo 4), entao nao houve ciclo vermelho observado separadamente.
- Estado do projeto (STATE.md, ROADMAP.md, REQUIREMENTS.md, config.json) NAO foi atualizado por este executor, por instrucao do orquestrador, que cuida disso.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova: so chamadas de saida ao Chatwoot e um metodo interno. Mitigacoes T-51-01 a T-51-04 cobertas pelos testes E1, E2, E4, E5, E7 e pelos de mesclar.

## Self-Check: PASSED

- FOUND: chatwoot-etiquetas.ts, chatwoot-etiquetas.test.ts, chatwoot.service.labels.test.ts, quotes.service.etiquetas.test.ts
- FOUND commits: 3c2f897, f2946e1
