---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
plan: 05
subsystem: cobranca
tags: [aviso-vencimento, roteiro-ativacao, gates, checkpoint-humano]
requires:
  - phase: 45
    provides: "45-02..45-04: orquestrador, job, previa AdminOnly, envs e painel"
provides:
  - 45-ROTEIRO-ATIVACAO.md (Passo 0 a Passo 5: previa, dry-run, envio real, desligar)
  - gates da fase rodados juntos com o envio ainda desligado
affects: []
key-files:
  created:
    - .planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-ROTEIRO-ATIVACAO.md
  modified: []
key-decisions:
  - "Roteiro so com SELECT no banco do Sistema; nenhuma consulta ao Athos; chaves como marcadores"
  - "Ativacao real (Passo 4) marcada como decisao do usuario; nenhum agente liga o envio"
requirements-completed: []
status: checkpoint-pending
duration: 15min
completed: 2026-11-10
commits: 1
plan_head_before: 65c79d0baeb81cb43ba6f1c941cff5f59cb23491
plan_head_after: 6476778
actuals:
  tokens: 3500
  tasks: 1
  commits: 1
---

# Phase 45 Plan 05: Roteiro de ativacao e gates da fase Summary

Roteiro em 6 passos para o usuario conferir painel e previa em producao e ativar o aviso sozinho (previa -> dry-run -> envio real -> desligar), com todos os gates da fase passando e o envio ainda desligado. **A Task 2 (checkpoint humano bloqueante) esta PENDENTE.**

## Status das tarefas

| Task | Status | Commit |
|---|---|---|
| 1. Roteiro 45-ROTEIRO-ATIVACAO.md + gates | concluida | 6476778 |
| 2. Verificacao humana em producao (checkpoint:human-verify, gate blocking) | **PENDENTE** (aguardando o usuario) | n/a |

## Gates da fase (saida real)

| Gate | Resultado |
|---|---|
| `grep -c "^## Passo"` no roteiro | 6 |
| SQL de escrita no roteiro (INSERT/UPDATE/DELETE/GRANT/REVOKE/DROP/ALTER/TRUNCATE/CREATE no inicio de linha) | 0 ocorrencias (grep sai com 1) |
| `aviso-vencimento/previa` / `COBRANCA_AVISO_DRY_RUN` / `x-admin-api-key` no roteiro | 2 / 4 / 2 |
| `COBRANCA_AVISO_ATIVO: ${COBRANCA_AVISO_ATIVO:-false}` nos compose vps e box.vps | 1 e 1 |
| `npm --prefix apps/backend run test -- --no-coverage` | 61 suites passed, 1 skipped; **892 passed**, 10 skipped (baseline 807) |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit 0 |
| `npm --prefix apps/frontend run build` | exit 0, `/contas-receber` gerado |
| `prisma validate` (DATABASE_URL ficticia, sem conexao) | "The schema ... is valid" |

## Checkpoint pendente: o que o usuario deve verificar

Depois do deploy normal da branch, mantendo `COBRANCA_AVISO_ATIVO` ausente ou false, seguir `45-ROTEIRO-ATIVACAO.md`:

1. Passo 0: migration aplicada (`to_regclass('"CobrancaAvisoVencimento"')` nao nulo) e log do backend em 08:00/14:00 com "desligado".
2. Passo 1: em `/contas-receber`, pills "Vence em Nd"/"Vence hoje"/"Atrasado ha Nd" so em pendentes (cores certas); contadores "A vencer"/"Atrasados" batem com a lista.
3. Passo 2: a previa responde `dryRun: true`, `hoje` = data de Sao Paulo e lista de itens; sem `x-admin-api-key` responde 401; quantidade de `previa_enviaria` esperada e `previa_sem_email` coerentes; `count(*)` em `"CobrancaAvisoVencimento"` = 0 e nenhum e-mail enviado.
4. Passos 3 e 4 (dry-run e envio real) NAO fazem parte da verificacao; informar se pretende ativar e quando.

Resposta esperada: "aprovado" com o numero de itens da previa (e quantos sem e-mail), ou o passo que falhou com resposta/erro. A decisao de ativacao (agora, depois, nunca) deve ser registrada aqui apos o retorno.

**Resultado da verificacao humana:** pendente.
**Decisao de ativacao:** pendente.

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree em base antiga.** HEAD estava em f2ea8ed (arvore limpa); `git reset --hard 65c79d0baeb81cb43ba6f1c941cff5f59cb23491` conforme instrucao do orquestrador.

**2. [Rule 3 - Blocking] node_modules ausente.** Criado `node_modules/` no worktree com links por entrada para o checkout principal (raiz e `apps/backend`, `apps/frontend` `@types`); `.prisma`, `@prisma` e `prisma` foram copiados. Nao foi necessario `prisma generate` (cliente copiado ja contem o model novo e o validate passou). Nao versionado.

**3. Gate de testes:** 892 passed contra o baseline 807 do gate; a estimativa de ~862 era so informativa.

**4. `apps/frontend/next-env.d.ts`** foi alterado pelo `next build`; revertido com `git checkout -- <arquivo>`, nao commitado.

**5. Ledger de commits:** nao gravado em disco (guarda do ambiente recusa comandos compostos); `plan_head_before` e a base de reset e `commits` conferido por `git log` (1 commit de tarefa, mais o commit deste SUMMARY).

Nenhum codigo alterado neste plano; STATE.md e ROADMAP.md nao foram tocados (propriedade do orquestrador).

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova. T-45-21..T-45-23 mitigados: nenhum env alterado, nenhum container reiniciado, nenhuma chamada a producao; roteiro apenas com SELECT no banco do Sistema e chaves como marcadores. Nada escrito no Athos, nenhum e-mail enviado, `COBRANCA_AVISO_ATIVO` nao habilitado.

## Self-Check: PASSED

- 45-ROTEIRO-ATIVACAO.md existe e esta commitado em 6476778; gates reexecutados e registrados acima.
