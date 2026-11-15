---
phase: 49-mensagens-de-status-ao-cliente-s-pronto-vai-ao-cliente-demai
plan: 01
subsystem: quotes
tags: [chatwoot, status, whatsapp, nestjs, class-validator]
requires: []
provides:
  - "PATCH /quotes/:id/status com notificarCliente opcional (boolean, padrao true)"
  - "changeStatus com ChangeStatusOptions: so PRONTO_PARA_ENTREGA envia mensagem publica; demais viram nota privada"
affects: [49-02]
tech-stack:
  added: []
  patterns: ["roteamento mensagem publica x nota privada por lista de status (statusComAvisoPublico)"]
key-files:
  created:
    - apps/backend/src/modules/quotes/quotes.controller.status.http.test.ts
  modified:
    - apps/backend/src/modules/quotes/dto/update-status.dto.ts
    - apps/backend/src/modules/quotes/quotes.controller.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/quotes/quotes.service.unit.test.ts
decisions:
  - "D-01: statusComAvisoPublico = [PRONTO_PARA_ENTREGA]; EM_PRODUCAO, ENTREGUE e CANCELADO usam postConversationNote com o mesmo texto"
  - "D-02: notificarCliente validado com IsOptional + IsBoolean (string 'false' e campos desconhecidos dao 400)"
requirements-completed: [STA-01, STA-02, STA-05]
status: complete
commits: 2
plan_head_before: 6922dee19e922e96f4534fc479baf775072a500c
plan_head_after: be58346
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 49 Plan 01: Status ao cliente so no "pronto" Summary

`changeStatus` agora envia mensagem publica ao cliente apenas em PRONTO_PARA_ENTREGA; producao, entrega e cancelamento ficam como nota privada com o mesmo texto, e `PATCH /quotes/:id/status` aceita `notificarCliente: false` para silenciar ate o "pronto".

## Tarefas

| Task | Nome | Commit | Arquivos |
| ---- | ---- | ------ | -------- |
| 1 (tracer) | notificarCliente ponta a ponta (HTTP -> DTO -> controller -> changeStatus -> nota privada) | 812935e | update-status.dto.ts, quotes.controller.ts, quotes.service.ts, quotes.controller.status.http.test.ts, quotes.service.unit.test.ts |
| 2 | Regra padrao: so o pronto e publico (D-01, D-04) | be58346 | quotes.service.ts, quotes.service.unit.test.ts |

## Verificacao

- `modules/quotes` + `integrations/efi`: 14 suites passam, 1 pulada, 158 testes passam (baseline de quotes: 113).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- `sendOutgoingMessage` em quotes.service.ts: 8 (inalterado); `changeStatus(quote.id, "APROVADO"`: 4 (inalterado); `chatwoot.service.ts` e `apps/frontend` nao tocados.
- Testes so com mocks; nenhuma chamada ao Athos de producao nem ao Chatwoot real.
- Teste HTTP usa Nest real com InternalAuthGuard e ValidationPipe do main.ts: 200 com false/true/ausente, 400 para string "false" e campo desconhecido, 401 sem chave.

## Deviations from Plan

None - plano executado como escrito. Nota de ambiente: `node_modules` do worktree foi ligado por symlink ao repo principal (nao commitado).

## Known Stubs

None.

## Threat Flags

None. Nenhuma superficie nova alem da prevista no threat_model (T-49-01..04 mitigadas pelos testes).

## Self-Check: PASSED

- Commits 812935e e be58346 presentes no historico; arquivos listados existem.
