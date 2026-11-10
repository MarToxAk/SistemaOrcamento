---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
plan: 03
subsystem: cobranca
tags: [aviso-vencimento, cron, kill-switch, admin-only, deploy, env]
requires:
  - phase: 45
    provides: "45-01: CobrancaAvisoVencimentoJob e CobrancaAvisoVencimentoService.processarCiclo"
provides:
  - testes J1..J5 do job (kill switch exato, dry-run, guarda running, falha do ciclo, cron)
  - GET /api/cobranca/aviso-vencimento/previa (AdminOnly, sempre dry-run)
  - COBRANCA_AVISO_ATIVO e COBRANCA_AVISO_DRY_RUN nos dois compose e nos dois exemplos de env, padrao false
affects: [45-05]
tech-stack:
  added: []
  patterns:
    - "Metadata do @Cron lida via Reflect.getMetadata(SCHEDULE_CRON_OPTIONS) em teste"
    - "Previa AdminOnly sem parametros chamando o servico com dryRun fixo"
key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.test.ts
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.controller.test.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml
    - .env.example
    - deploy/stack.env.example
key-decisions:
  - "Job de 45-01 ja atendia J1..J5; ajuste limitado a log de resumo (so contagens) e cabecalho sobre os dois disparos"
  - "4o parametro do CobrancaController opcional no tipo (os testes da Fase 43 usam 3 argumentos); a rota lanca 503 se ausente"
duration: 25min
completed: 2026-11-10
status: complete
commits: 3
plan_head_before: f92e61d705244ef30b758c7bcd35704a5d3b04d2
plan_head_after: 05a0c4648e0e83583dc6189d64a550abdb455742
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase 45 Plan 03: Operacao segura do aviso (job provado, previa, env) Summary

Job do aviso provado por 16 testes (so o texto exato `true` liga, dry-run so com o job ligado, sem sobreposicao, nunca rejeita, cron 08:00 e 14:00 em America/Sao_Paulo), previa AdminOnly `GET /api/cobranca/aviso-vencimento/previa` sempre em dry-run e variaveis `COBRANCA_AVISO_*` nos dois compose e exemplos de env com padrao `false`.

## Tarefas e commits

| Task | Commit | Resultado |
|---|---|---|
| 1. Job provado | 1216154 | 16 testes (J1 com 6 valores desligados, J2, J3, J4, J5 e log de resumo); job ganhou log de resumo com contagens e cabecalho sobre os dois disparos |
| 2. Previa AdminOnly | 8bc07ba | rota `@AdminOnly() @Get("aviso-vencimento/previa")` chamando `processarCiclo({ dryRun: true })`; 4 testes C1..C4 |
| 3. Env e compose | 05a0c46 | variaveis nos 2 compose (padrao false) e nos 2 exemplos de env, com previa e ordem de ativacao documentadas |

## Verificacao (saida real)

| Comando | Resultado |
|---|---|
| `test -- cobranca-aviso-vencimento.job` | 1 suite, 16 passed |
| `test -- cobranca-aviso-vencimento.controller` | 1 suite, 4 passed |
| `test -- cobranca-baixa-athos.controller` | 1 suite, 8 passed (sem alteracao no teste) |
| `test -- cobranca` | 14 suites, 180 passed |
| `tsc --noEmit -p apps/backend/tsconfig.json` | exit 0, sem erros |
| grep `COBRANCA_AVISO_ATIVO: ${...:-false}` nos 2 compose | 1 e 1 |
| grep `COBRANCA_AVISO_DRY_RUN: ${...:-false}` nos 2 compose | 1 e 1 |
| grep `^COBRANCA_AVISO_(ATIVO\|DRY_RUN)=false$` nos 2 exemplos | 2 e 2 |
| grep `^COBRANCA_AVISO_ATIVO=true` nos 2 exemplos | 0 e 0 |
| grep `aviso-vencimento/previa` nos 2 exemplos | 1 e 1 |
| YAML dos dois compose | yaml ok |
| acceptance greps do controller | rota=1, `dryRun: true`=1, `@AdminOnly()` na linha anterior ao `@Get`=1 |
| grep `toLowerCase\|trim()` no job | 0 (comparacao exata) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree em base antiga.** HEAD estava em f2ea8ed; `git reset --hard f92e61d` (arvore limpa) conforme instrucao do orquestrador.

**2. [Rule 3 - Blocking] node_modules ausente.** Criado `node_modules` no worktree com symlinks por entrada para o checkout principal (raiz e `apps/backend/node_modules/@types`), exceto `.prisma`, `@prisma` e `prisma`, que foram copiados antes do `prisma generate` (necessario para o model da 45-01). Nao versionado.

**3. [Rule 3 - Blocking] 4o parametro do construtor.** O plano pede o parametro novo opcional para os testes da Fase 43; como o ts-jest falha com "Expected 4 arguments", ele foi declarado `?` no tipo. O Nest continua injetando em runtime (provider em `CobrancaModule`); por seguranca, a rota lanca `ServiceUnavailableException` se o servico estiver ausente (nunca ocorre em runtime).

**4. TDD:** o job de 45-01 ja cumpria J1..J5, entao os testes passaram de primeira (sem commit RED separado); a mudanca no job foi so o log de resumo.

**5. Observacao de tipo:** o plano descreve `lookupFalhou` como booleano na resposta, mas o servico de 45-01 o tipa como `number`; os testes usam `0` e o log imprime o valor como esta. Nao editei o servico (pertence a 45-02).

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie alem da prevista no threat_model (T-45-14..T-45-17 mitigados: comparacao exata, padrao false, AdminOnly sem parametros, guarda `running` com finally). Nenhum banco alterado, nenhuma migration executada, nada escrito no Athos, nenhum e-mail enviado, e `COBRANCA_AVISO_ATIVO` nao foi habilitado em lugar algum. STATE.md e ROADMAP.md nao foram tocados.

## Self-Check: PASSED

- Arquivos criados e modificados existem (job.test.ts, controller.test.ts e os 6 modificados conferidos pelos greps e testes).
- Commits 1216154, 8bc07ba e 05a0c46 presentes no historico da branch.
