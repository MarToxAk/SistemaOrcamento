---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 05
subsystem: nfse
tags: [nfse, seguranca, prisma, migration, auditoria, senha-liberacao]
requires: []
provides:
  - model e tabela NfseLiberacao (auditoria da liberacao por senha, sem FK para Quote)
  - nfse-liberacao.util (senhaConfere, LimitadorFalhas, resolverIpOperador, sanitizarLiberadoPor, NFSE_OVERRIDE_ENV)
  - campos senhaLiberacao e liberadoPor em EmitirNfseNacionalDto
  - script validar-migration-descartavel.sh
affects: [54-06]
tech-stack:
  added: []
  patterns: [sha256 + timingSafeEqual, limitador de falhas em memoria, migration aditiva idempotente]
key-files:
  created:
    - apps/backend/prisma/migrations/20261125120000_add_nfse_liberacao/migration.sql
    - apps/backend/scripts/validar-migration-descartavel.sh
    - apps/backend/src/modules/integrations/nfse/nfse-liberacao.util.ts
    - apps/backend/src/modules/integrations/nfse/nfse-liberacao.util.test.ts
    - apps/backend/src/modules/integrations/nfse/dto/emitir-nfse-nacional.dto.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/integrations/nfse/dto/emitir-nfse-nacional.dto.ts
key-decisions:
  - "NfseLiberacao sem @relation com Quote: a fusao de orcamentos apaga Quote e a trilha de auditoria precisa sobreviver (quoteId e quoteNumero ficam na linha)."
  - "senhaConfere devolve false para qualquer lado vazio/ausente; este util nao le env nem guarda segredo."
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 5
plan_head_before: 9fc19b1870407549f16dd0e31fa4b1170fc38959
plan_head_after: ba6a52b
duration: ~25min
completed: 2026-11-25
---

# Phase 54 Plan 05: Base da liberacao por senha da NFS-e Summary

Tabela de auditoria NfseLiberacao (migration aditiva, idempotente, provada em Postgres Docker descartavel), utilitarios de seguranca (sha256 + timingSafeEqual, limitador de falhas 5/IP e 20 globais por 15 min, IP e nome do operador) e campos novos do DTO de emissao, tudo com testes.

## Tarefas

| Tarefa | Descricao | Commits |
|--------|-----------|---------|
| 1 | model NfseLiberacao, migration idempotente, script de validacao descartavel | 136dcb0 |
| 2 | nfse-liberacao.util (TDD: RED b8d1ce1, GREEN 60d0216) | b8d1ce1, 60d0216 |
| 3 | senhaLiberacao e liberadoPor no DTO (TDD: RED 236fbbe, GREEN ba6a52b) | 236fbbe, ba6a52b |

## Verificacao

- Migration: `validar-migration-descartavel.sh ... NfseLiberacao 13` aplicou o SQL duas vezes em postgres:16-alpine descartavel (127.0.0.1:55454), 13 colunas, container removido ao final (trap EXIT). Nada tocou o Athos nem producao.
- `prisma validate` OK e `prisma generate` OK (DATABASE_URL de mentira).
- `npm --prefix apps/backend run test -- src/modules/integrations/nfse`: 9 suites, 68 testes verdes (24 do util + 7 do DTO + os existentes).
- `tsc -p tsconfig.json --noEmit`: limpo.
- Nenhuma senha real em codigo, testes, migration ou schema (literais de teste obviamente falsos; sem coluna de senha/hash).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio] Caracteres U+2028/U+2029 literais no regex de sanitizarLiberadoPor**
- **Found during:** Task 2 (GREEN)
- **Issue:** a classe de caracteres do regex ficou com separadores de linha literais e quebrou o parse TS.
- **Fix:** removidos; `\s+` ja colapsa U+2028/U+2029, comportamento coberto pelos testes.
- **Files modified:** nfse-liberacao.util.ts (antes do commit GREEN)

**2. [Observacao de ambiente] `prisma generate` gravou o cliente no node_modules do repositorio principal**
- O worktree nao tem node_modules proprio (resolucao sobe ate /root/SistemaOrcamento/node_modules), entao o cliente Prisma regenerado com NfseLiberacao fica no node_modules compartilhado. Inofensivo (tipos aditivos), mas outros worktrees que rodarem `prisma generate` com o schema sem o model sobrescrevem; o plano 54-06 deve rodar `prisma generate` apos o merge.

**3. [Observacao] Ledger do plan head**
- O arquivo `gsd-plan-head-before-54-05` nao pode ser gravado em .git do worktree (sandbox bloqueou). A base foi registrada no frontmatter (`plan_head_before` = HEAD de inicio, 9fc19b1) e `commits` foi medido por `git log 9fc19b1..HEAD` (5 commits).

STATE.md e ROADMAP.md nao foram atualizados neste worktree (execucao paralela em wave; evita conflito de merge). Fica a cargo do orquestrador.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum novo alem do threat_model do plano (T-54-12 a T-54-15 mitigados: sem coluna de senha, sha256+timingSafeEqual, limitador pronto, sem FK para Quote).

## Self-Check: PASSED

Arquivos criados/alterados existem e os 5 commits estao no HEAD (136dcb0, b8d1ce1, 60d0216, 236fbbe, ba6a52b).
