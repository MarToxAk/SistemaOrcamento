---
phase: 28-pagina-detalhe-cliente
plan: 01
subsystem: api
tags: [nestjs, prisma, postgresql, athos, contas-receber]

# Dependency graph
requires:
  - phase: 27-contas-receber-dashboard
    provides: buscarTitulosClienteContasReceber e padrão validateAthosToken já estabelecidos
provides:
  - GET /athos/contas-receber/cliente/:idcliente/dados com dados cadastrais do cliente
  - AthosService.buscarDadosClienteContasReceber() com JOIN cliente+fisico+juridico
  - Modelos Prisma CobrancaBoleto, CobrancaBoletoTitulo, NfseEmitida, NfseEmitidaTitulo
  - Migration aplicada em produção (20260522155308_add_cobranca_boleto_nfse_emitida)
affects:
  - 28-02-frontend
  - 29-boleto-consolidado
  - 30-nfse-titulos

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AthosService: PoolClient adquirido, query parametrizada com $1, try/finally client.release()"
    - "AthosController: rota protegida por validateAthosToken, validação de idcliente com Number.isFinite"
    - "Prisma: modelos com @db.Decimal(12,2), @updatedAt, @@index em FKs"

key-files:
  created:
    - apps/backend/prisma/migrations/20260522155308_add_cobranca_boleto_nfse_emitida/migration.sql
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/backend/prisma/schema.prisma

key-decisions:
  - "Método buscarDadosClienteContasReceber usa COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial) para nome unificado PF/PJ"
  - "pickString helper reutilizado para campos nullable; campos numéricos convertidos com Number()"
  - "NotFoundException adicionado ao import do controller para 404 quando idcliente não existe"
  - "Migration aplicada diretamente em produção (DATABASE_URL disponível no .env)"

patterns-established:
  - "Rota de dados cadastrais separada da rota de títulos — responsabilidade única por endpoint"
  - "Novos modelos Prisma adicionados ao final do schema sem modificar modelos existentes (migration aditiva)"

requirements-completed:
  - CLI-01

# Metrics
duration: 20min
completed: 2026-05-22
---

# Phase 28 Plan 01: Backend Dados Cadastrais Cliente + Schema Prisma Summary

**Endpoint GET /athos/contas-receber/cliente/:idcliente/dados com JOIN PF/PJ e 4 modelos Prisma migrados para pre-requisitos de boleto e NFS-e**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-22T15:45:00Z
- **Completed:** 2026-05-22T16:05:00Z
- **Tasks:** 2
- **Files modified:** 3 (+ 1 migration criada)

## Accomplishments

- Método `buscarDadosClienteContasReceber(idcliente)` no AthosService com query SQL de JOIN `cliente` + `cliente_fisico` + `cliente_juridico`, retornando nome unificado PF/PJ via COALESCE
- Rota `GET /athos/contas-receber/cliente/:idcliente/dados` no AthosController, protegida por `validateAthosToken`, com validação 400 para idcliente inválido e 404 para cliente inexistente
- 4 modelos Prisma adicionados: `CobrancaBoleto`, `CobrancaBoletoTitulo`, `NfseEmitida`, `NfseEmitidaTitulo` — migration aplicada com sucesso em produção

## Task Commits

1. **Task 1: buscarDadosClienteContasReceber + rota GET dados** - `e62676a` (feat)
2. **Task 2: 4 modelos Prisma + migration** - `4954ca9` (feat)

**Plan metadata:** (a seguir — commit docs)

## Files Created/Modified

- `apps/backend/src/modules/integrations/athos/athos.service.ts` - Novo método `buscarDadosClienteContasReceber()` com JOIN PF/PJ
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` - Nova rota `GET contas-receber/cliente/:idcliente/dados`; `NotFoundException` adicionado ao import
- `apps/backend/prisma/schema.prisma` - 4 novos modelos ao final do arquivo
- `apps/backend/prisma/migrations/20260522155308_add_cobranca_boleto_nfse_emitida/migration.sql` - Migration SQL gerada e aplicada

## Decisions Made

- Reutilizado o helper `pickString` para campos de string nullable, mantendo consistência com os demais métodos do AthosService
- `NotFoundException` importado no controller para retornar 404 correto quando cliente não existe no Athos
- Migration executada diretamente com DATABASE_URL do `.env` (72.60.253.108:5435) — tabelas criadas em produção

## Deviations from Plan

None — plano executado exatamente como especificado.

## Issues Encountered

- `npx prisma validate` sem DATABASE_URL retorna erro P1012; solução: executar com `DATABASE_URL=` prefixado na CLI (comportamento esperado do Prisma)
- `prisma generate` emitiu aviso EPERM ao tentar substituir `query_engine-windows.dll.node` (arquivo em uso); migration foi aplicada com sucesso; o generate pode ser re-executado após reiniciar o processo

## Known Stubs

Nenhum — este plano é backend puro (service + controller + schema). Sem UI ou dados hardcoded.

## Threat Flags

Nenhuma nova superfície de rede ou auth path criada além do endpoint documentado no threat model do plano (T-28-01 mitigado por validateAthosToken).

## Next Phase Readiness

- Endpoint `GET /athos/contas-receber/cliente/:idcliente/dados` pronto para consumo pelo Route Handler do Next.js (Phase 28-02)
- Modelos `CobrancaBoleto` e `NfseEmitida` criados no banco — Phase 29 (boleto) e Phase 30 (NFS-e) podem fazer INSERT diretamente
- TypeScript compila sem erros (`npx tsc --noEmit` passou)

## Self-Check

- [x] `apps/backend/src/modules/integrations/athos/athos.service.ts` — método `buscarDadosClienteContasReceber` presente
- [x] `apps/backend/src/modules/integrations/athos/athos.controller.ts` — rota `contas-receber/cliente/:idcliente/dados` presente
- [x] `apps/backend/prisma/schema.prisma` — modelos `CobrancaBoleto`, `CobrancaBoletoTitulo`, `NfseEmitida`, `NfseEmitidaTitulo` presentes
- [x] Migration `20260522155308_add_cobranca_boleto_nfse_emitida/migration.sql` criada e aplicada
- [x] Commits `e62676a` e `4954ca9` existem no histórico

## Self-Check: PASSED

---
*Phase: 28-pagina-detalhe-cliente*
*Completed: 2026-05-22*
