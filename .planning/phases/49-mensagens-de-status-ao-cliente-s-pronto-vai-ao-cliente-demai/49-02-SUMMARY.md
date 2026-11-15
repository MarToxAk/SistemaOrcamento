---
phase: 49-mensagens-de-status-ao-cliente-s-pronto-vai-ao-cliente-demai
plan: 02
subsystem: quotes
tags: [status, lote, silencioso, nestjs, class-validator]
requires: [49-01]
provides:
  - "PATCH /quotes/status/lote (ids, newStatus, changedBy) sempre silencioso, com resultado por orcamento"
  - "QuotesService.changeStatusLote sequencial; tipos ResultadoStatusLote e ResultadoStatusLoteItem"
  - "UpdateStatusLoteDto e LIMITE_STATUS_LOTE = 50"
affects: []
tech-stack:
  added: []
  patterns: ["lote sequencial com try/catch por item reaproveitando changeStatus"]
key-files:
  created:
    - apps/backend/src/modules/quotes/dto/update-status-lote.dto.ts
    - apps/backend/src/modules/quotes/quotes.service.status-lote.test.ts
  modified:
    - apps/backend/src/modules/quotes/quotes.controller.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/quotes/quotes.controller.status.http.test.ts
decisions:
  - "D-03: o lote chama changeStatus com { notificarCliente: false } por item; o DTO nao tem campo de aviso (notificarCliente no corpo da 400)"
  - "Erro nao HTTP vira codigo 500 com mensagem generica; o detalhe real vai so para logger.error"
requirements-completed: [STA-03, STA-04, STA-05]
status: complete
commits: 2
plan_head_before: 8eee74068a8889346479694a323c6210d1d029eb
plan_head_after: 0edc1d5
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
---

# Phase 49 Plan 02: Troca de status em lote silenciosa Summary

`PATCH /quotes/status/lote` muda o status de ate 50 orcamentos por vez sem nenhuma mensagem publica ao cliente (so a nota privada de registro) e devolve ok ou erro de cada um, sem parar no primeiro erro.

## Tarefas

| Task | Nome | Commit | Arquivos |
| ---- | ---- | ------ | -------- |
| 1 (tracer) | Lote valido ponta a ponta (HTTP -> DTO -> controller -> changeStatusLote -> changeStatus silencioso) | 46fbda1 | update-status-lote.dto.ts, quotes.controller.ts, quotes.service.ts, quotes.controller.status.http.test.ts, quotes.service.status-lote.test.ts |
| 2 | Lote misto e limites (erro por item, status validado antes, limites no servico e no DTO) | 0edc1d5 | quotes.service.ts, quotes.controller.status.http.test.ts, quotes.service.status-lote.test.ts |

## Verificacao

- `modules/quotes` + `integrations/efi`: 15 suites passam, 1 pulada, 181 testes passam.
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Rota `status/lote` declarada antes de `:id/status` (linhas 81 e 86 do controller); teste HTTP prova que cada rota cai no seu handler. `Patch(` no controller: 2.
- `Promise.all` em quotes.service.ts: 0; `sendOutgoingMessage`: 8 (inalterado); `update-status.dto.ts`, `chatwoot.service.ts` e `apps/frontend` nao tocados.
- Testes so com mocks; nenhuma chamada ao Athos de producao nem ao Chatwoot real.
- Teste com changeStatus real: EM_PRODUCAO -> PRONTO_PARA_ENTREGA no lote nao chama sendOutgoingMessage e grava a nota privada "pronto para retirada".
- Teste de sequencia: a 2a chamada so comeca depois da 1a terminar.

## Deviations from Plan

None - plano executado como escrito. Notas de ambiente: `node_modules` do worktree e symlink para o repo principal (nao commitado). Os casos HTTP de validacao (Task 2) ja passavam no RED porque o DTO completo foi entregue na Task 1, como previsto no plano; o RED real da Task 2 foram os casos de servico (status invalido, alias, limites). STATE.md e ROADMAP.md nao foram alterados neste worktree (ficam a cargo do orquestrador).

## Known Stubs

None.

## Threat Flags

None. Mitigacoes T-49-05..10 cobertas por testes: ids validados (espaco, "../x", 65 caracteres, duplicado, 51 itens), execucao sequencial, 500 generico sem detalhe interno, 401 sem chave, zero mensagem publica no lote.

## Self-Check: PASSED

- Commits 46fbda1 e 0edc1d5 presentes no historico; arquivos listados existem.
