---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 09
subsystem: infra
tags: [deploy, docker-compose, env, nfse, memoria, seguranca]
status: complete

requires: ["54-08"]
provides:
  - "NFSE_OVERRIDE_PASSWORD repassada aos dois composes do backend com padrao vazio e vazia em .env.example e stack.env.example"
  - "variaveis e avisos do iiBrasil removidos dos quatro arquivos de deploy/env"
  - "teste de contrato nfse-deploy.env.test.ts (12 casos)"
  - "memoria do iiBrasil marcada HISTORICO; memorias de EFI e NFS-e Nacional e INTEGRATIONS.md atualizadas"
affects: [54-11]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: bd4fd31096789760e881a98d4713f1066147a08e
plan_head_after: 6b609f6e398e41485e8c2093479544a8dff1fee1

key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/nfse-deploy.env.test.ts
  modified:
    - .env.example
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml
    - deploy/stack.env.example
    - memory/nfse-iibrasil-integracao.md
    - memory/MEMORY.md
    - memory/integration-efi.md
    - memory/nfse-nacional-sefin-integracao.md
    - .planning/codebase/INTEGRATIONS.md

key-decisions:
  - "D-09: NFSE_OVERRIDE_PASSWORD sempre vazia no repositorio; compose usa ${NFSE_OVERRIDE_PASSWORD:-} (padrao vazio = liberacao desligada)"
  - "D-11: memoria do iiBrasil preservada como HISTORICO (a integracao Nacional referencia o fallback de municipio)"

requirements-completed: [P54-IIB, P54-NFS]
duration: ~20min
completed: 2026-11-25
---

# Phase 54 Plan 09: Deploy sem iiBrasil, senha de liberacao vazia e memoria Summary

Os composes passam a repassar NFSE_OVERRIDE_PASSWORD (padrao vazio) ao container, as cinco variaveis do iiBrasil saem de composes e exemplos, e um teste de contrato trava tudo; a memoria do projeto reflete o estado novo.

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Contrato de deploy (TDD): teste RED (9 falhas), composes, stack.env.example e .env.example | 4457350 |
| 2 | Memoria e documentacao: iiBrasil HISTORICO, EFI Fase 54, NFS-e Nacional (trava e senha), INTEGRATIONS.md | 6b609f6 |

## Verificacao

- RED confirmado antes das edicoes: `nfse-deploy.env.test.ts` 9 falhas / 3 passando no estado original.
- GREEN: `nfse-deploy.env.test.ts` + `pesquisa-variacao.env.test.ts` + `chatwoot-etiquetas.env.test.ts`: 3 suites, 34 testes verdes.
- Regressao: `src/modules/integrations/nfse src/modules/pesquisa src/modules/integrations/chatwoot`: 32 suites, 620 testes verdes.
- Verificacao automatizada da tarefa 2 (greps de HISTORICO, NFSE_OVERRIDE_PASSWORD, Fase 54, DISCONTINUED): OK.
- Diff conferido: nenhum valor de senha em nenhum arquivo; `NFSE_OVERRIDE_PASSWORD` aparece apenas vazia (`=`) ou como `${NFSE_OVERRIDE_PASSWORD:-}`.

## Deviations from Plan

**1. [Rule 3 - Ambiente] Worktree sem node_modules**
- Criados symlinks locais `node_modules` e `apps/backend/node_modules` para o checkout principal, so para rodar os testes; nao commitados (aparecem como untracked na worktree e devem ser ignorados/removidos pelo orquestrador).

**2. Ajuste menor no .env.example**
- O bloco `NFSE_NACIONAL_*` do `.env.example` usa `NFSE_NACIONAL_CNPJ_PRESTADOR=SEU_CNPJ_PRESTADOR` (placeholder, nao o CNPJ real) e `NFSE_NACIONAL_AMBIENTE=homologacao` como padrao seguro de exemplo; o `stack.env.example` continua com os valores de producao ja existentes.
- Linhas editadas por numero (arquivo com mojibake preexistente nos comentarios, preservado sem reformatar).

STATE.md e ROADMAP.md nao foram atualizados nesta worktree (execucao paralela; a cargo do orquestrador).

## Observacao (fora de escopo, nao alterada)

`memory/nfse-nacional-sefin-integracao.md` (item 1 de "Riscos conhecidos") ja continha, antes deste plano, o nome do arquivo `.pfx` e a senha dele (`12345678`) em texto. Nao e a senha de liberacao e nao foi tocada, mas vale remover do historico versionado.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. T-54-24 mitigado (senha vazia em todos os arquivos versionados + teste exige exatamente uma definicao vazia); T-54-25 aceito (falha segura, repasse coberto por teste nos dois composes).

## Self-Check: PASSED

- nfse-deploy.env.test.ts presente; commits 4457350 e 6b609f6 presentes no historico.
