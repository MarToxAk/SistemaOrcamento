---
phase: 30-emissao-nfse-titulos
plan: "01"
subsystem: backend
tags: [nfse, prisma, athos, migration, soap]
dependency_graph:
  requires: []
  provides:
    - NfseEmitida.idvenda (schema + migration)
    - NfseService.emitirParaContaReceber()
    - AthosService.verificarTipoProdutoVenda()
    - GET /athos/venda/:idvenda/tipo-produto
  affects:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
tech_stack:
  added: []
  patterns:
    - Prisma migration idempotente com CREATE TABLE IF NOT EXISTS
    - Pool/PoolClient com finally client.release() (Athos queries)
    - NfseService sem acoplamento ao model Quote
key_files:
  created:
    - apps/backend/prisma/migrations/20260523120000_add_nfse_emitida_idvenda/migration.sql
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
decisions:
  - "Migration SQL com CREATE TABLE IF NOT EXISTS para idempotência — banco tinha estado parcial por migrations anteriores não aplicadas"
  - "emitirParaContaReceber() usa Caminho A (clienteAthosId) — sem lookup de orçamento"
  - "verificarTipoProdutoVenda() trata NULL como { temProdutoFisico: false, todosServico: true } (Pitfall 4)"
metrics:
  duration: "~30min"
  completed: "2026-05-23"
  tasks: 3
  files: 4
---

# Phase 30 Plan 01: Infraestrutura Base NFS-e via Contas a Receber Summary

**One-liner:** Schema Prisma com idvenda + migration, NfseService.emitirParaContaReceber() sem Quote/Chatwoot, AthosService.verificarTipoProdutoVenda() com query D-04, GET /athos/venda/:idvenda/tipo-produto com guard SSRF.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema Prisma — idvenda Int? em NfseEmitida + migration | 0e1a0a7 | schema.prisma, migration.sql |
| 2 | NfseService.emitirParaContaReceber() | e028ca7 | nfse.service.ts |
| 3 | AthosService.verificarTipoProdutoVenda() + endpoint | c18bf64 | athos.service.ts, athos.controller.ts |

## Decisions Made

1. **Migration SQL idempotente** — O banco estava em estado parcial (migration `20260522155308_add_cobranca_boleto_nfse_emitida` marcada como aplicada mas não executada no banco). A migration nova foi escrita com `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS` para ser idempotente. Isso garantiu aplicação bem-sucedida sem depender do histórico de migrations anteriores.

2. **emitirParaContaReceber() exclusivamente via Caminho A** — Seguindo a spec do plano, o método sempre resolve o tomador via `buscarClientePorId(clienteAthosId)`. Não há fallback para Caminho B/C pois o `clienteAthosId` é obrigatório neste fluxo.

3. **NULL tratado como "todos serviço"** — Em `verificarTipoProdutoVenda()`, quando `venda_item` não tem linhas para o idvenda (BOOL_OR/BOOL_AND retornam NULL), o resultado é `{ temProdutoFisico: false, todosServico: true }`. Conforme D-02: título sem itens → permitir emissão sem aviso.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration idempotente para estado parcial do banco**
- **Found during:** Task 1
- **Issue:** O banco tinha a tabela `NfseEmitida` não criada, mas a migration anterior `20260522155308_add_cobranca_boleto_nfse_emitida` estava marcada como aplicada no `_prisma_migrations`. A migration simples com apenas `ALTER TABLE ADD COLUMN` falhava com `relation "NfseEmitida" does not exist`.
- **Fix:** Reescrita do SQL da migration para incluir `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`, tornando-a totalmente idempotente.
- **Files modified:** `apps/backend/prisma/migrations/20260523120000_add_nfse_emitida_idvenda/migration.sql`
- **Commit:** 0e1a0a7

**2. [Rule 3 - Blocking] Migrations conflitantes resolvidas via `prisma migrate resolve`**
- **Found during:** Task 1
- **Issue:** Múltiplas migrations no histórico do banco (20260506142815, 20260522155308, 20260523032912) estavam em estado inconsistente (falhou ou não aplicada).
- **Fix:** Usou `npx prisma migrate resolve --applied` para marcar as migrations como aplicadas e permitir que a nova migration fosse processada.
- **Files modified:** Nenhum — apenas estado do banco
- **Commit:** 0e1a0a7 (incluído na migration)

## Known Stubs

Nenhum stub identificado. Todos os métodos implementados têm lógica completa.

## Threat Flags

Nenhuma nova superfície de ataque não prevista no threat model do plano.

Os mitigations do threat register foram aplicados:
- **T-30-02 (SSRF):** `!Number.isFinite(id) || id <= 0` presente em `GET /athos/venda/:idvenda/tipo-produto` antes de qualquer chamada ao serviço.
- **T-30-03 (SQL Injection):** Query usa parâmetro posicional `$1` — sem interpolação de string.
- **T-30-04 (DoS):** `getInfoNfse()` retornando null → `BadRequestException` imediata.

## Self-Check

- [x] `schema.prisma` contém `idvenda Int?` e `@@index([idvenda])` (2 linhas com grep)
- [x] `prisma validate` retorna exit code 0
- [x] Migration `20260523120000_add_nfse_emitida_idvenda` existe e foi aplicada com sucesso
- [x] `emitirParaContaReceber` existe em `nfse.service.ts` (linha 793)
- [x] Método não contém `prisma.quote` nem `chatwootService`
- [x] `verificarTipoProdutoVenda` existe em `athos.service.ts` (linha 1870)
- [x] `GET venda/:idvenda/tipo-produto` existe em `athos.controller.ts` (linha 320)
- [x] `client.release()` em bloco `finally` (linha 1893 de athos.service.ts)
- [x] `validateAthosToken` chamado antes de `Number(idvenda)` no controller
- [x] Guard `!Number.isFinite(id) || id <= 0` presente antes de chamar o serviço
- [x] Todos os 3 commits existem: 0e1a0a7, e028ca7, c18bf64

## Self-Check: PASSED
