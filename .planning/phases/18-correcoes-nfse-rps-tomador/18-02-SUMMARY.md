---
phase: 18-correcoes-nfse-rps-tomador
plan: "02"
subsystem: nfse
tags: [nfse, rps, tomador, fallback, athos]
dependency_graph:
  requires: []
  provides: [log-rps-clarificado, fallback-tomador-por-nome]
  affects: [nfse.service.ts]
tech_stack:
  added: []
  patterns: [inline-fallback, buscarClientes-por-nome]
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
decisions:
  - "Log RPS atualizado para deixar explicito que AUXILIARRPS retorna proximo diretamente (sem +1)"
  - "Fallback por nome implementado como bloco inline em dois pontos de buscarTomador() — nao extraido para metodo separado, para manter fluxo visivel"
  - "Resultado ambiguo (>1 item) descartado sem populacao de CPF/CNPJ (T-18-02-02 mitigado)"
metrics:
  duration: "12m"
  completed: 2026-05-04
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 18 Plan 02: Log RPS clarificado e fallback de tomador por nome

Log de RPS atualizado para explicitar que AUXILIARRPS retorna o proximo numero diretamente (sem +1), e buscarTomador() ganhou fallback via buscarClientes({ nome }) em dois caminhos de falha.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Clarificar log RPS em emitir() — sem +1 | 2f13c3b | apps/backend/src/modules/integrations/nfse/nfse.service.ts |
| 2 | Adicionar fallback por nome em buscarTomador() | ca9c1f4 | apps/backend/src/modules/integrations/nfse/nfse.service.ts |

## Verification Results

### 1. Log RPS clarificado
```
549: this.logger.log(`[RPS] AUXILIARRPS proximoRPS=${rpsNumero} serie=${rpsSerie} (proximo a emitir — sem +1)`);
```
Resultado: PASSOU

### 2. Sem +1 no codigo RPS
```
(vazio — correto)
```
Resultado: PASSOU — nenhuma referencia a `proximoRps + 1`

### 3. Fallback de tomador por nome (>= 2 matches)
```
383: [Tomador] fallback nome="${nomeBusca}" → encontrado: ...
387: [Tomador] fallback nome="${nomeBusca}" → ambiguo ou ausente...
392: [Tomador] fallback nome="${nomeBusca}" → erro: ...
437: [Tomador] fallback nome="${nomeBusca}" → encontrado: ...
441: [Tomador] fallback nome="${nomeBusca}" → ambiguo ou ausente...
446: [Tomador] fallback nome="${nomeBusca}" → erro: ...
```
Resultado: PASSOU — 6 ocorrencias (3 por caminho x 2 caminhos)

### 4. buscarClientes presente (>= 2 matches)
```
373: await this.athosService.buscarClientes({ nome: nomeBusca, take: 1 });
427: await this.athosService.buscarClientes({ nome: nomeBusca, take: 1 });
```
Resultado: PASSOU

### 5. TypeScript sem erros
```
npx tsc --noEmit — saiu com codigo 0 (sem output)
```
Resultado: PASSOU

## Linhas Alteradas em nfse.service.ts

**Task 1 — linha 497 (agora linha 549 apos insercoes da Task 2):**
- Antes: `this.logger.log(\`[RPS] ProximoRPS=${rpsNumero} SerieRPS=${rpsSerie}\`);`
- Depois: `this.logger.log(\`[RPS] AUXILIARRPS proximoRPS=${rpsNumero} serie=${rpsSerie} (proximo a emitir — sem +1)\`);`

**Task 2 — linha 370 (Insercao 1, apos NotFoundException warn):**
- Adicionadas 26 linhas: fallback `buscarClientes({ nome: quote.customer?.fullName, take: 1 })`

**Task 2 — linha 421 (Insercao 2, dentro do else de idcliente=0):**
- Adicionadas 26 linhas: fallback `buscarClientes({ nome: athosData.mapped.cliente ?? quote.customer?.fullName, take: 1 })`

## Deviations from Plan

None - plan executed exactly as written.

## Threat Scan

Nenhuma nova superficie de rede ou caminho de autenticacao adicionada. buscarClientes() ja existia na interface do AthosService. T-18-02-02 mitigado conforme planejado: resultado ambiguo (>1) descartado sem populacao de documento.

## Known Stubs

None.

## Self-Check: PASSED

- [x] Commit 2f13c3b existe: `fix(18-02): clarificar log RPS — AUXILIARRPS retorna proximo diretamente`
- [x] Commit ca9c1f4 existe: `feat(18-02): adicionar fallback por nome em buscarTomador()`
- [x] SUMMARY.md criado em `.planning/phases/18-correcoes-nfse-rps-tomador/18-02-SUMMARY.md`
- [x] `grep "AUXILIARRPS proximoRPS"` retornou match
- [x] `grep "proximoRps + 1"` retornou vazio
- [x] `grep "fallback nome"` retornou >= 2 matches
- [x] `grep "buscarClientes"` retornou >= 2 matches
- [x] `npx tsc --noEmit` saiu com codigo 0
