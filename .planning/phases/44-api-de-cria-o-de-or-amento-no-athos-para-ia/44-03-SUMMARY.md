---
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
plan: 03
subsystem: api
tags: [athos, orcamento, idempotencia, auditoria, prisma, nestjs]
requires:
  - phase: 44-01
    provides: AthosOrcamentoService.criarOrcamento (opts.ref), OrcamentoAthosError, DTO, controller base
provides:
  - model Prisma AthosOrcamentoIa + migration aditiva 20261109120000
  - AthosOrcamentoIdempotenciaService (executar, hashPayloadOrcamento, refDoOrcamento, IDEMPOTENCY_KEY_REGEX)
  - header Idempotency-Key no POST /api/athos/orcamentos
  - teste HTTP do controller e replay provado no clone
affects: [44-04]
tech-stack:
  added: []
  patterns: [reserva-primeiro com indice unico (P2002), auditoria pos-COMMIT que nunca esconde o orcamento]
key-files:
  created:
    - apps/backend/prisma/migrations/20261109120000_add_athos_orcamento_ia/migration.sql
    - apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.test.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.controller.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/integrations/athos/athos-orcamento.controller.ts
    - apps/backend/src/modules/integrations/athos/athos.module.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.clone.it.test.ts
key-decisions:
  - "Reserva da chave no banco do Sistema antes de tocar o Athos; nenhuma chamada ao Prisma entre o primeiro INSERT e o COMMIT no Athos."
  - "Falha de auditoria apos o COMMIT so loga idorcamento e ref; a reserva fica 'processando' (retry recebe 409, nunca duplica)."
  - "Simulacao (simular: true) nao consome chave nem grava auditoria."
patterns-established:
  - "Prisma falso em memoria no IT do clone: o IT nunca toca o banco do Sistema."
requirements-completed: [ORC-09, ORC-10]
status: complete
duration: ~35min
completed: 2026-11-09
commits: 5
plan_head_before: 995268a
plan_head_after: bec07e600d04397fc45ea755cb66e7f71760e2e3
actuals:
  tokens: 24000
  tasks: 3
  commits: 5
---

# Phase 44 Plan 03: Idempotencia e auditoria da criacao de orcamento pela IA Summary

**Header Idempotency-Key com reserva-primeiro no banco do Sistema (AthosOrcamentoIa, indice unico), replay sem duplicata provado no clone do Athos e auditoria de todo orcamento criado pela IA.**

## Performance

- Tasks: 3 de 3
- Commits do plano: 5 (RED/GREEN nas Tasks 2 e 3), alem do merge de 7b94d8c (995268a)

## Accomplishments

- Model `AthosOrcamentoIa` e migration aditiva/idempotente (CREATE TABLE/INDEX IF NOT EXISTS, 3 clausulas), conferida contra `prisma migrate diff --script` offline. Nenhum banco foi alterado; so `prisma generate` e `prisma validate`.
- `AthosOrcamentoIdempotenciaService.executar`: simulacao direta, chave validada (400), reserva unica com P2002 -> replay (`replay: true`) ou 409 (`IDEMPOTENCY_KEY_REUTILIZADA` / `IDEMPOTENCY_EM_PROCESSAMENTO`), liberacao da reserva em falha antes do COMMIT, auditoria apos o COMMIT (com chave: update; sem chave: create com `idempotencyKey: null`).
- Hash canonico (chaves ordenadas recursivamente, sem `simular`) e `ref` de 12 hex para o marcador `[IA] ref:` no obs do Athos.
- Controller le `@Headers("idempotency-key")` (rota segue protegida pelo guard global, sem `@Public`), `@ApiHeader` documentado em portugues; servico registrado em `athos.module.ts`.

## Testes

- `athos-orcamento-idempotencia`: 11 passed (I1..I11), RED commit antes do GREEN.
- `athos-orcamento.controller`: 8 passed (C1..C8; 4 falhavam no RED).
- IT no clone (`athos-orcamento.clone`): 4 passed, 0 skipped (IT1, IT2, IT3 replay com 1 unico orcamento por ref, IT4 409 com contagem 1). Rodado so contra 127.0.0.1:5440.
- `npm run test -- athos --no-coverage`: 471 passed, 4 skipped (os 4 do IT, que exigem ATHOS_IT_CLONE=1), 27 suites passed. Suite completa do backend: 749 passed, 4 skipped, 55 suites passed.
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: 0 erros. `prisma validate` (com DATABASE_URL ficticia, sem conexao): schema valido.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Conflito de merge em athos.module.ts**
- **Found during:** merge inicial de 7b94d8c
- **Issue:** alem de `.planning/ROADMAP.md`, `athos.module.ts` conflitou (lado HEAD vazio vs. registro de AthosOrcamentoService/Controller do 44-01).
- **Fix:** resolvido tomando o lado 7b94d8c (superconjunto), igual ao tratamento de `.planning/*`.
- **Commit:** 995268a (merge)

**2. [Rule 3 - Blocking] `prisma validate` exige DATABASE_URL**
- **Fix:** executado com URL ficticia inline (sem conexao a nenhum banco e sem ler .env).

**3. Comentarios do model**
- Campos usam comentarios `//` na mesma linha (convencao do model CobrancaBaixaAthosLog) em vez de `///` por campo; o comentario `///` do model foi mantido.

### Observacao

- A baseline "462 passed" do plano foi superada (471); os 4 testes do IT contam como skipped sem ATHOS_IT_CLONE.

## Issues Encountered

Nenhum. `payload.simular` ja existe em `CriarOrcamentoInput` (44-01); o DTO ainda nao o declara (44-02 acrescenta em paralelo) e o servico de idempotencia le o campo via tipo do servico, sem editar DTO.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat_model do plano (T-44-14..T-44-20 mitigados: reserva unica, hash canonico, auditoria, regex da chave, sem migrate).

## Next Phase Readiness

44-04 pode ler `AthosOrcamentoIa` (idorcamento, senhabalcao, resposta) para consulta/cancelamento. A migration precisa ser aplicada pelo `prisma migrate deploy` do deploy antes de o endpoint ser usado em producao com Idempotency-Key (sem a tabela, o POST falha na reserva).

## Self-Check: PASSED

- Arquivos criados/alterados presentes; commits a38a656, 0368b9f, b1bf922, 0addc0c, bec07e6 sao ancestrais de HEAD.
