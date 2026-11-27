---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 03
subsystem: integrations/athos
tags: [athos, postgres-9.0.5, read-only, proposta, custo, cliente]
requires: []
provides:
  - AthosOrcamentoService.buscarProdutosProposta / obterProdutoProposta (preco base + custo unitario corrigido)
  - AthosService.buscarClienteParaProposta (razao social real, endereco por campo sem fallback)
  - razaoSocial aditivo em AthosService.buscarClientes
  - AthosOrcamentoService exportado pelo AthosModule
affects: [55-06, 55-07]
tech-stack:
  added: []
  patterns: [leitura em transacao READ ONLY + ROLLBACK, COALESCE por termo, DISTINCT ON sem LATERAL]
key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-orcamento-proposta-leitura.test.ts
    - apps/backend/src/modules/integrations/athos/athos-proposta-leitura.clone.it.test.ts
    - apps/backend/src/modules/integrations/athos/athos.service.cliente-proposta.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.module.ts
key-decisions:
  - "Custo unitario da proposta com COALESCE em cada termo (imposto, ipi, frete, outroimposto); SQL_LER_PRODUTOS da Fase 44 permanece intocado (D-24, D-30)."
  - "Busca de produto da proposta reimplementada como codigo proprio, sem extrair a funcao da Fase 44."
  - "buscarClienteParaProposta devolve null para dado ausente; endereco inteiro null quando nenhum campo existe (D-25)."
requirements-completed: [P55-PRECO, P55-MONT, P55-CLI]
duration: 25 min
completed: 2026-11-27
status: complete
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
plan_head_before: 40ff1b1ac80df9fc1ca2d9b66d7cab2b5039426f
plan_head_after: 00dd45e3f02f4c9ac32029ca3bfa93458d7c2045
---

# Phase 55 Plan 03: Leituras Athos para a proposta Summary

Leituras somente leitura do Athos para a montagem da proposta: produto com preco base e custo unitario corrigido (COALESCE por termo, D-24) e cliente com razao social real e endereco sem dados inventados (D-25), em metodos novos sem tocar na rota da IA nem na Fase 44.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Produto com preco base e custo corrigido + export do servico | 79c6c82 |
| 2 | Cliente para proposta com razao social real e razaoSocial aditivo | 00dd45e |

## Accomplishments

- `buscarProdutosProposta` / `obterProdutoProposta` (`ProdutoPropostaResultado`) via `lerSomenteLeitura` (BEGIN, SET TRANSACTION READ ONLY, timeout, ROLLBACK); SQL so com parametros `$n`.
- IT no clone athos-teste: escolhe dinamicamente produto com `imposto IS NULL` e custo positivo; prova custo > 0 e que a formula da Fase 44 daria 0 para o mesmo produto (D-24). Executado: 2 testes passaram (nao skipped).
- `AthosOrcamentoService` exportado em `AthosModule` para o PropostasModule (55-06).
- `buscarClienteParaProposta` (`ClientePropostaDetalhe`): SELECT unico com `DISTINCT ON`, sem LATERAL; campos ausentes viram null; nenhum fallback Centro/S-N/SP/3520400. Query validada contra o clone.
- `buscarClientes` ganhou `razaoSocial` aditivo; `nome`, `documento` e `endereco` inalterados (NFS-e e TomadorAthosSearch preservados).

## Verification

- `athos-orcamento*`: 5 suites passaram + 1 skipped (IT), 115 testes. Suites da Fase 44 (service, calc.util, idempotencia, controller) verdes e sem alteracao.
- IT de leitura no clone: 2 passed.
- `athos.service.cliente-proposta`, `athos.controller`, `athos.service`: 3 suites, 87 testes passaram.
- `tsc --noEmit` do backend limpo.
- Guards de git diff nos arquivos da Fase 44 (controller e testes): sem alteracao.
- Limite de verificacao: clone e PostgreSQL 14, producao e 9.0.5; compatibilidade verificada por revisao do texto SQL (somente construcoes ja usadas na Fase 44).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma client nao gerado no worktree**
- **Found during:** Task 1 (verificacao)
- **Issue:** Suites idempotencia/controller/clone.it da Fase 44 falhavam com TS2694 (`Prisma.InputJsonValue`) por `node_modules` recem-instalado sem client gerado.
- **Fix:** `npm ci` + `npm --prefix apps/backend run prisma:generate` (artefatos em node_modules, nada versionado).
- **Files modified:** nenhum arquivo versionado.

**Total deviations:** 1 (ambiente). **Impact:** nenhum no codigo entregue.

## Known Stubs

None.

## Threat Flags

None. Nenhuma superficie nova alem do mapeado em T-55-06/07/08: custo so existe nos metodos novos (rota da IA e `ProdutoOrcamentoResultado` intactos).

## Self-Check: PASSED

- Arquivos criados e modificados existem; commits 79c6c82 e 00dd45e presentes na branch.
