---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
plan: 01
subsystem: cobranca
tags: [aviso-vencimento, email, cron, prisma, idempotencia, tracer]
requires:
  - phase: 42
    provides: CobrancaEmailCcPadrao e normalizarListaCc (CC padrao do cliente)
  - phase: 43
    provides: hojeSaoPaulo e athosBaixaStatus (elegibilidade sem baixa Athos)
provides:
  - model CobrancaAvisoVencimento + migration aditiva (unique cobrancaBoletoId+tipo)
  - util puro de janelas de aviso (D-3, D-1, A+2, A+7, A+14)
  - CobrancaAvisoVencimentoService.processarCiclo
  - CobrancaAvisoVencimentoJob (cron 08h e 14h, desligado por padrao)
  - EmailEnvioService.resolverDestinatariosAviso e enviarAvisoVencimento
affects: [45-02, 45-03, 45-04, 45-05]
tech-stack:
  added: []
  patterns:
    - "Reserva da linha de idempotencia por create + P2002 antes do envio"
    - "Kill switch invertido: so o texto exato true liga"
key-files:
  created:
    - apps/backend/prisma/migrations/20261110120000_add_cobranca_aviso_vencimento/migration.sql
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.util.ts
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.service.ts
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.tracer.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - apps/backend/src/modules/cobranca/email-envio.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.test.ts
key-decisions:
  - "Janelas disjuntas em dias para vencer: D-3 = 3..2, D-1 = 1, A+2 = -2..-6, A+7 = -7..-13, A+14 = -14..-20; dia 0 nao avisa"
  - "Linha em status erro ja existente cai em P2002 e vira ja_processado neste plano; a retomada fica para 45-02"
  - "Falha ao gravar CobrancaEmailEnvio apos o sendMail nao lanca (evita reenvio duplicado)"
  - "Log so com ids, tipo e e-mail mascarado; erro de SMTP sem endereco"
duration: 35min
completed: 2026-11-10
status: complete
commits: 2
plan_head_before: c30ffd09f24f791eaee989d5a14fee85ea53f9f6
plan_head_after: 265bf34211362baf33d2aa1ec9d42259489b4041
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
---

# Phase 45 Plan 01: Aviso de vencimento D-1 ponta a ponta Summary

Tracer do aviso por e-mail: job agendado (08h e 14h, America/Sao_Paulo, desligado por padrao) que reserva a linha `CobrancaAvisoVencimento` por (boleto, tipo), envia o e-mail com CC, link e PDF do boleto pelo `EmailEnvioService` e nunca duplica o aviso.

## O que foi entregue

- **Task 1 (tracer, commit 2fc5aba):** model Prisma + migration aditiva e idempotente (FK `ON DELETE CASCADE`), util puro de janelas, servico orquestrador (consulta com `OR` explicito para `athosBaixaStatus` nulo, defesa dupla, reserva por create/P2002, dry-run sem reserva nem envio), job com kill switch `COBRANCA_AVISO_ATIVO === "true"` e guarda `running`, registro no `CobrancaModule`, dois metodos novos no `EmailEnvioService` e teste tracer.
- **Task 2 (commit 265bf34):** endurecimento do e-mail: CC padrao legado invalido ignorado com warn, link do boleto so com http(s), PDF best-effort, historico `CobrancaEmailEnvio` gravado depois do envio sem lancar, 13 testes novos (E1 a E13).
- `enviarBoletoENotas` intocado: o trecho `enviarBoletoENotas` ate `buscarCcPadrao` tem o mesmo md5 de 008ace6.

## Verificacao (saida real)

| Comando | Resultado |
|---|---|
| `prisma generate` | Generated Prisma Client (v5.22.0) |
| `prisma validate` (DATABASE_URL ficticia, sem conexao) | The schema is valid |
| `test -- cobranca-aviso-vencimento.tracer` | 1 suite, 7 passed (T3 roda com 3 valores) |
| `test -- email-envio.service` | 1 suite, 42 passed (29 antigos + 13 novos) |
| `test -- cobranca` | 12 suites, 160 passed (baseline 140) |
| `tsc --noEmit -p apps/backend/tsconfig.json` | sem erros |

Acceptance greps: model=1, relacao `CobrancaAvisoVencimento[]`=1, `@@unique`=1, `onDelete: Cascade`=6, `IF NOT EXISTS` na migration=4, `ON DELETE CASCADE`=1, DROP=0, cron=1, timeZone=1, kill switch=1, `athosBaixaStatus: null`=1, module=4, util sem imports Nest/Prisma=0.

## Deviations from Plan

### Ambiente

**1. [Rule 3 - Blocking] Worktree criado em base errada**
- **Found during:** inicio
- **Issue:** o worktree estava em f2ea8ed (sem os arquivos da fase 45 nem as fases 44); a base esperada pelo orquestrador era c30ffd0.
- **Fix:** `git reset --hard c30ffd0` no inicio (working tree limpo, branch do agente), conforme o passo de checagem de branch do startup.

**2. [Rule 3 - Blocking] node_modules ausente no worktree**
- **Fix:** `node_modules` real no worktree com symlinks por entrada para o checkout principal, exceto `.prisma`, `@prisma` e `prisma`, que foram copiados para o `prisma generate` nao alterar o cliente do checkout principal. Nao versionado (gitignore).

### Plano

**3. Contagem de testes do tracer:** o plano esperava 5 testes e o criterio era "pelo menos 5"; sao 7 porque o T3 (kill switch) usa `it.each` com tres valores. Suite `cobranca` ficou em 160 (o minimo era 145).

**4. TDD:** os testes do tracer e de E1..E13 foram escritos junto com o codigo, nao antes (sem commits RED separados); todos passam.

## Limitacoes conhecidas (previstas, tratadas em 45-02)

- Boleto com linha de aviso em `erro` cai em P2002 na reserva e conta como `ja_processado` (sem retomada nem limite de 3 tentativas ainda).
- Cliente sem e-mail valido: loga e conta `sem_email`, mas nao grava linha terminal (repete a cada ciclo ate 45-02).
- `AVISO_MAX_ENVIOS_POR_CICLO`, `AVISO_MAX_TENTATIVAS`, `AVISO_INTERVALO_ENVIO_MS` declaradas mas ainda nao aplicadas.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova alem da prevista no threat_model do plano. Nenhum banco foi alterado, nenhuma migration executada, nada escrito no Athos, nenhum e-mail real enviado, e `COBRANCA_AVISO_ATIVO` nao foi habilitado em ambiente algum.

## Self-Check: PASSED

- Arquivos criados/modificados existem (conferidos via git status/commits).
- Commits 2fc5aba e 265bf34 presentes no historico da branch.
