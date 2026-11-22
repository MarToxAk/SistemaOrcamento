---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 06
subsystem: pesquisa-satisfacao
tags: [nestjs, webhook, hmac, opt-out, cron, retencao, anonimizacao, trava-advisory, tdd]
status: complete

requires:
  - phase: 52-01
    provides: PesquisaService, schema PesquisaSatisfacao/CupomRecompensa/PesquisaSupressao com colunas pessoais nuláveis e rawBody ligado em main.ts
  - phase: 52-03
    provides: ehOptOut, normalizarTelefone, mascararTelefone e o formato Decimal/centavos usado pela fase
  - phase: 52-05
    provides: reenviarPendentes, marcarCuponsExpirados e as constantes de limite da re-tentativa
  - phase: 52-12
    provides: PesquisaModule no estado da wave 4 (controllers/providers existentes) e a revogação que os jobs respeitam
provides:
  - pesquisa-webhook.ts com verificarAssinaturaChatwoot, extrairOptOut e JANELA_TIMESTAMP_S
  - PesquisaWebhookController em POST /api/integrations/chatwoot/pesquisa/webhook (HMAC no corpo bruto, janela de 300 s, limite próprio de 600/min)
  - PesquisaService.registrarOptOut (upsert idempotente em PesquisaSupressao) e anonimizarAntigos (retenção gravando NULL)
  - pesquisa-trava.ts com comTravaAdvisory, CHAVE_TRAVA_RETRY (520101) e CHAVE_TRAVA_RETENCAO (520102)
  - PesquisaRetryJob (a cada 10 min) e PesquisaRetencaoJob (diário 03:30, kill-switch PESQUISA_RETENCAO_ATIVA)
  - PesquisaModule registrando o webhook e os dois jobs
affects:
  - 52-11 (roteiro configura o webhook de conta, CHATWOOT_WEBHOOK_SECRET, PESQUISA_RETENCAO_ATIVA/MESES e documenta SAIR reabrindo a conversa)
  - 52-09/52-10 (agregados preservados pela anonimização continuam alimentando painel e cupons)

actuals:
  tokens: 15035
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - webhook autenticado por HMAC sobre o corpo bruto, com janela de timestamp e comparação em tempo constante antes de qualquer acesso ao banco
    - trava advisory de transação (pg_try_advisory_xact_lock) com chave fixa por cron para cobrir múltiplos processos
    - kill-switch invertido (só a string exata "true" liga) avaliado antes de abrir transação
    - anonimização por updateMany com corte de data, gravando NULL e nunca apagando linhas

key-files:
  created:
    - apps/backend/src/modules/pesquisa/pesquisa-webhook.ts
    - apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts
    - apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-trava.ts
    - apps/backend/src/modules/pesquisa/pesquisa-retry.job.ts
    - apps/backend/src/modules/pesquisa/pesquisa-retencao.job.ts
    - apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa.module.ts

key-decisions:
  - "A assinatura X-Chatwoot-Signature é conferida sobre request.rawBody (nunca sobre o JSON reserializado) e antes de qualquer consulta ao banco; segredo ausente devolve 500 e assinatura/timestamp inválidos devolvem 401 sem efeito."
  - "O webhook usa limite próprio de 600 por minuto (não o THROTTLE_WEBHOOK de 30/min) porque message_created dispara a cada mensagem da conta."
  - "Erro inesperado do PesquisaService.registrarOptOut vira log com o nome do erro e resposta 200, para o Chatwoot não repetir indefinidamente um efeito idempotente."
  - "A trava entre réplicas é de transação (pg_try_advisory_xact_lock) porque o pool do Prisma não garante a mesma conexão entre travar e destravar; a transação fica aberta sem consultas, com timeout de 15 min e maxWait de 10 s."
  - "O kill-switch da retenção é avaliado antes de abrir a transação: desligado não toca o banco; meses inválidos (abc, 0, negativo) voltam ao padrão de 12."
  - "A anonimização grava NULL em telefone, conversationId, contactId, conversationUuid, customerId e comentário, preserva nota/variante/datas/valores e mantém a lista de supressão (o opt-out continua valendo)."

patterns-established:
  - "Webhook assinado: HMAC do corpo bruto + janela de timestamp + comparação em tempo constante, com o limite próprio mais alto que o do webhook de fechamento."
  - "Cron com três camadas: kill-switch (quando destrutivo), guarda running por processo e trava advisory entre processos."
  - "Retenção que anonimiza sem apagar: NULL nos campos pessoais, agregados intactos e supressão preservada."

requirements-completed: []

coverage:
  - id: D1
    description: "Webhook de SAIR com HMAC sobre o corpo bruto, janela de 300 s, 401 sem processar, filtro de evento/tipo/privada e supressão idempotente"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts#44 testes (hmac, filtro, optout, supressao, limite)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Job de re-tentativa (10 min) e de retenção (diário 03:30) com kill-switch, guarda running e trava advisory por chave"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts#38 testes (retry, killswitch, retencao, trava, anonimiza, modulo)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Anonimização de 12 meses grava NULL nos campos pessoais e identificadores, preserva agregados, nunca apaga e não toca a supressão"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts#anonimiza (updateMany, NULL, corte UTC, RangeError, sem delete)"
        status: pass
    human_judgment: false

metrics:
  duration: "~14min"
  started: "2026-11-22T18:37:00Z"
  completed: "2026-11-22T18:51:23Z"
  tasks: 2
  files: 9
  commits: 2
  plan_head_before: 9d3f97c9b56f35ed52131c0052e997d37280daba
  plan_head_after: d8e1392d5341c9f088fdf84cd5b28b0b70938af9
---

# Phase 52 Plan 06: Webhook de SAIR, re-tentativa e retenção de 12 meses

**O opt-out SAIR passa a chegar por webhook de conta assinado (HMAC sobre o corpo bruto, janela de 300 s, 401 sem efeito), grava a supressão de forma idempotente, e dois crons — re-tentativa a cada 10 min e anonimização diária de 12 meses desligada por padrão — rodam sob trava advisory entre processos.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-11-22T18:37:00Z
- **Completed:** 2026-11-22T18:51:23Z
- **Tasks:** 2
- **Files modified:** 9 (7 criados, 2 modificados)
- **Verificação:** `jest src/modules/pesquisa src/modules/integrations/chatwoot` = 18 suites / 468 testes verdes; `tsc --noEmit -p apps/backend/tsconfig.json` sem erros.

## Accomplishments

- `pesquisa-webhook.ts`: `verificarAssinaturaChatwoot` compara `sha256=` + HMAC-SHA256(segredo, `<timestamp>.<corpo bruto>`) com `timingSafeEqual` sobre buffers de mesmo tamanho, exige timestamp numérico dentro de `JANELA_TIMESTAMP_S` (300 s) e recusa corpo/assinatura/segredo ausentes — a assinatura feita sobre o JSON reserializado é provada inválida. `extrairOptOut` aceita `unknown`, nunca lança e só reconhece `message_created` de entrada (`incoming`/`0`), não privada, com texto normalizado exatamente `sair` e telefone válido de `sender.phone_number` ou `conversation.meta.sender.phone_number`.
- `PesquisaWebhookController` em `integrations/chatwoot/pesquisa` com `@Public() @Post("webhook") @HttpCode(200)` e `@Throttle({ default: { ttl: 60_000, limit: 600 } })`: segredo ausente → 500; assinatura ou janela inválidas → 401 sem chamar o serviço; eventos diferentes de `message_created` → `{ processed: false, optOut: false }`; erro do serviço → log só do nome do erro e 200.
- `PesquisaService.registrarOptOut` faz `upsert({ where: { telefone }, create: { telefone, origem: "SAIR" }, update: {} })` e loga o telefone mascarado `(12) *****-4918`, nunca o número completo.
- `pesquisa-trava.ts`: `comTravaAdvisory(prisma, chave, fn)` executa `SELECT pg_try_advisory_xact_lock(${chave})` dentro de `$transaction` (timeout 900 000 ms, maxWait 10 000 ms); trava `true` executa `fn` uma vez, qualquer outro valor (false, lista vazia, não booleano) devolve `{ executou: false }` sem chamar `fn`; erros propagam. Chaves fixas 520101 (retry) e 520102 (retenção), distintas da 520001 do resgate.
- `PesquisaRetryJob` (`*/10 * * * *`, America/Sao_Paulo): guarda `running`, ciclo dentro da trava, `marcarCuponsExpirados` sempre e `reenviarPendentes` só com a pesquisa ativa; logs só com contagens; erro → `logger.error` do nome do erro, `null` e guarda liberada.
- `PesquisaRetencaoJob` (`30 3 * * *`, America/Sao_Paulo): só liga com `PESQUISA_RETENCAO_ATIVA === "true"`; `PESQUISA_RETENCAO_MESES` inteiro ≥ 1 ou 12; kill-switch antes da transação; `executou: false` → log de outro processo e `null`.
- `PesquisaService.anonimizarAntigos(meses, agora)`: valida meses (RangeError sem tocar o banco), corta em UTC com `setUTCMonth`, `updateMany` grava NULL em telefone/conversationId/comentário/contactId/conversationUuid/customerId e marca `anonimizadaEm`, zera o telefone dos cupons ligados e devolve `{ pesquisas, cupons }` — sem `delete`, sem tocar `PesquisaSupressao` e sem incluir agregados em `data`.
- `PesquisaModule` registra `PesquisaWebhookController`, `PesquisaRetryJob` e `PesquisaRetencaoJob`.

## Task Commits

Cada task foi escrita em TDD (teste vermelho com os módulos ainda inexistentes, implementação, verde) e commitada atomicamente:

1. **Task 1: Webhook de SAIR com HMAC sobre o corpo bruto e supressão** - `dfeee02` (feat)
2. **Task 2: Jobs de re-tentativa e de retenção com trava advisory** - `d8e1392` (feat)

**Plan metadata:** commit do SUMMARY (docs).

### TDD Gate Compliance

- **Task 1 RED:** `jest src/modules/pesquisa/pesquisa-webhook` → 0 testes, `Cannot find module "./pesquisa-webhook"` e `Property 'registrarOptOut' does not exist on type 'PesquisaService'` (42+ erros de compilação do teste novo). **GREEN:** 44 testes verdes após `pesquisa-webhook.ts`, `pesquisa-webhook.controller.ts` e `registrarOptOut`.
- **Task 2 RED:** `jest src/modules/pesquisa/pesquisa-jobs` → 0 testes, módulos `pesquisa-retry.job`/`pesquisa-retencao.job`/`pesquisa-trava` ausentes e `anonimizarAntigos` inexistente. **GREEN:** 38 testes verdes após a implementação.
- **Semantic assessment:** em ambos os ciclos o teste alvo foi escrito a partir do bloco `<behavior>` do plano e o vermelho veio da ausência do código de produção (não de fixture ou erro de sintaxe no próprio teste); o verde é medido pelo mesmo comando.

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/pesquisa-webhook.ts` - funções puras de HMAC e de extração do opt-out.
- `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts` - rota pública com limite próprio de 600/min.
- `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts` - 44 testes (hmac, filtro, optout, supressão, limite e metadata).
- `apps/backend/src/modules/pesquisa/pesquisa-trava.ts` - `comTravaAdvisory` e as chaves 520101/520102.
- `apps/backend/src/modules/pesquisa/pesquisa-retry.job.ts` - cron de 10 minutos com guarda e trava.
- `apps/backend/src/modules/pesquisa/pesquisa-retencao.job.ts` - cron diário com kill-switch exato e trava.
- `apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts` - 38 testes (retry, killswitch, retenção, trava, anonimização, módulo).
- `apps/backend/src/modules/pesquisa/pesquisa.service.ts` - `registrarOptOut` e `anonimizarAntigos`.
- `apps/backend/src/modules/pesquisa/pesquisa.module.ts` - registra o webhook e os dois jobs.

## Decisions Made

- A rota do webhook fica em `PesquisaModule` (não no `ChatwootModule`) porque usa `PesquisaService`/`PesquisaSupressao`; o `ChatwootModule` já é importado para o `PesquisaService`.
- O controller valida segredo → assinatura → evento → filtro → supressão nessa ordem, para que qualquer chamada não autenticada não chegue ao banco.
- `comTravaAdvisory` não conhece `PrismaService` (recebe `{ $transaction: Function }`), o que mantém a função testável com transação falsa e sem acoplar o Prisma.
- A anonimização roda sem transação própria: são dois `updateMany` independentes e idempotentes; a trava do job já impede sobreposição entre processos.
- `PESQUISA_RETENCAO_MESES` só aceita inteiro ≥ 1; qualquer outro texto/valor volta a 12 (nunca desliga nem zera a retenção).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tipos de Request do Express indisponíveis**
- **Found during:** Task 1
- **Issue:** o plano sugeria `@Req() req: RawBodyRequest<Request>` (tipo do Express), mas `@types/express` não está instalado no repositório e o `tsc` falharia.
- **Fix:** o controller declara um tipo local estrutural `{ rawBody?: Buffer }`, que é exatamente o que o `rawBody: true` do Nest entrega; nenhuma dependência nova foi adicionada.
- **Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts`
- **Commit:** `dfeee02`

## Issues Encountered

- O worktree não tem `node_modules` próprio: jest e tsc foram executados a partir de `/root/SistemaOrcamento/node_modules` (a resolução de módulos sobe até a raiz do monorepo), mesma abordagem dos planos 52-05, 52-07 e 52-12. Nenhuma alteração de código foi necessária.
- Os testes dos jobs acessam argumentos de mocks com `as unknown[]` por causa da inferência de tuplas do jest 30; sem impacto no comportamento testado.

## Known Stubs

Nenhum. Webhook, jobs, trava e anonimização estão completos e testados; não há placeholder, valor vazio hardcoded nem TODO/FIXME.

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-36 mitigado (HMAC-SHA256 do corpo bruto com comparação em tempo constante, provado com corpo alterado em 1 byte); T-52-37 mitigado (janela de 300 s e upsert idempotente); T-52-38 mitigado (limite próprio de 600/min e HMAC antes do banco); T-52-39/T-52-40 mitigados (anonimização diária desligada por padrão, `updateMany` com corte de data, sem delete e sem tocar a supressão); T-52-73 mitigado (trava advisory em ambos os crons); T-52-74 mitigado (NULL em telefone e identificadores, colunas nuláveis desde 52-01). Nenhum log carrega telefone completo, texto de mensagem, corpo do webhook ou segredo.

## Next Phase Readiness

- Pronto para o roteiro (52-11) configurar o webhook de conta do Chatwoot com `CHATWOOT_WEBHOOK_SECRET`, as envs `PESQUISA_RETENCAO_ATIVA`/`PESQUISA_RETENCAO_MESES` e documentar que SAIR reabre a conversa resolvida (D-35) e que a retenção não alcança o Chatwoot (D-38).
- A retenção permanece desligada em produção até o parecer jurídico; os agregados que o painel consome não são afetados.
- Nenhum endpoint admin novo foi criado neste plano; o webhook é público e autenticado por HMAC.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Arquivos criados/modificados existem no disco e nos commits `dfeee02` e `d8e1392` (ancestrais de HEAD).
- `git rev-list --count 9d3f97c..HEAD` = 2 (uma por task).
- `jest src/modules/pesquisa src/modules/integrations/chatwoot`: 18 suites, 468 testes verdes.
- `tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.
- STATE.md e ROADMAP.md não foram tocados (o orquestrador atualiza após o merge).
