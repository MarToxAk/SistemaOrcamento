---
phase: 31-hist-rico-nfs-e-consulta-nf-athos
plan: "01"
subsystem: backend/cobranca
tags: [nfse, cobranca, prisma, nestjs, tdd]
dependency_graph:
  requires: []
  provides: [buscarNfseEmitidaCliente, "GET /cobranca/nfse/cliente/:idclienteAthos"]
  affects: [cobranca.service.ts, cobranca.controller.ts]
tech_stack:
  added: []
  patterns: [Prisma findMany com include, ParseIntPipe no controller, TDD RED/GREEN]
key_files:
  created:
    - apps/backend/src/modules/cobranca/cobranca.service.cliente.test.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
decisions:
  - "buscarNfseEmitidaCliente usa Number(n.valorServico) identico ao padrao de buscarBoletosCliente — consistencia de conversao Decimal->Number"
  - "titulos retornados como number[] (apenas idcontareceber) — sem valor pois consumer precisa so de vinculo"
  - "Rota posicionada apos DELETE nfse/:id para agrupar rotas de NFS-e no controller"
metrics:
  duration: "~15 min"
  completed: "2026-05-27T16:52:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 31 Plan 01: Historico NFS-e Cliente — Backend Summary

**One-liner:** Metodo `buscarNfseEmitidaCliente` no CobrancaService com rota `GET /cobranca/nfse/cliente/:idclienteAthos`, lendo NfseEmitida via Prisma com titulos vinculados, seguindo TDD RED/GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED  | Testes unitarios buscarNfseEmitidaCliente (falham) | 2fd58ec | cobranca.service.cliente.test.ts |
| Task 1 GREEN | Implementar CobrancaService.buscarNfseEmitidaCliente | fa672a2 | cobranca.service.ts + cobranca.service.cliente.test.ts |
| Task 2 | Expor GET /cobranca/nfse/cliente/:idclienteAthos | 6971bc4 | cobranca.controller.ts |

## What Was Built

### CobrancaService.buscarNfseEmitidaCliente(idclienteAthos: number)

Metodo publico assincrono adicionado em `cobranca.service.ts`. Executa `prisma.nfseEmitida.findMany` com:
- `where: { idclienteAthos }` — filtra NFS-e do cliente
- `orderBy: { dataEmissao: "desc" }` — mais recentes primeiro
- `include: { titulos: { select: { idcontareceber: true } } }` — inclui titulos vinculados

Retorno mapeado: `{ id, numeroNfse, numeroRps, valorServico: Number(...), linkNfse, dataEmissao, titulos: number[] }`

### GET /cobranca/nfse/cliente/:idclienteAthos

Rota adicionada no `CobrancaController`, posicionada apos `DELETE nfse/:id` para agrupar rotas NFS-e. Usa `ParseIntPipe` identico ao padrao de `boletosCliente`. Autenticacao via `InternalAuthGuard` global (sem guard adicional).

### Testes unitarios (cobranca.service.cliente.test.ts)

3 cenarios cobrindo:
1. Cliente com 2 NFS-e: retorna array com 2 entradas, titulos mapeados corretamente
2. Cliente sem NFS-e: retorna `[]` sem erro
3. Conversao de valorServico: `Number(Decimal)` resulta em `number` (tipo verificado)

## Verification Results

- `npx jest cobranca.service.cliente --silent`: 3/3 testes passando
- `npx tsc -p tsconfig.build.json --noEmit`: sem erros de compilacao
- `grep buscarNfseEmitidaCliente cobranca.service.ts`: linha 597 (definicao do metodo)
- `grep nfseEmitida.findMany cobranca.service.ts`: linha 602 (uso de Prisma)
- `grep "@Delete(\"nfse/:id\")"`: count = 1 (DELETE existente nao duplicado)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock Decimal no teste usava `.toNumber()` mas `Number(obj)` retorna NaN para objetos arbitrarios**
- **Found during:** Task 1 GREEN — testes falhavam com `valorServico: NaN`
- **Issue:** O Prisma Decimal real possui `valueOf()` configurado, que `Number()` usa. O mock inicial usou `{ toNumber: () => valor }` (API Prisma) mas `Number()` invoca `valueOf()`, nao `toNumber()`.
- **Fix:** Ajustados os mocks para `{ valueOf: () => valor, toString: () => "valor" }` — simula corretamente o comportamento do Decimal do Prisma com `Number()`.
- **Files modified:** cobranca.service.cliente.test.ts
- **Commit:** fa672a2

## TDD Gate Compliance

- RED commit: 2fd58ec (`test(31-01): add failing tests for buscarNfseEmitidaCliente`)
- GREEN commit: fa672a2 (`feat(31-01): implementar CobrancaService.buscarNfseEmitidaCliente`)
- Sequencia RED -> GREEN: OK

## Known Stubs

Nenhum — metodo consulta o banco real via Prisma, sem dados hardcoded ou placeholder.

## Threat Flags

Nenhum — endpoints criados estao dentro do perimetro do `<threat_model>` do plano:
- T-31-01 mitigado: `ParseIntPipe` rejeita valores nao-inteiros para `:idclienteAthos`
- T-31-02 mitigado: rota nao decorada com `@Public()`, protegida pelo `InternalAuthGuard` global

## Self-Check

- [x] cobranca.service.cliente.test.ts existe: FOUND
- [x] buscarNfseEmitidaCliente em cobranca.service.ts: FOUND (linha 597)
- [x] nfse/cliente/:idclienteAthos em cobranca.controller.ts: FOUND (linha 61)
- [x] Commits 2fd58ec, fa672a2, 6971bc4: FOUND
- Self-Check: PASSED
