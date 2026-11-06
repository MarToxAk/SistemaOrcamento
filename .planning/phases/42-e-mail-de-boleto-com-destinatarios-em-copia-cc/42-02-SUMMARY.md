---
phase: 42-e-mail-de-boleto-com-destinatarios-em-copia-cc
plan: 02
subsystem: cobranca
tags: [email, cc, lista-fixa, prisma, nestjs, nextjs]
requires: ["42-01"]
provides:
  - "model CobrancaEmailCcPadrao + migration idempotente (lista fixa de CC por idclienteAthos)"
  - "SalvarCcPadraoDto, EmailEnvioService.buscarCcPadrao/salvarCcPadrao"
  - "GET/PUT /cobranca/email/cc-padrao/:idclienteAthos (autenticados) e proxy Next com requireAdminSession"
  - "modal pre-preenchido com a lista do cliente + checkbox 'Salvar como padrao deste cliente'"
affects: []
tech-stack:
  added: []
  patterns: ["upsert unico como caminho de escrita (lista vazia remove o padrao)", "descarte de resposta obsoleta do GET por contador em useRef"]
key-files:
  created:
    - apps/backend/prisma/migrations/20261105130000_add_cobranca_email_cc_padrao/migration.sql
    - apps/backend/src/modules/cobranca/dto/salvar-cc-padrao.dto.ts
    - apps/frontend/src/app/api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/cobranca/email-envio.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
key-decisions:
  - "Lista fixa em tabela propria do Sistema (nunca no Athos); gravacao somente por opt-in (checkbox) apos envio ok"
  - "Falha ao carregar/salvar o padrao vira aviso no modal e nunca bloqueia nem desfaz o envio"
requirements-completed: [CC-05, CC-01, CC-02]
status: complete
commits: 3
plan_head_before: 4bbffd902a9f7ab696a5d2b71a6669db0bb0d3e6
plan_head_after: 75d9e7179e96d31271df7f1ca8429266e06b5a29
actuals:
  tokens: 9500
  tasks: 2
  commits: 3
---

# Phase 42 Plan 02: Lista fixa de CC por cliente Summary

Lista fixa de CC por cliente: tabela `CobrancaEmailCcPadrao` (migration idempotente) -> `GET`/`PUT /cobranca/email/cc-padrao/:idclienteAthos` autenticados (sem `@Public`) -> proxy Next com `requireAdminSession` -> modal que abre pre-preenchido e so grava o padrao quando o operador marca "Salvar como padrao deste cliente" e o envio da certo.

## Tarefas e commits

| Tarefa | Commit | Descricao |
|--------|--------|-----------|
| 1 (RED) | 6bc0a71 | `test(42-02)`: casos 18-25 (buscar/salvar padrao, id invalido, normalizacao, ValidationPipe do DTO) |
| 1 (GREEN) | 7b05a6b | `feat(42-02)`: model + migration, `SalvarCcPadraoDto`, `buscarCcPadrao`/`salvarCcPadrao`, rotas GET/PUT |
| 2 | 75d9e71 | `feat(42-02)`: proxy `cc-padrao`, `carregarCcPadrao`, checkbox opt-in, avisos de sucesso/falha |

## Verificacao (todas as `<automated>` passaram)

- Baseline apos ff-only: `email-envio` 18 passed. Final: 26 passed; suite `cobranca` completa: 6 suites, 58 passed.
- `prisma generate` ok; `prisma validate` "is valid" (com `DATABASE_URL` dummy; nenhum banco tocado).
- `tsc --noEmit` backend e frontend: exit 0.
- `@Public()` (sem comentarios) no `cobranca.controller.ts`: 3 (inalterado).
- Greps de aceite: proxy com 2 handlers e 2 `requireAdminSession(req)`; `page.tsx` com 2 chamadas a `/api/cobranca/email/cc-padrao/`, 1 "Salvar como padrão deste cliente", `carregarCcPadrao` 2x.
- Athos intocado: sem diff em `integrations/athos` desde d2a7709.

## Deviations from Plan

None - plan executed as written. Pequenos acrescimos dentro da tarefa 2: contador `emailCcCargaSeq` (useRef) para descartar resposta do GET de uma abertura anterior do modal (evita sobrescrever chips apos reabrir), e `assertIdCliente` privado no service para compartilhar a validacao de id entre os dois metodos.

## Itens `<human-check>` pendentes (fim da fase)

- **Task 2:** com backend + Postgres + SMTP reais: (1) abrir o modal de e-mail de um boleto, adicionar 2 CC, marcar "Salvar como padrão deste cliente" e enviar; (2) abrir o modal de outro boleto do MESMO cliente; (3) remover um chip, adicionar outro, enviar SEM marcar o checkbox; (4) reabrir; (5) remover todos os chips, marcar o checkbox e enviar; (6) reabrir. Esperado: (2) abre com os 2 CC como chips; (4) continua com os 2 CC de (1); (6) abre sem CC; em (1) e (5) o sucesso mostra "Lista de cópia salva como padrão deste cliente.".
- Aplicar as migrations no deploy (`prisma migrate deploy` via `scripts/bootstrap-runtime.sh`); a nova tabela nao foi aplicada em nenhum banco.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat_model do plano (T-42-07..11 mitigados; risco residual herdado: `requireAdminSession` e inerte sem `CONFIG_PANEL_PASSWORD`).

## Self-Check: PASSED

- Arquivos criados/modificados presentes (migration, DTO, proxy, schema, service, teste, controller, page.tsx).
- Commits 6bc0a71, 7b05a6b, 75d9e71 presentes na branch `worktree-agent-a3c7550ecc209d609`.
