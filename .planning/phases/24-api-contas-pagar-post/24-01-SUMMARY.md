---
phase: 24-api-contas-pagar-post
plan: 24-01
subsystem: backend/integrations/athos
tags: [nestjs, pg-pool, dto, class-validator, auth-fix, security]
dependency_graph:
  requires: []
  provides: [POST /athos/contas-pagar, validateAthosToken(), criarContaPagar(), statusconta filter]
  affects: [athos.controller.ts, athos.service.ts]
tech_stack:
  added: [CreateContaPagarDto (class-validator)]
  patterns: [fail-closed auth, pg.Pool INSERT with RETURNING, findExistingTable auto-detect]
key_files:
  created:
    - apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
decisions:
  - "validateAthosToken() throws InternalServerErrorException (500) when ATHOS_API_TOKEN absent — fail-closed by design"
  - "criarContaPagar() uses findExistingTable() to auto-detect table name, same pattern as listarContasPagar()"
  - "CAST($2 AS date) explicit cast for dmdata columns in INSERT (datavencimento, dataemissao)"
  - "idfornecedor uses @IsInt() not @IsNumber() — FK must be integer"
metrics:
  duration: 2 minutes
  completed: 2026-05-09
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
  files_created: 1
---

# Phase 24 Plan 01: DTO + validateAthosToken() + criarContaPagar() + statusconta filter Summary

**One-liner:** POST /athos/contas-pagar endpoint com DTO class-validator, auth fail-closed via validateAthosToken(), INSERT usando findExistingTable() com RETURNING, e filtro statusconta condicional no GET.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar DTO CreateContaPagarDto | 4d79bb6 | dto/create-conta-pagar.dto.ts (created) |
| 2 | Corrigir auth fail-closed e adicionar POST | 0220728 | athos.controller.ts (modified) |
| 3 | Implementar criarContaPagar() e statusconta | cd3fe55 | athos.service.ts (modified) |

## Files Created/Modified

### Created: `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts`

DTO com 7 campos:
- **Obrigatorios:** `descricaoconta` (IsString+IsNotEmpty), `datavencimento` (IsDateString), `valorconta` (IsNumber+Min(0.01))
- **Opcionais:** `dataemissao` (IsOptional+IsDateString), `observacao` (IsOptional+IsString), `idfornecedor` (IsOptional+IsInt), `numerodocumento` (IsOptional+IsString+MaxLength(50))

### Modified: `apps/backend/src/modules/integrations/athos/athos.controller.ts`

**Metodo privado adicionado:**
```typescript
private validateAthosToken(authorization?: string, xApiToken?: string): void
```
- Lanca `InternalServerErrorException` (500) quando `ATHOS_API_TOKEN` ausente no env — fail-closed
- Lanca `UnauthorizedException` (401) quando token incorreto ou ausente no header

**Endpoints atualizados:**
- `GET /athos/contas-pagar` — `this.validateAthosToken()` substituiu bloco `if(requiredToken)`; adicionado `@Query("statusconta")`
- `GET /athos/clientes` — `this.validateAthosToken()` substituiu bloco `if(requiredToken)`
- `POST /athos/contas-pagar` (NOVO) — `this.validateAthosToken()` + `this.athosService.criarContaPagar(dto)`

**Bug corrigido:** Vulnerabilidade HIGH (CONCERNS.md) eliminada — `if (requiredToken)` removido de todos os endpoints.

### Modified: `apps/backend/src/modules/integrations/athos/athos.service.ts`

**Assinatura atualizada:**
```typescript
async listarContasPagar(dataInicio?: string, dataFinal?: string, statusconta?: string)
```
Filtro condicional adicionado apos filtros de data:
```typescript
if (typeof statusconta === "string" && statusconta.trim()) {
  params.push(statusconta.trim().toUpperCase());
  conditions.push(`statusconta = $${params.length}`);
}
```

**Metodo novo:**
```typescript
async criarContaPagar(dto: CreateContaPagarDto): Promise<{ idcontapagar: number }>
```
- Usa `findExistingTable(client, candidates)` para resolver nome real da tabela
- INSERT com 7 parametros posicionais `$1..$7` (sem interpolacao de string com dados do usuario)
- `CAST($2 AS date)` e `CAST($4 AS date)` para `datavencimento` e `dataemissao` (tipo dmdata)
- `RETURNING idcontapagar` para retornar PK gerada pelo banco
- `client.release()` garantido em bloco `finally`
- Lanca `NotFoundException` se tabela nao encontrada

## Security Fix Confirmed

**CONCERNS.md HIGH vulnerability eliminada:**
- Antes: `if (requiredToken)` — quando `ATHOS_API_TOKEN` indefinido, bloco era pulado e endpoints ficavam publicos
- Depois: `if (!requiredToken) throw new InternalServerErrorException(...)` — fail-closed; sem modo aberto

Verificado: `grep -c "if (requiredToken)" athos.controller.ts` retorna `0`.

## Deviations from Plan

None — plan executed exactly as written.

## Build Verification

`cd apps/backend && npx tsc --noEmit` — PASSOU sem erros TypeScript.

## Self-Check: PASSED

- [x] `apps/backend/src/modules/integrations/athos/dto/create-conta-pagar.dto.ts` exists
- [x] `4d79bb6` commit exists
- [x] `0220728` commit exists
- [x] `cd3fe55` commit exists
- [x] TypeScript build clean (zero errors)
- [x] `validateAthosToken` appears 3x in controller (one per endpoint)
- [x] `if (requiredToken)` appears 0x in controller (bug removed)
- [x] `RETURNING idcontapagar` present in service
- [x] `findExistingTable` used in both `listarContasPagar` and `criarContaPagar`
