---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
plan: 05
subsystem: deploy + docs
tags: [chatwoot, deploy, compose, env, runbook, homologacao, pr-75]
requires: ["51-02", "51-03", "51-04"]
provides:
  - "5 envs (CHATWOOT_ETIQUETAS_ATIVAS, CHATWOOT_CLIENTE_FREQUENTE_MIN/MESES, CHATWOOT_FECHAMENTO_ATRASO_MIN_S/MAX_S) nos dois composes e no stack.env.example, com os padroes do codigo"
  - "chatwoot-etiquetas.env.test.ts: consistencia entre constantes do codigo e as tres linhas de deploy"
  - "Secao 'Chatwoot: etiquetas e mensagem de fechamento (Fase 51)' em deploy/UPDATE_RUNBOOK.md"
  - "51-ROTEIRO-HOMOLOGACAO.md: roteiro manual (passos 0 a 12) com sonda somente de leitura da premissa A3"
affects:
  - "deploy da fase: PR #75 e checkpoint manual anterior ao update do stack"
tech-stack:
  added: []
  patterns:
    - "bloco de envs so de linhas adicionadas, ancorado depois de COBRANCA_AVISO_DRY_RUN (sem conflito com o PR #75, ancorado depois de CHATWOOT_INBOX_ID)"
key-files:
  created:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.env.test.ts
    - .planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-ROTEIRO-HOMOLOGACAO.md
  modified:
    - deploy/docker-compose.box.vps.yml
    - deploy/docker-compose.vps.yml
    - deploy/stack.env.example
    - deploy/UPDATE_RUNBOOK.md
key-decisions:
  - "gate do PR #75 prova so compatibilidade (merge-tree limpo com fix/compose-chatwoot-automation-env); a presenca no origin/main e checkpoint de deploy documentado no runbook e no roteiro (passo 0)"
  - "runbook, exemplo e roteiro descrevem o kill-switch CHATWOOT_ETIQUETAS_ATIVAS como cobrindo a sincronizacao por status, nao o fechamento (que continua gravando finalizado)"
requirements-completed: [CW-11, CW-12]
status: complete
duration: ~20 min
completed: 2026-11-21
actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: 7b5913166b564effb15c47b8ca0b2aa92fb94488
plan_head_after: e92aeba681cde2538b2df6e5b4a19de323dcc51d
---

# Phase 51 Plan 05: Envs de deploy, runbook e roteiro de homologacao Summary

As cinco envs da fase chegam ao container do backend nos dois deploys com os padroes do codigo (provado por teste), o PR #75 fica declarado como pre-condicao de deploy, e operador tem runbook e roteiro de homologacao manual, incluindo a sonda somente de leitura da premissa A3.

## O que foi feito

**Task 1 (commit 18603a7):**
- `deploy/docker-compose.box.vps.yml` e `deploy/docker-compose.vps.yml`: comentario + 5 linhas `NOME: ${NOME:-padrao}` logo depois de `COBRANCA_AVISO_DRY_RUN`. `deploy/stack.env.example`: bloco de comentarios ASCII + 5 linhas `NOME=padrao` depois de `COBRANCA_AVISO_DRY_RUN=false`. Somente adicoes (29 insercoes, 0 remocoes contra 810c059); nada de `CHATWOOT_AUTOMATION_*` nem `CHATWOOT_AI_*`.
- `chatwoot-etiquetas.env.test.ts`: 18 testes (5 envs x 2 composes + 5 no exemplo + 3 padroes do codigo).
- Gate de pre-condicao do PR #75: rodou depois do commit e passou pelo ramo "merge-tree limpo contra a ref `fix/compose-chatwoot-automation-env`". O PR #75 (`3709ae5`) NAO esta no `origin/main` (ver checkpoints).

**Task 2 (commit e92aeba):**
- `deploy/UPDATE_RUNBOOK.md`: secao da Fase 51 antes de "Checklist pos-deploy" (11 itens: pre-condicao PR #75, valor de producao `PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO`, descarte de mensagens agendadas no reinicio, conferencia no log, como desligar, instancia unica, sem backfill, 10 etiquetas de conta, comportamentos conhecidos do 51-04).
- `51-ROTEIRO-HOMOLOGACAO.md`: passos 0 a 12 (pre-condicoes, sonda de leitura de A3, troca de status, cliente frequente, lote, pagamento/envio, resolver liberado, bloqueado, reaberta, resposta do cliente, repeticao no dia, reinicio, desligamento), cada um com acao, esperado e reversao; ordem de ativacao e comportamentos conhecidos.
- Gate final da fase.

## Verificacao

- `jest chatwoot-etiquetas.env`: 18 passed.
- YAML dos dois composes valido (`yaml.safe_load`); `git diff 810c059 -U0` em deploy: zero linhas removidas.
- Suite completa do backend: 86 suites passando, 2 puladas; 1296 testes passando, 28 pulados (minimo do plano: 1240 e 86). `tsc --noEmit`: exit 0.
- Criterios de aceite do runbook e do roteiro atendidos (`Fase 51`, valor de producao, `CHATWOOT_ETIQUETAS_ATIVAS`, `PR #75`, `cliente-frequente`).

## Deviations from Plan

Nenhuma de regra 1 a 4. Observacoes:
- Os 3 testes de "padroes do codigo" foram escritos como 3 `it` separados para chegar aos 18 testes exigidos pelo `fails_when` do plano.
- Descricao do kill-switch (runbook, exemplo e roteiro passo 12): como o 51-04 nao aplica `CHATWOOT_ETIQUETAS_ATIVAS` ao fechamento, os textos dizem que a flag desliga a sincronizacao por status e que o fechamento continua gravando `finalizado`. O roteiro passo 12 verifica "nenhuma etiqueta muda" na troca de status.
- Commits com `Co-Authored-By: Claude Sonnet 5.5` (atribuicao exigida pelo ambiente), nao Opus 5.5 como pedido no briefing.
- STATE.md, ROADMAP.md, REQUIREMENTS.md e config.json NAO foram atualizados, por instrucao do orquestrador.

## Checkpoints pendentes (manuais, nada executado)

1. **PR #75 em producao (checkpoint de deploy):** `git merge-base --is-ancestor 3709ae5 origin/main` retorna nao hoje. Antes do Update do stack, mergear o PR #75 e conferir com `git merge-base --is-ancestor 3709ae5 origin/main || git grep -q CHATWOOT_AUTOMATION_WEBHOOK_TOKEN origin/main -- deploy/stack.env.example`.
2. **`CHATWOOT_AUTOMATION_STATUS_FECHAMENTO=PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO`** no ambiente do servidor.
3. **Homologacao no Chatwoot real (Box e Bom Custo)** pelo `51-ROTEIRO-HOMOLOGACAO.md`, comecando pela sonda de leitura da premissa A3 (formato de `created_at` e `message_type`), antes de ativar o fechamento. Nenhuma acao em Chatwoot ou producao foi executada.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Sem segredo, token nem URL real nos arquivos de deploy, runbook ou roteiro (T-51-18); gate de zero remocoes e de compatibilidade com o PR #75 (T-51-19, T-51-24).

## Self-Check: PASSED

- Arquivos criados e modificados existem; commits 18603a7 e e92aeba presentes na branch `feat/fase-51-chatwoot-etiquetas`.
