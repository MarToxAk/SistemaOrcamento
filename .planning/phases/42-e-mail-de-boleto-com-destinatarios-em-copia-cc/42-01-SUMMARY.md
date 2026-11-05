---
phase: 42-e-mail-de-boleto-com-destinatarios-em-copia-cc
plan: 01
subsystem: cobranca
tags: [email, cc, nodemailer, prisma, nestjs, nextjs]
requires: []
provides:
  - "EMAIL_CC_MAX e campo cc validado no EnviarEmailCobrancaDto"
  - "normalizarListaCc (reutilizada em 42-02)"
  - "coluna CobrancaEmailEnvio.cc (migration idempotente)"
  - "helpers de modulo EMAIL_CC_MAX/EMAIL_RE/mesclarEmailsCc no frontend (reutilizados em 42-02)"
affects: [42-02]
tech-stack:
  added: []
  patterns: ["spread condicional de cc no sendMail", "migration aditiva idempotente (Fase 09)"]
key-files:
  created:
    - apps/backend/prisma/migrations/20261105120000_add_cobranca_email_envio_cc/migration.sql
  modified:
    - apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts
    - apps/backend/src/modules/cobranca/email-envio.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/prisma/schema.prisma
    - apps/frontend/src/app/api/cobranca/email/enviar/route.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
key-decisions:
  - "Sem CC nenhum Cc/Bcc e adicionado; EMPRESA_EMAIL nunca vira copia (D-04)"
  - "Validacao de CC falha rapido, antes de baixar anexos"
requirements-completed: [CC-01, CC-02, CC-03, CC-04]
status: complete
commits: 4
plan_head_before: 33c664a2c79f076925f769bf725fcdef213adfc0
plan_head_after: 704b578bd62838a78785441c923ea1789cb57c7f
actuals:
  tokens: 6300
  tasks: 2
  commits: 4
---

# Phase 42 Plan 01: CC no e-mail de boleto Summary

CC ponta a ponta no e-mail de boleto: modal com chips (Bootstrap) -> proxy Next -> DTO validado (IsEmail por item, max 10) -> `normalizarListaCc` -> `sendMail({ cc })` -> `CobrancaEmailEnvio.cc` (migration idempotente) -> tooltip do badge de status.

## Tarefas e commits

| Tarefa | Commit | Descricao |
|--------|--------|-----------|
| 1 (tracer, RED) | ccde705 | `test(42-01)`: casos 8-15 (normalizacao, sem Cc/Bcc, contrato ValidationPipe) |
| 1 (GREEN) | ade9801 | `feat(42-01)`: DTO, service, proxy, modal com chips |
| 2 (RED) | a9d5c02 | `test(42-01)`: casos 16-17 (cc no historico) |
| 2 (GREEN) | 704b578 | `feat(42-01)`: schema + migration, create com cc, `ultimoEmail.cc`, tooltip |

## Verificacao (todas as `<automated>` passaram)

- `npm --prefix apps/backend run test -- email-envio --no-coverage`: 18 passed (baseline 8). Suite `cobranca` completa: 6 suites, 50 passed.
- `tsc --noEmit` backend e frontend: exit 0.
- Corpo do e-mail inalterado: regiao `private montarCorpoHtml` ate o fim do arquivo identica a d2a7709.
- `prisma generate` ok; `prisma validate` "is valid" (executado com `DATABASE_URL` dummy, pois o schema le a env; nenhum banco foi tocado).
- Migration: `ADD COLUMN IF NOT EXISTS "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` (1 ocorrencia).
- `@Public()` no `cobranca.controller.ts`: 3 (inalterado). Athos: sem diff em `integrations/athos`.
- Gate do tracer: `<verify>` automatizado re-executado apos a Task 1 e passou antes da Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio] Ambiente do worktree sem node_modules**
- **Found during:** inicio
- **Fix:** `cp -a` de `node_modules` (raiz, apps/backend, apps/frontend) do repo principal para o worktree (em vez de symlink, para que `prisma generate` nao altere o client gerado do checkout principal). `node_modules/` e gitignored.

**2. [Observacao] Criterio de aceite `grep -c mesclarEmailsCc >= 3`**
- A mescla foi centralizada em `aplicarMesclaCc()` (usada por `adicionarEmailCc` e `confirmarEnviarEmail`), entao `mesclarEmailsCc` aparece 2 vezes (definicao + 1 uso) em vez de 3. Comportamento descrito no plano mantido integralmente; sem impacto funcional.

**3. [Observacao] Arquivos do plano nao estavam no worktree**
- `.planning/phases/42-*/` e untracked no checkout principal; PLAN/CONTEXT foram lidos de la. Este SUMMARY foi criado no worktree no mesmo caminho relativo.

**4. [Observacao] Ledger de commits**
- O arquivo de ledger em `.git/worktrees/...` nao pode ser gravado pelo sandbox; a base (`33c664a`, HEAD no inicio) foi registrada manualmente e `commits: 4` medido via `git rev-list --count 33c664a..HEAD`.

## Itens `<human-check>` pendentes (fim da fase)

- **Task 1:** com backend + SMTP reais, abrir `/contas-receber/ID_DO_CLIENTE` (cliente com boleto ativo), clicar em "E-mail", adicionar 2 e-mails em "Copia (CC)" (um via Enter, outro colando "x@y.com, z@w.com"), remover um chip e enviar. Esperado: principal no "Para"; CC restantes no "Cc" com os mesmos anexos; tela de sucesso lista "Copia (CC): ..."; "abc" mostra "E-mail invalido: abc" e nao envia.
- Aplicar a migration no deploy (`prisma migrate deploy` via `scripts/bootstrap-runtime.sh`); nao foi aplicada em nenhum banco.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat_model do plano (T-42-01..06 tratados conforme disposicao; T-42-06, proxy sem guarda de sessao, permanece como lacuna pre-existente aceita).

## Self-Check: PASSED

- Arquivos: migration, DTO, service, teste, proxy, page.tsx, schema, cobranca.service.ts presentes.
- Commits ccde705, ade9801, a9d5c02, 704b578 presentes na branch.
