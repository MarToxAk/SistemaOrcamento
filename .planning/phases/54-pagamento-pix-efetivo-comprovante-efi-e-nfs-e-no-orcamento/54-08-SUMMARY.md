---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 08
subsystem: infra
tags: [nestjs, config, health, npm, nfse, iibrasil]
status: complete

requires: []
provides:
  - "validateEnv/REQUIRED_ENV_VARS extraidos para common/env-validation.ts, sem a variavel do token iiBrasil"
  - "/health com integrations.nfse baseado so em configuracao da NFS-e Nacional (sem rede)"
  - "dependencia npm soap removida do backend e do package-lock.json"
affects: [54-09, 54-11]

actuals:
  tokens: 2800
  tasks: 3
  commits: 3
plan_head_before: 9fc19b1
plan_head_after: e1d0ec9136928845275ceb50b7432a76a3178db3

tech-stack:
  added: []
  patterns: ["validacao de env extraida para funcao pura testavel"]

key-files:
  created:
    - apps/backend/src/modules/common/env-validation.ts
    - apps/backend/src/modules/common/env-validation.test.ts
    - apps/backend/src/modules/health.controller.test.ts
  modified:
    - apps/backend/src/modules/app.module.ts
    - apps/backend/src/modules/health.controller.ts
    - apps/backend/package.json
    - package-lock.json

key-decisions:
  - "D-11: remover so emissao/credenciais/sonda do iiBrasil; leitura historica de notas preservada"
  - "Ordem segura: codigo deixa de exigir a variavel antes de ela sair da stack (checkpoint do plano 54-11)"

requirements-completed: [P54-IIB]
duration: ~15min
completed: 2026-11-25
---

# Phase 54 Plan 08: Residuo iiBrasil (boot, health, dependencia soap) Summary

Boot do backend nao exige mais a variavel do token iiBrasil, /health nao chama mais o WSDL do iiBrasil (nfse reflete a configuracao da NFS-e Nacional) e a dependencia `soap` foi removida do package e do lock.

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | validateEnv extraido, token iiBrasil fora de REQUIRED_ENV_VARS (5 testes) | a1c00fb |
| 2 | checkNfse por configuracao Nacional, sem rede (8 testes do HealthController) | 1d45dcd |
| 3 | `npm uninstall soap` do backend (package.json + lock, so remocoes) | e1d0ec9 |

## Verificacao

- `env-validation.test.ts`: 5/5. `health.controller.test.ts`: 8/8 (4 falharam em RED antes da implementacao).
- Gate da tarefa 3 (`src/modules/cobranca` + `src/modules/integrations/nfse`): 35 suites, 420 testes verdes.
- Suite completa do backend (`--silent`): 104 suites passadas (2 skipped), 1724 testes passados (28 skipped).
- `tsc -p tsconfig.json --noEmit`: limpo.
- `npm ls soap --package-lock-only`: vazio. O diff do lock contem apenas remocoes (soap e dependencias exclusivas: axios-ntlm, formidable, dezalgo, asap, des.js, js-md4, minimalistic-assert, dev-null, whatwg-mimetype, @paralleldrive/cuid2).
- Nenhum arquivo de `apps/backend/src/modules/cobranca/` nem de `integrations/nfse/` foi alterado.

## Deviations from Plan

### Ajustes de execucao

**1. [Rule 3 - Ambiente] Worktree sem node_modules**
- A worktree nao tinha dependencias instaladas. Foram criados symlinks temporarios de `node_modules` (raiz e `apps/backend`) para o checkout principal, removidos ao final; nada disso foi commitado.
- Efeito: `npm exec -w @orcamento/backend -- tsc` resolveria o workspace do checkout principal; por isso o tsc foi rodado diretamente em `apps/backend` da worktree (`../../node_modules/.bin/tsc -p tsconfig.json --noEmit`). Os testes via `npm --prefix apps/backend run test` rodam na worktree.
- A remocao da dependencia usou `npm uninstall soap -w @orcamento/backend --package-lock-only` para nao alterar o `node_modules` compartilhado do checkout principal.

**2. Fluxo RED da tarefa 1**
- `env-validation.ts` e seu teste foram escritos juntos (sem execucao RED separada). Na tarefa 2 o RED foi executado (4 falhas) antes da implementacao.

STATE.md e ROADMAP.md nao foram atualizados nesta worktree (execucao paralela; fica a cargo do orquestrador para evitar conflito de merge).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. T-54-22 mitigado (exigencia removida do codigo antes das variaveis sairem da stack, a cargo do 54-09/54-11) e T-54-23 mitigado (testes de cobranca/NFS-e verdes).

## Self-Check: PASSED

- env-validation.ts, env-validation.test.ts, health.controller.test.ts: presentes.
- Commits a1c00fb, 1d45dcd, e1d0ec9: presentes no historico.
