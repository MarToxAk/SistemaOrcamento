---
phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi
plan: 02
subsystem: payments
tags: [nestjs, cron, nestjs-schedule, efi, cobranca, prisma, jest]

# Dependency graph
requires:
  - phase: 29-boleto-consolidado-efi
    provides: "CobrancaModule, CobrancaService.verificarPagamentoBoleto() (EFI OAuth2 + status mapping), schema CobrancaBoleto"
provides:
  - "CobrancaReconciliationJob: reconciliação automática de boletos EFI a cada 30min, independente do webhook"
  - "ScheduleModule.forRoot() registrado globalmente em AppModule (infraestrutura de cron reutilizável por fases futuras)"
  - "Variáveis de ambiente opcionais EFI_RECONCILIACAO_ATIVA / EFI_RECONCILIACAO_CRON_MINUTOS documentadas em .env.example"
affects: [cobranca, efi-integration, 41-03, 41-04]

actuals:
  tokens: 3500
  tasks: 2
  commits: 3

tech-stack:
  added: ["@nestjs/schedule@^6.1.3"]
  patterns:
    - "Job de background via @Cron dentro de um provider comum (não módulo dedicado) — segue o precedente de AthosListenerService para estado mutável privado (guard booleano)"
    - "Guard running liberado em finally — nunca sobrepõe ciclos, mesmo com exceção"
    - "Isolamento de falha por item em loop sequencial (try/catch por boleto, não Promise.all)"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts
    - apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts
  modified:
    - apps/backend/package.json
    - package-lock.json
    - apps/backend/src/modules/app.module.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - .env.example

key-decisions:
  - "Checkpoint de legitimidade da Task 1 (npm supply-chain, @nestjs/schedule flagado SUS/too-new) aprovado pelo operador em 2026-09-05 antes desta execução — não re-executado, apenas registrado"
  - "@nestjs/schedule instalado como ^6.1.3 em vez do ^12.0.1 pesquisado/aprovado: 12.0.1 é type:module (ESM puro sem build CJS) e quebra tsc neste backend CommonJS; 6.1.3 é o mesmo pacote oficial NestJS (mesmos mantenedores, mesma dependência transitiva única cron@4.4.0, sem postinstall), publicado ~4 meses antes desta fase, peerDependencies ^10||^11 compatível com @nestjs/core ^11.1.19 já usado no projeto"
  - "Prisma Client gerado localmente (prisma generate) no início da execução — não estava gerado no worktree recém-criado, bloqueando qualquer tsc build; corrigido como pré-requisito de ambiente, não como mudança de código do plano"

patterns-established:
  - "Pattern de job de reconciliação de pagamento externo: consultar tabela própria por status pendente (findMany com take/orderBy), reaproveitar o serviço de domínio existente por item (nunca duplicar cliente HTTP), logar contagem a cada ciclo para calibrar frequência com dados reais de produção"

requirements-completed: [D-03, D-04, D-05]

coverage:
  - id: D1
    description: "@nestjs/schedule instalado e ScheduleModule.forRoot() registrado uma única vez em AppModule (D-05)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "npm --prefix apps/backend run build (tsc limpo)"
        status: pass
      - kind: other
        ref: "grep -c ScheduleModule.forRoot() apps.module.ts == 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "CobrancaReconciliationJob percorre boletos pendentes a cada 30min chamando verificarPagamentoBoleto() sem duplicar cliente EFI, isolando falha por item, sem ciclos sobrepostos, com interruptor por ambiente (D-03/D-04)"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts (8/8 passing)"
        status: pass
      - kind: unit
        ref: "npm --prefix apps/backend run test -- cobranca --no-coverage (31/31 passing, inclui suites existentes de cobranca.service)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Verificação manual em produção: linha de log de reconciliação aparece no intervalo configurado (diferida em 41-VALIDATION.md como manual-only)"
    verification: []
    human_judgment: true
    rationale: "Requer ambiente rodando em produção por ao menos um ciclo de 30min para observar o log real — não executável nesta sessão de execução de plano"

duration: ~25min
completed: 2026-09-05
status: complete
---

# Phase 41 Plan 02: Reconciliação Automática de Boletos EFI Summary

**Job `@Cron` a cada 30min que reconcilia boletos EFI pendentes reaproveitando `verificarPagamentoBoleto()`, fechando a lacuna do webhook (D-03/D-04), habilitado por `@nestjs/schedule` após aprovação humana do gate de supply-chain (D-05).**

## Performance

- **Duration:** ~25min
- **Completed:** 2026-09-05
- **Tasks:** 2 executados nesta sessão (Task 1 pré-aprovada em execução anterior; Task 2 e Task 3 executadas agora)
- **Files modified:** 6 (2 criados, 4 modificados, excluindo package-lock.json)

## Accomplishments
- `@nestjs/schedule` instalado e `ScheduleModule.forRoot()` registrado globalmente em `AppModule`, uma única vez, antes de `CobrancaModule`
- `CobrancaReconciliationJob` criado: a cada 30 minutos busca até 300 `CobrancaBoleto` com `status: "pendente"` e chama `CobrancaService.verificarPagamentoBoleto()` sequencialmente para cada um — `cobranca.service.ts` permanece intocado (D-04)
- Guard `running` previne ciclos sobrepostos e é liberado em `finally` mesmo quando a consulta ao banco falha
- Falha de um boleto específico é isolada (try/catch por item + `logger.error`); o lote continua para os demais
- Interruptor `EFI_RECONCILIACAO_ATIVA=false` documentado em `.env.example`, permitindo desligar o job em produção sem redeploy
- Efeito colateral positivo herdado de `verificarPagamentoBoleto()`: o job também mapeia `canceled` → `cancelado`, cobertura que o webhook nunca teve

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Gate de legitimidade do pacote @nestjs/schedule (D-05)** — aprovado pelo operador em 2026-09-05 em execução anterior (checkpoint `blocking-human`, resposta "sim"). Nenhum commit nesta sessão — apenas registrado como satisfeito.
2. **Task 2: Instalar @nestjs/schedule e registrar ScheduleModule.forRoot()** - `d73843c` (feat)
3. **Task 3: Job de reconciliação — RED** - `9e00e81` (test)
4. **Task 3: Job de reconciliação — GREEN** - `1956073` (feat)

**Plan metadata:** commit deste SUMMARY.md pendente (ver `<final_commit>` do orquestrador; STATE.md/ROADMAP.md não tocados por instrução explícita — orquestrador consolida após a wave)

_Nota: Task 3 seguiu TDD (`tdd="true"`) — commit RED (test) seguido de commit GREEN (feat), sem necessidade de REFACTOR (implementação já ficou limpa na primeira passada)._

## Files Created/Modified
- `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts` - Job `@Cron(EVERY_30_MINUTES)` que reconcilia boletos pendentes (NOVO)
- `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts` - 8 testes unitários cobrindo filtro/loop/isolamento de falha/guard/desligamento/teto (NOVO)
- `apps/backend/src/modules/cobranca/cobranca.module.ts` - registra `CobrancaReconciliationJob` como provider
- `apps/backend/src/modules/app.module.ts` - importa `ScheduleModule` e adiciona `ScheduleModule.forRoot()` ao array `imports`
- `apps/backend/package.json` / `package-lock.json` - nova dependência `@nestjs/schedule@^6.1.3`
- `.env.example` - documenta `EFI_RECONCILIACAO_ATIVA` e `EFI_RECONCILIACAO_CRON_MINUTOS` (opcionais, comentados)

## Decisions Made
- Checkpoint de legitimidade do pacote (Task 1) já havia sido resolvido em tentativa anterior: operador aprovou `@nestjs/schedule@12.0.1` em 2026-09-05 após revisar organização oficial `nestjs`, repositório `github.com/nestjs/schedule`, compatibilidade de peerDependencies e ausência de `postinstall`. Não foi re-perguntado nesta execução.
- **Desvio técnico da versão pinada:** durante a Task 2, `npm --prefix apps/backend run build` falhou com `TS1479` porque `@nestjs/schedule@12.0.1` é publicado como `"type": "module"` (ESM puro, sem build CommonJS), incompatível com o `tsc`/`module: Node16` deste backend (que resolve como CommonJS por ausência de `"type": "module"` no `package.json` do backend). Investigado o histórico de versões do pacote: não existe uma release `11.x` (o esquema de numeração pula de `6.1.3` para `12.0.0`, acompanhando o versionamento do NestJS core); `6.1.3` é a última versão pré-realinhamento, publicada ~4 meses antes desta fase pelos mesmos mantenedores oficiais (`nestjscore`/`kamilmysliwiec`), declara `peerDependencies` `@nestjs/core`/`@nestjs/common` `^10.0.0 || ^11.0.0` (compatível com `^11.1.19` já usado no projeto), mesma dependência transitiva única `cron@4.4.0`, sem `postinstall`, e não emite `"type": "module"` — compila limpo via `require()`. Trocada a instalação para `^6.1.3`. Este é o **mesmo pacote já aprovado no checkpoint** (não uma substituição por outro pacote/fornecedor) — apenas uma versão diferente, mais antiga e mais compatível, do pacote oficial já auditado. Aplicado como Rule 3 (build config error / blocking issue), não como Rule 4, porque não altera a decisão de arquitetura travada em D-05 (continua sendo `@nestjs/schedule`/`@Cron`) nem introduz um fornecedor não avaliado.
- `prisma generate` executado manualmente no início da Task 2: o worktree recém-criado nunca havia gerado o Prisma Client (`node_modules/@prisma/client` sem os tipos do schema atual), causando dezenas de erros `TS2305`/`TS2694` pré-existentes e não relacionados a esta mudança (`QuoteStatus`, `PriceSource`, `Decimal`, etc. ausentes do client stale). Corrigido como pré-requisito de ambiente (Rule 3) antes de avaliar o build; nenhum arquivo de schema ou migration foi alterado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@nestjs/schedule@12.0.1` (versão pesquisada/aprovada) é ESM-only e quebra o build CommonJS do backend**
- **Found during:** Task 2 (instalação e wiring do `ScheduleModule`)
- **Issue:** `npm --prefix apps/backend run build` falhava com `TS1479` — `@nestjs/schedule@12.0.1` publica `"type": "module"` sem build CJS; o `import { ScheduleModule } from "@nestjs/schedule"` em `app.module.ts` (arquivo CommonJS) não pode ser transpilado para `require()`.
- **Fix:** Trocada a versão instalada para `@nestjs/schedule@^6.1.3` — mesmo pacote oficial (`github.com/nestjs/schedule`, mesmos mantenedores), última versão pré-realinhamento de numeração com o NestJS core, `peerDependencies` compatível com `@nestjs/core@^11.1.19` já usado, mesma dependência transitiva única `cron@4.4.0`, sem `postinstall`, publicada ~4 meses antes desta fase (não é "too-new" como a `12.0.1`). Nenhuma mudança de código além da versão em `apps/backend/package.json`/`package-lock.json`.
- **Files modified:** apps/backend/package.json, package-lock.json
- **Verification:** `npm --prefix apps/backend run build` sai com código 0; `node -e "require('@nestjs/schedule')"` expõe `ScheduleModule`, `Cron`, `CronExpression`, `SchedulerRegistry`.
- **Committed in:** `d73843c` (Task 2 commit)

**2. [Rule 3 - Blocking] Prisma Client não gerado no worktree**
- **Found during:** Task 2 (primeira tentativa de `npm --prefix apps/backend run build`)
- **Issue:** O worktree isolado nunca havia rodado `prisma generate`; o client em `node_modules/@prisma/client` estava desatualizado/incompleto em relação ao `schema.prisma` atual, causando dezenas de erros `TS2305`/`TS2694` (`QuoteStatus`, `PriceSource`, `Prisma.Decimal` ausentes) em arquivos não tocados por este plano (`quotes.service.ts`, `efi.service.ts`, `pdf-templates.service.ts` etc.).
- **Fix:** Executado `npm --prefix apps/backend run prisma:generate` (gera o client a partir do `schema.prisma` já existente e commitado — nenhuma migration ou alteração de schema).
- **Files modified:** nenhum arquivo versionado (apenas `node_modules/@prisma/client`, artefato gerado e não commitado)
- **Verification:** erros `TS2305`/`TS2694` desapareceram do output de `tsc`; build passou a falhar apenas pelo item 1 acima, depois limpo.
- **Committed in:** n/a (artefato gerado localmente, fora do controle de versão)

---

**Total deviations:** 2 auto-fixed (2 blocking / Rule 3)
**Impact on plan:** Nenhuma mudança de escopo, arquitetura ou decisão travada (D-03/D-04/D-05 entregues exatamente como especificado). Ambos os desvios são correções de ambiente/compatibilidade necessárias para que o plano compilasse e testasse — sem eles a Task 2 não teria como passar em `<verify>`.

## Issues Encountered
Nenhum além dos documentados em Deviations acima.

## User Setup Required
None - nenhuma configuração externa necessária. As variáveis `EFI_RECONCILIACAO_ATIVA`/`EFI_RECONCILIACAO_CRON_MINUTOS` são opcionais e o comportamento padrão (job ligado, cadência de 30min) funciona sem nenhuma env var nova definida.

## Next Phase Readiness
- `CobrancaReconciliationJob` está registrado e ativo assim que o backend subir — nenhuma ação adicional necessária para D-03/D-04/D-05 entrarem em produção.
- Verificação manual diferida (registrada em `41-VALIDATION.md`): confirmar em ambiente rodando que a linha de log `Reconciliação EFI: N boleto(s) pendente(s) encontrado(s)` aparece a cada ~30min, e usar essa contagem real para validar/ajustar a cadência (per Pitfall 1 do research — teto teórico de 14.400 consultas/dia contra a cota de 15.000/dia da EFI).
- Sem bloqueios para os planos 41-01, 41-03 e 41-04 (não há overlap de arquivos com este plano).

---
*Phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts
- FOUND: apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts
- FOUND: .planning/phases/41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi/41-02-SUMMARY.md
- FOUND commit: d73843c (feat: instalar @nestjs/schedule + ScheduleModule.forRoot())
- FOUND commit: 9e00e81 (test: RED — cobranca-reconciliation.job.unit.test.ts)
- FOUND commit: 1956073 (feat: GREEN — CobrancaReconciliationJob)
