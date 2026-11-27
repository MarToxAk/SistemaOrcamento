---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 16
subsystem: deploy/propostas
tags: [deploy, kill-switch, proposta, athos, contrato-de-deploy, tdd]
requires: ["55-04"]
provides:
  - PROPOSTA_ESCRITA_ATIVA=false com comentario em .env.example e deploy/stack.env.example
  - repasse PROPOSTA_ESCRITA_ATIVA com padrao false em deploy/docker-compose.vps.yml e deploy/docker-compose.box.vps.yml
  - teste de contrato de deploy propostas-deploy.env.test.ts
affects: [55-11, 55-12]
tech-stack:
  added: []
  patterns: [teste de contrato de deploy lendo arquivos reais pela raiz do repositorio]
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas-deploy.env.test.ts
  modified:
    - .env.example
    - deploy/stack.env.example
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml
key-decisions:
  - "A flag fica DESLIGADA em todos os arquivos versionados; ligar e decisao humana one-way no plano 55-12 (D-07, D-30)."
  - "O teste exige exatamente uma linha por arquivo e proibe qualquer atribuicao com valor true (env, chave de compose e padrao :-true)."
requirements-completed: [P55-ATHOS]
duration: 10 min
completed: 2026-11-27
status: complete
commits: 2
plan_head_before: a95a67be28d94b5f24f68bd064401c3444aae2a9
plan_head_after: b76e73535959c62f4265c1555501b5ad7f3c22a5
actuals:
  tokens: 3000
  tasks: 1
  commits: 2
coverage:
  - deliverable: "Kill-switch PROPOSTA_ESCRITA_ATIVA desligado por padrao e repassado ao container, protegido contra regressao de configuracao (D-30)"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/backend/src/modules/propostas/propostas-deploy.env.test.ts#contrato de deploy da flag PROPOSTA_ESCRITA_ATIVA"
        status: pass
---

# Phase 55 Plan 16: Flag PROPOSTA_ESCRITA_ATIVA no deploy Summary

Kill-switch `PROPOSTA_ESCRITA_ATIVA` (plano 55-04) levado ao deploy desligado por padrao: linha `=false` com comentario nos dois exemplos de env, repasse `${PROPOSTA_ESCRITA_ATIVA:-false}` nos dois compose e teste de contrato que falha se a linha faltar, duplicar ou ligar a flag.

## Accomplishments

- `.env.example` e `deploy/stack.env.example`: bloco "Proposta comercial no Athos (Fase 55)" logo apos `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO`, dizendo que somente o texto `true` liga, que a flag e INDEPENDENTE de `ATHOS_ORCAMENTO_ESCRITA`, que exige as quatro `ATHOS_ORCAMENTO_ID_*` e os GRANTs do Athos e que deve ficar `false` ate o roteiro `55-ROTEIRO-ATIVACAO.md` (plano 55-11).
- `deploy/docker-compose.vps.yml` e `deploy/docker-compose.box.vps.yml`: repasse exatamente uma vez, junto das demais `ATHOS_ORCAMENTO_*`, com comentario de uma linha. Sem isso o container de producao nunca veria a variavel.
- `propostas-deploy.env.test.ts` (10 testes): por compose, exatamente um repasse com padrao false; por exemplo de env, exatamente uma linha `PROPOSTA_ESCRITA_ATIVA=false`; nenhuma atribuicao `true` nos quatro arquivos; comentarios de independencia e roteiro presentes nos exemplos.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 RED | teste de contrato de deploy da flag | efad48f |
| 1 GREEN | flag desligada por padrao nos quatro arquivos de deploy | b76e735 |

## TDD Gate Compliance

| Gate | Commit | Note |
|------|--------|------|
| RED | efad48f `test(55-16)` | 6 de 10 testes falharam por assertiva (arquivos ainda sem a linha); os 4 que passaram sao os de "nao liga a flag" nos arquivos sem a variavel, esperado. Jest nao emite TAP/JUnit, entao `check tdd-red-evidence` nao se aplica. |
| GREEN | b76e735 `feat(55-16)` | 10 passed. |
| REFACTOR | none | sem limpeza necessaria. |

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas/propostas-deploy.env.test.ts`: 1 suite, 10 passed.
- `tsc -p tsconfig.json --noEmit` do backend: sem erros.
- Acceptance: repasse nos dois compose = 1 cada; `^PROPOSTA_ESCRITA_ATIVA=false$` = 1 em cada exemplo; `^PROPOSTA_ESCRITA_ATIVA=true` = 0 em cada exemplo.
- `git diff --numstat` dos quatro arquivos antes do commit: 0 linhas removidas (9/0, 9/0, 2/0, 2/0); nenhuma variavel existente alterada, incluindo `ATHOS_ORCAMENTO_ESCRITA`.

## Deviations from Plan

None - plan executed exactly as written. Nota de ambiente (nao e desvio): `npm ci --ignore-scripts` e `prisma:generate` no worktree, sem arquivo versionado alterado. `STATE.md` e `ROADMAP.md` nao foram tocados (orquestrador).

## Known Stubs

None.

## Threat Flags

None. T-55-61 mitigado: flag desligada nos exemplos, repassada com padrao false nos compose e protegida por teste de contrato.

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/propostas/propostas-deploy.env.test.ts
- FOUND: .env.example, deploy/stack.env.example, deploy/docker-compose.vps.yml, deploy/docker-compose.box.vps.yml (modificados)
- FOUND commits: efad48f, b76e735
